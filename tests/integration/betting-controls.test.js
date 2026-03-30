/**
 * 下注控制功能測試
 * 測試 Undo、X2、Repeat 按鈕功能
 * 所有測試在一個 session 中完成，不需要重複登入/進房
 * 驗證方式：只驗證錢包變化，不驗證下注金額讀取
 */

const { test, expect } = require('@playwright/test');
const TEST_CONFIG = require('../../config/testConfig');
const { getTestConfig } = require('../../config/testConfig');
const { initWebSocketMonitoring, waitForNewOpenRound } = require('../../src/helpers/webSocketHelper');
const { loginGame, closePWAPopup } = require('../../src/helpers/loginHelper');
const { enterRoom } = require('../../src/helpers/roomHelper');
const { 
  placeBet, 
  clickOpenBettingButton,
  getBettingControlButtonsState,
  clickBettingControlButton,
  getWalletBalance
} = require('../../src/helpers/bettingHelper');
const logger = require('../../src/utils/logger');

// 獲取測試配置
const TEST_SPECIFIC_CONFIG = getTestConfig('full-flow');
const TARGET_ROOM = TEST_SPECIFIC_CONFIG.targetRoom;

test.describe('下注控制功能測試', () => {
  // 測試失敗時暫停，不關閉視窗
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      logger.raw('\n⚠️ 測試失敗，暫停執行以便檢查...');
      logger.raw('按 Ctrl+C 或關閉終端以結束測試\n');
      await page.pause(); // 暫停測試，保持視窗開啟
    }
  });

  test(`${TARGET_ROOM} - 完整下注控制流程（一次性完成）`, async ({ page }) => {
    test.setTimeout(600000); // 10 分鐘（因為需要多局）

    // ============================================
    // 初始化：只執行一次
    // ============================================
    await page.setViewportSize({ width: 414, height: 896 });
    await initWebSocketMonitoring(page);
    await loginGame(page, TEST_CONFIG.gameUrl);
    const roomResult = await enterRoom(page, TARGET_ROOM);
    expect(roomResult.success).toBe(true);
    await clickOpenBettingButton(page, TARGET_ROOM);

    logger.raw('\n========================================');
    logger.raw('開始下注控制功能測試（一次性完成）');
    logger.raw('========================================\n');

    // ============================================
    // 測試 1: Undo 取消下注
    // ============================================
    logger.raw('\n━━━ 測試 1: Undo 取消下注 ━━━\n');
    
    let currentRound = await waitForNewOpenRound(page, TARGET_ROOM, null, 60);
    expect(currentRound).not.toBeNull();
    logger.betting(`當前局號: ${currentRound}`);

    const testBets1 = [{ area: '801', amount: 100 }];
    const walletBefore1 = await getWalletBalance(page);
    
    const betResult1 = await placeBet(page, testBets1, TARGET_ROOM, TEST_CONFIG.areaNames);
    expect(betResult1.success).toBe(true);

    const walletAfterBet1 = await getWalletBalance(page);
    const betAmount1 = walletBefore1 - walletAfterBet1;
    expect(betAmount1).toBeGreaterThan(0);
    logger.betting(`下注前: ${walletBefore1}, 下注後: ${walletAfterBet1}, 扣款: ${betAmount1}`);

    const buttonsState1 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState1.success).toBe(true);
    expect(buttonsState1.undoButton.exists).toBe(true);
    expect(buttonsState1.undoButton.active).toBe(true);

    // 點擊 Undo
    const undoResult1 = await clickBettingControlButton(page, 'undo', TARGET_ROOM);
    expect(undoResult1.success).toBe(true);
    await page.waitForTimeout(500);

    // 驗證錢包恢復
    const walletAfterUndo1 = await getWalletBalance(page);
    const walletRecovered1 = walletAfterUndo1 - walletAfterBet1;
    expect(walletRecovered1).toBeGreaterThan(0);
    // 驗證恢復金額應該等於下注金額（允許小誤差）
    expect(Math.abs(walletRecovered1 - betAmount1)).toBeLessThan(0.01);
    logger.betting(`Undo 後錢包: ${walletAfterUndo1}, 恢復金額: ${walletRecovered1} (應等於下注金額: ${betAmount1})`);

    // ============================================
    // 測試 2: X2 翻倍下注（單區域）
    // ============================================
    logger.raw('\n━━━ 測試 2: X2 翻倍下注（單區域） ━━━\n');
    
    currentRound = await waitForNewOpenRound(page, TARGET_ROOM, currentRound, 60);
    expect(currentRound).not.toBeNull();
    logger.betting(`當前局號: ${currentRound}`);

    const testBets2 = [{ area: '801', amount: 100 }];
    const walletBefore2 = await getWalletBalance(page);
    
    const betResult2 = await placeBet(page, testBets2, TARGET_ROOM, TEST_CONFIG.areaNames);
    expect(betResult2.success).toBe(true);

    const walletAfterBet2 = await getWalletBalance(page);
    const initialBetAmount2 = walletBefore2 - walletAfterBet2;
    expect(initialBetAmount2).toBeGreaterThan(0);
    logger.betting(`下注前: ${walletBefore2}, 下注後: ${walletAfterBet2}, 初始下注: ${initialBetAmount2}`);

    const buttonsState2 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState2.success).toBe(true);
    expect(buttonsState2.doubleBetButton.exists).toBe(true);
    expect(buttonsState2.doubleBetButton.active).toBe(true);

    // 點擊 X2
    const x2Result2 = await clickBettingControlButton(page, 'x2', TARGET_ROOM);
    expect(x2Result2.success).toBe(true);
    await page.waitForTimeout(500);

    // 驗證錢包額外扣款（應該等於初始下注金額）
    const walletAfterX2 = await getWalletBalance(page);
    const additionalDeduction2 = walletAfterBet2 - walletAfterX2;
    expect(additionalDeduction2).toBeGreaterThan(0);
    // 驗證額外扣款應該等於初始下注金額（允許小誤差）
    expect(Math.abs(additionalDeduction2 - initialBetAmount2)).toBeLessThan(0.01);
    logger.betting(`X2 後錢包: ${walletAfterX2}, 額外扣款: ${additionalDeduction2} (應等於初始下注: ${initialBetAmount2})`);

    // ============================================
    // 測試 3: X2 多區域翻倍
    // ============================================
    logger.raw('\n━━━ 測試 3: X2 多區域翻倍 ━━━\n');
    
    currentRound = await waitForNewOpenRound(page, TARGET_ROOM, currentRound, 60);
    expect(currentRound).not.toBeNull();
    logger.betting(`當前局號: ${currentRound}`);

    const testBets3 = [
      { area: '801', amount: 100 },
      { area: '802', amount: 50 }
    ];
    const walletBefore3 = await getWalletBalance(page);
    
    const betResult3 = await placeBet(page, testBets3, TARGET_ROOM, TEST_CONFIG.areaNames);
    expect(betResult3.success).toBe(true);

    const walletAfterBet3 = await getWalletBalance(page);
    const initialBetAmount3 = walletBefore3 - walletAfterBet3;
    expect(initialBetAmount3).toBeGreaterThan(0);
    logger.betting(`下注前: ${walletBefore3}, 下注後: ${walletAfterBet3}, 初始下注: ${initialBetAmount3}`);

    // 下注剛完成時，DoubleBetButton 仍在更新，先等待以避免太快點擊
    await page.waitForTimeout(800);

    // 檢查 X2 按鈕狀態
    const buttonsState3 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState3.success).toBe(true);
    expect(buttonsState3.doubleBetButton.exists).toBe(true);
    expect(buttonsState3.doubleBetButton.active).toBe(true);
    logger.betting(`X2 按鈕狀態: exists=${buttonsState3.doubleBetButton.exists}, active=${buttonsState3.doubleBetButton.active}`);

    // 點擊 X2
    const x2Result3 = await clickBettingControlButton(page, 'x2', TARGET_ROOM);
    expect(x2Result3.success).toBe(true);
    await page.waitForTimeout(800); // 增加等待時間，確保 WebSocket 消息處理完成

    // 驗證錢包額外扣款（應該等於初始下注總額）
    const walletAfterX2Multi = await getWalletBalance(page);
    const additionalDeduction3 = walletAfterBet3 - walletAfterX2Multi;
    
    // 如果沒有扣款，可能是點擊沒有生效，記錄詳細信息
    if (additionalDeduction3 <= 0) {
      logger.error(`X2 點擊後沒有扣款！錢包變化: ${walletAfterBet3} -> ${walletAfterX2Multi}`);
      logger.error(`點擊結果: ${JSON.stringify(x2Result3)}`);
    }
    
    expect(additionalDeduction3).toBeGreaterThan(0);
    // 驗證額外扣款應該等於初始下注總額（允許小誤差）
    expect(Math.abs(additionalDeduction3 - initialBetAmount3)).toBeLessThan(0.01);
    logger.betting(`X2 後錢包: ${walletAfterX2Multi}, 額外扣款: ${additionalDeduction3} (應等於初始下注: ${initialBetAmount3})`);

    // ============================================
    // 測試 4: Repeat 重複上局下注
    // ============================================
    logger.raw('\n━━━ 測試 4: Repeat 重複上局下注 ━━━\n');
    
    // 記錄當前下注作為「上局下注」
    // 注意：Repeat 會恢復「上局最終下注總額」，包含 X2 的額外扣款
    const previousRoundBets = testBets3; // 使用測試 3 的下注記錄
    // 計算上局總下注金額 = 初始下注 + X2 額外扣款 = 總扣款
    const previousRoundTotal = initialBetAmount3 + additionalDeduction3; // 上局最終下注總額（包含 X2）
    
    // 調試：確認 previousRoundTotal 的值
    logger.betting(`調試: initialBetAmount3 = ${initialBetAmount3}, additionalDeduction3 = ${additionalDeduction3}, previousRoundTotal = ${previousRoundTotal}`);
    
    if (!previousRoundTotal || previousRoundTotal <= 0 || isNaN(previousRoundTotal)) {
      throw new Error(`previousRoundTotal 無效: ${previousRoundTotal} (initialBetAmount3 = ${initialBetAmount3}, additionalDeduction3 = ${additionalDeduction3})`);
    }
    
    logger.betting(`記錄上局下注: 區域 801=100, 區域 802=50, 初始下注: ${initialBetAmount3}, X2 額外: ${additionalDeduction3}, 最終總額: ${previousRoundTotal}`);

    // 等待派彩（簡單等待）
    await page.waitForTimeout(10000);

    // 等待新開局
    currentRound = await waitForNewOpenRound(page, TARGET_ROOM, currentRound, 60);
    expect(currentRound).not.toBeNull();
    logger.betting(`新開局: ${currentRound}`);

    const buttonsState4 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState4.success).toBe(true);
    expect(buttonsState4.reBetButton.exists).toBe(true);
    expect(buttonsState4.reBetButton.active).toBe(true);

    // 記錄 Repeat 前的錢包
    const walletBeforeRepeat = await getWalletBalance(page);

    // 點擊 Repeat
    const repeatResult4 = await clickBettingControlButton(page, 'repeat', TARGET_ROOM);
    expect(repeatResult4.success).toBe(true);
    await page.waitForTimeout(500);

    // 驗證錢包扣款（應該等於上局最終下注總額，包含 X2）
    const walletAfterRepeat = await getWalletBalance(page);
    const repeatDeduction = walletBeforeRepeat - walletAfterRepeat;
    expect(repeatDeduction).toBeGreaterThan(0);
    
    // 驗證扣款應該等於上局最終下注總額（允許小誤差）
    const diff = Math.abs(repeatDeduction - previousRoundTotal);
    expect(diff).toBeLessThan(0.01);
    logger.betting(`Repeat 前錢包: ${walletBeforeRepeat}, Repeat 後錢包: ${walletAfterRepeat}, 扣款: ${repeatDeduction} (應等於上局最終下注總額: ${previousRoundTotal})`);

    // ============================================
    // 測試 5: Repeat 只能按一次
    // ============================================
    logger.raw('\n━━━ 測試 5: Repeat 只能按一次 ━━━\n');
    
    // 檢查 Repeat 按鈕狀態（應該已變為不可用或切換為 Undo）
    const buttonsState5 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState5.success).toBe(true);
    
    if (buttonsState5.reBetButton.exists) {
      expect(buttonsState5.reBetButton.active).toBe(false);
      logger.betting('Repeat 按鈕已變為不可用');
    } else if (buttonsState5.undoButton.exists && buttonsState5.undoButton.active) {
      logger.betting('Repeat 按鈕已切換為 Undo 按鈕');
    }

    // 嘗試再次點擊 Repeat（應失敗）
    const repeatResult5 = await clickBettingControlButton(page, 'repeat', TARGET_ROOM);
    if (repeatResult5.success) {
      logger.warning('Repeat 按鈕仍可用，可能需要檢查邏輯');
    } else {
      logger.betting('Repeat 按鈕已不可用（符合預期）');
    }

    // ============================================
    // 測試 6: Repeat 後 Undo
    // ============================================
    logger.raw('\n━━━ 測試 6: Repeat 後 Undo ━━━\n');
    
    // 檢查按鈕狀態（應該已切換為 Undo）
    const buttonsState6 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsState6.success).toBe(true);
    expect(buttonsState6.undoButton.exists).toBe(true);
    expect(buttonsState6.undoButton.active).toBe(true);

    // 記錄 Undo 前的錢包
    const walletBeforeUndo6 = await getWalletBalance(page);

    // 點擊 Undo
    const undoResult6 = await clickBettingControlButton(page, 'undo', TARGET_ROOM);
    expect(undoResult6.success).toBe(true);
    await page.waitForTimeout(500);

    // 驗證錢包恢復（應該等於 Repeat 的扣款）
    const walletAfterUndo6 = await getWalletBalance(page);
    const undoRecovered6 = walletAfterUndo6 - walletBeforeUndo6;
    expect(undoRecovered6).toBeGreaterThan(0);
    // 驗證恢復金額應該等於 Repeat 的扣款（允許小誤差）
    expect(Math.abs(undoRecovered6 - repeatDeduction)).toBeLessThan(0.01);
    logger.betting(`Undo 前錢包: ${walletBeforeUndo6}, Undo 後錢包: ${walletAfterUndo6}, 恢復金額: ${undoRecovered6} (應等於 Repeat 扣款: ${repeatDeduction})`);

    // 等待按鈕狀態更新
    await page.waitForTimeout(500);
    
    // 檢查按鈕狀態（Undo 後，按鈕仍然是 active，但點擊不會有作用）
    const buttonsStateAfterUndo6 = await getBettingControlButtonsState(page, TARGET_ROOM);
    expect(buttonsStateAfterUndo6.undoButton.exists).toBe(true);
    expect(buttonsStateAfterUndo6.undoButton.active).toBe(true); // 按鈕仍然是 active
    logger.betting('Undo 按鈕仍為 active（符合預期：按鈕不會消失）');
    
    // 驗證：再次點擊 Undo 不會有作用（錢包不會再變化）
    const walletBeforeSecondUndo = await getWalletBalance(page);
    const secondUndoResult = await clickBettingControlButton(page, 'undo', TARGET_ROOM);
    await page.waitForTimeout(500);
    
    const walletAfterSecondUndo = await getWalletBalance(page);
    const secondUndoChange = Math.abs(walletAfterSecondUndo - walletBeforeSecondUndo);
    
    // 驗證第二次 Undo 沒有作用（錢包不變或變化極小）
    expect(secondUndoChange).toBeLessThan(0.01);
    logger.betting(`第二次 Undo 前錢包: ${walletBeforeSecondUndo}, 第二次 Undo 後錢包: ${walletAfterSecondUndo}, 變化: ${secondUndoChange} (應為 0，表示無作用)`);

    logger.raw('\n========================================');
    logger.raw('所有下注控制功能測試完成');
    logger.raw('========================================\n');
  });
});
