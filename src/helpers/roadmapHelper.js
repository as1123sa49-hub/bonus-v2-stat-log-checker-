/**
 * Roadmap (路書) 輔助：讀取最新一顆珠的顏色
 * 目前實作針對 CGIGOJP1：
 * - 最新顆在 ScrollView/Mask/Content 的「第二個」 ColorGameRoomLushuItem
 * - 取該項下 ColorSlotLayout/ColorSlot-1 的 spriteFrame.name
 */

const TEST_CONFIG = require('../../config/testConfig');

function normalizeSpriteToColor(spriteName) {
  if (!spriteName) return null;
  const n = String(spriteName).toLowerCase();
  if (n.includes('white')) return 'white';
  if (n.includes('yellow')) return 'yellow';
  if (n.includes('green')) return 'green';
  if (n.includes('red')) return 'red';
  if (n.includes('pink')) return 'pink';
  if (n.includes('blue')) return 'blue';
  return null;
}

function colorEnToZhShort(color) {
  switch (color) {
    case 'white': return '白';
    case 'yellow': return '黃';
    case 'green': return '綠';
    case 'red': return '紅';
    case 'pink': return '粉';
    case 'blue': return '藍';
    default: return '?';
  }
}

async function getLatestBeadColor(page, room) {
  const timeoutMs = (TEST_CONFIG.roadmapUpdateTimeoutMs ?? 3000);
  const intervalMs = (TEST_CONFIG.roadmapPollIntervalMs ?? 300);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate((targetRoom) => {
      try {
        // 依房間決定基底路徑（支援 CGIGOJP1 與 CGT01）

        const findNodeByPath = (root, path) => {
          const parts = path.split('/').filter(Boolean);
          let node = root;
          for (const part of parts) {
            if (!node || !node.getChildByName) return null;
            node = node.getChildByName(part);
          }
          return node;
        };
        const findNodeDeep = (node, name) => {
          if (!node) return null;
          if (node.name === name) return node;
          if (node.children) {
            for (const child of node.children) {
              const found = findNodeDeep(child, name);
              if (found) return found;
            }
          }
          return null;
        };

        if (typeof cc === 'undefined' || typeof App === 'undefined') {
          return { ok: false, reason: 'env_unavailable' };
        }

        const scene = cc.director && cc.director.getScene && cc.director.getScene();
        if (!scene) return { ok: false, reason: 'scene_not_ready' };
        // CGIGOJP1（一般房）
        const pathsCGI = [
          'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content',
          'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLuShuVirtualList/ScrollView/Mask/Contnet',
          'Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content'
        ];
        // CGT01（Speed 房）
        const pathsCGT = [
          'Main/Canvas/viewRoot/Layer_Default/ColorGameSpeedRoomView/BettingNode/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content',
        ];
        const paths = targetRoom === 'CGT01' ? pathsCGT : pathsCGI;
        let contentNode = null;
        for (const p of paths) {
          contentNode = findNodeByPath(scene, p);
          if (contentNode) break;
        }
        if (!contentNode) {
          // 最後嘗試深度搜尋 Content 或 ColorGameRoomLushuItem
          const panel = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
          const contentMaybe = panel ? findNodeDeep(panel, 'Content') : null;
          contentNode = contentMaybe;
        }
        if (!contentNode) return { ok: false, reason: 'content_not_found' };

        // 第 1 個 ColorGameRoomLushuItem 永遠空白，取第 2 個（index 1）
        const items = contentNode.children?.filter(n => n && n.name === 'ColorGameRoomLushuItem') || [];
        if (items.length === 0) return { ok: false, reason: 'no_items' };

        // 在部分版本（特別是 CGT01/SPEED）最新一列可能是第一個 item（index 0）。
        // 優先嘗試 items[0]；若讀不到有效 slot，退回 items[1]（若存在）。
        let latestItem = items[0] || null;
        let usedIndex = 0;
        const ensureSlotLayout = (node) => node && node.getChildByName && node.getChildByName('ColorSlotLayout');
        let slotLayout = ensureSlotLayout(latestItem);
        if (!slotLayout && items.length > 1) {
          latestItem = items[1];
          usedIndex = 1;
          slotLayout = ensureSlotLayout(latestItem);
        }
        if (!slotLayout) return { ok: false, reason: 'slot_layout_missing' };

        const slot1 = slotLayout.getChildByName('ColorSlot-1');
        if (!slot1) return { ok: false, reason: 'slot1_missing' };

        const sprite = slot1.getComponent(cc.Sprite);
        const spriteName = sprite && sprite.spriteFrame && sprite.spriteFrame.name ? sprite.spriteFrame.name : null;

        return { ok: true, spriteName, diag: { itemCount: items.length } };
      } catch (e) {
        return { ok: false, reason: 'exception', error: e.message };
      }
    }, room);

    if (result && result.ok && result.spriteName) {
      const color = normalizeSpriteToColor(result.spriteName);
      if (color) return { success: true, color, sprite: result.spriteName };
    }

    await page.waitForTimeout(intervalMs);
  }

  return { success: false, error: 'roadmap_timeout' };
}

async function getLatestBeadColors(page, room) {
  const timeoutMs = (TEST_CONFIG.roadmapUpdateTimeoutMs ?? 3000);
  const intervalMs = (TEST_CONFIG.roadmapPollIntervalMs ?? 300);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate((targetRoom) => {
      try {
        const findNodeByPath = (root, path) => {
          const parts = path.split('/').filter(Boolean);
          let node = root;
          for (const part of parts) {
            if (!node || !node.getChildByName) return null;
            node = node.getChildByName(part);
          }
          return node;
        };
        const findNodeDeep = (node, name) => {
          if (!node) return null;
          if (node.name === name) return node;
          if (node.children) {
            for (const child of node.children) {
              const found = findNodeDeep(child, name);
              if (found) return found;
            }
          }
          return null;
        };

        if (typeof cc === 'undefined' || typeof App === 'undefined') {
          return { ok: false, reason: 'env_unavailable' };
        }

        const scene = cc.director && cc.director.getScene && cc.director.getScene();
        if (!scene) return { ok: false, reason: 'scene_not_ready' };

        // CGIGOJP1（一般房）
        const pathsCGI = [
          'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content',
          'Main/Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLuShuVirtualList/ScrollView/Mask/Contnet',
          'Canvas/viewRoot/Layer_Default/ColorGameRoomView/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content'
        ];
        // CGT01（Speed 房）
        const pathsCGT = [
          'Main/Canvas/viewRoot/Layer_Default/ColorGameSpeedRoomView/BettingNode/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content',
        ];
        const paths = targetRoom === 'CGT01' ? pathsCGT : pathsCGI;
        let contentNode = null;
        for (const p of paths) {
          contentNode = findNodeByPath(scene, p);
          if (contentNode) break;
        }
        if (!contentNode) {
          const panel = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
          const contentMaybe = panel ? findNodeDeep(panel, 'Content') : null;
          contentNode = contentMaybe;
        }
        if (!contentNode) return { ok: false, reason: 'content_not_found' };

        const items = contentNode.children?.filter(n => n && n.name === 'ColorGameRoomLushuItem') || [];
        if (items.length < 2) return { ok: false, reason: 'not_enough_items', count: items.length };

        const latestItem = items[1];
        const slotLayout = latestItem.getChildByName('ColorSlotLayout');
        if (!slotLayout) return { ok: false, reason: 'slot_layout_missing' };

        // 讀取三個 Slot 的顏色
        // 注意：根據房間類型，順序可能不同
        // CGIGOJP1: ColorSlot-1 是最新的（應該對應 seq[0]）
        // CGT01: 可能順序不同，需要驗證
        const names = ['ColorSlot-1', 'ColorSlot-2', 'ColorSlot-3'];
        const sprites = [];
        for (const nm of names) {
          const slot = slotLayout.getChildByName(nm);
          const sp = slot && slot.getComponent && slot.getComponent(cc.Sprite);
          const spriteName = sp && sp.spriteFrame && sp.spriteFrame.name ? sp.spriteFrame.name : null;
          sprites.push(spriteName);
        }
        // CGT01 可能需要反轉順序（驗證中）
        // 如果 ColorSlot-1 不是最新的，可能需要反轉
        // 暫時保留原順序，讓調試信息顯示實際讀取情況
        return { ok: true, sprites, debugInfo: { slotOrder: names, targetRoom, usedIndex, itemsLength: items.length } };
      } catch (e) {
        return { ok: false, reason: 'exception', error: e.message };
      }
    }, room);

    if (result && result.ok && Array.isArray(result.sprites)) {
      const colors = result.sprites.map(s => normalizeSpriteToColor(s));
      return { success: true, colors, sprites: result.sprites, debugInfo: result.debugInfo || {} };
    }
    await page.waitForTimeout(intervalMs);
  }
  return { success: false, error: 'roadmap_timeout' };
}

/**
 * 讀取 CGT01 的 RateLabel（電子骰匹配時的倍率顯示）
 * 只有在電子骰與開出結果相同時才會顯示
 */
async function getCGT01RateLabel(page) {
  const result = await page.evaluate(() => {
    try {
      function findNodeByPath(root, path) {
        const parts = path.split('/').filter(Boolean);
        let node = root;
        for (const part of parts) {
          if (!node || !node.getChildByName) return null;
          node = node.getChildByName(part);
        }
        return node;
      }
      function findNodeDeep(node, name) {
        if (!node) return null;
        if (node.name === name) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = findNodeDeep(child, name);
            if (found) return found;
          }
        }
        return null;
      }

      if (typeof cc === 'undefined') return null;
      const scene = cc.director && cc.director.getScene && cc.director.getScene();
      if (!scene) return null;

      const path = 'Main/Canvas/viewRoot/Layer_Default/ColorGameSpeedRoomView/BettingNode/ColorGameRoomLushuPanel/ColorGameLushuVirtualList/ScrollView/Mask/Content/ColorGameRoomLushuItem/RateLabel';
      let labelNode = findNodeByPath(scene, path);
      if (!labelNode) {
        const panel = findNodeDeep(scene, 'ColorGameRoomLushuPanel');
        const item = panel ? findNodeDeep(panel, 'ColorGameRoomLushuItem') : null;
        labelNode = item ? item.getChildByName('RateLabel') : null;
      }

      if (!labelNode) return null;
      const labelComp = labelNode.getComponent(cc.Label);
      if (labelComp && typeof labelComp.string === 'string') {
        const rateText = labelComp.string.trim();
        return rateText ? rateText : null;
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  return result;
}

/**
 * 讀取 CGT01 指定 LushuItem(usedIndex) 下的 RateLabel 文字
 */
async function getCGT01RateLabelByIndex(page, usedIndex = 0) {
  const result = await page.evaluate((idx) => {
    try {
      if (typeof cc === 'undefined') return null;
      const scene = cc.director && cc.director.getScene && cc.director.getScene();
      if (!scene) return null;

      const content = scene
        .getChildByName('Main')?.getChildByName('Canvas')
        ?.getChildByName('viewRoot')?.getChildByName('Layer_Default')
        ?.getChildByName('ColorGameSpeedRoomView')?.getChildByName('BettingNode')
        ?.getChildByName('ColorGameRoomLushuPanel')?.getChildByName('ColorGameLushuVirtualList')
        ?.getChildByName('ScrollView')?.getChildByName('Mask')?.getChildByName('Content');
      if (!content) return null;
      const items = (content.children || []).filter(n => n && n.name === 'ColorGameRoomLushuItem');
      if (!items.length) return null;
      const i = Math.min(Math.max(Number(idx) || 0, 0), items.length - 1);
      const item = items[i];
      // 優先 SpeedEffectNodes/RateLabel
      let labelNode = item.getChildByName('SpeedEffectNodes')?.getChildByName('RateLabel');
      if (!labelNode) {
        // 備援：直接 RateLabel
        labelNode = item.getChildByName('RateLabel');
      }
      if (!labelNode) return null;
      const comp = labelNode.getComponent && labelNode.getComponent(cc.Label);
      const txt = comp && typeof comp.string === 'string' ? comp.string.trim() : null;
      return txt || null;
    } catch (_) { return null; }
  }, usedIndex);
  return result;
}

module.exports = {
  getLatestBeadColor,
  normalizeSpriteToColor,
  getLatestBeadColors,
  colorEnToZhShort,
  getCGT01RateLabel,
  getCGT01RateLabelByIndex,
};


