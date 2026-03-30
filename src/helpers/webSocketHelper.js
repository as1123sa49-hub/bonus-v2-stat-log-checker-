/**
 * WebSocket 輔助函數
 * 處理 WebSocket 連線監聽和事件解析
 */

const logger = require('../utils/logger');

/**
 * 初始化 WebSocket 監聽
 * 在頁面載入前注入腳本，攔截所有 WebSocket 訊息
 * @param {Page} page - Playwright page 對象
 */
async function initWebSocketMonitoring(page) {
  await page.addInitScript(() => {
    window.__wsMessages = [];
    window.__wsConnections = [];
    window.__openroundEvents = []; // 專門存 openround
    
    const OriginalWebSocket = window.WebSocket;
    
    window.WebSocket = function(url, protocols) {
      console.log('🔌 WebSocket 連線建立:', url);
      
      window.__wsConnections.push({
        url: url,
        timestamp: new Date().toISOString()
      });
      
      const ws = new OriginalWebSocket(url, protocols);
      
      ws.addEventListener('message', function(event) {
        try {
          const rawData = typeof event.data === 'string' ? event.data : event.data.toString();
          
          window.__wsMessages.push({
            data: rawData,
            timestamp: new Date().toISOString()
          });
          
          // 解析訊息 - 格式: $#|#${...JSON...}
          let jsonData = rawData;
          if (rawData.startsWith('$#|#$')) {
            jsonData = rawData.substring(5); // 移除 $#|#$
          }
          
          try {
            const parsed = JSON.parse(jsonData);
            
            // 檢查是否為 notify 事件
            if (parsed.e === 'notify' && parsed.d && parsed.d.v) {
              const eventData = parsed.d.v;
              const eventType = eventData['3']; // 事件類型在數字鍵 '3'
              
              // 如果是 openround 事件
              if (eventType === 'openround' || eventType === 'openRound') {
                const tableCode = eventData['8'] ? eventData['8']['0'] : null; // 桌號在 '8' -> '0'
                const roundCode = eventData['8'] ? eventData['8']['2'] : null; // 局號在 '8' -> '2'
                
                const openroundInfo = {
                  timestamp: new Date().toISOString(),
                  tableCode: tableCode,
                  roundCode: roundCode,
                  fullData: eventData
                };
                
                window.__openroundEvents.push(openroundInfo);
                
                console.log('🎯 檢測到 openround:', tableCode, '局號:', roundCode);
              }
            }
          } catch (parseError) {
            // JSON 解析失敗，忽略
          }
        } catch (e) {
          console.error('解析 WebSocket 訊息失敗:', e);
        }
      });
      
      return ws;
    };
    
    window.WebSocket.prototype = OriginalWebSocket.prototype;
  });
}

async function getLatestOpenRound(page, targetRoom) {
  return await page.evaluate((room) => {
    const openrounds = window.__openroundEvents || [];
    const roomRounds = openrounds.filter(r => r.tableCode === room);
    return roomRounds.length > 0 ? roomRounds[roomRounds.length - 1] : null;
  }, targetRoom);
}

async function getAllOpenRounds(page) {
  return await page.evaluate(() => {
    return window.__openroundEvents || [];
  });
}

async function waitForNewOpenRound(page, targetRoom, currentRoundNumber = null, maxAttempts = 60) {
  const currentOriginRoundCode = await page.evaluate((room) => {
    try {
      if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
        const table = App.model.tableCollection.getTable(room);
        if (table && table._originRoundCode) {
          return table._originRoundCode;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }, targetRoom);
  
  logger.info(`等待開局... (當前局號: ${currentOriginRoundCode || '未知'})`);
  
  const openroundCheck = await page.evaluate(({ room, currentOrigin }) => {
    try {
      const openrounds = window.__openroundEvents || [];
      const roomRounds = openrounds.filter(r => r.tableCode === room);
      
      let appModelRoundCode = null;
      if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
        const table = App.model.tableCollection.getTable(room);
        if (table && table._originRoundCode) {
          appModelRoundCode = table._originRoundCode;
        }
      }
      
      return {
        totalOpenrounds: openrounds.length,
        roomCount: roomRounds.length,
        appModelRoundCode: appModelRoundCode,
        isNewRound: appModelRoundCode && appModelRoundCode !== currentOrigin,
        allOpenrounds: openrounds.map(r => ({
          table: r.tableCode,
          round: r.roundCode,
          time: r.timestamp
        })),
        roomRounds: roomRounds.map(r => ({
          round: r.roundCode,
          time: r.timestamp
        }))
      };
    } catch (error) {
      return { error: error.message };
    }
  }, { room: targetRoom, currentOrigin: currentOriginRoundCode });
  
  if (openroundCheck.isNewRound) {
    logger.success(`檢測到新局: ${currentOriginRoundCode} → ${openroundCheck.appModelRoundCode}`);
    return openroundCheck.appModelRoundCode;
  }
  
  if (openroundCheck.roomRounds.length > 0) {
    logger.success(`\n${targetRoom} 的 openround 局號:`);
    openroundCheck.roomRounds.forEach((r, i) => {
      logger.success(`   [${i+1}] ${r.round} (${r.time})`, { prefix: '' });
    });
  }
  
  let elapsed = 0;
  let newRoundNumber = null;
  const pollIntervalMs = 300;
  const maxWaitMs = Math.max(1000, maxAttempts * 1000);
  
  while (!newRoundNumber && elapsed < maxWaitMs) {
    await page.waitForTimeout(pollIntervalMs);
    elapsed += pollIntervalMs;
    
    const checkAgain = await page.evaluate(({ room, currentOrigin }) => {
      if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
        const table = App.model.tableCollection.getTable(room);
        if (table && table._originRoundCode) {
          const newOriginCode = table._originRoundCode;
          if (newOriginCode !== currentOrigin) {
            return {
              source: 'App.model',
              roundCode: newOriginCode
            };
          }
        }
      }
      return null;
    }, { room: targetRoom, currentOrigin: currentOriginRoundCode });
    
    if (checkAgain) {
      newRoundNumber = checkAgain.roundCode;
      break;
    }
  }
  
  if (!newRoundNumber) {
    logger.warning('等待超時，未檢測到新局');
    return null;
  }
  
  logger.success(`檢測到開局！新局號: ${newRoundNumber}`);
  return newRoundNumber;
}

module.exports = {
  initWebSocketMonitoring,
  getLatestOpenRound,
  getAllOpenRounds,
  waitForNewOpenRound
};



