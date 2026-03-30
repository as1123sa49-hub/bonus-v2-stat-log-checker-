/**
 * 長駐觀察：登入→進房→持續等待新開局（不結束測試）
 */

const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const TEST_CONFIG = require('../../config/testConfig');
const { getTestConfig } = require('../../config/testConfig');
const { initWebSocketMonitoring, waitForNewOpenRound } = require('../../src/helpers/webSocketHelper');
const { loginGame, closePWAPopup } = require('../../src/helpers/loginHelper');
const { enterRoom } = require('../../src/helpers/roomHelper');
const { placeBet, clickOpenBettingButton } = require('../../src/helpers/bettingHelper');
const { waitForPayout, getPrepareBonusResult } = require('../../src/helpers/payoutHelper');
const { getLatestBeadColors, colorEnToZhShort, getCGT01RateLabel } = require('../../src/helpers/roadmapHelper');
const { createDiceStats, incBucket, printDiceStats } = require('../../src/helpers/diceStatistics');
const { initDetailCsv, appendDetailCsv, loadSummaryCsv, writeSummaryCsv } = require('../../src/helpers/csvHelper');
const logger = require('../../src/utils/logger');

// 獲取 live-watch 專用配置
const TEST_SPECIFIC_CONFIG = getTestConfig('live-watch');
const TARGET_ROOM = TEST_SPECIFIC_CONFIG.targetRoom;
const TEST_BETS = TEST_SPECIFIC_CONFIG.bets;

test.describe('長駐觀察 - 持續等待新局號', () => {
  test(`${TARGET_ROOM} - 連線常駐，等待新開局`, async ({ page }) => {
    // 取消整體超時，避免長時間常駐被終止
    test.setTimeout(0);

    // 建議將 worker 設為 1：--workers=1，確保日誌順序

    await page.setViewportSize({ width: 414, height: 896 });
    await initWebSocketMonitoring(page);
    // 一次性：登入、關閉 PWA、進房
    await loginGame(page, TEST_CONFIG.gameUrl);
    await closePWAPopup(page);
    const roomResult = await enterRoom(page, TARGET_ROOM);
    if (!roomResult.success) {
      // 前端顯示可能已進入，增加備援檢查 App.model 或視圖名稱
      let inRoom = false;
      try {
        inRoom = await page.evaluate((room) => {
          try {
            const table = App && App.model && App.model.tableCollection && App.model.tableCollection.getTable && App.model.tableCollection.getTable(room);
            const view = cc && cc.director && cc.director.getScene && cc.director.getScene();
            const findNodeDeep = (node, name) => { if (!node) return null; if (node.name === name) return node; if (node.children) { for (const c of node.children) { const f = findNodeDeep(c, name); if (f) return f; } } return null; };
            const roomView = findNodeDeep(view, 'ColorGameSpeedRoomView') || findNodeDeep(view, 'ColorGameRoomView');
            return !!(table || roomView);
          } catch (e) { return false; }
        }, TARGET_ROOM);
      } catch (_) { inRoom = false; }
      if (!inRoom) {
      logger.error('進入房間失敗，結束長駐');
      return;
      } else {
        logger.warning('房間進入回報失敗，但前端檢測顯示已在房內，持續執行');
      }
    }

    logger.raw(`
========================================`);
    logger.raw(`長駐模式：等待新局並自動下注/驗證（房間：${TARGET_ROOM}）`);
    logger.raw(`========================================\n`);

    // 目標局數（>0 則達標自動結束）
    const TARGET_ROUNDS = Number(process.env.DICE_TARGET_ROUNDS || 0);

    // 取得當前局號（若可得）
    let lastRound = null;
    try {
      lastRound = await page.evaluate((room) => {
        try {
          const table = App.model.tableCollection.getTable(room);
          return table && (table._originRoundCode || table._roundCode) || null;
        } catch (_) { return null; }
      }, TARGET_ROOM);
    } catch (_) {}

    if (lastRound) {
      logger.info(`當前局號: ${lastRound}`);
    }

    // ============================================
    // 500X 統計功能初始化（當前主要功能）
    // ============================================
    let diceStats = null;
    let csvDir = null;
    let csvPath = null;
    
    if (TEST_CONFIG.features.enableStats) {
      // 統計：電子骰（betstop d.v[10][143]）次數累積（純次數）
      diceStats = createDiceStats();
      
      // CSV 檔案初始化
      csvDir = path.join(process.cwd(), 'reports');
      csvPath = path.join(csvDir, 'detail239.csv');
      initDetailCsv(csvDir, csvPath);
      
      // 讀取現有的 summary CSV 並合併到 diceStats（持續累加）
      loadSummaryCsv(diceStats, csvDir, TARGET_ROOM);
    }

    /**
     * 讀取 betstop 事件的 d.v[10][143] 數據
     * @param {string} targetRoundCode - 目標局號
     * @returns {Promise<Object|null>} 143 數據或 null
     */
    async function readBetstop142ForRound(targetRoundCode) {
      try {
        const got = await page.evaluate((roundCode) => {
          try {
            if (!window.__wsMessages || window.__wsMessages.length === 0) return null;
            const recent = window.__wsMessages.slice(-500);
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
                  if (info143 && typeof info143 === 'object') {
                    return info143; // 返回整個 143 物件
                  }
                }
              } catch (_) {}
            }
          } catch (_) {}
          return null;
        }, targetRoundCode);
        return got;
      } catch (_) { return null; }
    }

    // 無限循環：持續等待新開局
    // 小提醒：使用 Ctrl+C 中止，或在另一終端停止測試命令
    // 若需保活心跳，可在迴圈中追加適度 page.waitForTimeout
    // 以及捕捉斷線情況重試
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nextRound = await waitForNewOpenRound(page, TARGET_ROOM, lastRound, 120);
      if (!nextRound) {
        logger.warning('等待新開局超時，將持續等待...');
        await page.waitForTimeout(500);
        continue;
      }

      logger.success(`檢測到新開局: ${nextRound}`);
      lastRound = nextRound;

      // ============================================
      // 500X 統計功能（當前主要功能）
      // ============================================
      if (TEST_CONFIG.features.enableStats) {
        try {
          const maxMs = 20000; const interval = 300; let waited = 0; let info142 = null;
          while (waited <= maxMs) {
            info142 = await readBetstop142ForRound(nextRound);
            if (info142) break;
            await page.waitForTimeout(interval); waited += interval;
          }
          if (info142) {
            diceStats.totals.roundsWith142 += 1;
            let seen807 = false; let seen808 = false; let seen2 = false; let seen3 = false;
            const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
            const singleSummaryParts = [];
            let anyDoubleSummary = null; let anyTripleSummary = null;
            // 第一遍遍歷：只設置 seen 標誌，不立即 incBucket
            for (const k of Object.keys(info142)) {
              const key = String(k); const row = info142[key] || {};
              if (['801','802','803','804','805','806'].includes(key)) {
                const rate = row.rate; const m = row.matchColors;
                if (m === 2) { seen2 = true; }
                else if (m === 3) { seen3 = true; }
                if (m === 2 || m === 3) {
                  const tag = m === 2 ? 'm2' : 'm3';
                  const label = areaToZh[key] || key;
                  singleSummaryParts.push(`${tag} ${label} ${String(rate)}x`);
                }
              } else if (key === '807') {
                const rate = row.rate; const bc = String(row.bonusColor);
                if (['801','802','803','804','805','806'].includes(bc)) { seen807 = true; anyDoubleSummary = `${areaToZh[bc] || bc} ${String(rate)}x`; }
              } else if (key === '808') {
                const rate = row.rate; const bc = String(row.bonusColor);
                if (['801','802','803','804','805','806'].includes(bc)) { seen808 = true; anyTripleSummary = `${areaToZh[bc] || bc} ${String(rate)}x`; }
              }
            }
            // 判斷是否同時出現（both）
            const bothSingle = seen2 && seen3;
            const bothAny = seen807 && seen808;
            // 第二遍遍歷：只有在不是 both 的情況下才 incBucket
            for (const k of Object.keys(info142)) {
              const key = String(k); const row = info142[key] || {};
              if (['801','802','803','804','805','806'].includes(key)) {
                const rate = row.rate; const m = row.matchColors;
                // 如果同時有 m2 和 m3，不累計單獨項
                if (!bothSingle) {
                  if (m === 2) { incBucket(diceStats.single2, key, rate); }
                  else if (m === 3) { incBucket(diceStats.single3, key, rate); }
                }
              } else if (key === '807') {
                const rate = row.rate; const bc = String(row.bonusColor);
                // 如果同時有 807 和 808，不累計單獨項
                if (!bothAny && ['801','802','803','804','805','806'].includes(bc)) {
                  incBucket(diceStats.anyDouble, bc, rate);
                }
              } else if (key === '808') {
                const rate = row.rate; const bc = String(row.bonusColor);
                // 如果同時有 807 和 808，不累計單獨項
                if (!bothAny && ['801','802','803','804','805','806'].includes(bc)) {
                  incBucket(diceStats.anyTriple, bc, rate);
                }
              }
            }
            // 只有在不是 both 的情況下才增加 totals 計數
            if (!bothSingle) {
              if (seen2) diceStats.totals.roundsWithMatch2 += 1;
              if (seen3) diceStats.totals.roundsWithMatch3 += 1;
            } else {
              diceStats.totals.roundsWithSingle2and3 += 1;
            }
            if (!bothAny) {
              if (seen807) diceStats.totals.roundsWith807 += 1;
              if (seen808) diceStats.totals.roundsWith808 += 1;
            } else {
              diceStats.totals.roundsWithAnyDoubleAndTriple += 1;
            }
            // Per-round concise line
            const singleSummary = singleSummaryParts.length ? singleSummaryParts.join(' ; ') : '-';
            const adSummary = anyDoubleSummary || '-';
            const atSummary = anyTripleSummary || '-';
            // 拆分出 m2 / m3 顏色與倍率，便於 CSV 分欄
            const parseCR = (s) => {
              const m = String(s).trim().match(/^(\S+)\s+(\d+)/);
              return m ? { c: m[1], r: m[2] } : { c: s, r: '' };
            };
            const m2Arr = singleSummaryParts.filter(p => p.startsWith('m2 ')).map(p => p.replace(/^m2\s+/, ''));
            const m3Arr = singleSummaryParts.filter(p => p.startsWith('m3 ')).map(p => p.replace(/^m3\s+/, ''));
            const m2Colors = m2Arr.map(x => parseCR(x).c).join(' | ');
            const m2Rates = m2Arr.map(x => parseCR(x).r).join(' | ');
            const m3Colors = m3Arr.map(x => parseCR(x).c).join(' | ');
            const m3Rates = m3Arr.map(x => parseCR(x).r).join(' | ');
            logger.stats(`本局 500X 結果｜Single: ${singleSummary}｜Any Double: ${adSummary}｜Any Triple: ${atSummary}｜局號: ${nextRound}`);
            // 記錄最近局號
            diceStats.recentRounds.push(nextRound);
            if (diceStats.recentRounds.length > 20) diceStats.recentRounds = diceStats.recentRounds.slice(-20);
            const bothSingleStr = bothSingle ? '是' : '否';
            const bothAnyStr = bothAny ? '是' : '否';
            const parseSingle = (txt) => {
              if (!txt || txt === '-') return { c: '', r: '' };
              const m = String(txt).trim().match(/^(\S+)\s+(\d+)/);
              return m ? { c: m[1], r: m[2] } : { c: txt, r: '' };
            };
            const ad = parseSingle(adSummary);
            const at = parseSingle(atSummary);
            appendDetailCsv(csvPath, nextRound, m2Colors, m2Rates, m3Colors, m3Rates, ad.c, ad.r, at.c, at.r, bothSingleStr, bothAnyStr);
            printDiceStats(diceStats, TEST_CONFIG.areaNames);
            if (TARGET_ROUNDS > 0 && diceStats.totals.roundsWith142 >= TARGET_ROUNDS) {
              writeSummaryCsv(diceStats, csvDir, TARGET_ROOM);
              logger.success(`目標局數已達成（${diceStats.totals.roundsWith142}/${TARGET_ROUNDS}），結束測試。`);
              return;
            }
          } else {
            logger.info('本局未收到 betstop d.v[10][142]（超時）');
          }
        } catch (e) {
          logger.warning(`統計功能執行失敗: ${e.message}`);
        }
      }

      // ============================================
      // 預留功能：下注檢測（日後啟用）
      // ============================================
      // TODO: 待實現完整的下注驗證邏輯
      // 啟用方式：在 testConfig.js 中設置 features.enableBetting = true
      // ============================================
      if (TEST_CONFIG.features.enableBetting) {
        // 實際下注清單
        try {
          const activeBets = TEST_BETS.filter(bet => bet.amount > 0);
          const actualBetsList = (betResult && Array.isArray(betResult.bets) ? betResult.bets : activeBets);
          if (actualBetsList && actualBetsList.length) {
            logger.betting('實際下注:');
            for (const b of actualBetsList) {
              if (b.amount && b.amount > 0) {
                const name = TEST_CONFIG.areaNames[b.area] || b.area;
                logger.betting(`${name} (${b.area}): ${b.amount}`, { prefix: '   • ' });
              }
            }
          }
        } catch (e) {
          logger.warning(`下注功能執行失敗: ${e.message}`);
        }
      }

      // ============================================
      // 預留功能：派彩檢測（日後啟用）
      // ============================================
      // TODO: 待實現完整的派彩驗證邏輯
      // 啟用方式：在 testConfig.js 中設置 features.enablePayout = true
      // ============================================
      if (TEST_CONFIG.features.enablePayout) {
        // 開局後 Jackpot 資訊（下單後再讀，避免延遲下注）（僅 CGIGOJP1）
        let jackpotBeforeRound = null;
        if (TARGET_ROOM !== 'CGT01') {
          jackpotBeforeRound = await page.evaluate((room) => {
        try {
          const table = App.model.tableCollection.getTable(room);
          if (!table || !table.round || !table.round._data || !table.round._data.data) return null;
          const jl = table.round._data.data.jackpotInfoList;
          const jp702 = jl && jl[702];
          if (!jp702 || !jp702.detail || !jp702.detail.onlyOne) return null;
          const dr = jp702.deductionRateList && jp702.deductionRateList[0] ? jp702.deductionRateList[0].deductionRate : null;
          return {
            amount: jp702.detail.onlyOne.amount ?? null,
            initAmount: jp702.detail.onlyOne.initAmount ?? null,
            payoutLimit: jp702.detail.onlyOne.payoutLimit ?? null,
            deductionRate: dr,
            jackpotType: jp702.deductionRateList && jp702.deductionRateList[0] ? jp702.deductionRateList[0].jackpotType : null
          };
        } catch (e) { return null; }
      }, TARGET_ROOM);

      logger.jackpot('開局後 Jackpot 資訊:');
      if (jackpotBeforeRound && jackpotBeforeRound.amount != null) {
        logger.wallet(`原始獎金: ${jackpotBeforeRound.amount.toFixed(2)}`, { prefix: '   ' });
        if (jackpotBeforeRound.deductionRate != null) {
          const fraction = jackpotBeforeRound.deductionRate / 100;
          const percentText = (fraction * 100).toFixed(3);
          const calc = totalBetAmount * fraction;
          const expected = jackpotBeforeRound.amount + calc;
          logger.stats(`設定抽水率: ${percentText}%`, { prefix: '   ' });
          logger.calc(`本次抽水驗算: ${totalBetAmount} × ${percentText}% = ${calc.toFixed(2)}`, { prefix: '   ' });
          logger.jackpot(`下注後預期獎金: ${jackpotBeforeRound.amount.toFixed(2)} + ${calc.toFixed(2)} = ${expected.toFixed(2)}`, { prefix: '   ' });
        }
      } else {
        logger.warning('無法讀取 Jackpot 資訊', { prefix: '   ' });
      }
      }

      // 派彩
        const payoutResult = await waitForPayout(
        page,
        betResult.roundCode,
        betResult.walletAfter,
        betResult.actualBets,
        60,
        TEST_CONFIG.areaNames,
        jackpotBeforeRound
      );

        // 錢包變化（三段）
        try {
          const beforeBet = typeof betResult.walletBefore === 'number' ? betResult.walletBefore : null;
          const afterBet = typeof betResult.walletAfter === 'number' ? betResult.walletAfter : null;
          const afterPayout = payoutResult && typeof payoutResult.walletAfter === 'number' ? payoutResult.walletAfter : null;
          if (beforeBet != null || afterBet != null || afterPayout != null) {
            logger.wallet('錢包變化:');
            if (beforeBet != null) logger.wallet(`下注前: ${beforeBet.toFixed(2)}`, { prefix: '   ' });
            if (afterBet != null) logger.wallet(`下注後: ${afterBet.toFixed(2)}`, { prefix: '   ' });
            if (afterPayout != null) logger.wallet(`派彩後: ${afterPayout.toFixed(2)}`, { prefix: '   ' });
            if (beforeBet != null && afterBet != null) logger.wallet(`下注階段變化: ${((afterBet - beforeBet) >= 0 ? '+' : '')}${(afterBet - beforeBet).toFixed(2)}`, { prefix: '   ' });
            if (afterBet != null && afterPayout != null) logger.wallet(`派彩變化: ${((afterPayout - afterBet) >= 0 ? '+' : '')}${(afterPayout - afterBet).toFixed(2)}`, { prefix: '   ' });
            if (beforeBet != null && afterPayout != null) logger.wallet(`總變化: ${((afterPayout - beforeBet) >= 0 ? '+' : '')}${(afterPayout - beforeBet).toFixed(2)}`, { prefix: '   ' });
          }
        } catch (e) {
          logger.warning(`派彩功能執行失敗: ${e.message}`);
        }
      }

      // ============================================
      // 預留功能：路書檢測（日後啟用）
      // ============================================
      // TODO: 待實現完整的路書驗證邏輯
      // 啟用方式：在 testConfig.js 中設置 features.enableRoadmap = true
      // ============================================
      if (TEST_CONFIG.features.enableRoadmap) {
        // 路書（三顆）與派彩顏色（三顆）
        try {
          await clickOpenBettingButton(page, TARGET_ROOM);
          const roadmap = await getLatestBeadColors(page, TARGET_ROOM);
          if (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) {
            const seq = payoutResult.payoutData['12'].map(v => String(v));
            const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
            const zhSeq = seq.map(a => areaToZh[a] || a).join('');
            logger.payout(`派彩顏色（三顆）: ${zhSeq}`);

            // CGT01 特殊處理：讀取電子骰結果並判斷是否匹配
            // 電子骰是單個顏色（第四個骰子），需要統計派彩中與電子骰相同的數量
            let electronicDiceMatch = false; // 是否有匹配（用於顯示）
            let electronicDiceMatchCount = 0; // 匹配數量（0/1/2/3），用於賠率計算
            let electronicDiceResult = null; // 電子骰顏色（單個區域 ID，如 "805"）
            if (TARGET_ROOM === 'CGT01') {
              const prepareBonusResult = await getPrepareBonusResult(page, betResult.roundCode);
              if (prepareBonusResult && prepareBonusResult.found && prepareBonusResult.electronicDice) {
                electronicDiceResult = prepareBonusResult.electronicDice; // 單個區域 ID（如 "805"）
                // 統計派彩中與電子骰相同的數量
                const matchCount = seq.filter(val => String(val) === String(electronicDiceResult)).length;
                electronicDiceMatch = matchCount > 0; // 只要有匹配就算匹配（用於顯示）
                electronicDiceMatchCount = matchCount; // 匹配數量供賠率計算使用
                const electronicZh = areaToZh[electronicDiceResult] || electronicDiceResult;
                const matchText = electronicDiceMatchCount > 0 ? ` ✅ 匹配（${electronicDiceMatchCount} 個）` : ' ❌ 不匹配';
                logger.electronicDice(`電子骰結果: ${electronicZh}${matchText}`);
              }
              // 路書顯示（僅在電子骰匹配時顯示倍率）
              if (roadmap && roadmap.success) {
                let zh = roadmap.colors.map(c => colorEnToZhShort(c)).join('');
                if (!zh || zh.includes('?')) {
                  zh = zhSeq;
                }
                // 若電子骰匹配，讀取 RateLabel 並顯示倍率
                if (electronicDiceMatch && electronicDiceMatchCount > 0) {
                  const rateLabelText = await getCGT01RateLabel(page);
                  if (rateLabelText) {
                    logger.roadmap(`路書（三顆）: ${zh} ${rateLabelText}X`);
                  } else {
                    logger.roadmap(`路書（三顆）: ${zh}`);
                  }
                } else {
                  logger.roadmap(`路書（三顆）: ${zh}`);
                }
              } else {
                logger.roadmap(`路書（三顆）: ${zhSeq}`);
              }
            } else {
              // CGIGOJP1：保持原有逻辑
              if (roadmap && roadmap.success) {
                const zh = roadmap.colors.map(c => colorEnToZhShort(c)).join('');
                logger.roadmap(`路書（三顆）: ${zh}`);
              }
            }
          }
        } catch (e) {
          logger.warning(`路書功能執行失敗: ${e.message}`);
        }

        // 各區域派彩詳情（僅列出有下注的區域）
        try {
          if (payoutResult && payoutResult.payoutData && Array.isArray(payoutResult.payoutData['12'])) {
            const seq = payoutResult.payoutData['12'].map(v => String(v));
            const countByArea = seq.reduce((m, a) => { m[a] = (m[a]||0)+1; return m; }, {});
            const byAreaMap = (betResult.actualBets||[]).reduce((m,b)=>{ m[String(b.area)] = b.actualAmount||0; return m; },{});

            // CGT01 特殊處理：讀取電子骰結果並判斷是否匹配
            // 電子骰是單個顏色（第四個骰子），需要統計派彩中與電子骰相同的數量
            let electronicDiceMatch = false; // 是否有匹配（用於顯示）
            let electronicDiceMatchCount = 0; // 匹配數量（0/1/2/3），用於賠率計算
            let electronicDiceResult = null; // 電子骰顏色（單個區域 ID，如 "805"）
            if (TARGET_ROOM === 'CGT01') {
              const prepareBonusResult = await getPrepareBonusResult(page, betResult.roundCode);
              if (prepareBonusResult && prepareBonusResult.found && prepareBonusResult.electronicDice) {
                electronicDiceResult = prepareBonusResult.electronicDice; // 單個區域 ID（如 "805"）
                // 統計派彩中與電子骰相同的數量
                const matchCount = seq.filter(val => String(val) === String(electronicDiceResult)).length;
                electronicDiceMatch = matchCount > 0; // 只要有匹配就算匹配（用於顯示）
                electronicDiceMatchCount = matchCount; // 匹配數量供賠率計算使用
                const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
                const electronicZh = areaToZh[electronicDiceResult] || electronicDiceResult;
                const matchText = electronicDiceMatchCount > 0 ? ` ✅ 匹配（${electronicDiceMatchCount} 個）` : ' ❌ 不匹配';
                logger.electronicDice(`電子骰結果: ${electronicZh}${matchText}`);
              }
            }

            // 讀取轉盤倍率（僅 CGIGOJP1）
            let rouletteMultiplier = null;
            if (TARGET_ROOM !== 'CGT01') {
              try {
                const pv10 = payoutResult && payoutResult.raw && payoutResult.raw.d && payoutResult.raw.d.v && payoutResult.raw.d.v['10'];
                if (pv10 && Array.isArray(pv10['83']) && pv10['83'].length > 0 && typeof pv10['83'][0] === 'number') {
                  rouletteMultiplier = pv10['83'][0];
                  // 顯示視覺倍率（RateLabel）以核對（僅 CGIGOJP1）
                  try {
                    const visualRateInfo = await page.evaluate(() => {
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
                          if (labelComp && typeof labelComp.string === 'string') rateText = labelComp.string.trim();
                        }
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
                        if (Number(rateText) !== rouletteMultiplier) {
                          logger.warning(`視覺倍率(${rateText}X) 與資料倍率(${rouletteMultiplier}X) 不一致`);
                        }
                      } else if (hintActive || starActive) {
                        logger.roulette('轉盤視覺顯示：JP');
                      }
                    }
                  } catch (_) {}
                }
              } catch (_) {}
            }

            logger.payout('各區域派彩詳情:');
            const activeBets = TEST_BETS.filter(bet => bet.amount > 0);
            const ordered = activeBets.map(b => String(b.area));
            for (const areaId of ordered) {
              const betAmt = byAreaMap[areaId] || 0;
              if (betAmt <= 0) continue;
              const hits = countByArea[areaId] || 0;
              const name = TEST_CONFIG.areaNames[areaId] || areaId;
              if (hits === 0) {
                logger.multiLine('payout', [
                  `實際下注: ${betAmt}`,
                  `派彩: 0`,
                  `賠率: 0.00x (含本金) / 0.00x (不含本金)`
                ], {
                  header: `${name} (${areaId}):`,
                  prefix: '   '
                });
              } else if (hits === 1 || hits === 2) {
                // CGT01：根據電子骰匹配情況調整賠率
                // 檢查當前顏色是否與電子骰相同，並根據匹配數量調整賠率
                let netOdds, withStake;
                if (TARGET_ROOM === 'CGT01' && electronicDiceResult) {
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
                  withStake = netOdds + 1; // 含本金
                } else {
                  netOdds = hits === 1 ? 1 : 2;
                  withStake = netOdds + 1;
                }
                const payout = betAmt * withStake;
                logger.multiLine('payout', [
                  `實際下注: ${betAmt}`,
                  `派彩: ${payout.toFixed(2)}`,
                  `賠率: ${withStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
                ], {
                  header: `${name} (${areaId}):`,
                  prefix: '   '
                });
              } else if (hits === 3) {
                // CGT01：三同色時，根據電子骰匹配數量調整賠率
                if (TARGET_ROOM === 'CGT01' && electronicDiceResult) {
                  const isElectronicDiceColor = String(areaId) === String(electronicDiceResult);
                  let netOdds;
                  if (isElectronicDiceColor && electronicDiceMatchCount === 3) {
                    netOdds = 8; // 3個匹配：1:8（不含本金）
                  } else {
                    netOdds = 3; // 沒有匹配或部分匹配：1:3（不含本金）
                  }
                  const withStake = netOdds + 1;
                  const payout = betAmt * withStake;
                  logger.multiLine('payout', [
                  `實際下注: ${betAmt}`,
                  `派彩: ${payout.toFixed(2)}`,
                  `賠率: ${withStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
                ], {
                  header: `${name} (${areaId}):`,
                  prefix: '   '
                });
                } else {
                  // CGIGOJP1：三同→轉盤
                  if (typeof rouletteMultiplier === 'number' && rouletteMultiplier >= 0) {
                    const netOdds = rouletteMultiplier; const withStake = netOdds + 1; const payout = betAmt * withStake;
                    logger.multiLine('payout', [
                  `實際下注: ${betAmt}`,
                  `派彩: ${payout.toFixed(2)}`,
                  `賠率: ${withStake.toFixed(2)}x (含本金) / ${netOdds.toFixed(2)}x (不含本金)`
                ], {
                  header: `${name} (${areaId}):`,
                  prefix: '   '
                });
                  } else if (rouletteMultiplier === -1) {
                    // JP 或 100X
                    let printed = false;
                    try {
                      const jw = payoutResult.raw && payoutResult.raw.d && payoutResult.raw.d.v && payoutResult.raw.d.v['99'] && payoutResult.raw.d.v['99']['702'] && payoutResult.raw.d.v['99']['702'].jackpotWinner;
                      const bd = jw && jw[0] && jw[0].bonusDetail && jw[0].bonusDetail[0];
                      if (bd && typeof bd.rate === 'number' && bd.rate === 100) {
                        logger.multiLine('payout', [
                          `實際下注: ${betAmt}`,
                          `派彩: ${(betAmt*101).toFixed(2)}`,
                          `賠率: 101.00x (含本金) / 100.00x (不含本金)`
                        ], {
                          header: `${name} (${areaId}):`,
                          prefix: '   '
                        });
                        printed = true;
                      }
                    } catch (_) {}
                    if (!printed) {
                      if (jackpotBeforeRound && typeof jackpotBeforeRound.amount === 'number') {
                        const drRaw = (jackpotBeforeRound.deductionRate != null ? jackpotBeforeRound.deductionRate : 0);
                        const fraction = drRaw / 100; const add = totalBetAmount * fraction; const pool = jackpotBeforeRound.amount + add;
                        const payout = pool + betAmt;
                        const percentText = (fraction * 100).toFixed(3);
                        logger.stats(`抽水率: ${percentText}%`, { prefix: '   ' });
                        logger.calc(`抽水計算: ${totalBetAmount} × ${percentText}% = ${add.toFixed(2)}`, { prefix: '   ' });
                        logger.jackpot(`JP 獎池（抽水後）: ${jackpotBeforeRound.amount.toFixed(2)} + ${add.toFixed(2)} = ${pool.toFixed(2)}`, { prefix: '   ' });
                        logger.multiLine('payout', [
                          `實際下注: ${betAmt}`,
                          `派彩: ${payout.toFixed(2)}（JP）`,
                          `賠率: JP / JP`
                        ], {
                          header: `${name} (${areaId}):`,
                          prefix: '   '
                        });
                      } else {
                        logger.multiLine('payout', [
                          `實際下注: ${betAmt}`,
                          `派彩: JP`
                        ], {
                          header: `${name} (${areaId}):`,
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
                      header: `${name} (${areaId}):`,
                      prefix: '   '
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.warning(`路書功能執行失敗: ${e.message}`);
        }
      }

      // 短暫暫停後等待下一局
      await page.waitForTimeout(500);
    }
  });
});


