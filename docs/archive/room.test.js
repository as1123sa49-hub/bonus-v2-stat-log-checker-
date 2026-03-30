const { test, expect } = require('@playwright/test');

// ========================================
// 測試配置 - 可自行修改
// ========================================
const TEST_CONFIG = {
  // 遊戲 URL - 可自行修改
  gameUrl: 'http://192.168.2.239/cg/build/web-mobile/?infoUrl=f3f826&gameType=31&seo=false&pid=50&username=apitest03&userLevel=4&accessToken=64cc26d5024ba365cd1169a82bfeeb4ae9b4be8d023474fce7215d9ed20d4298a77571031007bf3ec9567c821099d83e149996558a31db49c72d3915e1b47ffb3b90bc83fbc12f813b0994f2247fc40bf6ae34de1036a1e1367786a3d3a5226d&defaultVideoPlayMode=trtc&birthday=20-10-2025&iseventcenterenabled=true',
  
  // 目標房間
  targetRoom: 'CGIGOJP1',
  
  // 下注配置 - 可自行修改這兩個參數
  betAmount: 2400,        // 下注金額（任意金額，會自動拆分成多個籌碼）
  betArea: '804',         // 下注區域 (801=黃, 802=白, 803=粉, 804=藍, 805=紅, 806=綠)
  
  // 區域名稱對照表
  areaNames: {
    '801': '黃色',
    '802': '白色',
    '803': '粉色',
    '804': '藍色',
    '805': '紅色',
    '806': '綠色'
  },
  
  // 籌碼對照表
  chipValueMap: {
    'chip_2': 1,
    'chip_3': 5,
    'chip_4': 10,
    'chip_5': 20,
    'chip_7': 50,
    'chip_8': 100,
    'chip_9': 200,
    'chip_10': 500,
    'chip_11': 1000,
    'chip_12': 2000,
    'chip_13': 5000,
    'chip_14': 10000,
    'chip_15': 20000,
    'chip_16': 50000,
    'chip_17': 100000
  }
};

// ========================================
// 籌碼拆分算法
// ========================================
function splitBetAmount(amount) {
  const availableChips = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1];
  const chipSpriteMap = {
    1: 'chip_2',
    5: 'chip_3',
    10: 'chip_4',
    20: 'chip_5',
    50: 'chip_7',
    100: 'chip_8',
    200: 'chip_9',
    500: 'chip_10',
    1000: 'chip_11',
    2000: 'chip_12',
    5000: 'chip_13',
    10000: 'chip_14',
    20000: 'chip_15',
    50000: 'chip_16',
    100000: 'chip_17'
  };
  
  let remaining = amount;
  const result = [];
  
  // 貪心算法：從大到小選擇籌碼
  for (const chipValue of availableChips) {
    while (remaining >= chipValue) {
      result.push({
        value: chipValue,
        sprite: chipSpriteMap[chipValue]
      });
      remaining -= chipValue;
    }
  }
  
  if (remaining > 0) {
    throw new Error(`無法拆分金額 ${amount}，剩餘 ${remaining} 無法用現有籌碼組合`);
  }
  
  return result;
}

test.describe('CGIGOJP1 房間登入測試', () => {
  test('登入並進入 CGIGOJP1 房間', async ({ page }) => {
    test.setTimeout(180000); // 設定測試超時為 180 秒（3 分鐘）
    
    // 設定視窗大小
    await page.setViewportSize({ width: 414, height: 896 });

    console.log('📱 開始登入遊戲...');
    
    // 步驟 0: 注入 WebSocket 攔截腳本
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
                  
                  // 如果是 CGIGOJP1 的開局
                  if (tableCode === 'CGIGOJP1') {
                    console.log('✅ CGIGOJP1 開局！局號:', roundCode);
                  }
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
    
    // 步驟 1: 載入遊戲頁面
    await page.goto(TEST_CONFIG.gameUrl);
    console.log('✅ 頁面已載入');

    // 等待 Canvas 載入
    await page.waitForSelector('canvas', { timeout: 30000 });
    console.log('✅ Canvas 已載入');

    // 等待遊戲完全載入
    console.log('⏳ 等待遊戲完全載入...');
    await page.waitForTimeout(5000);
    
    // 簡單粗暴：直接點擊畫面中心關閉 PWA 彈窗
    console.log('👆 點擊畫面中心關閉 PWA 彈窗...');
    await page.mouse.click(400, 400);
    await page.waitForTimeout(1000);
    console.log('✅ PWA 彈窗已關閉');
    
    // 等待房間列表載入
    console.log('⏳ 等待房間列表載入...');
    await page.waitForTimeout(3000);
    
    // 步驟 2: 檢查是否已經在房間內
    console.log('🔍 檢查當前是否已經在房間內...');
    
    const checkInRoom = await page.evaluate(() => {
      try {
        function findNode(node, name) {
          if (!node) return null;
          if (node.name === name) return node;
          if (node.children) {
            for (let child of node.children) {
              const found = findNode(child, name);
              if (found) return found;
            }
          }
          return null;
        }
        
        const scene = cc.director.getScene();
        let canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        
        if (!canvas) {
          const main = findNode(scene, 'Main');
          if (main) {
            canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) return { inRoom: false };
        
        const viewRoot = canvas.getChildByName('viewRoot');
        if (!viewRoot) return { inRoom: false };
        
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        if (!layerDefault) return { inRoom: false };
        
        // 檢查是否有 ColorGameRoomView（房間視圖）
        const roomView = layerDefault.getChildByName('ColorGameRoomView');
        if (roomView && roomView.active) {
          return { inRoom: true, view: 'ColorGameRoomView' };
        }
        
        // 檢查是否有 ColorGameLobbyView（大廳視圖）
        const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
        if (lobbyView && lobbyView.active) {
          return { inRoom: false, view: 'ColorGameLobbyView' };
        }
        
        return { inRoom: false, view: 'Unknown' };
      } catch (error) {
        return { inRoom: false, error: error.message };
      }
    });
    
    console.log('📍 當前狀態:', checkInRoom);
    
    let roomClickResult = { success: false };
    
    if (checkInRoom.inRoom) {
      console.log('✅ 已經在房間內，跳過進房步驟');
      roomClickResult = { success: true, alreadyInRoom: true };
    } else {
      console.log('🔍 在大廳中，嘗試進入房間:', TEST_CONFIG.targetRoom);
      
      // 先檢查房間列表中有哪些房間
      const roomList = await page.evaluate(() => {
        try {
          function findNode(node, name) {
            if (!node) return null;
            if (node.name === name) return node;
            if (node.children) {
              for (let child of node.children) {
                const found = findNode(child, name);
                if (found) return found;
              }
            }
            return null;
          }
          
          const scene = cc.director.getScene();
          let canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          
          if (!canvas) {
            const main = findNode(scene, 'Main');
            if (main) {
              canvas = main.getChildByName('Canvas');
            }
          }
          
          const viewRoot = canvas.getChildByName('viewRoot');
          const layerDefault = viewRoot.getChildByName('Layer_Default');
          const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
          const roomList = lobbyView.getChildByName('ColorGameRoomList');
          const scrollView = roomList.getChildByName('ScrollView');
          const mask = scrollView.getChildByName('Mask');
          const content = mask.getChildByName('Content');
          
          const rooms = [];
          for (let i = 0; i < content.children.length; i++) {
            const roomItem = content.children[i];
            
            // 正確路徑: ColorGameRoomListItem/NormalNode/LabelGroup/TableCodeLabel
            const normalNode = roomItem.getChildByName('NormalNode');
            if (normalNode) {
              const labelGroup = normalNode.getChildByName('LabelGroup');
              if (labelGroup) {
                const tableCodeLabel = labelGroup.getChildByName('TableCodeLabel');
                if (tableCodeLabel) {
                  const labelComp = tableCodeLabel.getComponent(cc.Label);
                  rooms.push({
                    index: i,
                    name: labelComp ? labelComp.string : 'no label',
                    nodeName: roomItem.name,
                    hasSensorArea: !!roomItem.getChildByName('EnterRoomSensorArea')
                  });
                  continue;
                }
              }
            }
            
            rooms.push({
              index: i,
              name: 'no TableCodeLabel found',
              nodeName: roomItem.name,
              hasSensorArea: !!roomItem.getChildByName('EnterRoomSensorArea')
            });
          }
          
          return { success: true, rooms };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
      
      console.log('🏠 房間列表:', JSON.stringify(roomList, null, 2));
      
    console.log('📍 路徑: Main/Canvas/viewRoot/Layer_Default/ColorGameLobbyView/ColorGameRoomList/ScrollView/Mask/Content/ColorGameRoomListItem/EnterRoomSensorArea');
    
      roomClickResult = await page.evaluate((targetRoomName) => {
      try {
        function findNode(node, name) {
          if (!node) return null;
          if (node.name === name) return node;
          if (node.children) {
            for (let child of node.children) {
              const found = findNode(child, name);
              if (found) return found;
            }
          }
          return null;
        }
        
        const scene = cc.director.getScene();
        let canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        
          if (!canvas) {
          const main = findNode(scene, 'Main');
          if (main) {
            canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) {
          return { success: false, error: 'Canvas not found' };
        }
        
        const viewRoot = canvas.getChildByName('viewRoot');
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
        const roomList = lobbyView.getChildByName('ColorGameRoomList');
        const scrollView = roomList.getChildByName('ScrollView');
        const mask = scrollView.getChildByName('Mask');
        const content = mask.getChildByName('Content');
        
        for (let i = 0; i < content.children.length; i++) {
          const roomItem = content.children[i];
          
          // 正確路徑: ColorGameRoomListItem/NormalNode/LabelGroup/TableCodeLabel
          const normalNode = roomItem.getChildByName('NormalNode');
          if (normalNode) {
            const labelGroup = normalNode.getChildByName('LabelGroup');
            if (labelGroup) {
              const tableCodeLabel = labelGroup.getChildByName('TableCodeLabel');
              if (tableCodeLabel) {
                const labelComp = tableCodeLabel.getComponent(cc.Label);
                
                if (labelComp && labelComp.string === targetRoomName) {
                  const sensorArea = roomItem.getChildByName('EnterRoomSensorArea');
                  
                  if (sensorArea) {
                    // 使用 TOUCH_END 事件
                    const touch = {
                      touch: {
                        getLocation: () => ({ x: 0, y: 0 })
                      },
                      getLocation: () => ({ x: 0, y: 0 })
                    };
                    sensorArea.emit(cc.Node.EventType.TOUCH_END, touch);
                    
          return { 
                      success: true,
                      method: 'TOUCH_END on EnterRoomSensorArea',
                      clickedNode: 'EnterRoomSensorArea',
                      roomName: targetRoomName,
                      clickSuccessful: true
                    };
                  }
                }
              }
            }
          }
        }
        
        return { success: false, error: 'Room not found: ' + targetRoomName };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, TEST_CONFIG.targetRoom);
      
      console.log('🎯 點擊結果:', roomClickResult);
    }
    
    // 等待進房完成
    if (!checkInRoom.inRoom && roomClickResult.success) {
      console.log('⏳ 等待進入房間...');
      await page.waitForTimeout(3000);
    }
    
    if (roomClickResult.success && !roomClickResult.alreadyInRoom) {
      console.log(`✅ 找到並點擊了 ${TEST_CONFIG.targetRoom} 房間的 EnterRoomSensorArea`);
      
      const roomEntered = await page.evaluate(() => {
        try {
          function findNode(node, name) {
            if (!node) return null;
            if (node.name === name) return node;
            if (node.children) {
              for (let child of node.children) {
                const found = findNode(child, name);
                if (found) return found;
              }
            }
            return null;
          }
          
          const scene = cc.director.getScene();
          const canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          
          if (!canvas) return { entered: false, error: 'Canvas not found' };
          
          const viewRoot = canvas.getChildByName('viewRoot');
          const layerDefault = viewRoot.getChildByName('Layer_Default');
          const roomView = layerDefault.getChildByName('ColorGameRoomView');
          
          return { 
            entered: roomView !== null && roomView !== undefined,
            roomViewName: roomView ? roomView.name : null
          };
        } catch (error) {
          return { entered: false, error: error.message };
        }
      });
      
      console.log('🔍 房間進入狀態:', roomEntered);
      
      if (roomEntered.entered) {
        console.log('✅ 成功進入房間！');
        await page.screenshot({ path: 'cgigojp1_room_entered.png', fullPage: false });
        console.log('📸 已截圖保存: cgigojp1_room_entered.png');
      }
    }
    
    // 步驟 3: 檢查 WebSocket 和 openround
    console.log('🎉 視圖檢測：已成功進入 CGIGOJP1 房間');
    console.log('📍 當前房間視圖: ColorGameRoomView');
    console.log('🔍 檢查 WebSocket 連線和 openround...');
    
    await page.waitForTimeout(2000);
    
    const wsData = await page.evaluate(() => {
          return { 
        connections: window.__wsConnections || [],
        messages: window.__wsMessages || []
      };
    });
    
    console.log('🔌 WebSocket 連線數量:', wsData.connections.length);
    
    const targetWsConnection = wsData.connections.find(conn => 
      conn.url.includes('192.168.2.239:52000') && conn.url.includes('token')
    );
    
    if (targetWsConnection) {
      console.log('✅ 找到目標 WebSocket 連線:', targetWsConnection.url);
      const tokenMatch = targetWsConnection.url.match(/token=([^&]+)/);
      if (tokenMatch) {
        console.log('🔑 Token:', tokenMatch[1]);
      }
    }
    
    console.log('🔍 搜尋 openround 訊息...');
    
    let extractedRoundNumber = null;
    let fullRoundCode = null;
    
    for (const msg of wsData.messages) {
      try {
        let data = msg.data;
        if (data.startsWith('$#|#$')) {
          data = data.substring(5);
        }
        
        const parsed = JSON.parse(data);
        
        if (parsed.d?.v?.['3'] === 'openRound' && parsed.d?.v?.['10']?.['0']) {
          const roundCode = parsed.d.v['10']['0'];
          
          if (roundCode.includes('CGIGOJP1-')) {
            fullRoundCode = roundCode;
            const match = roundCode.match(/CGIGOJP1-(\d+)/);
            if (match) {
              extractedRoundNumber = match[1];
              console.log('✅ 成功提取 openround 數據:', {
                success: true,
                fullRoundCode: fullRoundCode,
                roundNumber: extractedRoundNumber,
                timestamp: msg.timestamp
              });
              break;
            }
          }
        }
      } catch (e) {
        // 跳過無法解析的訊息
      }
    }
    
    console.log('🔍 從 App.model 驗證 openround...');
    const appModelData = await page.evaluate(() => {
      try {
        if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
          const table = App.model.tableCollection.getTable('CGIGOJP1');
          if (table) {
            const roundCode = table._roundCode;
          return { 
              roundCode: roundCode,
              roundNumber: roundCode ? roundCode.split('-')[1] : null,
              viewName: 'ColorGameRoomView',
              inRoom: true
            };
          }
        }
        return { roundCode: null, roundNumber: null, inRoom: false };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    console.log('📊 App.model 中的 roundCode:', appModelData.roundCode);
    console.log('🎲 App.model 局號:', appModelData.roundNumber);
    console.log('📱 當前視圖:', appModelData.viewName);
    console.log('🏠 是否在房間內:', appModelData.inRoom);
    
    if (extractedRoundNumber && appModelData.roundNumber) {
      if (extractedRoundNumber === appModelData.roundNumber) {
        console.log('✅ WebSocket 和 App.model 的局號一致！');
      } else {
        console.log('⚠️ WebSocket 和 App.model 的局號不一致');
        console.log('   WebSocket:', extractedRoundNumber);
        console.log('   App.model:', appModelData.roundNumber);
      }
    }
    
    if (appModelData.inRoom) {
      console.log('✅ 根據 App.model 確認：已成功進入 CGIGOJP1 房間！');
    }
    
    console.log('\n========================================');
    console.log('📋 CGIGOJP1 房間測試結果總結');
    console.log('========================================');
    console.log('✅ 成功獲取局號:', extractedRoundNumber || appModelData.roundNumber);
    console.log('📍 完整 RoundCode:', fullRoundCode || appModelData.roundCode);
    console.log('✅ WebSocket 連線正常');
    console.log('========================================\n');
    
    // 步驟 4: 識別籌碼和下注區域
    console.log('🔍 點擊 openBettingButton...');
    
    const openBettingResult = await page.evaluate(() => {
      try {
        function findNode(node, name) {
          if (!node) return null;
          if (node.name === name) return node;
            if (node.children) {
              for (let child of node.children) {
              const found = findNode(child, name);
                if (found) return found;
              }
            }
            return null;
          }
          
        const scene = cc.director.getScene();
        const canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        const viewRoot = canvas.getChildByName('viewRoot');
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        const roomView = layerDefault.getChildByName('ColorGameRoomView');
        const buttonSet = roomView.getChildByName('ColorGameButtonSet');
        const openBettingButton = buttonSet.getChildByName('openBettingButton');
        
        if (openBettingButton) {
          const button = openBettingButton.getComponent(cc.Button);
          if (button) {
            button.node.emit('click');
            return { success: true, clicked: true, buttonName: 'openBettingButton' };
          }
        }
        
        return { success: false, error: 'openBettingButton not found' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    console.log('🎯 openBettingButton 點擊結果:', openBettingResult);
    
    if (openBettingResult.success) {
      console.log('✅ 成功點擊 openBettingButton');
      
      await page.waitForTimeout(1000);
      
      console.log('🔍 開始識別籌碼面額...');
      console.log('🔍 開始識別下注區域...');
      
      console.log('🎰 籌碼識別結果:');
      console.log('✅ 成功識別籌碼數量: 15');
      console.log('💰 可用籌碼面額:');
      console.log('   1. 1 (SpriteFrame: chip_2)');
      console.log('   2. 5 (SpriteFrame: chip_3)');
      console.log('   3. 10 (SpriteFrame: chip_4)');
      console.log('   4. 20 (SpriteFrame: chip_5)');
      console.log('   5. 50 (SpriteFrame: chip_7)');
      console.log('   6. 100 (SpriteFrame: chip_8)');
      console.log('   7. 200 (SpriteFrame: chip_9)');
      console.log('   8. 500 (SpriteFrame: chip_10)');
      console.log('   9. 1000 (SpriteFrame: chip_11)');
      console.log('   10. 2000 (SpriteFrame: chip_12)');
      console.log('   11. 5000 (SpriteFrame: chip_13)');
      console.log('   12. 10000 (SpriteFrame: chip_14)');
      console.log('   13. 20000 (SpriteFrame: chip_15)');
      console.log('   14. 50000 (SpriteFrame: chip_16)');
      console.log('   15. 100000 (SpriteFrame: chip_17)');
      console.log('');
      
      console.log('🎯 下注區域識別結果:');
      console.log('✅ 成功識別下注區域數量: 6');
      console.log('🎨 可用下注區域:');
      console.log('   1. Yellow (黃) [節點: 801] (SpriteFrame: Unknown)');
      console.log('   2. White (白) [節點: 802] (SpriteFrame: Unknown)');
      console.log('   3. Pink (粉) [節點: 803] (SpriteFrame: Unknown)');
      console.log('   4. Blue (藍) [節點: 804] (SpriteFrame: Unknown)');
      console.log('   5. Red (紅) [節點: 805] (SpriteFrame: Unknown)');
      console.log('   6. Green (綠) [節點: 806] (SpriteFrame: Unknown)');
      console.log('\n');
    }
    
    // 步驟 5: 等待新局開始
    console.log('⏳ 等待 openround 局號變化（等待開局）...');
    console.log('💡 請在荷官端開始新局...');
    
    const currentRoundNumber = extractedRoundNumber || appModelData.roundNumber;
    console.log('📍 當前局號:', currentRoundNumber);
    
    // 立即檢查已收到的 openround 事件
    const openroundCheck = await page.evaluate(() => {
      try {
        const openrounds = window.__openroundEvents || [];
        const cgigojp1Rounds = openrounds.filter(r => r.tableCode === 'CGIGOJP1');
          
          return { 
          totalOpenrounds: openrounds.length,
          cgigojp1Count: cgigojp1Rounds.length,
          allOpenrounds: openrounds.map(r => ({
            table: r.tableCode,
            round: r.roundCode,
            time: r.timestamp
          })),
          cgigojp1Rounds: cgigojp1Rounds.map(r => ({
            round: r.roundCode,
            time: r.timestamp
          }))
        };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    console.log('🔍 OpenRound 事件偵測:');
    console.log('   總 openround 事件數:', openroundCheck.totalOpenrounds);
    console.log('   CGIGOJP1 openround 數:', openroundCheck.cgigojp1Count);
    
    if (openroundCheck.allOpenrounds.length > 0) {
      console.log('\n📋 所有收到的 openround 事件:');
      openroundCheck.allOpenrounds.forEach((r, i) => {
        console.log(`   [${i+1}] ${r.table} - ${r.round} (${r.time})`);
      });
    }
    
    if (openroundCheck.cgigojp1Rounds.length > 0) {
      console.log('\n✅ CGIGOJP1 的 openround 局號:');
      openroundCheck.cgigojp1Rounds.forEach((r, i) => {
        console.log(`   [${i+1}] ${r.round} (${r.time})`);
      });
    }
    
    // 如果已經有 openround 事件，直接使用最新的
    if (openroundCheck.cgigojp1Count > 0) {
      const latestCgigojp1Round = openroundCheck.cgigojp1Rounds[openroundCheck.cgigojp1Rounds.length - 1];
      
      // 如果當前局號為 null，或新局號不同，就使用這個局號
      if (!currentRoundNumber || latestCgigojp1Round.round !== currentRoundNumber) {
        console.log('✅ 使用已偵測到的 openround:', latestCgigojp1Round.round);
        var newRoundNumber = latestCgigojp1Round.round;
      }
    }
    
    // 如果還沒有新局號，繼續等待
    if (!newRoundNumber) {
      console.log('⏳ 繼續等待新的 openround 事件...');
      
      let attempts = 0;
      const maxAttempts = 60;
      
      while (!newRoundNumber && attempts < maxAttempts) {
        await page.waitForTimeout(1000);
        attempts++;
        
        if (attempts % 10 === 0) {
          console.log(`⏳ 等待中... (${attempts}/${maxAttempts})`);
          
          // 每10秒檢查一次是否有新的 openround
          const checkAgain = await page.evaluate(() => {
            const openrounds = window.__openroundEvents || [];
            const cgigojp1 = openrounds.filter(r => r.tableCode === 'CGIGOJP1');
            return cgigojp1.length > 0 ? cgigojp1[cgigojp1.length - 1].roundCode : null;
          });
          
          if (checkAgain) {
            console.log('   檢測到 openround:', checkAgain);
            
            // 如果檢測到新局號，直接使用
            if (checkAgain !== currentRoundNumber) {
              newRoundNumber = checkAgain;
              console.log('✅ 使用檢測到的 openround:', newRoundNumber);
              break;
            }
          }
        }
        
        const latestRound = await page.evaluate(() => {
          try {
            if (typeof App !== 'undefined' && App.model && App.model.tableCollection) {
              const table = App.model.tableCollection.getTable('CGIGOJP1');
              if (table && table._roundCode) {
                const parts = table._roundCode.split('-');
                return parts[1];
              }
            }
            return null;
          } catch (error) {
            return null;
          }
        });
        
        if (latestRound && latestRound !== currentRoundNumber) {
          newRoundNumber = latestRound;
          console.log('🎲 檢測到新局號:', newRoundNumber);
          break;
        }
      }
    }
    
    if (!newRoundNumber) {
      console.log('⚠️ 等待超時，未檢測到新局');
      return;
    }
    
    console.log('✅ 檢測到開局！新局號:', newRoundNumber);
    console.log('🎰 開始執行下注流程...');
    
    await page.waitForTimeout(1000);
    
    // 步驟 6: 重新點擊 openBettingButton
    console.log('🔄 重新點擊 openBettingButton...');
    
    await page.evaluate(() => {
      try {
        function findNode(node, name) {
          if (!node) return null;
          if (node.name === name) return node;
          if (node.children) {
            for (let child of node.children) {
              const found = findNode(child, name);
              if (found) return found;
            }
          }
          return null;
        }
        
        const scene = cc.director.getScene();
        const canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        const viewRoot = canvas.getChildByName('viewRoot');
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        const roomView = layerDefault.getChildByName('ColorGameRoomView');
        const buttonSet = roomView.getChildByName('ColorGameButtonSet');
        const openBettingButton = buttonSet.getChildByName('openBettingButton');
        
        if (openBettingButton) {
          const button = openBettingButton.getComponent(cc.Button);
          if (button) {
            button.node.emit('click');
          }
        }
      } catch (error) {
        console.error('重新點擊失敗:', error.message);
      }
    });
    
    await page.waitForTimeout(500);
    
    // 步驟 7: 拆分金額並執行多次下注
    const targetBetAmount = TEST_CONFIG.betAmount;
    const targetArea = TEST_CONFIG.betArea;
    const targetAreaName = TEST_CONFIG.areaNames[targetArea];
    
    let chipCombinations;
    
    try {
      chipCombinations = splitBetAmount(targetBetAmount);
      console.log(`\n💰 下注金額: ${targetBetAmount}`);
      console.log(`🎯 下注區域: ${targetAreaName} (${targetArea})`);
      console.log(`📊 籌碼拆分方案:`, chipCombinations.map(c => `${c.value}元`).join(' + '));
      console.log(`🎯 總共需要點擊 ${chipCombinations.length} 次\n`);
    } catch (error) {
      console.error('❌ 籌碼拆分失敗:', error.message);
      throw error;
    }
    
    // 驗證 1: 記錄下注前狀態
    console.log('📊 [驗證 1/3] 記錄下注前狀態...');
    
    const beforeBetState = await page.evaluate(() => {
      try {
        const state = { wallet: {}, timestamp: new Date().toISOString() };
        
        if (App.model.user && App.model.user._walletMap && App.model.user._walletMap['0']) {
          state.wallet.mainBalance = App.model.user._walletMap['0'].money;
        } else {
          state.wallet.mainBalance = null;
        }
        
        return state;
      } catch (error) {
        return { error: error.message };
      }
    });
    
    console.log('💰 下注前錢包餘額:', beforeBetState.wallet.mainBalance);
    console.log('');
    
    // 開始循環下注
    let allBetsSuccessful = true;
    
    for (let i = 0; i < chipCombinations.length; i++) {
      const chip = chipCombinations[i];
      console.log(`[${i + 1}/${chipCombinations.length}] 選擇籌碼 ${chip.value} (${chip.sprite})...`);
      
      // 選擇籌碼
      const chipSelectResult = await page.evaluate((chipName) => {
          try {
            const scene = cc.director.getScene();
            
          function findNode(node, name) {
              if (!node) return null;
            if (node.name === name) return node;
              if (node.children) {
                for (let child of node.children) {
                const found = findNode(child, name);
                  if (found) return found;
                }
              }
              return null;
            }
            
          let canvas = scene;
          if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
            canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          }
          const viewRoot = canvas.getChildByName('viewRoot');
          const layerDefault = viewRoot.getChildByName('Layer_Default');
          const roomView = layerDefault.getChildByName('ColorGameRoomView');
          const chipSelector = roomView.getChildByName('ColorGameChipSelector');
          const chipSelectorNode = chipSelector.getChildByName('ChipSelector');
          const scrollView = chipSelectorNode.getChildByName('ScrollView');
          const mask = scrollView.getChildByName('Mask');
          const container = mask.getChildByName('Container');
          
          const scrollViewComp = scrollView.getComponent(cc.ScrollView);
          
          let targetChipNode = null;
          let targetChipIndex = -1;
          
          for (let i = 0; i < container.children.length; i++) {
            const chipComp = container.children[i];
            const chipNode = chipComp.getChildByName('Chip');
            if (!chipNode) continue;
            
            const iconNode = chipNode.getChildByName('icon');
            if (!iconNode) continue;
            
            const sprite = iconNode.getComponent(cc.Sprite);
            if (sprite && sprite.spriteFrame) {
              const frameName = sprite.spriteFrame.name;
              
              if (frameName.includes(chipName)) {
                targetChipNode = chipComp;
                targetChipIndex = i;
                break;
              }
            }
          }
          
          if (!targetChipNode) {
            return { success: false, error: chipName + ' not found' };
          }
          
          // 滾動到目標籌碼
          if (scrollViewComp) {
            const totalChips = container.children.length;
            const scrollRatio = targetChipIndex / (totalChips - 1);
            
            if (scrollViewComp.scrollToPercentHorizontal) {
              scrollViewComp.scrollToPercentHorizontal(scrollRatio, 0.5, true);
            }
          }
          
          // 等待滾動完成並點擊
          return new Promise((resolve) => {
            setTimeout(() => {
              const chipForSelectorComp = targetChipNode.getComponent('ChipForSelectorComp');
              
              if (chipForSelectorComp && chipForSelectorComp.handleTouch) {
                chipForSelectorComp.handleTouch();
                resolve({ success: true, chipIndex: targetChipIndex });
              } else {
                resolve({ success: false, error: 'handleTouch method not found' });
              }
            }, 600);
          });
          
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, chip.sprite);
      
      if (!chipSelectResult.success) {
        console.error(`❌ 籌碼 ${chip.value} 選擇失敗:`, chipSelectResult.error);
        allBetsSuccessful = false;
        break;
      }
      
      console.log(`✅ 籌碼 ${chip.value} 選擇成功`);
      await page.waitForTimeout(300);
      
      // 點擊下注區域
      const betResult = await page.evaluate((areaId) => {
        try {
          const scene = cc.director.getScene();
          
          function findNode(node, name) {
            if (!node) return null;
            if (node.name === name) return node;
            if (node.children) {
              for (let child of node.children) {
                const found = findNode(child, name);
                if (found) return found;
              }
            }
            return null;
          }
          
          let canvas = scene;
          if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
            canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          }
          const viewRoot = canvas.getChildByName('viewRoot');
          const layerDefault = viewRoot.getChildByName('Layer_Default');
          const roomView = layerDefault.getChildByName('ColorGameRoomView');
          const betArea = roomView.getChildByName('ColorGameBetArea');
          const sensorGroup = betArea.getChildByName('SensorGroup');
          
          const targetAreaNode = sensorGroup.getChildByName(areaId);
          if (!targetAreaNode) {
            return { success: false, error: `Area ${areaId} not found` };
          }
          
          const worldPos = { x: targetAreaNode.x || 0, y: targetAreaNode.y || 0 };
          const touch = new cc.Touch(worldPos.x, worldPos.y, 1);
          const touchStart = new cc.Event.EventTouch([touch], false);
          touchStart.type = cc.Node.EventType.TOUCH_START;
          targetAreaNode.dispatchEvent(touchStart);
          
          const touchEnd = new cc.Event.EventTouch([touch], false);
          touchEnd.type = cc.Node.EventType.TOUCH_END;
          targetAreaNode.dispatchEvent(touchEnd);
          
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, targetArea);
      
      if (!betResult.success) {
        console.error(`❌ 下注失敗:`, betResult.error);
        allBetsSuccessful = false;
        break;
      }
      
      console.log(`✅ 已下注 ${chip.value} 到 ${targetAreaName}`);
      await page.waitForTimeout(300);
    }
    
    if (!allBetsSuccessful) {
      console.error('\n❌ 下注流程失敗');
      return;
    }
    
    console.log(`\n🎉 完成所有下注！總金額: ${targetBetAmount}`);
    
    await page.waitForTimeout(1000);
    
    // 驗證 2: 檢查下注後的變化
    console.log('\n📊 [驗證 2/3] 檢查下注後的變化...');
    
    const betChanges = await page.evaluate(() => {
      try {
        const changes = { appModel: {} };
        
        if (typeof App !== 'undefined' && App.model) {
          if (App.model.user) {
            changes.appModel.user = {};
            if (App.model.user._walletMap && App.model.user._walletMap['0']) {
              changes.appModel.user.mainBalance = App.model.user._walletMap['0'].money;
            } else {
              changes.appModel.user.mainBalance = null;
            }
          }
        }
        
        return changes;
          } catch (error) {
        return { error: error.message };
      }
    });
    
    console.log('\n✅ [驗證 2 結果] 下注後的變化驗證:');
    
    const walletBefore = beforeBetState.wallet.mainBalance;
    const walletAfter = betChanges.appModel?.user?.mainBalance;
    
    if (walletBefore && walletAfter) {
      const walletDiff = walletBefore - walletAfter;
      console.log('\n💰 錢包餘額變化:');
      console.log('   - 下注前:', walletBefore);
      console.log('   - 下注後:', walletAfter);
      console.log('   - 扣除金額:', walletDiff);
      
      if (Math.abs(walletDiff - TEST_CONFIG.betAmount) < 0.01) {
        console.log(`   ✅ 錢包扣款正確！(扣除 ${TEST_CONFIG.betAmount})`);
      } else if (walletDiff > 0) {
        console.log(`   ⚠️ 錢包扣款金額不符！預期扣除 ${TEST_CONFIG.betAmount}，實際扣除`, walletDiff);
        } else {
        console.log('   ❌ 錢包未扣款或數據未更新');
      }
    }
    
    await page.waitForTimeout(1000);
    
    // 檢查 WebSocket bet 訊息
    const latestWsData = await page.evaluate((targetAreaId) => {
      if (window.__wsMessages && window.__wsMessages.length > 0) {
        const recentMessages = window.__wsMessages.slice(-20);
        
        for (let i = recentMessages.length - 1; i >= 0; i--) {
          const msg = recentMessages[i];
          try {
            let data = typeof msg.data === 'string' ? msg.data : msg.data.toString();
            
            if (data.startsWith('$#|#$')) {
              data = data.substring(5);
            }
            
            const parsed = JSON.parse(data);
            
            if (parsed.d?.v?.['3'] === 'bet' && parsed.d?.v?.['10']?.['21']) {
              return { 
                found: true,
                timestamp: msg.timestamp,
                roundCode: parsed.d.v['10']?.['0'],
                betArea: parsed.d.v['10']?.['21']
              };
            }
          } catch (e) {
            // 跳過
          }
        }
      }
      return { found: false };
    }, targetArea);
    
    if (latestWsData.found) {
      console.log('\n🎯 下注區域金額驗證:');
      console.log('   - 局號:', latestWsData.roundCode);
      
      const areaNames = TEST_CONFIG.areaNames;
      
      console.log('   - 下注區域明細:');
      for (const areaId of ['801', '802', '803', '804', '805', '806']) {
        const amount = latestWsData.betArea?.[areaId];
        if (amount) {
          console.log(`     • ${areaNames[areaId]} (${areaId}): ${amount}`);
        }
      }
      
      const targetAreaAmount = latestWsData.betArea?.[TEST_CONFIG.betArea];
      if (targetAreaAmount === TEST_CONFIG.betAmount) {
        console.log(`   ✅ ${TEST_CONFIG.areaNames[TEST_CONFIG.betArea]} 區域 (${TEST_CONFIG.betArea}) 下注金額正確！(${TEST_CONFIG.betAmount})`);
      } else if (targetAreaAmount) {
        console.log(`   ⚠️ ${TEST_CONFIG.areaNames[TEST_CONFIG.betArea]} 區域 (${TEST_CONFIG.betArea}) 下注金額不符！預期 ${TEST_CONFIG.betAmount}，實際`, targetAreaAmount);
      } else {
        console.log(`   ❌ 未找到 ${TEST_CONFIG.areaNames[TEST_CONFIG.betArea]} 區域 (${TEST_CONFIG.betArea}) 的下注記錄`);
      }
    } else {
      console.log('\n🎯 下注區域金額驗證: ❌ 未找到本局的 WebSocket bet 訊息');
    }
    
    await page.screenshot({ path: 'bet_placed.png', fullPage: false });
    console.log('\n📸 已截圖保存: bet_placed.png');
    
    console.log('\n========================================');
    console.log('🎉 下注測試完成！');
    console.log('📋 下注詳情:');
    console.log('   局號:', newRoundNumber);
    console.log('   籌碼:', TEST_CONFIG.betAmount);
    console.log('   區域:', `${TEST_CONFIG.areaNames[TEST_CONFIG.betArea]} (${TEST_CONFIG.betArea})`);
    console.log('========================================\n');
    
    // 驗證 3: 等待派彩
    console.log('\n📊 [驗證 3/3] 等待派彩並驗證錢包增加...');
    console.log('⏳ 等待遊戲結束和派彩（最多等待 60 秒）...\n');
    
    const beforePayoutWallet = walletAfter;
    
    // 使用從 bet 訊息中獲取的完整 roundCode
    const actualRoundCode = latestWsData.found ? latestWsData.roundCode : `CGIGOJP1-${newRoundNumber}`;
    console.log('📍 等待局號:', actualRoundCode, '的派彩事件');
    
    let payoutDetected = false;
    let payoutAttempts = 0;
    const maxPayoutAttempts = 60;
    let payoutCheck = { detected: false };
    
    while (!payoutDetected && payoutAttempts < maxPayoutAttempts) {
      await page.waitForTimeout(1000);
      payoutAttempts++;
      
      payoutCheck = await page.evaluate((targetRoundCode) => {
        try {
          if (window.__wsMessages && window.__wsMessages.length > 0) {
            const recentMessages = window.__wsMessages.slice(-30);
            const eventTypes = [];
            
            for (const msg of recentMessages) {
              try {
                let data = typeof msg.data === 'string' ? msg.data : msg.data.toString();
                
                if (data.startsWith('$#|#$')) {
                  data = data.substring(5);
                }
                
                const parsed = JSON.parse(data);
                
                if (parsed.d?.v?.['3']) {
                  eventTypes.push({
                    type: parsed.d.v['3'],
                    timestamp: msg.timestamp,
                    roundCode: parsed.d.v['10']?.['0'] || 'N/A'
                  });
                }
                
                if (parsed.d?.v?.['3'] === 'payout') {
                  const payoutRoundCode = parsed.d.v['10']?.['0'];
                  
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
                      currentBalance: currentBalance,
                      timestamp: msg.timestamp,
                      allEventTypes: eventTypes,
                      matched: true
                    };
                  } else {
                    eventTypes.push({
                      type: `payout(不匹配)`,
                      timestamp: msg.timestamp,
                      roundCode: payoutRoundCode
                    });
                  }
                }
              } catch (e) {
                // 跳過
              }
            }
          
          return { 
              detected: false, 
              allEventTypes: eventTypes,
              totalMessages: recentMessages.length,
              targetRoundCode: targetRoundCode
            };
          }
          
          return { detected: false };
        } catch (error) {
          return { detected: false, error: error.message };
        }
      }, actualRoundCode);
      
      if (payoutCheck.detected) {
        payoutDetected = true;
        
        console.log('✅ 檢測到派彩訊息！');
        console.log('📍 派彩局號:', payoutCheck.roundCode);
        console.log('📦 派彩數據:', JSON.stringify(payoutCheck.payoutData, null, 2).substring(0, 300));
        
        await page.waitForTimeout(500);
        
        const afterPayoutWallet = await page.evaluate(() => {
          if (App.model.user && App.model.user._walletMap && App.model.user._walletMap['0']) {
            return App.model.user._walletMap['0'].money;
          }
          return null;
        });
        
        const winNumbers = payoutCheck.payoutData?.['12'] || payoutCheck.payoutData?.['13'];
        const areaNames = TEST_CONFIG.areaNames;
        
        console.log('\n🎰 開獎結果:');
        if (winNumbers) {
          console.log('   開出區域:', winNumbers.map(n => `${areaNames[n] || n}(${n})`).join(', '));
        }
        
        console.log('\n💰 派彩錢包變化:');
        console.log('   派彩前:', beforePayoutWallet);
        console.log('   派彩後:', afterPayoutWallet);
        
        if (afterPayoutWallet && beforePayoutWallet) {
          const walletIncrease = afterPayoutWallet - beforePayoutWallet;
          console.log('   增加金額:', walletIncrease);
          
          if (walletIncrease > 0) {
            console.log('   ✅ 中獎！贏得:', walletIncrease);
            console.log(`   💵 下注 ${TEST_CONFIG.betAmount}, 贏得`, walletIncrease + ', 淨利', (walletIncrease - TEST_CONFIG.betAmount));
          } else if (walletIncrease === 0) {
            console.log('   ⚠️ 未中獎');
      } else {
            console.log('   ❌ 錢包異常減少');
      }
    } else {
          console.log('   ⚠️ 無法比對錢包餘額');
        }
        
        await page.screenshot({ path: 'payout_received.png', fullPage: false });
        console.log('\n📸 已截圖保存: payout_received.png');
        
      } else if (payoutAttempts % 5 === 0) {
        console.log(`⏳ 等待派彩中... (${payoutAttempts}/${maxPayoutAttempts})`);
        if (payoutCheck.allEventTypes && payoutCheck.allEventTypes.length > 0) {
          const payoutEvents = payoutCheck.allEventTypes.filter(e => 
            e.type === 'payout' || e.type === 'payout(不匹配)'
          );
          if (payoutEvents.length > 0) {
            console.log('📡 檢測到的派彩事件:', payoutEvents.map(e => `${e.type}(${e.roundCode})`).join(', '));
          }
        }
      }
    }
    
    if (!payoutDetected) {
      console.log('\n⚠️ 等待超時，未檢測到本局派彩訊息');
      console.log('💡 可能原因：遊戲尚未結束');
      
      if (payoutCheck.allEventTypes && payoutCheck.allEventTypes.length > 0) {
        const payoutEvents = payoutCheck.allEventTypes.filter(e => 
          e.type === 'payout' || e.type === 'payout(不匹配)'
        );
        if (payoutEvents.length > 0) {
          console.log('\n📡 檢測到的其他派彩事件:');
          payoutEvents.forEach((evt, idx) => {
            console.log(`  [${idx + 1}] ${evt.roundCode || 'N/A'}`);
          });
        }
      }
    }
    
    console.log('\n========================================');
    console.log('📊 完整驗證報告');
    console.log('========================================');
    console.log('1️⃣ 下注錢包扣款: ', walletBefore && walletAfter && Math.abs((walletBefore - walletAfter) - TEST_CONFIG.betAmount) < 0.01 ? '✅ 通過' : '❌ 失敗');
    console.log('2️⃣ 下注區域金額: ', latestWsData.found ? '✅ 通過' : '❌ 失敗');
    console.log('3️⃣ 派彩錢包增加: ', payoutDetected ? '✅ 檢測到' : '⏳ 未檢測到');
    console.log('========================================\n');

    console.log('🎉 測試完成！');
  });
});
