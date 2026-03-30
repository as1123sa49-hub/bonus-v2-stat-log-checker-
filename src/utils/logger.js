/**
 * 統一日誌管理工具
 * 支援不同類型的日誌輸出，並可根據遊戲類型自訂格式
 */

const chalk = require('chalk');

/**
 * 日誌類型
 */
const LogType = {
  SUCCESS: 'success',      // ✅ 成功
  ERROR: 'error',          // ❌ 錯誤
  WARNING: 'warning',      // ⚠️ 警告
  INFO: 'info',           // ℹ️ 資訊
  BETTING: 'betting',      // [下注] 下注相關
  PAYOUT: 'payout',       // [派彩] 派彩相關
  ROADMAP: 'roadmap',      // [路書] 路書相關
  ELECTRONIC_DICE: 'electronic_dice', // [骰子] 電子骰
  JACKPOT: 'jackpot',      // [獎池] 獎池相關
  ROULETTE: 'roulette',   // [轉盤] 轉盤相關
  SCRATCH: 'scratch',     // [刮刮樂] 刮刮樂
  GIFT: 'gift',           // [送禮] 送禮
  CHAT: 'chat',           // [發話] 發話
  UNDO: 'undo',           // [取消] 下注取消
  X2: 'x2',               // [X2] X2下注
  STATS: 'stats',         // [統計] 統計
  CALC: 'calc',           // [計算] 計算
  DETECT: 'detect',       // [偵測] 偵測
  ROOM: 'room',           // [房間] 房間相關
  WALLET: 'wallet'        // [錢包] 錢包
};

/**
 * 日誌標籤映射（保留基本狀態圖示，其他使用文字標籤）
 */
const LogLabels = {
  [LogType.SUCCESS]: '✅',
  [LogType.ERROR]: '❌',
  [LogType.WARNING]: '⚠️',
  [LogType.INFO]: 'ℹ️',
  [LogType.BETTING]: '[下注]',
  [LogType.PAYOUT]: '[派彩]',
  [LogType.ROADMAP]: '[路書]',
  [LogType.ELECTRONIC_DICE]: '[骰子]',
  [LogType.JACKPOT]: '[獎池]',
  [LogType.ROULETTE]: '[轉盤]',
  [LogType.SCRATCH]: '[刮刮樂]',
  [LogType.GIFT]: '[送禮]',
  [LogType.CHAT]: '[發話]',
  [LogType.UNDO]: '[取消]',
  [LogType.X2]: '[X2]',
  [LogType.STATS]: '[統計]',
  [LogType.CALC]: '[計算]',
  [LogType.DETECT]: '[偵測]',
  [LogType.ROOM]: '[房間]',
  [LogType.WALLET]: '[錢包]'
};

/**
 * 日誌顏色映射
 */
const LogColors = {
  [LogType.SUCCESS]: chalk.green,
  [LogType.ERROR]: chalk.red,
  [LogType.WARNING]: chalk.yellow,
  [LogType.INFO]: chalk.blue,
  [LogType.BETTING]: chalk.cyan,
  [LogType.PAYOUT]: chalk.magenta,
  [LogType.ROADMAP]: chalk.hex('#FFA500'), // Orange
  [LogType.ELECTRONIC_DICE]: chalk.hex('#8A2BE2'), // BlueViolet
  [LogType.JACKPOT]: chalk.hex('#FFD700'), // Gold
  [LogType.ROULETTE]: chalk.hex('#FF69B4'), // HotPink
  [LogType.SCRATCH]: chalk.hex('#00CED1'), // DarkTurquoise
  [LogType.GIFT]: chalk.hex('#FF1493'), // DeepPink
  [LogType.CHAT]: chalk.hex('#1E90FF'), // DodgerBlue
  [LogType.UNDO]: chalk.hex('#FF6347'), // Tomato
  [LogType.X2]: chalk.hex('#32CD32'), // LimeGreen
  [LogType.STATS]: chalk.hex('#32CD32'), // LimeGreen
  [LogType.CALC]: chalk.hex('#FF8C00'), // DarkOrange
  [LogType.DETECT]: chalk.hex('#1E90FF'), // DodgerBlue
  [LogType.ROOM]: chalk.hex('#20B2AA'), // LightSeaGreen
  [LogType.WALLET]: chalk.hex('#DAA520') // Goldenrod
};

/**
 * 日誌配置
 */
let loggerConfig = {
  enabled: true,
  showTimestamp: false,
  showType: true,
  indent: 0
};

/**
 * 設定日誌配置
 * @param {Object} config - 配置選項
 */
function setConfig(config) {
  loggerConfig = { ...loggerConfig, ...config };
}

/**
 * 格式化訊息
 * @param {string} type - 日誌類型
 * @param {string} message - 訊息內容
 * @param {Object} options - 選項
 * @returns {string} 格式化後的訊息
 */
function formatMessage(type, message, options = {}) {
  const { prefix = '', suffix = '', noIcon = false } = options;
  const indent = '   '.repeat(loggerConfig.indent);
  const timestamp = loggerConfig.showTimestamp ? `[${new Date().toISOString()}] ` : '';
  
  // 判斷是否應該顯示標籤：
  // 1. noIcon 為 true 時不顯示
  // 2. prefix 包含縮排（以空格開頭）時不顯示標籤（後續行）
  const hasIndentPrefix = prefix.trim() !== prefix && prefix.length > 0;
  const shouldShowLabel = !noIcon && !hasIndentPrefix;
  
  // 獲取標籤（保留基本狀態圖示，其他使用文字標籤）
  const label = shouldShowLabel ? (LogLabels[type] || '') : '';
  
  // 獲取顏色函數
  const colorFn = LogColors[type] || chalk.white;
  
  // 格式化標籤（基本狀態圖示保持原樣，文字標籤使用顏色）
  let formattedLabel = label;
  if (label && !['✅', '❌', '⚠️', 'ℹ️'].includes(label)) {
    // 文字標籤使用顏色
    formattedLabel = colorFn(label);
  }
  
  // 格式化訊息內容（使用顏色）
  const coloredMessage = colorFn(message);
  
  return `${indent}${timestamp}${formattedLabel}${formattedLabel ? ' ' : ''}${prefix}${coloredMessage}${suffix}`;
}

/**
 * 核心日誌函數
 * @param {string} type - 日誌類型
 * @param {string} message - 訊息內容
 * @param {Object} options - 選項
 */
function log(type, message, options = {}) {
  if (!loggerConfig.enabled) return;
  const formatted = formatMessage(type, message, options);
  console.log(formatted);
}

/**
 * 多行日誌（用於複雜輸出）
 * @param {string} type - 日誌類型
 * @param {Array<string>} lines - 多行訊息
 * @param {Object} options - 選項
 */
function logMultiLine(type, lines, options = {}) {
  if (!loggerConfig.enabled) return;
  const { header = null, footer = null } = options;
  
  if (header) {
    log(type, header, { ...options, noIcon: false });
  }
  
  lines.forEach((line, index) => {
    const isFirst = index === 0;
    const lineOptions = {
      ...options,
      noIcon: true, // lines 中的所有行都不顯示標籤
      prefix: isFirst ? '' : '   ' // 後續行縮排
    };
    log(type, line, lineOptions);
  });
  
  if (footer) {
    log(type, footer, { ...options, noIcon: true, prefix: '   ' });
  }
}

/**
 * 增加縮排
 */
function increaseIndent() {
  loggerConfig.indent++;
}

/**
 * 減少縮排
 */
function decreaseIndent() {
  loggerConfig.indent = Math.max(0, loggerConfig.indent - 1);
}

/**
 * 重置縮排
 */
function resetIndent() {
  loggerConfig.indent = 0;
}

// 便利函數
const logger = {
  // 基本日誌
  success: (msg, opts) => log(LogType.SUCCESS, msg, opts),
  error: (msg, opts) => log(LogType.ERROR, msg, opts),
  warning: (msg, opts) => log(LogType.WARNING, msg, opts),
  info: (msg, opts) => log(LogType.INFO, msg, opts),
  
  // 業務邏輯日誌
  betting: (msg, opts) => log(LogType.BETTING, msg, opts),
  payout: (msg, opts) => log(LogType.PAYOUT, msg, opts),
  roadmap: (msg, opts) => log(LogType.ROADMAP, msg, opts),
  electronicDice: (msg, opts) => log(LogType.ELECTRONIC_DICE, msg, opts),
  jackpot: (msg, opts) => log(LogType.JACKPOT, msg, opts),
  roulette: (msg, opts) => log(LogType.ROULETTE, msg, opts),
  scratch: (msg, opts) => log(LogType.SCRATCH, msg, opts),
  
  // 未來新增的測試類型
  gift: (msg, opts) => log(LogType.GIFT, msg, opts),
  chat: (msg, opts) => log(LogType.CHAT, msg, opts),
  undo: (msg, opts) => log(LogType.UNDO, msg, opts),
  x2: (msg, opts) => log(LogType.X2, msg, opts),
  
  // 其他日誌
  stats: (msg, opts) => log(LogType.STATS, msg, opts),
  calc: (msg, opts) => log(LogType.CALC, msg, opts),
  detect: (msg, opts) => log(LogType.DETECT, msg, opts),
  room: (msg, opts) => log(LogType.ROOM, msg, opts),
  wallet: (msg, opts) => log(LogType.WALLET, msg, opts),
  
  // 多行日誌
  multiLine: logMultiLine,
  
  // 縮排控制
  indent: increaseIndent,
  unindent: decreaseIndent,
  resetIndent: resetIndent,
  
  // 配置
  setConfig: setConfig,
  
  // 原始日誌（用於向後兼容）
  raw: console.log
};

module.exports = logger;
module.exports.LogType = LogType;

