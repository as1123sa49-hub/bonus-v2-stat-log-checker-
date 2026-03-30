/**
 * 房間模式偵測（避免寫死房名）。
 * 主要依據：App.model.tableCollection 的房間 subType；
 * 備援：近期 WebSocket 訊息中是否出現 betstop d.v[10][143]（500X 特徵）。
 */

/**
 * 在頁面環境嘗試從 App.model.tableCollection 解析指定房間的 subType。
 * 盡量容錯：從 getTable(room)、_tableMap、roomInfo 等多處嘗試取得。
 */
async function detectSubTypeFromModel(page, roomId) {
  return await page.evaluate((rid) => {
    function safeGet(fn, fallback = null) {
      try { return fn(); } catch (_) { return fallback; }
    }
    function findSubType(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 4) return null;
      for (const k in obj) {
        try {
          const v = obj[k];
          const lk = String(k).toLowerCase();
          if ((lk.includes('subtype') || lk.includes('colorgamesubtype')) && typeof v === 'number') {
            return v;
          }
          if (v && typeof v === 'object') {
            const sub = findSubType(v, depth + 1);
            if (sub != null) return sub;
          }
        } catch (_) {}
      }
      return null;
    }

    try {
      const app = (typeof window !== 'undefined') ? (window).App : null;
      if (!app || !app.model || !app.model.tableCollection) return null;
      const tc = app.model.tableCollection;
      // 優先從 getTable 取得
      const table = safeGet(() => tc.getTable(rid), null);
      let sub = null;
      if (table) {
        sub = findSubType(table);
        if (sub != null) return sub;
      }
      // 備援：從 _tableMap 取
      const map = safeGet(() => tc._tableMap, null) || safeGet(() => tc.tableMap, null);
      if (map && map[rid]) {
        const node = map[rid];
        sub = findSubType(node);
        if (sub != null) return sub;
      }
      // 再嘗試從全域 App 其他結構尋找
      return findSubType(app);
    } catch (e) {
      return null;
    }
  }, roomId);
}

/** 檢查最近的 WS 訊息是否出現 500X 的 betstop v[10][143] 特徵 */
async function hasRecent500xSignature(page, roomId) {
  return await page.evaluate((rid) => {
    try {
      const msgs = (window.__wsMessages || []).slice(-800);
      for (let i = msgs.length - 1; i >= 0; i--) {
        let data = msgs[i].data; if (typeof data !== 'string') data = String(data);
        if (data.startsWith('$#|#$')) data = data.substring(5);
        try {
          const p = JSON.parse(data);
          const v = p && p.d && p.d.v; if (!v) continue;
          const evt = v['3'];
          const r = v['10'] && v['10']['0'];
          if ((evt === 'betstop' || evt === 'betStop') && r) {
            const info = v['10'] && v['10']['143'];
            if (info && typeof info === 'object') {
              // 只要有 801..806/807/808 任一 key 就可視為 500X 特徵
              const keys = Object.keys(info);
              if (keys.some(k => ['801','802','803','804','805','806','807','808'].includes(String(k)))) {
                return true;
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }, roomId);
}

/**
 * 綜合偵測房間模式
 * @param {import('playwright').Page} page
 * @param {string} roomId
 * @returns {Promise<{subType:number|null,is500x:boolean,isSpeed:boolean,isJackpotV1:boolean,isJackpotV2:boolean,isJackpotV3:boolean,isUltimateV1:boolean,isUltimateV2:boolean}>}
 */
async function detectRoomMode(page, roomId) {
  // 先嘗試讀取 model 中的 subType
  let subType = await detectSubTypeFromModel(page, roomId);
  if (subType == null) {
    // 備援：若出現 500X 的 143 特徵，推定為 10
    const is500 = await hasRecent500xSignature(page, roomId);
    if (is500) subType = 10;
  }

  const st = Number.isFinite(subType) ? Number(subType) : null;
  const mode = {
    subType: st,
    is500x: st === 10,
    isSpeed: st === 6,
    isJackpotV1: st === 1,
    isJackpotV2: st === 2,
    isJackpotV3: st === 5,
    isUltimateV1: st === 7,
    isUltimateV2: st === 8,
    is75x: st === 9,
  };
  return mode;
}

module.exports = {
  detectRoomMode,
  detectSubTypeFromModel,
  hasRecent500xSignature,
};


