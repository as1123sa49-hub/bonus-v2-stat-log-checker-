/**
 * 房間操作輔助函數
 * 處理進入房間、檢查房間狀態等操作
 */

const { createRoomPathHelperScript } = require('./cocosHelper');
const TEST_CONFIG = require('../../config/testConfig');
const logger = require('../utils/logger');
const { closePWAPopup } = require('./loginHelper');

async function checkTableMapForRoom(page, targetRoom) {
  return await page.evaluate((roomName) => {
    try {
      const tableCollection = App?.model?.tableCollection;
      if (!tableCollection || !tableCollection._tableMap) {
        return { checked: false, exists: false, rooms: [] };
      }
      const map = tableCollection._tableMap;
      const keys = Object.keys(map || {});
      return {
        checked: true,
        exists: !!map[roomName],
        rooms: keys
      };
    } catch (error) {
      return { checked: false, exists: false, error: error.message, rooms: [] };
    }
  }, targetRoom);
}

async function scrollRoomList(page, progress, options = {}) {
  const { duration = 0.6, settleDelay = 400 } = options;
  return await page.evaluate(({ targetProgress, durationMs, settleMs }) => {
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
      if (!canvas) return { success: false, error: 'Canvas not found' };

      const viewRoot = canvas.getChildByName('viewRoot');
      if (!viewRoot) return { success: false, error: 'viewRoot not found' };

      const layerDefault = viewRoot.getChildByName('Layer_Default');
      if (!layerDefault) return { success: false, error: 'Layer_Default not found' };

      const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
      if (!lobbyView || !lobbyView.active) {
        return { success: false, error: 'Lobby view not active' };
      }

      const roomList = lobbyView.getChildByName('ColorGameRoomList');
      const scrollViewNode = roomList?.getChildByName('ScrollView');
      const scrollBar = scrollViewNode?.getChildByName('ScrollBar');
      const bar = scrollBar?.getChildByName('Bar');
      const scrollViewComp = scrollViewNode?.getComponent(cc.ScrollView);
      const scrollBarComp = scrollBar?.getComponent(cc.ScrollBar);

      if (!scrollViewComp || !scrollBarComp || !bar) {
        return { success: false, error: 'ScrollView or ScrollBar not available' };
      }

      const progressClamped = Math.max(0, Math.min(1, targetProgress));
      let method = '';

      if (typeof scrollViewComp.scrollToPercentVertical === 'function') {
        scrollViewComp.scrollToPercentVertical(progressClamped, durationMs / 1000, true);
        method = 'scrollToPercentVertical';
      } else if (typeof scrollViewComp.scrollToOffset === 'function') {
        const content = scrollViewComp.content;
        const viewSize = scrollViewComp.node.getContentSize();
        const contentSize = content.getContentSize();
        const maxOffsetY = Math.max(0, contentSize.height - viewSize.height);
        const offsetY = maxOffsetY * progressClamped;
        scrollViewComp.scrollToOffset(cc.v2(0, maxOffsetY - offsetY), durationMs / 1000, true);
        method = 'scrollToOffset';
      }

      scrollBarComp.progress = progressClamped;

      const touch = {
        touch: {
          getLocation: () => ({ x: 0, y: 0 })
        },
        getLocation: () => ({ x: 0, y: 0 }),
        target: bar,
        currentTarget: bar
      };
      bar.emit(cc.Node.EventType.TOUCH_START, touch);
      bar.emit(cc.Node.EventType.TOUCH_END, touch);

      return { success: true, method, progress: progressClamped, settleMs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, { targetProgress: progress, durationMs: duration * 1000, settleMs: settleDelay });
}

async function scanVisibleRooms(page, batch = 6) {
  const listResult = await getRoomList(page);
  if (!listResult.success) {
    return listResult;
  }
  const rooms = listResult.rooms || [];
  const limited = rooms.slice(0, Math.min(batch, rooms.length));
  const names = limited.map(r => r.name).join(', ');
  return { success: true, rooms: limited, allRooms: rooms, summary: names };
}

async function checkIfInRoom(page) {
  return await page.evaluate(() => {
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
      
      const possibleRoomViews = ['ColorGameRoomView', 'ColorGameSpeedRoomView', 'ColorGameBonusRoomView'];
      for (const viewName of possibleRoomViews) {
        const roomView = layerDefault.getChildByName(viewName);
        if (roomView && roomView.active) {
          return { inRoom: true, view: viewName };
        }
      }
      
      const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
      if (lobbyView && lobbyView.active) {
        return { inRoom: false, view: 'ColorGameLobbyView' };
      }
      
      return { inRoom: false, view: 'Unknown' };
    } catch (error) {
      return { inRoom: false, error: error.message };
    }
  });
}

async function getRoomList(page) {
  return await page.evaluate(() => {
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
}

async function enterRoom(page, targetRoom) {
  logger.info('等待房間列表載入...');
  
  let viewReady = false;
  let attempts = 0;
  const maxAttempts = 100; // 最多等待 ~10 秒
  
  while (!viewReady && attempts < maxAttempts) {
    viewReady = await page.evaluate(() => {
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
          if (main) canvas = main.getChildByName('Canvas');
        }
        
        if (!canvas) return false;
        
        const viewRoot = canvas.getChildByName('viewRoot');
        if (!viewRoot) return false;
        
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        if (!layerDefault) return false;
        
        const roomView = layerDefault.getChildByName('ColorGameRoomView');
        const speedRoomView = layerDefault.getChildByName('ColorGameSpeedRoomView');
        const bonusRoomView = layerDefault.getChildByName('ColorGameBonusRoomView');
        const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
        
        return (roomView && roomView.active) || (speedRoomView && speedRoomView.active) || (bonusRoomView && bonusRoomView.active) || (lobbyView && lobbyView.active);
      } catch (e) {
        return false;
      }
    });
    
    if (!viewReady) {
      await page.waitForTimeout(100);
      attempts++;
    }
  }
  
  if (viewReady) {
    logger.success('視圖已就緒');
  } else {
    logger.warning('視圖載入超時，繼續執行...');
  }
  
  const checkInRoom = await checkIfInRoom(page);
  if (checkInRoom.inRoom) {
    logger.success('已經在房間內，跳過進房步驟');
    return { success: true, alreadyInRoom: true, lobbyListRead: false };
  }
  
  logger.detect(`嘗試進入房間: ${targetRoom}`);
  let roomList = await getRoomList(page);
  if (!roomList.success) {
    return { success: false, error: roomList.error, lobbyListRead: false };
  }

  if (roomList.rooms && roomList.rooms.length > 0) {
    const roomNames = roomList.rooms.map(r => r.name).join(', ');
    logger.info(`讀取到的房間: ${roomNames}`);
  }

  // 標記已經讀取到大廳列表
  const lobbyListRead = true;
  
  // 在進入房間列表後關閉 PWA
  await closePWAPopup(page);

  let roomVisible = roomList.rooms?.some(r => r.name === targetRoom);
  const collectedRoomNames = new Set(roomList.rooms?.map(r => r.name) || []);

  if (!roomVisible) {
    const tableMapInfo = await checkTableMapForRoom(page, targetRoom);
    if (tableMapInfo.checked) {
      const mapRooms = tableMapInfo.rooms.join(', ');
      if (tableMapInfo.exists) {
        logger.info(`TableMap 中存在目標房間 ${targetRoom}，啟動逐步拖曳檢索 (tableMap: ${mapRooms})`);
      } else {
        logger.warning(`TableMap 中未找到房間 ${targetRoom}，可用房間: ${mapRooms}`);
      }
    } else if (tableMapInfo.error) {
      logger.warning(`讀取 TableMap 失敗: ${tableMapInfo.error}`);
    }

    if (tableMapInfo.exists) {
      const collectResult = await collectRoomsByScrolling(page, {
        step: 0.08,
        duration: 0.95,
        settleDelay: 750,
        maxIterations: 30,
        targetRoom
      });

      if (collectResult.roomsVisible && collectResult.roomsVisible.length) {
        collectResult.roomsVisible.forEach(name => collectedRoomNames.add(name));
        logger.info(`累積識別房間: ${Array.from(collectedRoomNames).join(', ')}`);
      }

      if (collectResult.found) {
        roomVisible = true;
        roomList = { success: true, rooms: collectResult.lastRooms || roomList.rooms };
        const progressLog = typeof collectResult.progressReached === 'number'
          ? collectResult.progressReached.toFixed(2)
          : '未知';
        logger.info(`在 progress=${progressLog} 處找到了目標房間 ${targetRoom}`);
      }
    }
  }

  if (!roomVisible) {
    const visibleNames = Array.from(collectedRoomNames);
    logger.error(`無法在房間列表中找到房間 ${targetRoom}`);
    return { success: false, error: `Room not visible: ${targetRoom}`, roomsVisible: visibleNames, lobbyListRead: true };
  }
  
  const roomClickResult = await page.evaluate((targetRoomName) => {
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
                  const touch = {
                    touch: {
                      getLocation: () => ({ x: 0, y: 0 })
                    },
                    getLocation: () => ({ x: 0, y: 0 }),
                    target: sensorArea,
                    currentTarget: sensorArea
                  };
                  sensorArea.emit(cc.Node.EventType.TOUCH_START, touch);
                  sensorArea.emit(cc.Node.EventType.TOUCH_END, touch);
                  
                  return { 
                    success: true,
                    method: 'TOUCH_START+TOUCH_END on EnterRoomSensorArea',
                    clickedNode: 'EnterRoomSensorArea',
                    roomName: targetRoomName,
                    clickSuccessful: true
                  };
                }
                
                const fallbackTouch = {
                  touch: {
                    getLocation: () => ({ x: 0, y: 0 })
                  },
                  getLocation: () => ({ x: 0, y: 0 }),
                  target: roomItem,
                  currentTarget: roomItem
                };
                roomItem.emit(cc.Node.EventType.TOUCH_START, fallbackTouch);
                roomItem.emit(cc.Node.EventType.TOUCH_END, fallbackTouch);
                return {
                  success: true,
                  method: 'TOUCH_START+TOUCH_END on roomItem',
                  clickedNode: roomItem.name,
                  roomName: targetRoomName,
                  clickSuccessful: true
                };
              }
            }
          }
        }
      }
      
      return { success: false, error: 'Room not found: ' + targetRoomName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, targetRoom);
  
  if (!roomClickResult.success) {
    logger.error(`點擊房間失敗: ${roomClickResult.error}`);
    return { ...roomClickResult, roomsVisible: roomList.rooms?.map(r => r.name) || [] };
  }
  
  let roomEntered = { entered: false };
  let enterAttempts = 0;
  const maxEnterAttempts = 120; // 最多等待 12 秒
  
  while (!roomEntered.entered && enterAttempts < maxEnterAttempts) {
    roomEntered = await page.evaluate(() => {
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
      
      const activeViews = [];
      if (layerDefault && layerDefault.children) {
        for (let i = 0; i < layerDefault.children.length; i++) {
          const child = layerDefault.children[i];
          if (child.active) {
            activeViews.push(child.name);
          }
        }
      }
      
      const possibleRoomViews = [
        'ColorGameRoomView',
        'ColorGameSpeedRoomView',
        'ColorGameBonusRoomView'
      ];
      
      for (const viewName of possibleRoomViews) {
        const roomView = layerDefault.getChildByName(viewName);
        if (roomView && roomView.active) {
          return { entered: true, roomViewName: viewName };
        }
      }
      
      return { entered: false, activeViews: activeViews };
    } catch (error) {
      return { entered: false, error: error.message };
    }
  });
    
    if (!roomEntered.entered) {
      await page.waitForTimeout(100);
      enterAttempts++;
    }
  }
  
  if (roomEntered.entered) {
    logger.success(`成功進入房間: ${targetRoom}`);
    await page.screenshot({ path: `${targetRoom.toLowerCase()}_room_entered.png`, fullPage: false });
  } else {
    logger.warning('房間進入超時，但可能已進入');
  }
  
  const visibleNames = roomList.rooms?.map(r => r.name) || [];
  return { success: roomEntered.entered, roomsVisible: visibleNames, lobbyListRead: true };
}

async function collectRoomsByScrolling(page, options = {}) {
  const {
    step = 0.08,
    duration = 0.9,
    settleDelay = 750,
    maxIterations = 20,
    targetRoom
  } = options;

  let currentProgress = 0;
  const seenRoomNames = new Set();
  const seenSnapshots = new Set();
  let lastRooms = [];

  const pushRooms = (roomsArray) => {
    roomsArray.forEach(room => {
      if (room && room.name) {
        seenRoomNames.add(room.name);
      }
    });
    lastRooms = roomsArray;
  };

  // 先回到頂部
  const topResult = await scrollRoomList(page, 0, { duration: Math.max(duration, 0.8), settleDelay });
  if (topResult.success) {
    await page.waitForTimeout(topResult.settleMs || settleDelay);
    const topList = await scanVisibleRooms(page, 10);
    if (topList.success) {
      pushRooms(topList.allRooms || []);
      const snapshotKey = (topList.allRooms || []).map(r => r.name).join('|');
      if (snapshotKey) {
        seenSnapshots.add(snapshotKey);
      }
      if (targetRoom && (topList.allRooms || []).some(r => r.name === targetRoom)) {
        return { found: true, roomsVisible: Array.from(seenRoomNames), lastRooms, progressReached: currentProgress };
      }
    }
  }

  let iterations = 0;
  while (iterations < maxIterations && currentProgress < 1) {
    iterations++;
    currentProgress = Math.min(1, currentProgress + step);

    const scrollResult = await scrollRoomList(page, currentProgress, { duration, settleDelay });
    if (!scrollResult.success) {
      await page.waitForTimeout(settleDelay);
      continue;
    }

    await page.waitForTimeout(scrollResult.settleMs || settleDelay);
    const list = await scanVisibleRooms(page, 10);
    if (!list.success) {
      continue;
    }

    const snapshotKey = (list.allRooms || []).map(r => r.name).join('|');
    if (snapshotKey) {
      if (seenSnapshots.has(snapshotKey)) {
        // 已循環到既有組合，視為到達邊界
        break;
      }
      seenSnapshots.add(snapshotKey);
    }

    pushRooms(list.allRooms || []);

    if (targetRoom && (list.allRooms || []).some(r => r.name === targetRoom)) {
      return { found: true, roomsVisible: Array.from(seenRoomNames), lastRooms, progressReached: currentProgress };
    }
  }

  return { found: false, roomsVisible: Array.from(seenRoomNames), lastRooms, progressReached: currentProgress };
}

module.exports = {
  checkIfInRoom,
  getRoomList,
  enterRoom
};



