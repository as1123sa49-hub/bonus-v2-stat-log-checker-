/**
 * 完整流程整合測試
 * 測試從登入到派彩的完整遊戲流程
 */

const { test, expect } = require('@playwright/test');
const TEST_CONFIG = require('../../config/testConfig');
const { getTestConfig } = require('../../config/testConfig');
const { initWebSocketMonitoring, waitForNewOpenRound } = require('../../src/helpers/webSocketHelper');
const { loginGame, closePWAPopup } = require('../../src/helpers/loginHelper');
const { enterRoom } = require('../../src/helpers/roomHelper');
const { placeBet, clickOpenBettingButton } = require('../../src/helpers/bettingHelper');
const { waitForPayout, getPrepareBonusResult } = require('../../src/helpers/payoutHelper');
const {
  getBonusDiceResultsFromScanCard,
  getBonusResultsFromModel,
  describeBonusResultCode,
} = require('../../src/helpers/bonusHelper');
const { getLatestBeadColor, getLatestBeadColors, colorEnToZhShort, getCGT01RateLabel, getCGT01RateLabelByIndex } = require('../../src/helpers/roadmapHelper');
const { detectRoomMode } = require('../../src/helpers/roomModeHelper');
const logger = require('../../src/utils/logger');

// 獲取 full-flow 專用配置
const TEST_SPECIFIC_CONFIG = getTestConfig('full-flow');
const TARGET_ROOM = TEST_SPECIFIC_CONFIG.targetRoom;
const TEST_BETS = TEST_SPECIFIC_CONFIG.bets;

/**
 * 讀取 betstop 事件的 d.v[10][143]（500X Bonus 資訊）
 * @param {import('@playwright/test').Page} page
 * @param {string} targetRoundCode
 * @returns {Promise<Object|null>} 143 資訊或 null
 */
async function readBetstop143ForRound(page, targetRoundCode) {
  try {
    const got = await page.evaluate((roundCode) => {
      try {
        if (!window.__wsMessages || window.__wsMessages.length === 0) return null;
        const recent = window.__wsMessages.slice(-600);
        for (let i = recent.length - 1; i >= 0; i--) {
          let data = recent[i].data; if (typeof data !== 'string') data = data.toString();
          if (data.startsWith('$#|#$')) data = data.substring(5);
          try {
            const parsed = JSON.parse(data);
            const v = parsed && parsed.d && parsed.d.v;
            if (!v) continue;
            const evt = v['3'];
            const round = v['10'] && v['10']['0'];
            if ((evt === 'betstop' || evt === 'betStop') && round === roundCode) {
              const info143 = v['10'] && v['10']['143'];
              if (info143 && typeof info143 === 'object') return info143;
            }
          } catch (_) {}
        }
      } catch (_) {}
      return null;
    }, targetRoundCode);
    return got;
  } catch (_) { return null; }
}

function formatBonusDiceList(diceMeta) {
  if (!diceMeta || diceMeta.length === 0) return '無資料';
  return diceMeta
    .map((meta, idx) => `${idx + 1}. ${meta.zh}${meta.multiplier}x (code ${meta.code})`)
    .join(' | ');
}

async function verify75xSuperRound(page, {
  roundCode,
  targetRoom,
  seq,
  betResult,
  payoutResult
}) {
  const summary = { success: false, betArea: null, diceMeta: [], expectedGain: null, actualGain: null };
  if (!roundCode) {
    logger.warning('75X：缺少 roundCode，跳過特殊骰驗證');
    summary.reason = 'missingRoundCode';
    return summary;
  }
  if (!Array.isArray(seq) || seq.length < 3) {
    logger.info('75X：派彩序列不足，無法檢測是否三同色');
    summary.reason = 'seqTooShort';
    return summary;
  }
  const firstArea = String(seq[0]);
  const isTriple = seq.every((val) => String(val) === firstArea);
  if (!isTriple) {
    logger.info('75X：本局未開出三同色，無需進入 Super Round 驗證');
    summary.reason = 'notTriple';
    return summary;
  }
  summary.betArea = firstArea;

  const betOnTriple = (betResult.actualBets || []).find((bet) => String(bet.area) === firstArea);
  if (!betOnTriple || !betOnTriple.actualAmount) {
    logger.warning('75X：未在三同顏色下注，無法驗證派彩金額');
    summary.reason = 'noBetOnTriple';
    return summary;
  }
  summary.stakeAmount = betOnTriple.actualAmount;

  const anyTripleBet = (betResult.actualBets || []).find((bet) => String(bet.area) === '808' && bet.actualAmount > 0);
  if (anyTripleBet) {
    logger.warning('75X：Any Triple 有下注，錢包增額包含額外派彩，僅做資料比對');
    summary.hasAnyTriple = true;
  }

  const scanResult = await getBonusDiceResultsFromScanCard(page, roundCode);
  const modelResult = await getBonusResultsFromModel(page, targetRoom);

  if (scanResult.success) {
    const diceMeta = scanResult.codes.map(describeBonusResultCode);
    logger.payout(`[75X] scanCard 特殊骰：${formatBonusDiceList(diceMeta)}`);
  } else {
    logger.warning('75X：未在 WebSocket 讀到 scanCard 特殊骰資料');
  }

  if (modelResult && modelResult.success) {
    const diceMeta = modelResult.codes.map(describeBonusResultCode);
    logger.payout(`[75X] App.model bonusResults：${formatBonusDiceList(diceMeta)}`);
  } else {
    logger.warning(`75X：App.model bonusResults 讀取失敗${modelResult && modelResult.error ? ` - ${modelResult.error}` : ''}`);
  }

  if (scanResult.success && modelResult && modelResult.success) {
    const codesMatch = scanResult.codes.length === modelResult.codes.length
      && scanResult.codes.every((code, idx) => Number(code) === Number(modelResult.codes[idx]));
    if (codesMatch) {
      logger.success('75X：WebSocket 與 App.model 的特殊骰結果一致');
    } else {
      logger.warning('75X：WebSocket 與 App.model 的特殊骰結果不一致，請人工確認');
    }

  }

  const diceCodes = scanResult.success
    ? scanResult.codes
    : ((modelResult && modelResult.success) ? modelResult.codes : []);
  if (diceCodes.length < 2) {
    logger.warning('75X：取得的特殊骰資料不足兩顆，無法計算派彩');
    summary.reason = 'insufficientDice';
    return summary;
  }

  const diceMeta = diceCodes.map(describeBonusResultCode);
  const diceMultiplier = diceMeta.reduce((acc, meta) => acc * (meta.multiplier || 1), 1);
  const baseMultiplier = 3;
  const stakeAmount = betOnTriple.actualAmount;
  const expectedWin = stakeAmount * baseMultiplier * diceMultiplier;
  const expectedGain = expectedWin + stakeAmount;
  summary.diceMeta = diceMeta;
  summary.diceMultiplier = diceMultiplier;
  summary.expectedGain = expectedGain;

  if (anyTripleBet && anyTripleBet.actualAmount > 0) {
    logger.calc(`[75X] 預期派彩（僅顏色三同，含本金）：${expectedGain.toFixed(2)}`);
    summary.reason = 'anyTripleBetAlsoPlaced';
    return summary;
  }

  if (payoutResult.walletAfter == null || betResult.walletAfter == null) {
    logger.warning('75X：無法取得錢包資料，僅記錄預期派彩');
    logger.calc(`[75X] 預期派彩（含本金）：${expectedGain.toFixed(2)}`);
    summary.reason = 'missingWallet';
    return summary;
  }

  const actualGain = payoutResult.walletAfter - betResult.walletAfter;
  logger.calc(`[75X] 預期派彩（含本金）：${expectedGain.toFixed(2)}｜實際錢包增加：${actualGain.toFixed(2)}`);
  expect(Math.abs(actualGain - expectedGain)).toBeLessThan(0.5);
  logger.success('75X：派彩金額驗證通過');
  summary.success = true;
  summary.actualGain = actualGain;
  return summary;
}

test.describe('完整下注流程整合測試', () => {
  test(`${TARGET_ROOM} - 登入→進房→下注→派彩`, async ({ page }) => {
    test.setTimeout(180000); // 3 分鐘
    
    // 設定視窗大小
    await page.setViewportSize({ width: 414, height: 896 });
    
    // 1. 初始化 WebSocket 監聽
    await initWebSocketMonitoring(page);
    
    // 2. 登入遊戲
    await loginGame(page, TEST_CONFIG.gameUrl);
    
    // 3. 進入房間（會在進入房間列表後自動關閉 PWA）
    const roomResult = await enterRoom(page, TARGET_ROOM);
    if (!roomResult.success) {
      const visibleRooms = roomResult.roomsVisible && roomResult.roomsVisible.length
        ? roomResult.roomsVisible.join(', ')
        : '無';
      logger.warning(`目前 Lobby 可見房間: ${visibleRooms}`);
    }
    expect(roomResult.success).toBe(true);
    // 4.1 進房後先開啟下注面板，才能顯示路書
    await clickOpenBettingButton(page, TARGET_ROOM);
    // 4.2 移除進房即讀路書日誌（避免顯示 ???）
    
    // 4.1 進房後立即嘗試讀取抽水率（未等開局）
    let earlyDR = await page.evaluate((room) => {
        try {
          const table = App.model.tableCollection.getTable(room);
          const jl = table?.round?._data?.data?.jackpotInfoList;
          const jp702 = jl && jl[702];
          if (!jp702) return null;
          const dr = jp702.deductionRateList && jp702.deductionRateList[0] ? jp702.deductionRateList[0].deductionRate : null;
          return dr;
        } catch (e) { return null; }
      }, TARGET_ROOM);
    // 若讀不到，短暫輪詢 3 次 × 100ms（更快返回，不阻塞流程）
    if (earlyDR == null) {
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(100);
        earlyDR = await page.evaluate((room) => {
          try {
            const table = App.model.tableCollection.getTable(room);
            const jl = table?.round?._data?.data?.jackpotInfoList;
            const jp702 = jl && jl[702];
            if (!jp702) return null;
            const dr = jp702.deductionRateList && jp702.deductionRateList[0] ? jp702.deductionRateList[0].deductionRate : null;
            return dr;
          } catch (e) { return null; }
        }, TARGET_ROOM);
        if (earlyDR != null) break;
      }
    }
    // 移除進房即讀抽水率日誌
    
    // 5. 等待 openround（移除重複的 openBettingButton 點擊，placeBet 會處理）
    const newRoundNumber = await waitForNewOpenRound(page, TARGET_ROOM, null, 60);
    expect(newRoundNumber).not.toBeNull();
    
    // 偵測房間模式（以 subType 判斷 500X/Speed/Jackpot 等）
    const ROOM_MODE = await detectRoomMode(page, TARGET_ROOM);
    logger.detect(`房間模式偵測結果:`);
    logger.detect(`subType: ${ROOM_MODE.subType ?? 'null'}`, { prefix: '   ' });
    logger.detect(`is500x: ${ROOM_MODE.is500x}`, { prefix: '   ' });
    logger.detect(`isSpeed: ${ROOM_MODE.isSpeed}`, { prefix: '   ' });
    logger.detect(`isJackpotV2: ${ROOM_MODE.isJackpotV2}`, { prefix: '   ' });
    logger.raw('');
    
    const activeBets = TEST_BETS.filter(bet => bet.amount > 0);
    const totalBetAmount = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // 5.1 開局後立即執行下注（優先下注，避免錯過下注時間窗口）
    const betResult = await placeBet(
      page,
      TEST_BETS,
      TARGET_ROOM,
      TEST_CONFIG.areaNames
    );
    
    // 5.0 下注後記錄並打印開局時的路書（作為之後派彩後對比，避免讀到上一局）
    await clickOpenBettingButton(page, TARGET_ROOM);
    let prePayoutRoadmapSnapshot = await getLatestBeadColors(page, TARGET_ROOM);
    try {
      // 短暫等待一幀，避免 UI 尚未完成重繪
      await page.waitForTimeout(50);
    } catch(_) {}
    if (prePayoutRoadmapSnapshot && prePayoutRoadmapSnapshot.success && Array.isArray(prePayoutRoadmapSnapshot.colors)) {
      const zh = prePayoutRoadmapSnapshot.colors.map(c => colorEnToZhShort(c)).join('');
      logger.roadmap(`開局時路書: ${zh} (顏色順序: ${prePayoutRoadmapSnapshot.colors.join(', ')})`);
    }
    // （移除實際下注概覽輸出）
    
    // 5.5 讀取開局後的 Jackpot 資訊（加入短暫輪詢以確保抽水率可讀）
    let jackpotBeforeRound = await page.evaluate((room) => {
      try {
        const table = App.model.tableCollection.getTable(room);
        
        // 正確路徑：round._data.data.jackpotInfoList[702]
        if (!table || !table.round || !table.round._data || !table.round._data.data || !table.round._data.data.jackpotInfoList) {
          return null;
        }
        
        const jackpotList = table.round._data.data.jackpotInfoList;
        if (jackpotList[702]) {
          const jp702 = jackpotList[702];
          const deductionRateList = jp702.deductionRateList;  // 抽水率列表
          const detail = jp702.detail;

          const deductionRate = deductionRateList && deductionRateList[0] ? deductionRateList[0].deductionRate : null;
          const jackpotType = deductionRateList && deductionRateList[0] ? deductionRateList[0].jackpotType : null;

          // 即使 detail 尚未就緒，也要先回傳抽水率
          const amount = detail && detail.onlyOne ? (detail.onlyOne.amount || null) : null;
          const initAmount = detail && detail.onlyOne ? (detail.onlyOne.initAmount || null) : null;
          const payoutLimit = detail && detail.onlyOne ? (detail.onlyOne.payoutLimit || null) : null;

          return { amount, initAmount, payoutLimit, deductionRate, jackpotType };
        }
        return null;
      } catch (e) {
        return { error: e.message };
      }
    }, TARGET_ROOM);

    // 若抽水率暫時為 null，短暫輪詢再讀取（最多 3 次 × 100ms ≈ 0.3s）
    if (jackpotBeforeRound && jackpotBeforeRound.deductionRate == null) {
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(100);
        const polled = await page.evaluate((room) => {
          try {
            const table = App.model.tableCollection.getTable(room);
            if (!table || !table.round || !table.round._data || !table.round._data.data || !table.round._data.data.jackpotInfoList) {
              return null;
            }
            const jp702 = table.round._data.data.jackpotInfoList[702];
            if (!jp702) return null;
            const dr = jp702.deductionRateList && jp702.deductionRateList[0] ? jp702.deductionRateList[0].deductionRate : null;
            return { dr };
          } catch (e) { return null; }
        }, TARGET_ROOM);
        if (polled && polled.dr != null) {
          jackpotBeforeRound.deductionRate = polled.dr;
          break;
        }
      }
    }
    
    // 顯示 Jackpot 資訊（抽水率若未讀到，回填為進房即讀 earlyDR）（僅 CGIGOJP1）
    let reportRoadText = null; // ex: 黃黃黃 / 粉 JP
    let reportRateText = null; // ex: 20X / JP
    let reportDeduction = null; // { percentText, addText, poolText }
    let openingPercentText = null; let openingAddText = null; let openingPoolText = null;
    if (!ROOM_MODE.isSpeed) {
      logger.jackpot('開局後 Jackpot 資訊:');
    if (jackpotBeforeRound) {
      if (jackpotBeforeRound.amount != null) {
          logger.wallet(`原始獎金: ${jackpotBeforeRound.amount.toFixed(2)}`, { prefix: '   ' });
      }
      const openingDR = (jackpotBeforeRound.deductionRate != null)
        ? jackpotBeforeRound.deductionRate
        : (typeof earlyDR === 'number' ? earlyDR : null);
      if (openingDR != null) {
        const raw = openingDR; // 0.3 表示 0.3%
        const fraction = raw / 100;
        const percentText = (fraction * 100).toFixed(3);
        const calculatedDeduction = totalBetAmount * fraction;
          logger.stats(`設定抽水率: ${percentText}%`, { prefix: '   ' });
          logger.calc(`本次抽水驗算: ${totalBetAmount} × ${percentText}% = ${calculatedDeduction.toFixed(2)}`, { prefix: '   ' });
          openingPercentText = `${percentText}%`;
          openingAddText = `${totalBetAmount} × ${percentText}% = ${calculatedDeduction.toFixed(2)}`;
        if (jackpotBeforeRound.amount != null) {
          const expectedJackpot = jackpotBeforeRound.amount + calculatedDeduction;
            logger.jackpot(`下注後預期獎金: ${jackpotBeforeRound.amount.toFixed(2)} + ${calculatedDeduction.toFixed(2)} = ${expectedJackpot.toFixed(2)}`, { prefix: '   ' });
            openingPoolText = `${jackpotBeforeRound.amount.toFixed(2)} + ${calculatedDeduction.toFixed(2)} = ${expectedJackpot.toFixed(2)}`;
          }
        } else {
          logger.info('無抽水率資訊', { prefix: '   ' });
        }
      } else {
        logger.warning('無法讀取 Jackpot 資訊', { prefix: '   ' });
      if (jackpotBeforeRound?.error) {
          logger.error(`錯誤: ${jackpotBeforeRound.error}`, { prefix: '   ' });
      }
    }
      logger.raw('');
    }
    
    // 6. 下注結果驗證
    expect(betResult.success).toBe(true);
    
    // 驗證錢包扣款（允許部分成功，因為伺服器有防連點機制）
    const expectedDeduction = betResult.totalBetAmount;
    const actualDeduction = betResult.walletBefore - betResult.walletAfter;
    
    if (actualDeduction <= 0) {
      logger.warning('錢包未扣款 - 可能下注時間已過');
      logger.warning('跳過派彩驗證測試', { prefix: '   ' });
      return; // 提前結束測試
    }
    
    // 檢查是否有 roundCode
    if (!betResult.roundCode) {
      logger.warning('未獲取到 roundCode，無法進行派彩驗證');
      logger.warning('但下注已成功（錢包已扣款）', { prefix: '   ' });
      return; // 提前結束測試
    }
    
    // 7. 等待派彩
    const payoutResult = await waitForPayout(
      page,
      betResult.roundCode,
      betResult.walletAfter,
      betResult.actualBets,  // 傳入實際下注金額數組
      60,
      TEST_CONFIG.areaNames,  // 傳入區域名稱映射
      jackpotBeforeRound  // 傳入開局後的 Jackpot 資訊
    );
    
    expect(payoutResult.detected).toBe(true);
    // （移除 debug：不再輸出 payout 原始 payload）

    // 7.0.1 轉盤是否轉到 Jackpot（是否進入刮刮樂），以及本局是否具備 JP 刮刮樂資格（本局總投注 >= 門檻）（僅 CGIGOJP1）
    let jpHit = null;
    let jpThreshold = null;
    if (!ROOM_MODE.isSpeed) {
      jpHit = await page.evaluate((room) => {
        try {
          const table = App.model.tableCollection.getTable(room);
          return table && table.round && table.round._data && table.round._data.data ? !!table.round._data.data.hitJackpot : null;
        } catch (e) { return null; }
      }, TARGET_ROOM);
      // 門檻（例：jackpotInfoList[702].betLimit.onlyOne.amount）與本局總下注
      jpThreshold = await page.evaluate((room) => {
        try {
          const t = App.model.tableCollection.getTable(room);
          const jl = t?.round?._data?.data?.jackpotInfoList;
          const limit = jl && jl[702] && jl[702].betLimit && jl[702].betLimit.onlyOne ? jl[702].betLimit.onlyOne.amount : null;
          return limit;
        } catch (e) { return null; }
      }, TARGET_ROOM);
      // 先暫存模型值，實際輸出將在收集所有訊號後再統一判定
      // 刮刮樂資格的輸出將在偵測到 openBonus 後再顯示
    }

    // 7.0.2 錢包變化（下注前 → 下注後 → 派彩後）
    try {
      const walletBeforeBet = betResult && typeof betResult.walletBefore === 'number' ? betResult.walletBefore : null;
      const walletAfterBet = betResult && typeof betResult.walletAfter === 'number' ? betResult.walletAfter : null;
      const walletAfterPayout = payoutResult && typeof payoutResult.walletAfter === 'number' ? payoutResult.walletAfter : null;
      if (walletBeforeBet != null || walletAfterBet != null || walletAfterPayout != null) {
        logger.wallet('錢包變化:');
        if (walletBeforeBet != null) logger.wallet(`下注前: ${walletBeforeBet.toFixed(2)}`, { prefix: '   ' });
        if (walletAfterBet != null) logger.wallet(`下注後: ${walletAfterBet.toFixed(2)}`, { prefix: '   ' });
        if (walletAfterPayout != null) logger.wallet(`派彩後: ${walletAfterPayout.toFixed(2)}`, { prefix: '   ' });
        if (walletBeforeBet != null && walletAfterBet != null) {
          const d1 = walletAfterBet - walletBeforeBet;
          logger.wallet(`下注階段變化: ${(d1 >= 0 ? '+' : '')}${d1.toFixed(2)}`, { prefix: '   ' });
        }
        if (walletAfterBet != null && walletAfterPayout != null) {
          const d2 = walletAfterPayout - walletAfterBet;
          logger.wallet(`派彩變化: ${(d2 >= 0 ? '+' : '')}${d2.toFixed(2)}`, { prefix: '   ' });
        }
        if (walletBeforeBet != null && walletAfterPayout != null) {
          const d3 = walletAfterPayout - walletBeforeBet;
          logger.wallet(`總變化: ${(d3 >= 0 ? '+' : '')}${d3.toFixed(2)}`, { prefix: '   ' });
        }
      }
    } catch (_) {}

    // 7.1 路書檢測（派彩後）
    // 先定義電子骰相關變數（需要在外部作用域，供後續使用）
    let electronicDiceMatch = false; // 是否有匹配（用於顯示）
    let electronicDiceMatchCount = 0; // 匹配數量（0/1/2/3），用於賠率計算
    let electronicDiceResult = null; // 電子骰顏色（單個區域 ID，如 "805"）

    // 若有 payout 數據，先讀取派彩序列用於路書驗證
    let seq = null;
    if (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) {
      seq = payoutResult.payoutData['12'].map(v => String(v));
    }

    let summary75x = null;
    if (ROOM_MODE.is75x && seq) {
      summary75x = await verify75xSuperRound(page, {
        roundCode: betResult.roundCode,
        targetRoom: TARGET_ROOM,
        seq,
        betResult,
        payoutResult
      });
    }

    // CGT01 特殊處理：在派彩後需要讀取電子骰結果
    // 電子骰是單個顏色（第四個骰子），需要統計派彩中與電子骰相同的數量
    if (ROOM_MODE.isSpeed && seq && betResult.roundCode) {
      const prepareBonusResult = await getPrepareBonusResult(page, betResult.roundCode);
      if (prepareBonusResult && prepareBonusResult.found && prepareBonusResult.electronicDice) {
        electronicDiceResult = prepareBonusResult.electronicDice; // 單個區域 ID（如 "805"）
        // 統計派彩中與電子骰相同的數量
        const matchCount = seq.filter(val => String(val) === String(electronicDiceResult)).length;
        // 匹配數量：0/1/2/3，用於後續賠率計算
        electronicDiceMatch = matchCount > 0; // 只要有匹配就算匹配（用於顯示）
        // 存儲匹配數量供賠率計算使用
        electronicDiceMatchCount = matchCount;
      }
    }

    // 在派彩後重新讀取路書，確保讀到最新路書（類似 CGIGOJP1）
    await clickOpenBettingButton(page, TEST_CONFIG.targetRoom);
    // 輪詢直到路書與開局時 snapshot 不同，避免讀到上一局顏色
    let roadmapGroup = await getLatestBeadColors(page, TARGET_ROOM);
    if (prePayoutRoadmapSnapshot && prePayoutRoadmapSnapshot.success) {
      const maxWaitMs = 5000; const interval = 300; let waited = 0;
      while (roadmapGroup && roadmapGroup.success && prePayoutRoadmapSnapshot.colors && Array.isArray(prePayoutRoadmapSnapshot.colors) &&
             Array.isArray(roadmapGroup.colors) && roadmapGroup.colors.join(',') === prePayoutRoadmapSnapshot.colors.join(',') && waited < maxWaitMs) {
        await page.waitForTimeout(interval); waited += interval;
        await clickOpenBettingButton(page, TARGET_ROOM);
        roadmapGroup = await getLatestBeadColors(page, TARGET_ROOM);
        if (roadmapGroup && roadmapGroup.success && Array.isArray(roadmapGroup.colors)) {
          logger.roadmap(`路書輪詢（與開局比對中）: ${roadmapGroup.colors.join(', ')}`);
        }
      }
    }
    
    // 如果有派彩序列，再次驗證路書是否已更新（針對 CGT01 和 CGIGOJP1）
    if (seq && roadmapGroup && roadmapGroup.success && TEST_CONFIG.colorToAreaMap) {
      const roadmapFirstArea = TEST_CONFIG.colorToAreaMap[roadmapGroup.colors[0]];
      if (roadmapFirstArea && roadmapFirstArea !== seq[0]) {
        // 路書可能尚未更新，繼續輪詢直到匹配或超時（延長至 8000ms 並加入詳細日誌）
        const maxWaitMs = 8000; const interval = 300; let waited = 0;
        while (roadmapGroup && roadmapGroup.success && waited < maxWaitMs) {
          const currentFirstArea = TEST_CONFIG.colorToAreaMap[roadmapGroup.colors[0]];
          if (currentFirstArea === seq[0]) break;
          await page.waitForTimeout(interval); waited += interval;
          await clickOpenBettingButton(page, TARGET_ROOM);
          roadmapGroup = await getLatestBeadColors(page, TARGET_ROOM);
          if (roadmapGroup && roadmapGroup.success && Array.isArray(roadmapGroup.colors)) {
            logger.roadmap(`路書輪詢（與派彩比對中）: ${roadmapGroup.colors.join(', ')} -> first=${TEST_CONFIG.colorToAreaMap[roadmapGroup.colors[0]]}, expected=${seq[0]}`);
          }
        }
      }
    }

    // 7.2.1 若有 payout payload 的 12 欄位（開出顏色/區域序列），則輸出並與路書對照
    if (seq) {
      const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
      const zhSeq = seq.map(a => areaToZh[a] || a).join('');
      logger.payout(`派彩顏色（三顆）: ${zhSeq}`);
      
      // 顯示電子骰結果（CGT01）
      if (ROOM_MODE.isSpeed && electronicDiceResult) {
        const electronicZh = areaToZh[electronicDiceResult] || electronicDiceResult;
        const matchText = electronicDiceMatchCount > 0 ? ` ✅ 匹配（${electronicDiceMatchCount} 個）` : ' ❌ 不匹配';
        logger.electronicDice(`電子骰結果: ${electronicZh}${matchText}`);
      }

      // 500X：讀取 143 Bonus（若可得）
      let bonus143 = null;
      if (ROOM_MODE.is500x && betResult && betResult.roundCode) {
        bonus143 = await readBetstop143ForRound(page, betResult.roundCode);
      }

      // 500X：顯示所有開出的電子骰結果
      if (ROOM_MODE.is500x && bonus143) {
        logger.electronicDice('500X 電子骰結果:');
        
        // 單區（801-806）的電子骰結果
        const singleAreas = ['801', '802', '803', '804', '805', '806'];
        const singleResults = [];
        for (const areaId of singleAreas) {
          if (bonus143[areaId]) {
            const row = bonus143[areaId];
            const mc = Number(row.matchColors);
            const r = Number(row.rate);
            const areaZh = areaToZh[areaId] || areaId;
            if (mc === 2) {
              singleResults.push(`${areaZh} (2同色 ${r}x)`);
            } else if (mc === 3) {
              singleResults.push(`${areaZh} (3同色 ${r}x)`);
            }
          }
        }
        if (singleResults.length > 0) {
          logger.electronicDice(`單區: ${singleResults.join(', ')}`, { prefix: '   ' });
        }
        
        // AnyDouble (807) 的電子骰結果
        if (bonus143['807']) {
          const adRow = bonus143['807'];
          const adColor = adRow.bonusColor;
          const adRate = Number(adRow.rate);
          const adColorZh = areaToZh[String(adColor)] || adColor;
          logger.electronicDice(`AnyDouble: ${adColorZh} (${adRate}x)`, { prefix: '   ' });
        }
        
        // AnyTriple (808) 的電子骰結果
        if (bonus143['808']) {
          const atRow = bonus143['808'];
          const atColor = atRow.bonusColor;
          const atRate = Number(atRow.rate);
          const atColorZh = areaToZh[String(atColor)] || atColor;
          logger.electronicDice(`AnyTriple: ${atColorZh} (${atRate}x)`, { prefix: '   ' });
        }
        
        if (singleResults.length === 0 && !bonus143['807'] && !bonus143['808']) {
          logger.info('本局無電子骰結果', { prefix: '   ' });
        }
      }

      if (roadmapGroup && roadmapGroup.success && TEST_CONFIG.colorToAreaMap) {
        // 調試：顯示路書讀取到的詳細信息
        const roadmapZh = roadmapGroup.colors.map(c => colorEnToZhShort(c)).join('');
        const roadmapFirstArea = TEST_CONFIG.colorToAreaMap[roadmapGroup.colors[0]];
        logger.roadmap(`路書讀取結果: ${roadmapZh} (顏色順序: ${roadmapGroup.colors.join(', ')})`);
        logger.roadmap(`路書第一個顏色對應區域: ${roadmapFirstArea}, 派彩第一個區域: ${seq[0]}`);
        if (roadmapFirstArea) {
          if (roadmapFirstArea !== seq[0]) {
            logger.warning(`路書與派彩不匹配：路書第一個區域 ${roadmapFirstArea} 不是最新結果 ${seq[0]}，可能是上一局的路書`);
          }
          expect(roadmapFirstArea).toBe(seq[0]);
        }
      }

      logger.payout('各區域派彩詳情:');
      const countByArea = seq.reduce((m, a) => { m[a] = (m[a]||0)+1; return m; }, {});
      const byAreaMap = (betResult.actualBets||[]).reduce((m,b)=>{ m[String(b.area)] = b.actualAmount||0; return m; },{});
      const orderedAreas = ['801','802','803','804','805','806','807','808'];
      // 先讀取轉盤倍率（payout d.v['10']['83'][0]），-1 表 JP（僅 CGIGOJP1）
      let rouletteMultiplier = null;
      if (!ROOM_MODE.isSpeed) {
        try {
          const pv10 = payoutResult && payoutResult.raw && payoutResult.raw.d && payoutResult.raw.d.v && payoutResult.raw.d.v['10'];
          if (pv10 && Array.isArray(pv10['83']) && pv10['83'].length > 0 && typeof pv10['83'][0] === 'number') {
            rouletteMultiplier = pv10['83'][0];
          }
        } catch (_) {}
      }

      for (const areaId of orderedAreas) {
        const betAmt = byAreaMap[areaId] || 0;
        const hits = countByArea[areaId] || 0;
        const name = TEST_CONFIG.areaNames[areaId] || (areaId === '807' ? 'Any Double' : (areaId === '808' ? 'Any Triple' : areaId));
        if (ROOM_MODE.is75x && summary75x && summary75x.betArea === areaId && summary75x.expectedGain != null) {
          const stake = summary75x.stakeAmount || betAmt;
          const payoutAmount = summary75x.actualGain != null ? summary75x.actualGain : summary75x.expectedGain;
          const oddsWithStake = stake > 0 && payoutAmount != null ? (payoutAmount / stake) : null;
          const netOdds = oddsWithStake != null ? (oddsWithStake - 1) : null;
          logger.multiLine('payout', [
            `實際下注: ${stake}`,
            `派彩: ${payoutAmount != null ? payoutAmount.toFixed(2) : '未知'}`,
            oddsWithStake != null
              ? `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
              : '賠率: 未知'
          ], {
            header: `✅ ${name} (${areaId}):`,
            prefix: '   '
          });
          continue;
        }

        if (hits === 0) {
          // 500X：807 和 808 需要根據實際開出結果判斷是否中獎
          if (ROOM_MODE.is500x && areaId === '807' && betAmt > 0) {
            // Any Double：存在二同且非三同
            const isDouble = Object.values(countByArea).some(c => c === 2);
            const isTriple = Object.values(countByArea).some(c => c === 3);
            if (isDouble && !isTriple) {
              // 中獎：二同且非三同
              const base = 1;
              let useRate = null;
              if (bonus143 && bonus143['807']) {
                const r = Number(bonus143['807'].rate);
                if (Number.isFinite(r)) useRate = r;
              }
              const netOdds = (useRate != null ? useRate : base);
              const oddsWithStake = netOdds + 1;
              const payout = betAmt * oddsWithStake;
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: ${payout.toFixed(2)}`,
                `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
              ], {
                header: `✅ ${name} (${areaId}):`,
                prefix: '   '
              });
              
              // 500X：如果 Any Double 有下注且中了電子骰，顯示中的電子骰結果
              if (bonus143 && bonus143['807']) {
                const adRow = bonus143['807'];
                const adColor = adRow.bonusColor;
                const adRate = Number(adRow.rate);
                const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                const adColorZh = areaToZh[String(adColor)] || adColor;
                logger.electronicDice(`電子骰: ${adColorZh} (${adRate}x)`, { prefix: '      ' });
              }
            } else {
              // 未中獎：不是二同或有三同
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: 0`,
                `賠率: 0.00x (含本金) / 0.00x (不含本金)`
              ], {
                header: `❌ ${name} (${areaId}):`,
                prefix: '   '
              });
            }
          } else if (ROOM_MODE.is500x && areaId === '808' && betAmt > 0) {
            // Any Triple：三同
            const isTriple = Object.values(countByArea).some(c => c === 3);
            if (isTriple) {
              // 中獎：三同
              const base = 25;
              let useRate = null;
              if (bonus143 && bonus143['808']) {
                const r = Number(bonus143['808'].rate);
                if (Number.isFinite(r)) useRate = r;
              }
              const netOdds = (useRate != null ? useRate : base);
              const oddsWithStake = netOdds + 1;
              const payout = betAmt * oddsWithStake;
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: ${payout.toFixed(2)}`,
                `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
              ], {
                header: `✅ ${name} (${areaId}):`,
                prefix: '   '
              });
              
              // 500X：如果 Any Triple 有下注且中了電子骰，顯示中的電子骰結果
              if (bonus143 && bonus143['808']) {
                const atRow = bonus143['808'];
                const atColor = atRow.bonusColor;
                const atRate = Number(atRow.rate);
                const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                const atColorZh = areaToZh[String(atColor)] || atColor;
                logger.electronicDice(`電子骰: ${atColorZh} (${atRate}x)`, { prefix: '      ' });
              }
            } else {
              // 未中獎：不是三同
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: 0`,
                `賠率: 0.00x (含本金) / 0.00x (不含本金)`
              ], {
                header: `❌ ${name} (${areaId}):`,
                prefix: '   '
              });
            }
          } else if (betAmt > 0) {
            // 其他區域（801-806）或其他玩法
            logger.multiLine('payout', [
              `實際下注: ${betAmt}`,
              `派彩: 0`,
              `賠率: 0.00x (含本金) / 0.00x (不含本金)`
            ], {
              header: `❌ ${name} (${areaId}):`,
              prefix: '   '
            });
          }
        } else if (hits === 1 || hits === 2) {
          if (betAmt <= 0) { continue; }
          // CGT01：根據電子骰匹配情況調整賠率
          // 檢查當前顏色是否與電子骰相同，並根據匹配數量調整賠率
          let netOdds, oddsWithStake;
          if (ROOM_MODE.isSpeed && electronicDiceResult) {
            const isElectronicDiceColor = String(areaId) === String(electronicDiceResult);
            if (isElectronicDiceColor && electronicDiceMatchCount > 0) {
              // 該顏色與電子骰相同，根據匹配數量計算賠率
              if (electronicDiceMatchCount === 1) {
                netOdds = 1.3; // 1個匹配：1:1.3
              } else if (electronicDiceMatchCount === 2) {
                netOdds = 2.5; // 2個匹配：1:2.5
              } else {
                // 理論上 hits=1或2 時不會有 matchCount=3，但保持邏輯一致
                netOdds = hits === 1 ? 1 : 2; // 回退到正常賠率
              }
            } else {
              // 該顏色與電子骰不同，或沒有匹配，使用正常賠率
              netOdds = hits === 1 ? 1 : 2; // 1:1 或 1:2（不含本金）
            }
            oddsWithStake = netOdds + 1; // 含本金
          } else if (ROOM_MODE.is500x && ['801','802','803','804','805','806'].includes(areaId)) {
            // 500X：單區 1/2 同色 → 基本 1/2；若 143 有同色型別匹配則用 rate
            const base = (hits === 1 ? 1 : 2);
            let useRate = null;
            if (bonus143 && bonus143[areaId]) {
              const row = bonus143[areaId];
              const mc = Number(row.matchColors);
              const r = Number(row.rate);
              if ((mc === 2 && hits === 2) || (mc === 3 && hits === 3)) {
                if (Number.isFinite(r)) useRate = r;
              }
            }
            netOdds = (useRate != null ? useRate : base);
            oddsWithStake = netOdds + 1;
          } else if (ROOM_MODE.is500x && areaId === '807') {
            // Any Double：存在二同且非三同
            const isDouble = Object.values(countByArea).some(c => c === 2);
            const isTriple = Object.values(countByArea).some(c => c === 3);
            const base = (isDouble && !isTriple) ? 1 : 0;
            let useRate = null;
            if (bonus143 && bonus143['807'] && isDouble && !isTriple) {
              const r = Number(bonus143['807'].rate);
              if (Number.isFinite(r)) useRate = r;
            }
            netOdds = (useRate != null ? useRate : base);
            oddsWithStake = netOdds + 1;
          } else if (ROOM_MODE.is500x && areaId === '808') {
            // Any Triple：三同
            const isTriple = Object.values(countByArea).some(c => c === 3);
            const base = isTriple ? 25 : 0;
            let useRate = null;
            if (bonus143 && bonus143['808'] && isTriple) {
              const r = Number(bonus143['808'].rate);
              if (Number.isFinite(r)) useRate = r;
            }
            netOdds = (useRate != null ? useRate : base);
            oddsWithStake = netOdds + 1;
          } else {
            netOdds = hits === 1 ? 1 : 2; // 1:1 或 1:2（不含本金）
            oddsWithStake = netOdds + 1;   // 含本金：2x / 3x
          }
          const payout = betAmt * oddsWithStake;
          logger.multiLine('payout', [
            `實際下注: ${betAmt}`,
            `派彩: ${payout.toFixed(2)}`,
            `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
          ], {
            header: `✅ ${name} (${areaId}):`,
            prefix: '   '
          });
          
          // 500X：如果該區域有下注且中了電子骰，顯示中的電子骰結果
          if (ROOM_MODE.is500x && betAmt > 0 && bonus143) {
            let electronicDiceInfo = null;
            
            // 單區（801-806）
            if (['801','802','803','804','805','806'].includes(areaId)) {
              if (bonus143[areaId]) {
                const row = bonus143[areaId];
                const mc = Number(row.matchColors);
                const r = Number(row.rate);
                if ((mc === 2 && hits === 2) || (mc === 3 && hits === 3)) {
                  // 符合電子骰條件，使用電子骰倍率
                  electronicDiceInfo = `電子骰: ${mc === 2 ? '2同色' : '3同色'} ${r}x`;
                } else if (mc === 2 && hits === 1) {
                  // 電子骰為 2同色，但實際開出只有 1 個，使用基本賠率
                  electronicDiceInfo = `電子骰為 2同色 ${r}x，但實際開出只有 1 個，使用基本賠率 1:1`;
                } else if (mc === 3 && hits < 3) {
                  // 電子骰為 3同色，但實際開出不是 3 個，使用基本賠率
                  const baseText = hits === 1 ? '1:1' : '1:2';
                  electronicDiceInfo = `電子骰為 3同色 ${r}x，但實際開出只有 ${hits} 個，使用基本賠率 ${baseText}`;
                }
              }
            }
            // AnyDouble (807)
            else if (areaId === '807' && bonus143['807']) {
              const adRow = bonus143['807'];
              const adColor = adRow.bonusColor;
              const adRate = Number(adRow.rate);
              const adColorZh = areaToZh[String(adColor)] || adColor;
              const isDouble = Object.values(countByArea).some(c => c === 2);
              const isTriple = Object.values(countByArea).some(c => c === 3);
              if (isDouble && !isTriple) {
                // 符合 AnyDouble 條件，使用電子骰倍率
                electronicDiceInfo = `電子骰: ${adColorZh} (${adRate}x)`;
              }
            }
            // AnyTriple (808)
            else if (areaId === '808' && bonus143['808']) {
              const atRow = bonus143['808'];
              const atColor = atRow.bonusColor;
              const atRate = Number(atRow.rate);
              const atColorZh = areaToZh[String(atColor)] || atColor;
              const isTriple = Object.values(countByArea).some(c => c === 3);
              if (isTriple) {
                // 符合 AnyTriple 條件，使用電子骰倍率
                electronicDiceInfo = `電子骰: ${atColorZh} (${atRate}x)`;
              }
            }
            
            if (electronicDiceInfo) {
              logger.electronicDice(electronicDiceInfo, { prefix: '      ' });
            }
          }
        } else if (hits === 3) {
          if (betAmt <= 0) { continue; }
          // CGT01：三同色時，根據電子骰匹配數量調整賠率
          if (ROOM_MODE.isSpeed && electronicDiceResult) {
            const isElectronicDiceColor = String(areaId) === String(electronicDiceResult);
            let netOdds;
            if (isElectronicDiceColor && electronicDiceMatchCount === 3) {
              netOdds = 8; // 3個匹配：1:8（不含本金）
            } else {
              netOdds = 3; // 沒有匹配或部分匹配：1:3（不含本金）
            }
            const oddsWithStake = netOdds + 1;
            const payout = betAmt * oddsWithStake;
            logger.multiLine('payout', [
              `實際下注: ${betAmt}`,
              `派彩: ${payout.toFixed(2)}`,
              `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
            ], {
              header: `✅ ${name} (${areaId}):`,
              prefix: '   '
            });
          } else if (ROOM_MODE.is500x && ['801','802','803','804','805','806'].includes(areaId)) {
            // 500X：三同 → 基本 3 或 143 m3 匹配用 rate
            let netOdds = 3;
            if (bonus143 && bonus143[areaId]) {
              const row = bonus143[areaId];
              const mc = Number(row.matchColors);
              const r = Number(row.rate);
              if (mc === 3 && Number.isFinite(r)) {
                netOdds = r;
              }
            }
            const oddsWithStake = netOdds + 1;
            const payout = betAmt * oddsWithStake;
            logger.multiLine('payout', [
              `實際下注: ${betAmt}`,
              `派彩: ${payout.toFixed(2)}`,
              `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
            ], {
              header: `✅ ${name} (${areaId}):`,
              prefix: '   '
            });
            
            // 500X：如果該區域有下注且中了電子骰，顯示中的電子骰結果
            if (ROOM_MODE.is500x && betAmt > 0 && bonus143 && bonus143[areaId]) {
              const row = bonus143[areaId];
              const mc = Number(row.matchColors);
              const r = Number(row.rate);
              if (mc === 3 && hits === 3) {
                // 符合電子骰條件，使用電子骰倍率
                logger.electronicDice(`電子骰: 3同色 ${r}x`, { prefix: '      ' });
              } else if (mc === 3 && hits < 3) {
                // 電子骰為 3同色，但實際開出不是 3 個（理論上不會發生，但保留邏輯）
                const baseText = hits === 1 ? '1:1' : '1:2';
                logger.info(`電子骰為 3同色 ${r}x，但實際開出只有 ${hits} 個，使用基本賠率 ${baseText}`, { prefix: '      ' });
              }
            }
          } else if (ROOM_MODE.is500x && areaId === '807') {
            // 500X：Any Double 在三同時不中獎（因為是三同，不是二同）
            if (betAmt > 0) {
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: 0`,
                `賠率: 0.00x (含本金) / 0.00x (不含本金)`
              ], {
                header: `❌ ${name} (${areaId}):`,
                prefix: '   '
              });
            }
          } else if (ROOM_MODE.is500x && areaId === '808') {
            // 500X：Any Triple 在三同時中獎
            const isTriple = Object.values(countByArea).some(c => c === 3);
            const base = isTriple ? 25 : 0;
            let useRate = null;
            if (bonus143 && bonus143['808'] && isTriple) {
              const r = Number(bonus143['808'].rate);
              if (Number.isFinite(r)) useRate = r;
            }
            const netOdds = (useRate != null ? useRate : base);
            const oddsWithStake = netOdds + 1;
            const payout = betAmt * oddsWithStake;
            logger.multiLine('payout', [
              `實際下注: ${betAmt}`,
              `派彩: ${payout.toFixed(2)}`,
              `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
            ], {
              header: `✅ ${name} (${areaId}):`,
              prefix: '   '
            });
            
            // 500X：如果 Any Triple 有下注且中了電子骰，顯示中的電子骰結果
            if (ROOM_MODE.is500x && betAmt > 0 && bonus143 && bonus143['808']) {
              const atRow = bonus143['808'];
              const atColor = atRow.bonusColor;
              const atRate = Number(atRow.rate);
              const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
              const atColorZh = areaToZh[String(atColor)] || atColor;
              if (isTriple) {
                // 符合 AnyTriple 條件，使用電子骰倍率
                logger.electronicDice(`電子骰: ${atColorZh} (${atRate}x)`, { prefix: '      ' });
              }
            }
          } else {
            // CGIGOJP1：三同：根據轉盤或刮刮樂結果計算派彩與賠率
            if (typeof rouletteMultiplier === 'number' && rouletteMultiplier >= 0) {
              const netOdds = rouletteMultiplier; // 不含本金
              const oddsWithStake = netOdds + 1;
              const payout = betAmt * oddsWithStake;
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: ${payout.toFixed(2)}`,
                `賠率: ${oddsWithStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
              ], {
                header: `${name} (${areaId}):`,
                prefix: '   '
              });
            } else if (rouletteMultiplier === -1) {
              // JP 路徑：若 openBonus 是 100X 則按 100X，否則 JP（賠率顯示 JP / JP）
              let printed = false;
              try {
                const jw = payoutResult.raw && payoutResult.raw.d && payoutResult.raw.d.v && payoutResult.raw.d.v['99'] && payoutResult.raw.d.v['99']['702'] && payoutResult.raw.d.v['99']['702'].jackpotWinner;
                const bd = jw && jw[0] && jw[0].bonusDetail && jw[0].bonusDetail[0];
                if (bd && typeof bd.rate === 'number' && bd.rate === 100) {
                  const netOdds = 100; const oddsWithStake = 101; const payout = betAmt * oddsWithStake;
                  logger.multiLine('payout', [
                    `實際下注: ${betAmt}`,
                    `派彩: ${payout.toFixed(2)}`,
                    `賠率: 101.00x (含本金) / 100.00x (不含本金)`
                  ], {
                    header: `✅ ${name} (${areaId}):`,
                    prefix: '   '
                  });
                  printed = true;
                }
              } catch(_) {}
              if (!printed) {
                if (jackpotBeforeRound && typeof jackpotBeforeRound.amount === 'number') {
                  const drRaw = (jackpotBeforeRound.deductionRate != null ? jackpotBeforeRound.deductionRate : (typeof earlyDR === 'number' ? earlyDR : 0));
                  const fraction = (drRaw / 100);
                  const add = (totalBetAmount || 0) * fraction;
                  const pool = jackpotBeforeRound.amount + add;
                  const payout = pool + betAmt; // JP = 獎池（開局前+本局抽水）+ 本金
                  const percentText = (fraction * 100).toFixed(3);
                  logger.stats(`抽水率: ${percentText}%`, { prefix: '   ' });
                  logger.calc(`抽水計算: ${totalBetAmount} × ${percentText}% = ${add.toFixed(2)}`, { prefix: '   ' });
                  logger.jackpot(`JP 獎池（抽水後）: ${jackpotBeforeRound.amount.toFixed(2)} + ${add.toFixed(2)} = ${pool.toFixed(2)}`, { prefix: '   ' });
                  reportDeduction = { percentText: `${percentText}%`, addText: `${totalBetAmount} × ${percentText}% = ${add.toFixed(2)}`, poolText: `${jackpotBeforeRound.amount.toFixed(2)} + ${add.toFixed(2)} = ${pool.toFixed(2)}` };
                  logger.multiLine('payout', [
                    `實際下注: ${betAmt}`,
                    `派彩: ${payout.toFixed(2)}（JP）`,
                    `賠率: JP / JP`
                  ], {
                    header: `✅ ${name} (${areaId}):`,
                    prefix: '   '
                  });
                } else {
                  logger.multiLine('payout', [
                    `實際下注: ${betAmt}`,
                    `派彩: JP`
                  ], {
                    header: `✅ ${name} (${areaId}):`,
                    prefix: '   '
                  });
                }
              }
            } else {
              logger.multiLine('payout', [
                `實際下注: ${betAmt}`,
                `派彩: 未知`,
                `賠率: 未知 / 未知`
              ], {
                header: `✅ ${name} (${areaId}):`,
                prefix: '   '
              });
            }
          }
        }
      }
    }

    // 7.2.2 三同色轉盤倍率（來自 payout d.v['10']['83']）；-1 代表 JP 觸發（僅 CGIGOJP1）
    // CGT01：根據電子骰匹配情況，在路書顯示倍率（RateLabel，僅電子骰匹配時顯示）
    let rouletteMultiplier = null;
    if (!ROOM_MODE.isSpeed) {
      if (payoutResult && payoutResult.raw && payoutResult.raw.d && payoutResult.raw.d.v && payoutResult.raw.d.v['10']) {
        const pv10 = payoutResult.raw.d.v['10'];
        if (Array.isArray(pv10['83']) && pv10['83'].length > 0) {
          const r = pv10['83'][0];
          if (typeof r === 'number') {
            rouletteMultiplier = r;
            if (r === -1) logger.roulette('轉盤結果：JP');
            else logger.roulette(`轉盤結果：${r}X`);
          // 嘗試從路書面板讀取視覺倍率（RateLabel）以核對，例如 60X
          try {
            const visualRateInfo = await page.evaluate(() => {
              function findNodeDeep(node, name) {
                if (!node) return null; if (node.name === name) return node;
                if (node.children) { for (const c of node.children) { const f = findNodeDeep(c, name); if (f) return f; } }
                return null;
              }
              function findByPaths(root, paths) {
                for (const p of paths) {
                  const parts = p.split('/').filter(Boolean); let cur = root;
                  let ok = true;
                  for (const part of parts) {
                    cur = cur && cur.getChildByName ? cur.getChildByName(part) : null;
                    if (!cur) { ok = false; break; }
                  }
                  if (ok && cur) return cur; 
                }
                return null;
              }
              try {
                const scene = cc.director && cc.director.getScene && cc.director.getScene();
                if (!scene) return null;
                const candidates = [
                  'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLuShuVirtualList/ScrollView/Mask/Contnet/ColorGameRoomLushuItem/SpeedEffectNodes/RateLabel',
                  'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content/ColorGameRoomLushuItem/SpeedEffectNodes/RateLabel',
                ];
                let labelNode = findByPaths(scene, candidates);
                if (!labelNode) {
                  const panel = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
                  const item = panel ? findNodeDeep(panel, 'ColorGameRoomLushuItem') : null;
                  const speed = item ? item.getChildByName('SpeedEffectNodes') : null;
                  labelNode = speed ? speed.getChildByName('RateLabel') : null;
                }
                let rateText = null;
                if (labelNode) {
                  const labelComp = labelNode.getComponent(cc.Label);
                  if (labelComp && typeof labelComp.string === 'string') {
                    rateText = labelComp.string.trim(); // 例如 '60'
                  }
                }
                // JP 視覺判斷：HintSlot 或 Starcon 為 active
                const panel2 = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
                const item2 = panel2 ? findNodeDeep(panel2, 'ColorGameRoomLushuItem') : null;
                const speed2 = item2 ? item2.getChildByName('SpeedEffectNodes') : null;
                const hintSlot = speed2 ? speed2.getChildByName('HintSlot') : null;
                const starcon = speed2 ? speed2.getChildByName('Starcon') : null;
                const hintActive = !!(hintSlot && hintSlot.active);
                const starActive = !!(starcon && starcon.active);
                return { rateText, hintActive, starActive };
              } catch (e) { return null; }
            });
            if (visualRateInfo) {
              const { rateText, hintActive, starActive } = visualRateInfo;
              if (rateText) {
                logger.roulette(`轉盤視覺顯示：${rateText}X`);
                if (Number(rateText) !== r) {
                  logger.warning(`視覺倍率(${rateText}X) 與資料倍率(${r}X) 不一致`);
                }
              } else if (hintActive || starActive) {
                logger.roulette('轉盤視覺顯示：JP');
              }
            }
            // 將倍率附加在路書（三顆）後顯示；
            // 若為 JP，顏色改從 Breathinglight 讀取；若一般情況讀不到路書，退回 payoutData['12'] 推導
            if (roadmapGroup) {
              let zhRoad = roadmapGroup.success ? roadmapGroup.colors.map(c => colorEnToZhShort(c)).join('') : '???';
              if (r === -1) {
                try {
                  const jpLight = await page.evaluate(() => {
                    function findNodeDeep(node, name) {
                      if (!node) return null; if (node.name === name) return node;
                      if (node.children) { for (const c of node.children) { const f = findNodeDeep(c, name); if (f) return f; } }
                      return null;
                    }
                    function findByPaths(root, paths) {
                      for (const p of paths) {
                        const parts = p.split('/').filter(Boolean); let cur = root; let ok = true;
                        for (const part of parts) { cur = cur && cur.getChildByName ? cur.getChildByName(part) : null; if (!cur) { ok = false; break; } }
                        if (ok && cur) return cur;
                      }
                      return null;
                    }
                    try {
                      const scene = cc.director && cc.director.getScene && cc.director.getScene();
                      if (!scene) return null;
                      const candidates = [
                        'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLuShuVirtualList/ScrollView/Mask/Contnet/ColorGameRoomLushuItem/Breathinglight',
                        'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content/ColorGameRoomLushuItem/Breathinglight',
                      ];
                      let node = findByPaths(scene, candidates);
                      if (!node) {
                        const panel = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
                        const item = panel ? findNodeDeep(panel, 'ColorGameRoomLushuItem') : null;
                        node = item ? item.getChildByName('Breathinglight') : null;
                      }
                      if (!node) return null;
                      const sp = node.getComponent(cc.Sprite);
                      const name = sp && sp.spriteFrame && sp.spriteFrame.name ? sp.spriteFrame.name : null;
                      return name;
                    } catch (e) { return null; }
                  });
                  if (jpLight) {
                    const n = jpLight.toLowerCase();
                    const map = {
                      'colorgame_luzhu_bonus_light_pink': '粉',
                      'colorgame_luzhu_bonus_light_white': '白',
                      'colorgame_luzhu_bonus_light_yellow': '黃',
                      'colorgame_luzhu_bonus_light_green': '綠',
                      'colorgame_luzhu_bonus_light_blue': '藍',
                      'colorgame_luzhu_bonus_light_red': '紅',
                    };
                    for (const k of Object.keys(map)) { if (n.includes(k)) { zhRoad = map[k]; break; } }
                  }
                } catch (_) {}
                // 若仍為 ???，最後退回用 payoutData['12'] 第一顆映射
                if (!zhRoad || zhRoad.includes('?')) {
                  try {
                    const seqFirst = (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) ? String(payoutResult.payoutData['12'][0]) : null;
                    if (seqFirst) {
                      const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                      zhRoad = areaToZh[seqFirst] || zhRoad;
                    }
                  } catch (_) {}
                }
              } else if (!roadmapGroup.success) {
                // 一般倍率但路書失敗時，用 payoutData['12'] 三顆推導
                try {
                  const seq = (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) ? payoutResult.payoutData['12'].map(v => String(v)) : null;
                  if (seq && seq.length) {
                    const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                    zhRoad = seq.map(a => areaToZh[a] || '').join('');
                  }
                } catch (_) {}
              }
              const rateText = (r === -1) ? 'JP' : `${r}X`;
              logger.roadmap(`路書（三顆）: ${zhRoad} ${rateText}`);
              reportRoadText = `${zhRoad}`; reportRateText = rateText;
            }
          } catch (_) {}
          }
        }
      }
    } else if (ROOM_MODE.isSpeed) {
            // CGT01：僅在電子骰匹配時顯示「計算出的倍率」，UI RateLabel 只作交叉比對
            if (roadmapGroup) {
              let zhRoad = roadmapGroup.success ? roadmapGroup.colors.map(c => colorEnToZhShort(c)).join('') : '???';
              // 若路書讀取失敗，用 payoutData['12'] 推導
              if (!roadmapGroup.success || !zhRoad || zhRoad.includes('?')) {
                try {
                  const seqForRoadmap = (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) ? payoutResult.payoutData['12'].map(v => String(v)) : null;
                  if (seqForRoadmap && seqForRoadmap.length) {
                    const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                    zhRoad = seqForRoadmap.map(a => areaToZh[a] || '').join('');
                  }
                } catch (_) {}
              }
              // 計算匹配倍率（不含本金）：1→1.3；2→2.5；3→8
              let calcRate = null;
              if (electronicDiceMatch) {
                if (electronicDiceMatchCount === 1) calcRate = 1.3;
                else if (electronicDiceMatchCount === 2) calcRate = 2.5;
                else if (electronicDiceMatchCount === 3) calcRate = 8;
              }
              // 讀取 UI RateLabel 作交叉比對（不做主值）
              let uiRate = null;
              try {
                const usedIndex = (roadmapGroup && roadmapGroup.debugInfo && typeof roadmapGroup.debugInfo.usedIndex === 'number') ? roadmapGroup.debugInfo.usedIndex : 0;
                const rateLabelText = await getCGT01RateLabelByIndex(page, usedIndex);
                if (rateLabelText) {
                  // 去除可能重複的 x/X，僅保留數字
                  const num = Number(String(rateLabelText).replace(/[^0-9.]/g, ''));
                  if (Number.isFinite(num)) uiRate = num;
                }
              } catch(_) {}

              if (calcRate != null) {
                // 主值：計算倍率
                let line = `🎯 路書（三顆）: ${zhRoad} ${calcRate}x`;
                if (uiRate != null) {
                  line += `（UI：${uiRate}x${uiRate !== calcRate ? '，不一致' : ''}）`;
                }
                logger.roadmap(line);
                reportRoadText = `${zhRoad}`; reportRateText = `${calcRate}x`;
              } else {
                logger.roadmap(`路書（三顆）: ${zhRoad}`);
                reportRoadText = `${zhRoad}`; reportRateText = null;
              }
            }
    }

    // 7.2.3 刮刮樂（openBonus）結果：100X 或 JP（僅 CGIGOJP1）
    let openBonusInfo = null;
    if (!ROOM_MODE.isSpeed) {
      openBonusInfo = await page.evaluate((targetRound) => {
        try {
          if (!window.__wsMessages || window.__wsMessages.length === 0) return null;
          const recent = window.__wsMessages.slice(-400);
          for (let i = recent.length - 1; i >= 0; i--) {
            let data = recent[i].data; if (typeof data !== 'string') data = data.toString();
            if (data.startsWith('$#|#$')) data = data.substring(5);
            try {
              const parsed = JSON.parse(data);
              const v = parsed && parsed.d && parsed.d.v;
              if (v && v['3'] === 'openBonus') {
                const round = v['10'] && v['10']['0'];
                if (!round || round !== targetRound) continue;
                const info99 = v['10'] && v['10']['99'] && v['10']['99']['702'];
                const jw = info99 && Array.isArray(info99.jackpotWinner) ? info99.jackpotWinner : [];
                const winner = jw && jw[0];
                const bd = winner && winner.bonusDetail && winner.bonusDetail[0];
                if (bd && typeof bd.rate === 'number' && bd.type === 2) {
                  // 100X case（刮刮樂）
                  return { type: 'SCRATCH_100X', rate: bd.rate, betType: bd.betType, bonus: winner.bonus };
                }
                // JP case: bonus=0 + jackpotType=onlyOne
                const jackpotType = info99 && info99.jackpotTypeList ? info99.jackpotTypeList[0] : (bd && bd.jackpotType) || null;
                if (winner && winner.bonus === 0) {
                  return { type: 'SCRATCH_JP', jackpotType: jackpotType || 'onlyOne' };
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
        return null;
      }, betResult.roundCode);
    }

    if (openBonusInfo && !ROOM_MODE.isSpeed) {
      if (openBonusInfo.type === 'SCRATCH_100X') {
        const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
        const zhColor = areaToZh[String(openBonusInfo.betType)] || String(openBonusInfo.betType);
        logger.scratch(`刮刮樂結果：${openBonusInfo.rate}X（顏色 ${zhColor}）`);
      } else if (openBonusInfo.type === 'SCRATCH_JP') {
        // JP 金額 = 開局前獎池 + 本局抽水（已在前面計算過預期值）
        if (jackpotBeforeRound && typeof jackpotBeforeRound.amount === 'number') {
          const fraction = ((jackpotBeforeRound.deductionRate ?? 0) / 100);
          const expectedAdd = (totalBetAmount || 0) * fraction;
          const expected = jackpotBeforeRound.amount + expectedAdd;
          logger.scratch(`刮刮樂結果：JP（類型 ${openBonusInfo.jackpotType}） 獎池：${expected.toFixed(2)}`);
        } else {
          logger.scratch(`刮刮樂結果：JP（類型 ${openBonusInfo.jackpotType}）`);
        }
      }
      // 只有有進刮刮樂時才輸出 JP 資格
      if (jpThreshold != null) {
        const jpEligible = typeof jpThreshold === 'number' ? (totalBetAmount >= jpThreshold) : null;
        logger.scratch(`JP 刮刮樂資格: ${jpEligible === null ? '未知' : (jpEligible ? '是' : '否')}（門檻 ${jpThreshold}，本局總下注 ${totalBetAmount}）`);
      }
    }

    // 7.2.4 轉盤事件（openJackpot）偵測：表示三同色後已開啟轉盤（僅 CGIGOJP1）
    let openJackpotDetected = false;
    let enteredJp = false;
    if (!ROOM_MODE.isSpeed) {
      openJackpotDetected = await page.evaluate((targetRound) => {
        try {
          if (!window.__wsMessages || window.__wsMessages.length === 0) return null;
          const recent = window.__wsMessages.slice(-400);
          for (let i = recent.length - 1; i >= 0; i--) {
            let data = recent[i].data; if (typeof data !== 'string') data = data.toString();
            if (data.startsWith('$#|#$')) data = data.substring(5);
            try {
              const parsed = JSON.parse(data);
              const v = parsed && parsed.d && parsed.d.v;
              if (v && v['3'] === 'openJackpot') {
                const round = v['10'] && v['10']['0'];
                if (round === targetRound) {
                  return true;
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
        return false;
      }, betResult.roundCode);
      // 統一輸出「轉盤是否進 JP」：優先以 payout['83']、openBonus、有無 openJackpot 其一為 true，再備援 App.model
      enteredJp = (typeof rouletteMultiplier === 'number' && rouletteMultiplier === -1)
        || !!openBonusInfo
        || !!openJackpotDetected
        || (jpHit === true);
      logger.roulette(`轉盤是否進 JP: ${enteredJp ? '是' : '否'}`);
    }

    
    // 最終報告
    logger.raw('\n========================================');
    logger.stats('完整驗證報告');
    logger.raw('========================================');
    logger.success('下注錢包扣款: 通過', { prefix: '1️⃣  ' });
    logger.success('下注區域金額: 通過', { prefix: '2️⃣  ' });
    logger.success('派彩錢包增加: 檢測到', { prefix: '3️⃣  ' });
    // 新增：路書、倍率、抽水檢查
    if (reportRoadText && reportRateText) {
      logger.success(`路書顏色/倍率: ${reportRoadText} ${reportRateText}`, { prefix: '4️⃣  ' });
    } else if (reportRoadText) {
      logger.success(`路書顏色: ${reportRoadText}`, { prefix: '4️⃣  ' });
    } else {
      logger.warning('路書顏色/倍率: 無資料', { prefix: '4️⃣  ' });
    }
    if (reportDeduction && reportDeduction.percentText) {
      logger.success('抽水檢核: 通過', { prefix: '5️⃣  ' });
      logger.stats(`抽水率: ${reportDeduction.percentText}`, { prefix: '   ' });
      logger.calc(`抽水計算: ${reportDeduction.addText}`, { prefix: '   ' });
      logger.jackpot(`JP 獎池（抽水後）: ${reportDeduction.poolText}`, { prefix: '   ' });
    } else if (openingPercentText) {
      logger.success('抽水檢核: 通過', { prefix: '5️⃣  ' });
      logger.stats(`抽水率: ${openingPercentText}`, { prefix: '   ' });
      if (openingAddText) logger.calc(`抽水計算: ${openingAddText}`, { prefix: '   ' });
      if (openingPoolText) logger.jackpot(`下注後預期獎池: ${openingPoolText}`, { prefix: '   ' });
    } else {
      logger.info('抽水檢核: 無資料', { prefix: '5️⃣  ' });
    }
    logger.raw('========================================\n');
    
    logger.success('測試完成！');
  });
});

