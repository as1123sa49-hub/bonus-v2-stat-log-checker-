/**
 * 登入輔助函數
 * 處理遊戲登入和初始化相關操作
 */

const logger = require('../utils/logger');

/**
 * 登入遊戲
 * @param {Page} page - Playwright page 對象
 * @param {string} gameUrl - 遊戲 URL
 */
async function loginGame(page, gameUrl) {
  logger.info('開始登入遊戲...');
  
  await page.goto(gameUrl);
  
  // 等待 Canvas 載入
  await page.waitForSelector('canvas', { timeout: 30000 });
  
  // 檢查 Cocos Creator 場景是否已載入
  let gameReady = false;
  let attempts = 0;
  const maxAttempts = 25; // 最多等待 2.5 秒
  
  while (!gameReady && attempts < maxAttempts) {
    gameReady = await page.evaluate(() => {
      try {
        // 檢查 cc 和 scene 是否可用
        if (typeof cc === 'undefined') return false;
        const scene = cc.director.getScene();
        if (!scene) return false;
        
        // 檢查 Canvas 節點是否存在
        const canvas = scene.getChildByName('Canvas') || 
                      scene.getChildByName('canvas') ||
                      scene.getChildByName('Main')?.getChildByName('Canvas');
        
        return !!canvas;
      } catch (e) {
        return false;
      }
    });
    
    if (!gameReady) {
      await page.waitForTimeout(100);
      attempts++;
    }
  }
  
  if (gameReady) {
    logger.success('遊戲載入完成');
    // 額外等待 500ms 確保所有元素完全渲染
    await page.waitForTimeout(500);
  } else {
    logger.warning('遊戲載入超時，繼續執行...');
    // 降級到固定等待
    await page.waitForTimeout(2000);
  }
}

/**
 * 關閉 PWA 彈窗
 * 檢測方式：檢查 Layer_Loading 是否有子節點
 * 關閉方式：觸摸 Layer_Loading/PWAPopupView/TouchImage
 * @param {Page} page - Playwright page 對象
 */
async function closePWAPopup(page) {
  // 檢測 PWA：檢查 Layer_Loading 是否有子節點
  let pwaDetected = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!pwaDetected && attempts < maxAttempts) {
    pwaDetected = await page.evaluate(() => {
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
        function findNodeByPath(pathParts) {
          const scene = cc.director.getScene();
          let current = scene;
          for (const part of pathParts) {
            if (!current) return null;
            if (part === 'Main' && current.name === 'Main') {
              continue;
            }
            current = findNode(current, part);
          }
          return current;
        }
        const layerLoadingPath = ['Main', 'Canvas', 'viewRoot', 'Layer_Loading'];
        const layerLoading = findNodeByPath(layerLoadingPath);
        if (layerLoading && layerLoading.children && layerLoading.children.length > 0) {
          return true; // 有子節點 = 有 PWA
        }
        return false; // 沒有子節點 = 沒有 PWA
      } catch (e) {
        return false;
      }
    });

    if (!pwaDetected) {
      await page.waitForTimeout(100);
      attempts++;
    }
  }

  if (!pwaDetected) {
    logger.info('未偵測到 PWA（Layer_Loading 無子節點），跳過關閉流程');
    return;
  }

  logger.info('偵測到 PWA（Layer_Loading 有子節點），開始關閉...');

  // 關閉 PWA：觸摸 Layer_Loading/PWAPopupView/TouchImage
  const touchResult = await page.evaluate(() => {
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
      function findNodeByPath(pathParts) {
        const scene = cc.director.getScene();
        let current = scene;
        for (const part of pathParts) {
          if (!current) return null;
          if (part === 'Main' && current.name === 'Main') {
            continue;
          }
          current = findNode(current, part);
        }
        return current;
      }
      const touchImagePath = ['Main', 'Canvas', 'viewRoot', 'Layer_Loading', 'PWAPopupView', 'TouchImage'];
      const touchImageNode = findNodeByPath(touchImagePath);
      if (touchImageNode) {
        const touch = {
          touch: {
            getLocation: () => ({ x: 0, y: 0 })
          },
          getLocation: () => ({ x: 0, y: 0 }),
          target: touchImageNode,
          currentTarget: touchImageNode
        };
        touchImageNode.emit(cc.Node.EventType.TOUCH_START, touch);
        touchImageNode.emit(cc.Node.EventType.TOUCH_END, touch);
        function hasChildren(nodePath) {
          const scene = cc.director.getScene();
          const node = findNodeByPath(nodePath);
          if (!node || !node.children) return false;
          return node.children.length > 0;
        }
        const layerLoadingPath = ['Main', 'Canvas', 'viewRoot', 'Layer_Loading'];
        const stillHasChildren = hasChildren(layerLoadingPath);
        return { success: true, method: 'touch_TouchImage', stillHasChildren };
      }
      return { success: false, error: 'TouchImage not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  if (touchResult?.success && !touchResult.stillHasChildren) {
    logger.success('PWA 彈窗已透過觸摸 TouchImage 關閉');
    await page.waitForTimeout(300);
  } else {
    logger.warning(`觸摸 TouchImage 失敗: ${touchResult?.error || '未知錯誤'}`);
    logger.warning('或觸摸後仍存在子節點，改用 active = false 方式關閉 PWA...');

    const forceResult = await page.evaluate(() => {
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
        function findNodeByPath(pathParts) {
          const scene = cc.director.getScene();
          let current = scene;
          for (const part of pathParts) {
            if (!current) return null;
            if (part === 'Main' && current.name === 'Main') {
              continue;
            }
            current = findNode(current, part);
          }
          return current;
        }
        const pwaPath = ['Main', 'Canvas', 'viewRoot', 'Layer_Loading', 'PWAPopupView'];
        const pwaNode = findNodeByPath(pwaPath);
        if (pwaNode && pwaNode.active) {
          pwaNode.active = false;
          return { success: true };
        }
        return { success: false, error: 'PWAPopupView not found or inactive' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    if (forceResult?.success) {
      logger.success('已透過設定 active = false 關閉 PWA');
    } else {
      logger.warning(`強制關閉 PWA 失敗: ${forceResult?.error || '未知錯誤'}`);
      logger.warning('PWA 彈窗可能未完全關閉，但繼續執行...');
    }
  }

  await page.waitForTimeout(500);
}

module.exports = {
  loginGame,
  closePWAPopup
};



