/**
 * 75X / Super Double 相關輔助函式
 * - 解析 scanCard / bonusResults 特殊骰資料
 * - 提供倍率對照
 */

const BONUS_RESULT_CODE_MAP = {
  1: { key: 'white5x', color: 'white', zh: '白', multiplier: 5, areaId: '802' },
  2: { key: 'red5x', color: 'red', zh: '紅', multiplier: 5, areaId: '805' },
  3: { key: 'white2x', color: 'white', zh: '白', multiplier: 2, areaId: '802' },
  4: { key: 'red2x', color: 'red', zh: '紅', multiplier: 2, areaId: '805' },
  5: { key: 'yellow1x', color: 'yellow', zh: '黃', multiplier: 1, areaId: '801' },
  6: { key: 'green1x', color: 'green', zh: '綠', multiplier: 1, areaId: '806' },
  7: { key: 'blue1x', color: 'blue', zh: '藍', multiplier: 1, areaId: '804' },
  8: { key: 'pink1x', color: 'pink', zh: '粉', multiplier: 1, areaId: '803' },
};

/**
 * 將任意結構的 bonus 結果轉換為最多兩個代碼數字
 * @param {*} raw
 * @returns {number[]}
 */
function normalizeBonusCodes(raw) {
  const result = [];
  const visited = new Set();

  function walk(value, depth = 0) {
    if (result.length >= 2) return;
    if (depth > 6) return;
    if (value == null) return;
    const t = typeof value;
    if (t === 'number' || t === 'string') {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) {
        result.push(num);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        if (result.length >= 2) break;
        walk(v, depth + 1);
      }
      return;
    }
    if (t === 'object') {
      if (visited.has(value)) return;
      visited.add(value);
      const candidateKeys = ['result', 'srcResult', 'code', 'value'];
      for (const key of candidateKeys) {
        if (key in value) {
          walk(value[key], depth + 1);
        }
      }
      if (result.length >= 2) return;
      const keys = Object.keys(value).sort();
      for (const key of keys) {
        if (candidateKeys.includes(key)) continue;
        walk(value[key], depth + 1);
        if (result.length >= 2) break;
      }
      return;
    }
  }

  walk(raw);
  return result.slice(0, 2);
}

function describeBonusResultCode(code) {
  const numCode = Number(code);
  const meta = BONUS_RESULT_CODE_MAP[numCode] || null;
  return {
    code: numCode,
    multiplier: meta ? meta.multiplier : 1,
    color: meta ? meta.color : 'unknown',
    zh: meta ? meta.zh : '未知',
    key: meta ? meta.key : `code-${numCode}`,
    areaId: meta ? meta.areaId : null,
    label: meta ? `${meta.zh}${meta.multiplier}x` : `代碼 ${numCode}`,
  };
}

async function getBonusDiceResultsFromScanCard(page, roundCode, options = {}) {
  const { maxMessages = 800 } = options;
  const rawResult = await page.evaluate(({ roundCode, maxMessages }) => {
    function collectCodes(source, bucket, depth = 0) {
      if (!source || bucket.length >= 2 || depth > 6) return;
      if (typeof source === 'number' || typeof source === 'string') {
        const num = Number(source);
        if (Number.isFinite(num) && num > 0) bucket.push(num);
        return;
      }
      if (Array.isArray(source)) {
        for (const item of source) {
          if (bucket.length >= 2) break;
          collectCodes(item, bucket, depth + 1);
        }
        return;
      }
      if (typeof source === 'object') {
        const preferredKeys = ['result', 'srcResult', 'code', 'value'];
        for (const key of preferredKeys) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            collectCodes(source[key], bucket, depth + 1);
            if (bucket.length >= 2) return;
          }
        }
        const keys = Object.keys(source).sort();
        for (const key of keys) {
          if (preferredKeys.includes(key)) continue;
          collectCodes(source[key], bucket, depth + 1);
          if (bucket.length >= 2) break;
        }
      }
    }

    const response = { success: false, codes: [], matchCount: 0, totalMessages: 0 };
    try {
      if (!window.__wsMessages || window.__wsMessages.length === 0) return response;
      const recent = window.__wsMessages.slice(-maxMessages);
      response.totalMessages = recent.length;
      for (let i = recent.length - 1; i >= 0; i--) {
        let data = recent[i].data;
        if (typeof data !== 'string') data = String(data);
        if (data.startsWith('$#|#$')) data = data.substring(5);
        try {
          const parsed = JSON.parse(data);
          const v = parsed && parsed.d && parsed.d.v;
          if (!v) continue;
          if (v['3'] === 'scanCard') {
            const round = v['10'] && v['10']['0'];
            if (roundCode && round !== roundCode) continue;
            response.matchCount++;
            const raw77 = v['10'] && v['10']['77'];
            if (raw77) {
              collectCodes(raw77, response.codes);
            }
            if (response.codes.length >= 2) break;
          }
        } catch (_) {}
      }
      response.success = response.codes.length > 0;
      return response;
    } catch (error) {
      response.error = error.message;
      return response;
    }
  }, { roundCode, maxMessages });

  const normalizedCodes = normalizeBonusCodes(rawResult.codes || []);
  return {
    success: normalizedCodes.length > 0,
    codes: normalizedCodes,
    meta: rawResult,
  };
}

async function getBonusResultsFromModel(page, roomId) {
  const raw = await page.evaluate((rid) => {
    try {
      const app = (typeof window !== 'undefined') ? window.App : null;
      if (!app || !app.model || !app.model.tableCollection) {
        return { success: false, error: 'tableCollection not available' };
      }
      const tc = app.model.tableCollection;
      const table = (typeof tc.getTable === 'function' ? tc.getTable(rid) : null)
        || (tc._tableMap && tc._tableMap[rid]) || null;
      if (!table) return { success: false, error: 'table not found' };
      const round = table.round || table._round || null;
      const data = round && round._data && round._data.data ? round._data.data : null;
      const bonusResults = data && data.bonusResults ? data.bonusResults : null;
      if (!bonusResults) return { success: false, error: 'bonusResults not found' };
      return { success: true, raw: bonusResults };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, roomId);

  if (!raw || !raw.success) {
    return raw;
  }

  const codes = normalizeBonusCodes(raw.raw);
  return {
    success: codes.length > 0,
    codes,
    raw: raw.raw,
  };
}

module.exports = {
  BONUS_RESULT_CODE_MAP,
  normalizeBonusCodes,
  describeBonusResultCode,
  getBonusDiceResultsFromScanCard,
  getBonusResultsFromModel,
};


