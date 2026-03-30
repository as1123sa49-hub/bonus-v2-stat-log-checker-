/**
 * CGIGOJP1 回歸測試
 * 確保各種下注組合都能正常工作
 */

const { test, expect } = require('@playwright/test');
const TEST_CONFIG = require('../../config/testConfig');
const { initWebSocketMonitoring, waitForNewOpenRound } = require('../../src/helpers/webSocketHelper');
const { loginGame, closePWAPopup } = require('../../src/helpers/loginHelper');
const { enterRoom } = require('../../src/helpers/roomHelper');
const { placeBet } = require('../../src/helpers/bettingHelper');

test.describe('CGIGOJP1 回歸測試 - 不同下注組合', () => {
  // 每個測試前都要登入並進房
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 414, height: 896 });
    
    await initWebSocketMonitoring(page);
    await loginGame(page, TEST_CONFIG.gameUrl);
    await closePWAPopup(page);
    await enterRoom(page, 'CGIGOJP1');
    
    // 等待 openround（高頻檢測），偵測到後立即進入各測項
    await waitForNewOpenRound(page, 'CGIGOJP1', null, 60);
  });
  
  test('下注 2400 到藍色區域', async ({ page }) => {
    const betResult = await placeBet(page, [ { area: '804', amount: 2400 } ], 'CGIGOJP1', TEST_CONFIG.areaNames);
    
    expect(betResult.success).toBe(true);
    expect(betResult.walletBefore - betResult.walletAfter).toBe(2400);
  });
  
  test('下注 5000 到白色區域', async ({ page }) => {
    const betResult = await placeBet(page, [ { area: '802', amount: 5000 } ], 'CGIGOJP1', TEST_CONFIG.areaNames);
    
    expect(betResult.success).toBe(true);
    expect(betResult.walletBefore - betResult.walletAfter).toBe(5000);
  });
  
  test('下注 10000 到紅色區域', async ({ page }) => {
    const betResult = await placeBet(page, [ { area: '805', amount: 10000 } ], 'CGIGOJP1', TEST_CONFIG.areaNames);
    
    expect(betResult.success).toBe(true);
    expect(betResult.walletBefore - betResult.walletAfter).toBe(10000);
  });
  
  test('下注 12345 到黃色區域（複雜拆分）', async ({ page }) => {
    const betResult = await placeBet(page, [ { area: '801', amount: 12345 } ], 'CGIGOJP1', TEST_CONFIG.areaNames);
    
    expect(betResult.success).toBe(true);
    expect(Math.abs((betResult.walletBefore - betResult.walletAfter) - 12345)).toBeLessThan(0.01);
  });
});


