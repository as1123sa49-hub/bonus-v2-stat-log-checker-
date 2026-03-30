/**
 * 派彩輔助函數
 * 處理派彩驗證相關操作
 */

const { getWalletBalance } = require('./bettingHelper');
const logger = require('../utils/logger');

async function waitForPayout(page, roundCode, walletBeforePayout, betAmount = 0, maxAttempts = 60, areaNames = null, jackpotBeforeBet = null) {
  logger.info(`等待局號: ${roundCode} 的派彩事件`);
  
  let payoutDetected = false;
  let payoutAttempts = 0;
  let payoutCheck = { detected: false };
  
  while (!payoutDetected && payoutAttempts < maxAttempts) {
    await page.waitForTimeout(1000);
    payoutAttempts++;
    
    payoutCheck = await page.evaluate((targetRoundCode) => {
      try {
        if (window.__wsMessages && window.__wsMessages.length > 0) {
          const recentMessages = window.__wsMessages.slice(-200);
          const eventTypes = [];
          let lastAnyPayoutRound = null;
          
          for (const msg of recentMessages) {
            try {
              let data = typeof msg.data === 'string' ? msg.data : msg.data.toString();
              if (data.startsWith('$#|#$')) data = data.substring(5);
              const parsed = JSON.parse(data);
              if (parsed.d?.v?.['3']) {
                eventTypes.push({ type: parsed.d.v['3'], timestamp: msg.timestamp, roundCode: parsed.d.v['10']?.['0'] || 'N/A' });
              }
              if (parsed.d?.v?.['3'] === 'payout') {
                const payoutRoundCode = parsed.d.v['10']?.['0'];
                lastAnyPayoutRound = payoutRoundCode || lastAnyPayoutRound;
                if (payoutRoundCode === targetRoundCode) {
                  let currentBalance = null;
                  if (App.model.user && App.model.user._walletMap && App.model.user._walletMap['0']) {
                    currentBalance = App.model.user._walletMap['0'].money;
                  }
                  return {
                    detected: true,
                    eventType: 'payout',
                    roundCode: payoutRoundCode,
                    payoutData: parsed.d.v['10'],
                    raw: parsed,
                    currentBalance: currentBalance,
                    timestamp: msg.timestamp,
                    allEventTypes: eventTypes,
                    matched: true,
                    lastAnyPayoutRound: lastAnyPayoutRound
                  };
                }
              }
            } catch (e) {}
          }
          return { detected: false, allEventTypes: eventTypes, totalMessages: recentMessages.length, targetRoundCode, lastAnyPayoutRound };
        }
        return { detected: false };
      } catch (error) {
        return { detected: false, error: error.message };
      }
    }, roundCode);
    
    if (payoutCheck.detected) {
      payoutDetected = true;
      logger.success(`檢測到派彩訊息 (${payoutCheck.roundCode})`);
      // 根據 payout payload 判斷是否 JP（payout d.v['10']['83'][0] === -1）
      let isJp = false;
      try {
        const v10 = payoutCheck.raw && payoutCheck.raw.d && payoutCheck.raw.d.v && payoutCheck.raw.d.v['10'];
        if (v10 && Array.isArray(v10['83']) && typeof v10['83'][0] === 'number' && v10['83'][0] === -1) {
          isJp = true;
        }
      } catch (_) {}

      // 派彩後輪詢錢包直到變動或逾時（JP 延長等待）
      const pollInterval = 300;
      const maxWaitMs = isJp ? 15000 : 3000;
      let elapsedMs = 0;
      let afterPayoutWallet = await getWalletBalance(page);
      while (walletBeforePayout != null && afterPayoutWallet === walletBeforePayout && elapsedMs < maxWaitMs) {
        await page.waitForTimeout(pollInterval);
        elapsedMs += pollInterval;
        afterPayoutWallet = await getWalletBalance(page);
      }
      if (walletBeforePayout != null && afterPayoutWallet === walletBeforePayout) {
        logger.info(`派彩後錢包仍未變動（已等待 ${elapsedMs}ms${isJp ? '｜JP 延長輪詢' : ''}）`, { prefix: '   ' });
      }
      return {
        detected: true,
        success: true,
        payoutAmount: afterPayoutWallet != null && walletBeforePayout != null ? (afterPayoutWallet - walletBeforePayout) : null,
        walletBefore: walletBeforePayout,
        walletAfter: afterPayoutWallet,
        payoutData: payoutCheck.payoutData,
        raw: payoutCheck.raw,
      };
    }
  }
  
  if (!payoutDetected) {
    if (payoutCheck && payoutCheck.lastAnyPayoutRound) {
      logger.warning(`等待派彩超時，但近期有其他局派彩：${payoutCheck.lastAnyPayoutRound}（非本局 ${roundCode}）`);
    } else {
      logger.warning('等待派彩超時');
    }
    return { detected: false, success: false, error: 'Payout timeout' };
  }
  return payoutCheck;
}

/**
 * 獲取 prepareBonusResult 中的電子骰結果（d.v[10][77]）
 * 用於 CGT01 判斷電子骰是否與開出結果相同
 */
async function getPrepareBonusResult(page, roundCode) {
  const result = await page.evaluate((targetRoundCode) => {
    try {
      if (window.__wsMessages && window.__wsMessages.length > 0) {
        const recentMessages = window.__wsMessages.slice(-200);
        for (const msg of recentMessages) {
          try {
            let data = typeof msg.data === 'string' ? msg.data : msg.data.toString();
            if (data.startsWith('$#|#$')) data = data.substring(5);
            const parsed = JSON.parse(data);
            // 檢查是否為 prepareBonusResult 事件（d.v[3] === 'prepareBonusResult'）
            if (parsed.d?.v?.['3'] === 'prepareBonusResult') {
              const eventRoundCode = parsed.d?.v?.['10']?.['0'];
              // 如果指定了 roundCode，則檢查是否匹配
              if (targetRoundCode && eventRoundCode !== targetRoundCode) continue;
              // 提取電子骰結果（d.v[10][77]）
              // 電子骰是單個區域 ID（如 805），不是數組
              const v10 = parsed.d?.v?.['10'];
              const electronicDice = v10?.['77']; // 電子骰結果（單個區域 ID，例如 805 或 "805"）
              // 電子骰可能是數字或字符串
              if (electronicDice != null) {
                return {
                  found: true,
                  roundCode: eventRoundCode,
                  electronicDice: String(electronicDice), // 轉為字符串統一格式
                  raw: parsed,
                };
              }
            }
          } catch (e) {}
        }
      }
      return { found: false };
    } catch (error) {
      return { found: false, error: error.message };
    }
  }, roundCode);

  return result;
}

module.exports = {
  waitForPayout,
  getPrepareBonusResult,
};



