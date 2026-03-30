/**
 * 下注輔助函數（移至 src/helpers）
 * 核心流程保持穩定版行為
 */

const { createRoomPathHelperScript } = require('./cocosHelper');
const TEST_CONFIG = require('../../config/testConfig');
const logger = require('../utils/logger');

function getEffectiveSettings(targetRoom) {
  const base = {
    strategyKey: TEST_CONFIG.strategyKey || 'normal',
    openButtonRequired: true,
    chipSelectDelayMs: 100,
    clickIntervalMs: 12,
    interAreaDelayMs: 15,
    retryMax: 4,
    fastMode: true
  };
  const ov = TEST_CONFIG.overrides || {};
  const perStrategy = (TEST_CONFIG.perStrategy && TEST_CONFIG.perStrategy[base.strategyKey]) || {};
  const perRoom = (TEST_CONFIG.perRoom && TEST_CONFIG.perRoom[targetRoom]) || {};
  const merged = {
    ...base,
    ...(perStrategy.strategyKey ? { strategyKey: perStrategy.strategyKey } : {}),
    ...(perStrategy.overrides || {}),
    ...ov,
    ...(perRoom.strategyKey ? { strategyKey: perRoom.strategyKey } : {}),
    ...(perRoom.overrides || {})
  };
  return merged;
}

function splitBetAmount(amount) {
  const availableChips = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1];
  const chipSpriteMap = {
    1: 'chip_2', 5: 'chip_3', 10: 'chip_4', 20: 'chip_5', 50: 'chip_7', 100: 'chip_8',
    200: 'chip_9', 500: 'chip_10', 1000: 'chip_11', 2000: 'chip_12', 5000: 'chip_13',
    10000: 'chip_14', 20000: 'chip_15', 50000: 'chip_16', 100000: 'chip_17'
  };
  let remaining = amount; const result = [];
  for (const chipValue of availableChips) {
    while (remaining >= chipValue) {
      result.push({ value: chipValue, sprite: chipSpriteMap[chipValue] });
      remaining -= chipValue;
    }
  }
  if (remaining > 0) throw new Error(`無法拆分金額 ${amount}，剩餘 ${remaining} 無法用現有籌碼組合`);
  return result;
}

async function getWalletBalance(page) {
  return await page.evaluate(() => {
    if (App.model.user && App.model.user._walletMap && App.model.user._walletMap['0']) {
      return App.model.user._walletMap['0'].money;
    }
    return null;
  });
}

async function clickOpenBettingButton(page, targetRoom) {
  const settings = getEffectiveSettings(targetRoom);
  if (settings.openButtonRequired === false) return { success: true, skipped: true, reason: 'openButtonRequired=false' };
  const helperScript = createRoomPathHelperScript();
  const result = await page.evaluate((helpers) => {
    try {
      eval(helpers);
      const roomView = getRoomView();
      if (!roomView) return { success: false, error: 'Room view not found' };
      // 500X 房間（ColorGameBonusRoomView）不需要點擊 BetButton
      if (roomView.name === 'ColorGameBonusRoomView') {
        return { success: true, skipped: true, reason: '500X room does not require openBettingButton', roomType: roomView.name };
      }
      const buttonSet = getNodeByRoomPath(roomView, 'buttonSetPath');
      if (!buttonSet) return { success: true, skipped: true, reason: 'ButtonSet not found, room may not require openBettingButton', roomViewName: roomView.name };
      const openBettingButton = buttonSet.getChildByName('openBettingButton');
      if (openBettingButton) {
        const touch = { touch: { getLocation: () => ({ x: 0, y: 0 }) }, getLocation: () => ({ x: 0, y: 0 }), target: openBettingButton, currentTarget: openBettingButton };
        openBettingButton.emit(cc.Node.EventType.TOUCH_START, touch);
        openBettingButton.emit(cc.Node.EventType.TOUCH_END, touch);
        return { success: true, clicked: true, buttonName: 'openBettingButton', roomType: roomView.name };
      }
      return { success: true, skipped: true, reason: 'openBettingButton not found but continuing' };
    } catch (error) { return { success: false, error: error.message }; }
  }, helperScript);
  if (!result.success) logger.error('點擊 openBettingButton 失敗:', result.error);
  await page.waitForTimeout(120);
  return result;
}

async function placeBet(page, bets, targetRoom, areaNames = {}) {
  const settings = getEffectiveSettings(targetRoom);
  const activeBets = bets.filter(bet => bet.amount > 0);
  if (activeBets.length === 0) return { success: false, error: 'No active bets' };
  const totalAmount = activeBets.reduce((s, b) => s + b.amount, 0);
  // （移除冗長日誌）
  const walletBefore = await getWalletBalance(page);
  await clickOpenBettingButton(page, targetRoom);
  let betResult;
  if (activeBets.length === 1) {
    logger.betting('使用單區域下注模式\n');
    betResult = await placeSingleAreaBet(page, activeBets[0].amount, activeBets[0].area, targetRoom, areaNames);
    if (!betResult.success) return { success: false, error: 'Bet failed' };
    return await verifyFinalBet(page, activeBets, totalAmount, walletBefore, betResult.roundCode, targetRoom, areaNames);
  } else {
    betResult = await placeMultiAreaBetOptimizedV2(page, activeBets, targetRoom, areaNames);
    if (!betResult.success) return { success: false, error: 'Multi-area bet failed' };
    return await verifyFinalBet(page, activeBets, totalAmount, walletBefore, betResult.roundCode, targetRoom, areaNames);
  }
}

async function placeMultiAreaBetOptimizedV2(page, activeBets, targetRoom, areaNames = {}) {
  const sortedBets = [...activeBets].sort((a, b) => b.amount - a.amount);
  let totalSuccess = 0; let totalClicks = 0;
  for (let i = 0; i < sortedBets.length; i++) {
    const bet = sortedBets[i];
    const chips = splitBetAmount(bet.amount);
    for (const chip of chips) {
      let selectResult = await selectChip(page, chip.sprite, targetRoom);
      if (!selectResult.success) { await page.waitForTimeout(120); selectResult = await selectChip(page, chip.sprite, targetRoom); }
      if (!selectResult.success) { logger.error(`選擇籌碼 ${chip.value} 失敗: ${selectResult.error || '未知錯誤'}`); return { success: false, error: `Chip selection failed: ${chip.value}`, details: selectResult }; }
      const clickResult = await clickBetArea(page, bet.area, targetRoom);
      if (!clickResult.success) {
        logger.error(`點擊區域 ${bet.area} 失敗: ${clickResult.error || '未知錯誤'}`);
        if (clickResult.debug) logger.error(`調試信息: ${JSON.stringify(clickResult.debug)}`, { prefix: '   ' });
        if (clickResult.roomViewName) logger.error(`房間視圖: ${clickResult.roomViewName}`, { prefix: '   ' });
        if (clickResult.availableAreas) logger.error(`可用區域: ${clickResult.availableAreas}`, { prefix: '   ' });
        return { success: false, error: `Bet area click failed: ${bet.area}`, details: clickResult };
      }
      totalClicks++;
      await page.waitForTimeout(20);
    }
    totalSuccess++;
    await page.waitForTimeout(30);
  }
  // （移除冗長日誌）
  const roundCode = await page.evaluate((room) => {
    try { if (typeof App !== 'undefined' && App.model && App.model.tableCollection) { const table = App.model.tableCollection.getTable(room); if (table && table._originRoundCode) { return table._originRoundCode; } } } catch (error) { return null; }
    return null;
  }, targetRoom);
  return { success: true, roundCode, totalClicks, betsPlaced: activeBets };
}

async function selectChip(page, chipSprite, targetRoom) {
  const helperScript = createRoomPathHelperScript();
  return await page.evaluate((params) => {
    return new Promise((resolve) => {
      try {
        const makeHelpers = new Function(params.helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
        const { getRoomView, getNodeByRoomPath } = makeHelpers();
        const roomView = getRoomView(); if (!roomView) { resolve({ success: false, error: 'Room view not found' }); return; }
        const container = getNodeByRoomPath(roomView, 'chipSelectorPath'); if (!container) { resolve({ success: false, error: 'Chip container not found' }); return; }
        let scrollView = container.parent?.parent?.parent; if (!scrollView || scrollView.name !== 'ScrollView') { let current = container.parent; while (current && current.name !== 'ScrollView') { current = current.parent; } scrollView = current; }
        const scrollViewComp = scrollView.getComponent(cc.ScrollView); let targetChipNode = null; let targetChipIndex = -1;
        for (let j = 0; j < container.children.length; j++) { const chipComp = container.children[j]; const chipNode = chipComp.getChildByName('Chip'); if (!chipNode) continue; const icon = chipNode.getChildByName('icon'); if (!icon) continue; const sprite = icon.getComponent(cc.Sprite); if (sprite && sprite.spriteFrame) { const frameName = sprite.spriteFrame.name; if (frameName.includes(params.chipSprite)) { targetChipNode = chipComp; targetChipIndex = j; break; } } }
        if (!targetChipNode) { resolve({ success: false, error: `Chip sprite ${params.chipSprite} not found` }); return; }
        if (scrollViewComp && targetChipIndex > 0) { const totalChips = container.children.length; const scrollRatio = targetChipIndex / (totalChips - 1); if (scrollViewComp.scrollToPercentHorizontal) { scrollViewComp.scrollToPercentHorizontal(scrollRatio, 0.5, true); } }
        setTimeout(() => { const chipForSelectorComp = targetChipNode.getComponent('ChipForSelectorComp'); if (chipForSelectorComp && chipForSelectorComp.handleTouch) { chipForSelectorComp.handleTouch(); resolve({ success: true }); } else { resolve({ success: false, error: 'handleTouch method not found' }); } }, 180);
      } catch (error) { resolve({ success: false, error: error.message }); }
    });
  }, { helperScriptStr: helperScript, chipSprite });
}

async function clickBetArea(page, betArea, targetRoom) {
  const helperScript = createRoomPathHelperScript();
  return await page.evaluate((params) => {
    try {
      const makeHelpers = new Function(params.helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
      const { getRoomView, getNodeByRoomPath } = makeHelpers();
      const roomView = getRoomView(); if (!roomView) { return { success: false, error: 'Room view not found' }; }
      const sensorGroup = getNodeByRoomPath(roomView, 'betAreaPath');
      if (!sensorGroup) {
        const debugInfo = window.__pathDebug || 'No debug info';
        return { success: false, error: 'SensorGroup not found', debug: debugInfo, roomViewName: roomView.name };
      }
      const targetAreaNode = sensorGroup.getChildByName(params.betArea);
      if (!targetAreaNode) {
        const availableAreas = sensorGroup.children ? sensorGroup.children.map(c => c.name).join(', ') : 'no children';
        return { success: false, error: `Bet area ${params.betArea} not found`, availableAreas };
      }
      const worldPos = { x: targetAreaNode.x || 0, y: targetAreaNode.y || 0 }; const touch = new cc.Touch(worldPos.x, worldPos.y, 1);
      const touchStart = new cc.Event.EventTouch([touch], false); touchStart.type = cc.Node.EventType.TOUCH_START; targetAreaNode.dispatchEvent(touchStart);
      const touchEnd = new cc.Event.EventTouch([touch], false); touchEnd.type = cc.Node.EventType.TOUCH_END; targetAreaNode.dispatchEvent(touchEnd);
      return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
  }, { helperScriptStr: helperScript, betArea });
}

async function placeSingleAreaBet(page, betAmount, betArea, targetRoom, areaNames = {}) {
  const chipCombinations = splitBetAmount(betAmount);
  // （移除冗長日誌）
  const walletBefore = await getWalletBalance(page);
  let allBetsSuccessful = true; const targetArea = betArea;
  for (let i = 0; i < chipCombinations.length; i++) {
    const chip = chipCombinations[i];
    logger.betting(`[${i + 1}/${chipCombinations.length}] 選擇籌碼 ${chip.value} (${chip.sprite})...`);
    const helperScript = createRoomPathHelperScript();
    const chipSelectResult = await page.evaluate((params) => {
      return new Promise((resolve) => {
        try {
          const makeHelpers = new Function(params.helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
          const { getRoomView, getNodeByRoomPath } = makeHelpers();
          const roomView = getRoomView(); if (!roomView) { resolve({ success: false, error: 'Room view not found' }); return; }
          const container = getNodeByRoomPath(roomView, 'chipSelectorPath'); if (!container) { resolve({ success: false, error: 'Chip container not found' }); return; }
          let scrollView = container.parent?.parent?.parent; if (!scrollView || scrollView.name !== 'ScrollView') { let current = container.parent; while (current && current.name !== 'ScrollView') { current = current.parent; } scrollView = current; }
          const scrollViewComp = scrollView.getComponent(cc.ScrollView); let targetChipNode = null; let targetChipIndex = -1;
          for (let j = 0; j < container.children.length; j++) { const chipComp = container.children[j]; const chipNode = chipComp.getChildByName('Chip'); if (!chipNode) continue; const icon = chipNode.getChildByName('icon'); if (!icon) continue; const sprite = icon.getComponent(cc.Sprite); if (sprite && sprite.spriteFrame) { const frameName = sprite.spriteFrame.name; if (frameName.includes(params.chipSprite)) { targetChipNode = chipComp; targetChipIndex = j; break; } } }
          if (!targetChipNode) { resolve({ success: false, error: `Chip sprite ${params.chipSprite} not found` }); return; }
          if (scrollViewComp && targetChipIndex > 0) { const totalChips = container.children.length; const scrollRatio = targetChipIndex / (totalChips - 1); if (scrollViewComp.scrollToPercentHorizontal) { scrollViewComp.scrollToPercentHorizontal(scrollRatio, 0.5, true); } }
          setTimeout(() => { const chipForSelectorComp = targetChipNode.getComponent('ChipForSelectorComp'); if (chipForSelectorComp && chipForSelectorComp.handleTouch) { chipForSelectorComp.handleTouch(); resolve({ success: true, chipIndex: targetChipIndex, scrolled: targetChipIndex > 3 }); } else { resolve({ success: false, error: 'handleTouch method not found' }); } }, 400);
        } catch (error) { resolve({ success: false, error: error.message }); }
      });
    }, { helperScriptStr: helperScript, chipSprite: chip.sprite });
    if (!chipSelectResult.success) { allBetsSuccessful = false; break; }
    if (chipSelectResult.scrolled) logger.success(`籌碼 ${chip.value} 選擇成功（已滑動至位置 ${chipSelectResult.chipIndex}）`);
    else logger.success(`籌碼 ${chip.value} 選擇成功`);
    await page.waitForTimeout(200);
    const betResult = await page.evaluate((params) => {
      try {
        const makeHelpers = new Function(params.helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
        const { getRoomView, getNodeByRoomPath } = makeHelpers();
        const roomView = getRoomView(); if (!roomView) { return { success: false, error: 'Room view not found' }; }
        const sensorGroup = getNodeByRoomPath(roomView, 'betAreaPath'); if (!sensorGroup) { return { success: false, error: 'Sensor group not found for room type: ' + roomView.name }; }
        const targetAreaNode = sensorGroup.getChildByName(params.areaId); if (!targetAreaNode) { return { success: false, error: `Area ${params.areaId} not found` }; }
        const worldPos = { x: targetAreaNode.x || 0, y: targetAreaNode.y || 0 }; const touch = new cc.Touch(worldPos.x, worldPos.y, 1);
        const touchStart = new cc.Event.EventTouch([touch], false); touchStart.type = cc.Node.EventType.TOUCH_START; targetAreaNode.dispatchEvent(touchStart);
        const touchEnd = new cc.Event.EventTouch([touch], false); touchEnd.type = cc.Node.EventType.TOUCH_END; targetAreaNode.dispatchEvent(touchEnd);
        return { success: true };
      } catch (error) { return { success: false, error: error.message }; }
    }, { helperScriptStr: helperScript, areaId: targetArea });
    if (!betResult.success) { allBetsSuccessful = false; break; }
    logger.success(`已下注 ${chip.value} 到 ${areaNames[targetArea] || targetArea}`);
    await page.waitForTimeout(80);
  }
  if (!allBetsSuccessful) return { success: false, error: '下注過程中發生錯誤' };
  // （移除冗長日誌）
  await page.waitForTimeout(2000);
  let walletAfter = await getWalletBalance(page);
  const actualBetAmount = (await getWalletBalance(page, true)) ? null : null; // 保留原介面
  return { success: true, roundCode: await page.evaluate((room)=>{ try{ if(App?.model?.tableCollection){ const t=App.model.tableCollection.getTable(room); return t?._originRoundCode||t?._roundCode||null;} }catch(_){return null;} return null; }, targetRoom) };
}

/**
 * 從 App.model 讀取下注金額（即時反映 Undo/X2 操作）
 * @param {Page} page - Playwright page 對象
 * @param {Array} activeBets - 下注配置陣列
 * @param {string} targetRoom - 目標房間
 * @returns {Promise<Object>} 下注金額資訊
 */
async function getAreaBetAmountsFromModel(page, activeBets, targetRoom) {
  return await page.evaluate((params) => {
    const areaAmounts = {};
    params.areas.forEach(area => { areaAmounts[area] = 0; });

    try {
      if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
        const table = App.model.tableCollection.getTable(params.room);
        if (table && table.round) {
          // 嘗試從 table.round 讀取下注數據
          // 路徑可能是：table.round._data.data.betAreaData 或類似
          const roundData = table.round._data;
          if (roundData && roundData.data) {
            const betAreaData = roundData.data.betAreaData || roundData.data.betData || roundData.betAreaData;
            if (betAreaData && typeof betAreaData === 'object') {
              for (const [areaId, amount] of Object.entries(betAreaData)) {
                const areaIdStr = String(areaId);
                if (params.areas.includes(areaIdStr) && typeof amount === 'number') {
                  areaAmounts[areaIdStr] = amount;
                }
              }
            }
          }

          // 備用方案：嘗試從 table 的其他屬性讀取
          if (Object.values(areaAmounts).every(v => v === 0)) {
            // 嘗試 table._betAreaData 或 table.betAreaData
            const betData = table._betAreaData || table.betAreaData || table._betData || table.betData;
            if (betData && typeof betData === 'object') {
              for (const [areaId, amount] of Object.entries(betData)) {
                const areaIdStr = String(areaId);
                if (params.areas.includes(areaIdStr) && typeof amount === 'number') {
                  areaAmounts[areaIdStr] = amount;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      return { areaAmounts, error: e.message };
    }

    return { areaAmounts };
  }, { areas: activeBets.map(b => b.area), room: targetRoom });
}

/**
 * 從 WebSocket 訊息讀取下注金額
 * @param {Page} page - Playwright page 對象
 * @param {Array} activeBets - 下注配置陣列
 * @param {string} targetRoom - 目標房間
 * @returns {Promise<Object>} 下注金額資訊
 */
async function getAreaBetAmounts(page, activeBets, targetRoom) {
  return await page.evaluate((params) => {
    const areaAmounts = {}; const unexpectedAreaAmounts = {};
    params.areas.forEach(area => { areaAmounts[area] = 0; });
    if (!window.__wsMessages || window.__wsMessages.length === 0) { return areaAmounts; }
    let currentRoundCode = null; try { if (typeof App !== 'undefined' && App.model && App.model.tableCollection) { const table = App.model.tableCollection.getTable(params.room); if (table && table._originRoundCode) { currentRoundCode = table._originRoundCode; } } } catch (e) {}
    const recentMessages = window.__wsMessages.slice(-300);
    const allBetData = {}; let debugInfo = { currentRoundCode, totalMessages: recentMessages.length, betMessages: [], matchedMessages: 0 };
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      try {
        let data = typeof msg.data === 'string' ? msg.data : msg.data.toString(); if (data.startsWith('$#|#$')) { data = data.substring(5); }
        const parsed = JSON.parse(data);
        if (parsed.d?.v?.['3'] === 'bet' && parsed.d?.v?.['10']) {
          const betData = parsed.d.v['10']; const betRoundCode = betData['0']; const betAreaData = betData['21'];
          debugInfo.betMessages.push({ roundCode: betRoundCode, match: betRoundCode === currentRoundCode, areaData: betAreaData });
          if (betRoundCode === currentRoundCode && betAreaData && typeof betAreaData === 'object') {
            debugInfo.matchedMessages++;
            for (const [areaId, amount] of Object.entries(betAreaData)) { const areaIdStr = String(areaId); if (typeof amount === 'number') { allBetData[areaIdStr] = Math.max(allBetData[areaIdStr] || 0, amount); } }
          }
        }
      } catch (e) {}
    }
    for (const [areaIdStr, amount] of Object.entries(allBetData)) { if (params.areas.includes(areaIdStr)) { areaAmounts[areaIdStr] = amount; } else if (amount > 0) { unexpectedAreaAmounts[areaIdStr] = amount; } }
    return { areaAmounts, unexpectedAreaAmounts, debugInfo };
  }, { areas: activeBets.map(b => b.area), room: targetRoom });
}

async function verifyFinalBet(page, activeBets, totalAmount, walletBefore, combinedRoundCode, targetRoom, areaNames) {
  const settings = getEffectiveSettings(targetRoom);
  await page.waitForTimeout(300);
  let walletAfter = await getWalletBalance(page); let walletDiff = walletBefore - walletAfter;
  let retryCount = 0; const maxRetries = Math.max(0, settings.retryMax || 4);
  while (walletDiff < totalAmount && walletDiff > 0 && retryCount < maxRetries) {
    const shortfall = totalAmount - walletDiff; const successRate = (walletDiff / totalAmount) * 100;
    const guardEnabled = !!(TEST_CONFIG.features && TEST_CONFIG.features.betSuccessGuardEnabled);
    const thresholdPct = (TEST_CONFIG.features && typeof TEST_CONFIG.features.betSuccessThreshold === 'number'
      ? (TEST_CONFIG.features.betSuccessThreshold * 100)
      : 30);
    if (guardEnabled && successRate < thresholdPct) {
      logger.warning(`成功率低於 ${thresholdPct}% ，停止補下注`);
      break;
    }
    await page.waitForTimeout(500);
    const betResult = await getAreaBetAmounts(page, activeBets, targetRoom);
    const areaAmounts = betResult.areaAmounts || betResult;
    const retryBets = [];
    for (const bet of activeBets) { const actualAmount = areaAmounts[bet.area] || 0; const shortage = bet.amount - actualAmount; if (shortage > 0) { retryBets.push({ area: bet.area, amount: shortage }); } }
    if (retryBets.length === 0) break;
    const retryResult = await placeMultiAreaBetOptimizedV2(page, retryBets, targetRoom, areaNames);
    if (!retryResult.success) break;
    await page.waitForTimeout(400);
    walletAfter = await getWalletBalance(page); walletDiff = walletBefore - walletAfter;
    if (walletDiff < 0) { logger.warning('檢測到錢包增加，可能已進入派彩階段', { prefix: '   ' }); logger.warning('停止補下注', { prefix: '   ' }); walletDiff = walletBefore - walletAfter; break; }
    retryCount++;
  }
  // （移除冗長日誌）
  await page.waitForTimeout(150);
  let finalBetResult = await getAreaBetAmounts(page, activeBets, targetRoom);
  const finalAreaAmounts = finalBetResult.areaAmounts || finalBetResult; const unexpectedAreaAmounts = finalBetResult.unexpectedAreaAmounts || {};
  let wsSumNow = Object.values(finalAreaAmounts).reduce((s, v) => s + v, 0) + Object.values(unexpectedAreaAmounts).reduce((s, v) => s + v, 0);
  const walletDiffNowCheck = walletBefore - walletAfter; let wsRetry = 0;
  while (wsSumNow + 0.01 < walletDiffNowCheck && wsRetry < 3) {
    await page.waitForTimeout(200);
    finalBetResult = await getAreaBetAmounts(page, activeBets, targetRoom);
    const na = finalBetResult.areaAmounts || finalBetResult; const nu = finalBetResult.unexpectedAreaAmounts || {};
    Object.assign(finalAreaAmounts, na); Object.assign(unexpectedAreaAmounts, nu);
    wsSumNow = Object.values(finalAreaAmounts).reduce((s, v) => s + v, 0) + Object.values(unexpectedAreaAmounts).reduce((s, v) => s + v, 0);
    wsRetry++;
  }
  // （移除冗長日誌）
  let totalActualBet = 0; const actualBets = [];
  for (let i = 0; i < activeBets.length; i++) {
    const bet = activeBets[i];
    const actualAmount = finalAreaAmounts[bet.area] || 0;
    totalActualBet += actualAmount;
    const status = actualAmount >= bet.amount ? '✅' : '⚠️';
    const diff = actualAmount - bet.amount;
    const diffText = diff === 0 ? '' : ` (${diff > 0 ? '+' : ''}${diff})`;
    // 第一行顯示標籤，後續行不顯示
    logger.betting(`${areaNames[bet.area]} (${bet.area}): ${actualAmount} / ${bet.amount} ${status}${diffText}`, { prefix: i === 0 ? '' : '   ' });
    actualBets.push({ area: bet.area, targetAmount: bet.amount, actualAmount: actualAmount });
  }
  const absoluteWalletDiff = Math.abs(walletDiff);
  // （移除冗長日誌）
  await page.screenshot({ path: 'bet_placed.png', fullPage: false });
  return { success: absoluteWalletDiff > 0 || walletDiff < 0, walletBefore, walletAfter, roundCode: combinedRoundCode, totalBetAmount: totalAmount, actualDeduction: walletDiff > 0 ? walletDiff : absoluteWalletDiff, bets: activeBets, actualBets };
}

/**
 * 獲取下注控制按鈕的狀態（Undo/Repeat/X2）
 * @param {Page} page - Playwright page 對象
 * @param {string} targetRoom - 目標房間
 * @returns {Promise<Object>} 按鈕狀態資訊
 */
async function getBettingControlButtonsState(page, targetRoom) {
  const helperScript = createRoomPathHelperScript();
  return await page.evaluate((helpers) => {
    try {
      eval(helpers);
      const roomView = getRoomView();
      if (!roomView) return { success: false, error: 'Room view not found' };

      // 根據房間類型構建路徑（優先嘗試 BettingInfoNode，因為所有房間可能都使用此路徑）
      let undoBetDecision = null;
      const possiblePaths = [
        ['BettingInfoNode', 'ColorGameChipSelector', 'UndoBetDecision'], // 所有房間通用路徑
        ['BettingNode', 'ColorGameChipSelector', 'UndoBetDecision'], // Speed 房間備用路徑
        ['ColorGameChipSelector', 'UndoBetDecision'] // Normal 房間備用路徑
      ];

      for (const basePath of possiblePaths) {
        let current = roomView;
        for (const pathName of basePath) {
          current = current ? current.getChildByName(pathName) : null;
          if (!current) break;
        }
        if (current) {
          undoBetDecision = current;
          break;
        }
      }

      if (!undoBetDecision) {
        return { success: false, error: 'UndoBetDecision not found' };
      }

      // 查找各個按鈕
      const undoButton = undoBetDecision.getChildByName('UndoBetButton');
      const reBetButton = undoBetDecision.getChildByName('ReBetButton');
      const doubleBetButton = undoBetDecision.getChildByName('DoubleBetButton');

      return {
        success: true,
        undoButton: {
          exists: !!undoButton,
          active: undoButton ? undoButton.active : false
        },
        reBetButton: {
          exists: !!reBetButton,
          active: reBetButton ? reBetButton.active : false
        },
        doubleBetButton: {
          exists: !!doubleBetButton,
          active: doubleBetButton ? doubleBetButton.active : false
        },
        roomType: roomView.name
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, helperScript);
}

/**
 * 點擊下注控制按鈕（Undo/Repeat/X2）
 * @param {Page} page - Playwright page 對象
 * @param {string} buttonType - 按鈕類型：'undo' | 'repeat' | 'x2'
 * @param {string} targetRoom - 目標房間
 * @returns {Promise<Object>} 點擊結果
 */
async function clickBettingControlButton(page, buttonType, targetRoom) {
  const helperScript = createRoomPathHelperScript();
  const result = await page.evaluate((params) => {
    try {
      eval(params.helpers);
      const roomView = getRoomView();
      if (!roomView) return { success: false, error: 'Room view not found' };

      // 根據房間類型構建路徑（優先嘗試 BettingInfoNode，因為所有房間可能都使用此路徑）
      let undoBetDecision = null;
      const possiblePaths = [
        ['BettingInfoNode', 'ColorGameChipSelector', 'UndoBetDecision'], // 所有房間通用路徑
        ['BettingNode', 'ColorGameChipSelector', 'UndoBetDecision'], // Speed 房間備用路徑
        ['ColorGameChipSelector', 'UndoBetDecision'] // Normal 房間備用路徑
      ];

      for (const basePath of possiblePaths) {
        let current = roomView;
        for (const pathName of basePath) {
          current = current ? current.getChildByName(pathName) : null;
          if (!current) break;
        }
        if (current) {
          undoBetDecision = current;
          break;
        }
      }

      if (!undoBetDecision) {
        return { success: false, error: 'UndoBetDecision not found' };
      }

      // 根據按鈕類型查找對應按鈕
      let targetButton = null;
      let buttonName = '';

      if (params.buttonType === 'undo') {
        targetButton = undoBetDecision.getChildByName('UndoBetButton');
        buttonName = 'UndoBetButton';
      } else if (params.buttonType === 'repeat') {
        targetButton = undoBetDecision.getChildByName('ReBetButton');
        buttonName = 'ReBetButton';
      } else if (params.buttonType === 'x2') {
        targetButton = undoBetDecision.getChildByName('DoubleBetButton');
        buttonName = 'DoubleBetButton';
      } else {
        return { success: false, error: `Unknown button type: ${params.buttonType}` };
      }

      if (!targetButton) {
        return { success: false, error: `${buttonName} not found` };
      }

      if (!targetButton.active) {
        return { success: false, error: `${buttonName} is not active (not available)` };
      }

      // 使用 touch 事件點擊
      const touch = {
        touch: { getLocation: () => ({ x: 0, y: 0 }) },
        getLocation: () => ({ x: 0, y: 0 }),
        target: targetButton,
        currentTarget: targetButton
      };
      targetButton.emit(cc.Node.EventType.TOUCH_START, touch);
      targetButton.emit(cc.Node.EventType.TOUCH_END, touch);

      return { success: true, buttonName, roomType: roomView.name };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, { helpers: helperScript, buttonType });

  if (!result.success) {
    logger.error(`點擊 ${buttonType} 按鈕失敗: ${result.error}`);
  } else {
    logger.success(`已點擊 ${buttonType} 按鈕`);
  }

  await page.waitForTimeout(200); // 等待按鈕響應
  return result;
}

module.exports = {
  splitBetAmount,
  getWalletBalance,
  clickOpenBettingButton,
  placeBet,
  getBettingControlButtonsState,
  clickBettingControlButton,
  getAreaBetAmounts,
  getAreaBetAmountsFromModel
};



