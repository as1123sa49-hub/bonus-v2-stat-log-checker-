/**
 * CSV 操作模組
 * 處理 500X 遊戲的 CSV 讀寫邏輯
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * 初始化 CSV 文件
 * @param {string} csvDir - CSV 目錄路徑
 * @param {string} csvPath - CSV 文件路徑
 */
function initDetailCsv(csvDir, csvPath) {
  try {
    if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, 'roundCode,single_m2_color,single_m2_rate,single_m3_color,single_m3_rate,anyDouble_color,anyDouble_rate,anyTriple_color,anyTriple_rate,both_single_m2_m3,both_anyDouble_anyTriple\n', 'utf8');
    }
  } catch (e) {
    logger.warning(`CSV 初始化失敗: ${e.message}`);
  }
}

/**
 * 追加詳細 CSV 記錄
 * @param {string} csvPath - CSV 文件路徑
 * @param {string} roundCode - 局號
 * @param {string} m2Colors - Single M2 顏色
 * @param {string} m2Rates - Single M2 倍率
 * @param {string} m3Colors - Single M3 顏色
 * @param {string} m3Rates - Single M3 倍率
 * @param {string} adColor - AnyDouble 顏色
 * @param {string} adRate - AnyDouble 倍率
 * @param {string} atColor - AnyTriple 顏色
 * @param {string} atRate - AnyTriple 倍率
 * @param {string} bothSingle - Single 同時出現 m2&m3（是/否）
 * @param {string} bothAny - AnyDouble 與 AnyTriple 同時出現（是/否）
 */
function appendDetailCsv(csvPath, roundCode, m2Colors, m2Rates, m3Colors, m3Rates, adColor, adRate, atColor, atRate, bothSingle, bothAny) {
  try {
    const esc = (s) => {
      const v = s == null ? '' : String(s);
      return v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const line = `${esc(roundCode)},${esc(m2Colors)},${esc(m2Rates)},${esc(m3Colors)},${esc(m3Rates)},${esc(adColor)},${esc(adRate)},${esc(atColor)},${esc(atRate)},${esc(bothSingle)},${esc(bothAny)}\n`;
    fs.appendFileSync(csvPath, line, 'utf8');
  } catch (e) {
    logger.warning(`CSV 追加失敗: ${e.message}`);
  }
}

/**
 * 讀取現有的 summary CSV 並合併到 diceStats（持續累加）
 * @param {Object} diceStats - 統計數據
 * @param {string} csvDir - CSV 目錄路徑
 * @param {string} targetRoom - 目標房間
 */
function loadSummaryCsv(diceStats, csvDir, targetRoom) {
  try {
    const summaryPath = path.join(csvDir, 'summary239.csv');
    if (!fs.existsSync(summaryPath)) return;
    const content = fs.readFileSync(summaryPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return; // 只有標題或空文件
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) continue;
      
      const type = parts[0];
      
      // 處理 totals
      if (type === 'totals') {
        if (parts[1] === 'both_single_m2_m3') {
          diceStats.totals.roundsWithSingle2and3 += Number(parts[4] || 0);
        } else if (parts[1] === 'both_anyDouble_anyTriple') {
          diceStats.totals.roundsWithAnyDoubleAndTriple += Number(parts[4] || 0);
        } else if (parts[1] === 'total_single_m2') {
          diceStats.totals.roundsWithMatch2 += Number(parts[4] || 0);
        } else if (parts[1] === 'total_single_m3') {
          diceStats.totals.roundsWithMatch3 += Number(parts[4] || 0);
        } else if (parts[1] === 'total_anyDouble') {
          diceStats.totals.roundsWith807 += Number(parts[4] || 0);
        } else if (parts[1] === 'total_anyTriple') {
          diceStats.totals.roundsWith808 += Number(parts[4] || 0);
        }
        continue;
      }
      
      // 處理詳細數據：type,color,colorId,rate,count
      if (['single_m2', 'single_m3', 'anyDouble', 'anyTriple'].includes(type)) {
        const colorId = parts[2];
        const rate = parts[3];
        const count = Number(parts[4] || 0);
        if (colorId && rate && count > 0) {
          let bucket = null;
          if (type === 'single_m2') bucket = diceStats.single2;
          else if (type === 'single_m3') bucket = diceStats.single3;
          else if (type === 'anyDouble') bucket = diceStats.anyDouble;
          else if (type === 'anyTriple') bucket = diceStats.anyTriple;
          
          if (bucket && ['801','802','803','804','805','806'].includes(colorId)) {
            if (!bucket[colorId]) bucket[colorId] = {};
            bucket[colorId][rate] = (bucket[colorId][rate] || 0) + count;
          }
        }
      }
    }
    
    logger.info('已讀取並合併現有統計數據');
  } catch (e) {
    logger.warning(`讀取現有統計數據失敗: ${e.message}`);
  }
}

/**
 * 從 detail CSV 讀取 both 情況並累加到統計結果
 * @param {Object} bucket - 統計桶（如 diceStats.single2）
 * @param {string} type - 類型（'m2' | 'm3' | 'ad' | 'at'）
 * @param {string} csvDir - CSV 目錄路徑
 * @param {string} targetRoom - 目標房間
 * @returns {Object} 統計結果（byRate 或 byColor）
 */
function sumByRateFromDetail(bucket, type, csvDir, targetRoom) {
  // 先從 bucket 統計（非 both 情況）
  const res = {};
  for (const color of Object.keys(bucket)) {
    const rates = bucket[color] || {};
    for (const r of Object.keys(rates)) {
      const num = Number(String(r).replace(/[^0-9.+-]/g, ''));
      const key = Number.isFinite(num) ? String(num) : 'unknown';
      res[key] = (res[key] || 0) + (rates[r] || 0);
    }
  }
  
  // 從 detail CSV 讀取 both 情況並累加
  try {
    const detailPath = path.join(csvDir, 'detail239.csv');
    if (fs.existsSync(detailPath)) {
      const detailContent = fs.readFileSync(detailPath, 'utf8');
      const detailLines = detailContent.split('\n').filter(l => l.trim());
      for (let i = 1; i < detailLines.length; i++) {
        const line = detailLines[i];
        if (!line.trim()) continue;
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const bothSingle = parts[9]?.trim() === '是';
        const bothAny = parts[10]?.trim() === '是';
        
        if (type === 'm2' && bothSingle) {
          const rate = parts[2]?.trim();
          if (rate) {
            const num = Number(String(rate).replace(/[^0-9.+-]/g, ''));
            const key = Number.isFinite(num) ? String(num) : 'unknown';
            res[key] = (res[key] || 0) + 1;
          }
        } else if (type === 'm3' && bothSingle) {
          const rate = parts[4]?.trim();
          if (rate) {
            const num = Number(String(rate).replace(/[^0-9.+-]/g, ''));
            const key = Number.isFinite(num) ? String(num) : 'unknown';
            res[key] = (res[key] || 0) + 1;
          }
        } else if (type === 'ad' && bothAny) {
          const rate = parts[6]?.trim();
          if (rate) {
            const num = Number(String(rate).replace(/[^0-9.+-]/g, ''));
            const key = Number.isFinite(num) ? String(num) : 'unknown';
            res[key] = (res[key] || 0) + 1;
          }
        } else if (type === 'at' && bothAny) {
          const rate = parts[8]?.trim();
          if (rate) {
            const num = Number(String(rate).replace(/[^0-9.+-]/g, ''));
            const key = Number.isFinite(num) ? String(num) : 'unknown';
            res[key] = (res[key] || 0) + 1;
          }
        }
      }
    }
  } catch (e) {
    logger.warning(`讀取 detail CSV 失敗: ${e.message}`);
  }
  
  return res;
}

/**
 * 從 detail CSV 讀取 both 情況並累加到統計結果（按顏色）
 * @param {Object} bucket - 統計桶（如 diceStats.single2）
 * @param {string} type - 類型（'m2' | 'm3' | 'ad' | 'at'）
 * @param {string} csvDir - CSV 目錄路徑
 * @param {string} targetRoom - 目標房間
 * @returns {Object} 統計結果（按顏色 ID）
 */
function sumByColorFromDetail(bucket, type, csvDir, targetRoom) {
  // 先從 bucket 統計（非 both 情況）
  const res = {};
  for (const color of Object.keys(bucket)) {
    const rates = bucket[color] || {};
    let s = 0; for (const r of Object.keys(rates)) s += (rates[r] || 0);
    res[color] = s;
  }
  
  // 從 detail CSV 讀取 both 情況並累加
  try {
    const detailPath = path.join(csvDir, 'detail239.csv');
    if (fs.existsSync(detailPath)) {
      const detailContent = fs.readFileSync(detailPath, 'utf8');
      const detailLines = detailContent.split('\n').filter(l => l.trim());
      const zhToArea = { '黃': '801', '白': '802', '粉': '803', '藍': '804', '紅': '805', '綠': '806' };
      
      for (let i = 1; i < detailLines.length; i++) {
        const line = detailLines[i];
        if (!line.trim()) continue;
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const bothSingle = parts[9]?.trim() === '是';
        const bothAny = parts[10]?.trim() === '是';
        
        if (type === 'm2' && bothSingle) {
          const colorZh = parts[1]?.trim();
          if (colorZh && zhToArea[colorZh]) {
            const colorId = zhToArea[colorZh];
            res[colorId] = (res[colorId] || 0) + 1;
          }
        } else if (type === 'm3' && bothSingle) {
          const colorZh = parts[3]?.trim();
          if (colorZh && zhToArea[colorZh]) {
            const colorId = zhToArea[colorZh];
            res[colorId] = (res[colorId] || 0) + 1;
          }
        } else if (type === 'ad' && bothAny) {
          const colorZh = parts[5]?.trim();
          if (colorZh && zhToArea[colorZh]) {
            const colorId = zhToArea[colorZh];
            res[colorId] = (res[colorId] || 0) + 1;
          }
        } else if (type === 'at' && bothAny) {
          const colorZh = parts[7]?.trim();
          if (colorZh && zhToArea[colorZh]) {
            const colorId = zhToArea[colorZh];
            res[colorId] = (res[colorId] || 0) + 1;
          }
        }
      }
    }
  } catch (e) {
    logger.warning(`讀取 detail CSV 失敗: ${e.message}`);
  }
  
  return res;
}

/**
 * 寫入彙總統計 CSV
 * @param {Object} diceStats - 統計數據
 * @param {string} csvDir - CSV 目錄路徑
 * @param {string} targetRoom - 目標房間
 */
function writeSummaryCsv(diceStats, csvDir, targetRoom) {
  try {
    const out = path.join(csvDir, 'summary239.csv');
    const order = ['801','802','803','804','805','806'];
    const areaToZh = { '801': '黃', '802': '白', '803': '粉', '804': '藍', '805': '紅', '806': '綠' };
    const groups = [
      { key: 'single2', title: 'single_m2' },
      { key: 'single3', title: 'single_m3' },
      { key: 'anyDouble', title: 'anyDouble' },
      { key: 'anyTriple', title: 'anyTriple' },
    ];
    let content = 'type,color,colorId,rate,count\n';
    for (const g of groups) {
      const bucket = diceStats[g.key];
      for (const color of order) {
        const rates = bucket[color] || {};
        const keys = Object.keys(rates).sort((a,b)=>Number(a)-Number(b));
        for (const r of keys) {
          const cnt = rates[r];
          content += `${g.title},${areaToZh[color]||color},${color},${r},${cnt}\n`;
        }
      }
    }
    // 附加兩項同時出現的總次數
    content += `totals,both_single_m2_m3,,,${diceStats.totals.roundsWithSingle2and3}\n`;
    content += `totals,both_anyDouble_anyTriple,,,${diceStats.totals.roundsWithAnyDoubleAndTriple}\n`;
    // 附加單獨出現的總次數（排除 both 情況）
    content += `totals,total_single_m2,,,${diceStats.totals.roundsWithMatch2}\n`;
    content += `totals,total_single_m3,,,${diceStats.totals.roundsWithMatch3}\n`;
    content += `totals,total_anyDouble,,,${diceStats.totals.roundsWith807}\n`;
    content += `totals,total_anyTriple,,,${diceStats.totals.roundsWith808}\n`;

    // single_m2 / single_m3: byRate & byColor（兩者都包含 both 情況）
    const s2ByRate = sumByRateFromDetail(diceStats.single2, 'm2', csvDir, targetRoom);
    const s2ByColor = sumByColorFromDetail(diceStats.single2, 'm2', csvDir, targetRoom);
    content += 'single_m2_byRate,rate,count\n';
    for (const r of Object.keys(s2ByRate).sort((a,b)=>Number(a)-Number(b))) {
      content += `single_m2_byRate,${r},${s2ByRate[r]}\n`;
    }
    content += 'single_m2_byColor,color,colorId,count\n';
    for (const cid of order) {
      const cnt = s2ByColor[cid] || 0; if (cnt === 0) continue;
      content += `single_m2_byColor,${areaToZh[cid]||cid},${cid},${cnt}\n`;
    }
    const s3ByRate = sumByRateFromDetail(diceStats.single3, 'm3', csvDir, targetRoom);
    const s3ByColor = sumByColorFromDetail(diceStats.single3, 'm3', csvDir, targetRoom);
    content += 'single_m3_byRate,rate,count\n';
    for (const r of Object.keys(s3ByRate).sort((a,b)=>Number(a)-Number(b))) {
      content += `single_m3_byRate,${r},${s3ByRate[r]}\n`;
    }
    content += 'single_m3_byColor,color,colorId,count\n';
    for (const cid of order) {
      const cnt = s3ByColor[cid] || 0; if (cnt === 0) continue;
      content += `single_m3_byColor,${areaToZh[cid]||cid},${cid},${cnt}\n`;
    }

    // anyDouble / anyTriple: byRate & byColor（兩者都包含 both 情況）
    const adByRate = sumByRateFromDetail(diceStats.anyDouble, 'ad', csvDir, targetRoom);
    const adByColor = sumByColorFromDetail(diceStats.anyDouble, 'ad', csvDir, targetRoom);
    content += 'anyDouble_byRate,rate,count\n';
    for (const r of Object.keys(adByRate).sort((a,b)=>Number(a)-Number(b))) {
      content += `anyDouble_byRate,${r},${adByRate[r]}\n`;
    }
    content += 'anyDouble_byColor,color,colorId,count\n';
    for (const cid of order) {
      const cnt = adByColor[cid] || 0; if (cnt === 0) continue;
      content += `anyDouble_byColor,${areaToZh[cid]||cid},${cid},${cnt}\n`;
    }
    const atByRate = sumByRateFromDetail(diceStats.anyTriple, 'at', csvDir, targetRoom);
    const atByColor = sumByColorFromDetail(diceStats.anyTriple, 'at', csvDir, targetRoom);
    content += 'anyTriple_byRate,rate,count\n';
    for (const r of Object.keys(atByRate).sort((a,b)=>Number(a)-Number(b))) {
      content += `anyTriple_byRate,${r},${atByRate[r]}\n`;
    }
    content += 'anyTriple_byColor,color,colorId,count\n';
    for (const cid of order) {
      const cnt = atByColor[cid] || 0; if (cnt === 0) continue;
      content += `anyTriple_byColor,${areaToZh[cid]||cid},${cid},${cnt}\n`;
    }

    fs.writeFileSync(out, content, 'utf8');
    logger.info(`已輸出彙總統計 CSV: ${out}`);
  } catch (e) {
    logger.warning(`彙總統計 CSV 輸出失敗: ${e.message}`);
  }
}

module.exports = {
  initDetailCsv,
  appendDetailCsv,
  loadSummaryCsv,
  writeSummaryCsv,
  sumByRateFromDetail,
  sumByColorFromDetail,
};

