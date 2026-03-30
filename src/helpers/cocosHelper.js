/**
 * Cocos Creator 通用輔助函數
 * 提供與 Cocos Creator 引擎交互的通用工具
 */

/**
 * 生成在瀏覽器環境中使用的 findNode 函數腳本
 * 用於在 Cocos 節點樹中查找指定名稱的節點
 */
function getFindNodeScript() {
  return `
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
  `;
}

/**
 * 在頁面中執行並獲取 Canvas 節點
 * @param {Page} page - Playwright page 對象
 * @returns {Promise<boolean>} 是否成功找到 Canvas
 */
async function getCanvas(page) {
  return await page.evaluate(() => {
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
    
    return !!canvas;
  });
}

/**
 * 獲取當前視圖名稱
 * @param {Page} page - Playwright page 對象
 * @returns {Promise<string>} 視圖名稱（如 'ColorGameLobbyView' 或 'ColorGameRoomView'）
 */
async function getCurrentView(page) {
  return await page.evaluate(() => {
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
    
    if (!canvas) return null;
    
    const viewRoot = canvas.getChildByName('viewRoot');
    if (!viewRoot) return null;
    
    const layerDefault = viewRoot.getChildByName('Layer_Default');
    if (!layerDefault) return null;
    
    // 檢查是否在房間視圖
    const roomView = layerDefault.getChildByName('ColorGameRoomView');
    if (roomView && roomView.active) {
      return 'ColorGameRoomView';
    }
    
    // 檢查是否在大廳視圖
    const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
    if (lobbyView && lobbyView.active) {
      return 'ColorGameLobbyView';
    }
    
    return 'Unknown';
  });
}

/**
 * 房間類型路徑配置
 * 定義不同房間類型的節點路徑
 */
const ROOM_PATH_CONFIG = {
  'ColorGameRoomView': {
    type: 'normal',
    chipSelectorPath: ['ColorGameChipSelector', 'ChipSelector', 'ScrollView', 'Mask', 'Container'],
    betAreaPath: ['ColorGameBetArea', 'SensorGroup'],
    buttonSetPath: ['ColorGameButtonSet']
  },
  'ColorGameSpeedRoomView': {
    type: 'speed',
    chipSelectorPath: ['BettingNode', 'ColorGameChipSelector', 'ChipSelector', 'ScrollView', 'Mask', 'Container'],
    betAreaPath: ['BettingNode', 'ColorGameBetArea', 'SensorGroup'],
    buttonSetPath: ['BettingNode', 'ColorGameButtonSet']
  },
  'ColorGameBonusRoomView': {
    type: 'bonus', // 500X 房間
    chipSelectorPath: ['BettingInfoNode', 'ColorGameChipSelector', 'ChipSelector', 'ScrollView', 'Mask', 'Container'],
    betAreaPath: ['ColorGameBonusBetArea', 'SensorGroup'],
    buttonSetPath: null // 500X 房間不需要 BetButton
  }
};

/**
 * 生成房間路徑輔助腳本（在 page.evaluate 中使用）
 * 包含路徑配置和通用路徑遍歷函數
 */
function createRoomPathHelperScript() {
  return `
    // 房間類型路徑配置
    const ROOM_PATH_CONFIG = ${JSON.stringify(ROOM_PATH_CONFIG)};
    
    // 查找節點的通用函數
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
    
    // 獲取當前房間視圖
    function getRoomView() {
      const scene = cc.director.getScene();
      let canvas = scene;
      if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
        canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
      }
      if (!canvas) {
        const main = findNode(scene, 'Main');
        if (main) canvas = main.getChildByName('Canvas');
      }
      
      const viewRoot = canvas.getChildByName('viewRoot');
      const layerDefault = viewRoot.getChildByName('Layer_Default');
      
      // 查找活動的房間視圖
      const possibleRoomViews = ['ColorGameRoomView', 'ColorGameSpeedRoomView', 'ColorGameBonusRoomView'];
      for (const viewName of possibleRoomViews) {
        const roomView = layerDefault.getChildByName(viewName);
        if (roomView && roomView.active) return roomView;
      }
      
      return null;
    }
    
    // 根據房間類型和路徑類型獲取節點
    function getNodeByRoomPath(roomView, pathType) {
      if (!roomView) {
        window.__pathDebug = 'roomView is null';
        return null;
      }
      
      const config = ROOM_PATH_CONFIG[roomView.name];
      if (!config) {
        window.__pathDebug = 'No config for room: ' + roomView.name;
        return null;
      }
      
      const path = config[pathType];
      if (!path) {
        // 500X 房間的 buttonSetPath 為 null，這是正常的
        if (pathType === 'buttonSetPath' && config.type === 'bonus') {
          return null; // 500X 房間不需要 BetButton
        }
        window.__pathDebug = 'No path for type: ' + pathType;
        return null;
      }
      
      let current = roomView;
      for (let i = 0; i < path.length; i++) {
        const nodeName = path[i];
        const next = current.getChildByName(nodeName);
        if (!next) {
          const children = current.children ? current.children.map(c => c.name) : [];
          window.__pathDebug = {
            error: 'Path broken',
            step: i + 1,
            total: path.length,
            missingNode: nodeName,
            currentNode: current.name,
            availableChildren: children.slice(0, 15)
          };
          return null;
        }
        current = next;
      }
      
      return current;
    }
  `;
}

module.exports = {
  getFindNodeScript,
  getCanvas,
  getCurrentView,
  createRoomPathHelperScript,
  ROOM_PATH_CONFIG
};



