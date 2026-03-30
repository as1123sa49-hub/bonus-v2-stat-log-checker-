/**
 * 骰子統計模組
 * 處理 500X 遊戲的統計邏輯（d.v[10][143]）
 */

const logger = require('../utils/logger');

/**
 * 創建統計數據結構
 */
function createDiceStats() {
  return {
    totals: {
      roundsWith142: 0,
      roundsWith807: 0,
      roundsWith808: 0,
      roundsWithMatch2: 0,
      roundsWithMatch3: 0,
      roundsWithSingle2and3: 0,
      roundsWithAnyDoubleAndTriple: 0,
    },
    recentRounds: [],
    single2: { '801': {}, '802': {}, '803': {}, '804': {}, '805': {}, '806': {} },
    single3: { '801': {}, '802': {}, '803': {}, '804': {}, '805': {}, '806': {} },
    anyDouble: { '801': {}, '802': {}, '803': {}, '804': {}, '805': {}, '806': {} },
    anyTriple: { '801': {}, '802': {}, '803': {}, '804': {}, '805': {}, '806': {} },
  };
}

/**
 * 增加統計計數
 * @param {Object} bucket - 統計桶（如 diceStats.single2）
 * @param {string} color - 顏色 ID（如 '801'）
 * @param {string|number} rate - 倍率（如 '20'）
 */
function incBucket(bucket, color, rate) {
  const c = String(color);
  const r = String(rate);
  if (!bucket[c]) bucket[c] = {};
  bucket[c][r] = (bucket[c][r] || 0) + 1;
}

/**
 * 打印統計結果
 * @param {Object} diceStats - 統計數據
 * @param {Object} areaNames - 區域名稱映射
 */
function printDiceStats(diceStats, areaNames) {
  const order = ['801','802','803','804','805','806'];
  function fmtGroup(title, group) {
    logger.calc(`\n${title}`);
    for (const color of order) {
      const rates = group[color] || {};
      const keys = Object.keys(rates);
      if (keys.length === 0) continue;
      const pairs = keys.sort((a,b)=>Number(a)-Number(b)).map(k => `${k}x:${rates[k]}`).join(', ');
      logger.calc(`   • ${areaNames[color] || color}: { ${pairs} }`);
    }
  }
  logger.raw(`\n========================================`);
  logger.stats('電子骰統計（累計局數）');
  logger.stats(`- roundsWith142: ${diceStats.totals.roundsWith142}`);
  logger.stats(`- roundsWith807: ${diceStats.totals.roundsWith807}`);
  logger.stats(`- roundsWith808: ${diceStats.totals.roundsWith808}`);
  logger.stats(`- roundsWithMatch2: ${diceStats.totals.roundsWithMatch2}`);
  logger.stats(`- roundsWithMatch3: ${diceStats.totals.roundsWithMatch3}`);
  logger.stats(`- roundsWithSingle2and3 (Single 同時出現 m2&m3): ${diceStats.totals.roundsWithSingle2and3}`);
  logger.stats(`- roundsWithAnyDoubleAndTriple (807 與 808 同時出現): ${diceStats.totals.roundsWithAnyDoubleAndTriple}`);
  if (diceStats.recentRounds.length) {
    const show = diceStats.recentRounds.slice(-10);
    logger.stats(`- 最近局號（最新在後）: ${show.join(', ')}`);
  }
  fmtGroup('Single-2 同色（match=2）', diceStats.single2);
  fmtGroup('Single-3 同色（match=3）', diceStats.single3);
  fmtGroup('AnyDouble（807）', diceStats.anyDouble);
  fmtGroup('AnyTriple（808）', diceStats.anyTriple);
  logger.raw(`========================================\n`);
}

module.exports = {
  createDiceStats,
  incBucket,
  printDiceStats,
};

