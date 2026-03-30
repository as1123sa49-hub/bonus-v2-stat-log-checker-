/**
 * 測試配置文件
 * 集中管理所有測試相關的配置參數
 */

/**
 * 多帳號配置（避免同時運行測試時互相衝突）
 * 
 * 使用方式：
 * 1. live-watch 測試（統計功能）：使用預設帳號
 *    $env:TEST_ACCOUNT="default"; npx playwright test tests/integration/live-watch.test.js
 *    或不設置環境變數（預設即為 default）
 * 
 * 2. full-flow 測試（下注流程）：使用 betting 帳號
 *    $env:TEST_ACCOUNT="betting"; npx playwright test tests/integration/full-flow.test.js
 * 
 * 注意：請確保 betting 帳號的 accessToken 已正確配置
 */
// 環境 URL 配置
const ENV_URLS = {
  // C 服 URL
  c: 'https://colorgame.game1testing.com/?infoUrl=b388a7&gameType=31&defaultVideoPlayMode=trtc&channelId=859&pId=50&playerName=1205482331&gameId=31&lang=en-US&timestamp=1763436833&accessToken=e41eef1a138b9c1f4e1da7afa26119f8cbc6af60e646c73fffaf5a55d1b311ca2044813108fd47e22f118bb454b3130b04b43dbf2555241f98d7393a4e2d903d4c7f8dbb8dc06af275bb4d5f14fdc732a058273641a5e214e0a9e95dd799cd9ebb387cc97efa20f5bb9333f2ee0ef2e6&nickName=1205482331&userLevel=2&userName=1205482331&epm=1&birthday=23-09-2000&mode=mobile&isPwaClaimed=1',
  // 239 測試站 URL
  '239': 'http://192.168.2.239/cg/build/web-mobile/?infoUrl=f3f826&gameType=31&seo=false&pid=50&username=apitest03&userLevel=4&accessToken=64cc26d5024ba365cd1169a82bfeeb4ae9b4be8d023474fce7215d9ed20d4298a77571031007bf3ec9567c821099d83e149996558a31db49c72d3915e1b47ffb3b90bc83fbc12f813b0994f2247fc40bf6ae34de1036a1e1367786a3d3a5226d&defaultVideoPlayMode=trtc&birthday=05-11-2025'
};

const ACCOUNTS = {
  // 預設帳號（用於 live-watch 統計測試）
  // 切換環境：修改 targetEnv 為 'c' 或 '239'
  default: {
    username: '1205482331',
    accessToken: 'e41eef1a138b9c1f4e1da7afa26119f8cbc6af60e646c73fffaf5a55d1b311ca2044813108fd47e22f118bb454b3130b04b43dbf2555241f98d7393a4e2d903d4c7f8dbb8dc06af275bb4d5f14fdc732a058273641a5e214e0a9e95dd799cd9ebb387cc97efa20f5bb9333f2ee0ef2e6',
    userLevel: 2,
    birthday: '23-09-2000',
    targetEnv: '239' // 切換環境：'c' = C 服，'239' = 239 測試站
  },
  // 下注流程測試帳號（用於 full-flow 測試）
  betting: {
    username: 'apitest03',  // 請替換為實際的第二個測試帳號
    accessToken: '64cc26d5024ba365cd1169a82bfeeb4ae9b4be8d023474fce7215d9ed20d4298a77571031007bf3ec9567c821099d83e149996558a31db49c72d3915e1b47ffb3b90bc83fbc12f813b0994f2247fc40bf6ae34de1036a1e1367786a3d3a5226d',  // 請替換為實際的 accessToken
    userLevel: 2,
    birthday: '29-10-2025'
  },
  // 外部測試站帳號（提供完整自訂 URL）
  game1testing: {
    username: 'ryanlin',
    accessToken: 'e41eef1a138b9c1f4e1da7afa26119f8cbc6af60e646c73fffaf5a55d1b311ca95216cb99f209b88cb69ef36d09716357ace96738c46cfdfad41804d29b246afa867fe043ad72974c6bc8b5ac0d56eaf1cc899eded70c5770d3bbb80d678b940',
    userLevel: 1,
    birthday: '01-02-2000',
    customGameUrl: 'https://colorgame.game1testing.com/?infoUrl=b388a7&gameType=31&defaultVideoPlayMode=trtc&channelId=859&pId=50&playerName=ryanlin&gameId=31&lang=en-US&timestamp=1762832163&accessToken=e41eef1a138b9c1f4e1da7afa26119f8cbc6af60e646c73fffaf5a55d1b311ca95216cb99f209b88cb69ef36d09716357ace96738c46cfdfad41804d29b246afa867fe043ad72974c6bc8b5ac0d56eaf1cc899eded70c5770d3bbb80d678b940&nickName=player22935&userLevel=1&userName=ryanlin&epm=1&birthday=01-02-2000&mode=mobile&isPwaClaimed=1'
  }
};

// 根據環境變數選擇帳號（預設使用 'default'）
const accountKey = process.env.TEST_ACCOUNT || 'default';
const selectedAccount = ACCOUNTS[accountKey] || ACCOUNTS.default;

// 預設遊戲 URL（當帳號沒有指定環境時使用，預設使用 239 測試站）
const DEFAULT_GAME_URL = ENV_URLS['239'];

// 構建遊戲 URL
const buildGameUrl = (account) => {
  if (!account) {
    return DEFAULT_GAME_URL;
  }

  // 如果帳號有指定 targetEnv，使用對應環境的 URL
  if (account.targetEnv && ENV_URLS[account.targetEnv]) {
    return ENV_URLS[account.targetEnv];
  }

  // 如果帳號有自訂 URL，優先使用
  if (account.customGameUrl) {
    return account.customGameUrl;
  }

  const baseUrl = account.baseGameUrl || DEFAULT_GAME_URL;
  const url = new URL(baseUrl);

  if (account.infoUrl) url.searchParams.set('infoUrl', account.infoUrl);
  if (account.gameType) url.searchParams.set('gameType', String(account.gameType));
  if (account.seo !== undefined) url.searchParams.set('seo', String(account.seo));
  if (account.pid || account.pid === 0) url.searchParams.set('pid', String(account.pid));
  if (account.channelId) url.searchParams.set('channelId', String(account.channelId));
  if (account.lang) url.searchParams.set('lang', account.lang);

  if (account.username) url.searchParams.set('username', account.username);
  if (account.userName) url.searchParams.set('userName', account.userName);
  if (account.userLevel !== undefined) url.searchParams.set('userLevel', String(account.userLevel));
  if (account.accessToken) url.searchParams.set('accessToken', account.accessToken);
  if (account.defaultVideoPlayMode) {
    url.searchParams.set('defaultVideoPlayMode', account.defaultVideoPlayMode);
  } else if (!url.searchParams.has('defaultVideoPlayMode')) {
    url.searchParams.set('defaultVideoPlayMode', 'trtc');
  }
  if (account.birthday) url.searchParams.set('birthday', account.birthday);

  if (account.extraParams && typeof account.extraParams === 'object') {
    Object.entries(account.extraParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
};

const TEST_CONFIG = {
  // 遊戲 URL（根據選擇的帳號動態生成）
  gameUrl: buildGameUrl(selectedAccount),
  
  // 當前使用的帳號資訊（用於日誌顯示）
  accountInfo: {
    key: accountKey,
    username: selectedAccount.username
  },
  
  // 目標房間
  targetRoom: 'CGD16',
  
  // 多區域下注配置（設定金額 > 0 即會下注該區域，金額 = 0 則跳過）
  // 使用範例：
  //   - 下注單一區域: 只設定一個區域 amount > 0
  //   - 下注多個區域: 設定多個區域 amount > 0
  //   - 暫停某區域: 將該區域 amount 設為 0
  bets: [
    { area: '801', amount: 0 },    // 黃色
    { area: '802', amount: 0 },    // 白色
    { area: '803', amount: 0 },    // 粉色
    { area: '804', amount: 0 },   // 藍色 
    { area: '805', amount: 0 },    // 紅色
    { area: '806', amount: 0 },    // 綠色
    { area: '807', amount: 0 },    // Any Double
    { area: '808', amount: 0 }     // Any Triple
  ],
  
  // 區域名稱映射
  areaNames: {
    '801': 'Yellow (黃)',
    '802': 'White (白)',
    '803': 'Pink (粉)',
    '804': 'Blue (藍)',
    '805': 'Red (紅)',
    '806': 'Green (綠)',
    '807': 'Any Double',
    '808': 'Any Triple'
  },
  
  // 籌碼值與 Sprite 映射
  chipValueMap: {
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
  },

  // 路書與結果比對配置
  colorToAreaMap: {
    yellow: '801',
    white: '802',
    pink: '803',
    blue: '804',
    red: '805',
    green: '806',
  },

  // 路書更新等待（毫秒）
  roadmapUpdateTimeoutMs: 3000,
  roadmapPollIntervalMs: 300,
  
  // 500X常駐功能開關（控制測試功能啟用/禁用）
  features: {
    enableStats: true,      // 500X 統計功能（當前主要功能）
    enableBetting: false,   // 下注功能（預留，日後啟用）
    enablePayout: false,    // 派彩功能（預留，日後啟用）
    enableRoadmap: false,   // 路書功能（預留，日後啟用）

    // 全域下注成功率保護
    betSuccessGuardEnabled: false, // 全域開關（true/false）
    betSuccessThreshold: 0.30     // 全域門檻（0~1，預設 30%）
  },
  
   //超時設定（秒）
  timeouts: {
    pageLoad: 30000,
    waitForRound: 60,
    waitForPayout: 60
  },

  // 玩法策略鍵（normal | speed | jackpot | special）
  strategyKey: 'normal',

  // 全域覆寫（可由 perRoom/perStrategy 覆寫）
  overrides: {
    openButtonRequired: true,       // 是否必須點 openBettingButton
    chipSelectDelayMs: 150,         // 選籌碼後等待時間（穩定優先）
    clickIntervalMs: 12,            // 同一區域連續點擊間隔
    interAreaDelayMs: 15,           // 區域與區域之間間隔
    retryMax: 4,                    // 補下注最大重試次數
    fastMode: true                  // 激進提速（策略可自行解讀）
  },

  // 依房間覆寫（優先於 overrides）
  perRoom: {
    // 'CGT01': { strategyKey: 'speed', overrides: { openButtonRequired: false } }
  },

  // 依策略覆寫（做為預設模板）
  perStrategy: {
    normal: {},
    speed: { overrides: { openButtonRequired: false } },
    jackpot: {},
    special: {}
  },

  // 依測試檔案覆寫（每個測試可以有自己的房間和下注配置）
  perTest: {
    // live-watch.test.js 專用配置
    'live-watch': {
      targetRoom: 'CGD16',  // 房間A（可自行修改）
      bets: [
        { area: '801', amount: 0 },    // 黃色
        { area: '802', amount: 0 },    // 白色
        { area: '803', amount: 0 },    // 粉色
        { area: '804', amount: 0 },   // 藍色 
        { area: '805', amount: 0 },    // 紅色
        { area: '806', amount: 0 },    // 綠色
        { area: '807', amount: 0 },    // Any Double
        { area: '808', amount: 0 }     // Any Triple
      ]
    },
    // full-flow.test.js 專用配置
    'full-flow': {
      targetRoom: 'CGRY75X',  // 房間B（可自行修改）
      bets: [
        { area: '801', amount: 50 },    // 黃色
        { area: '802', amount: 50 },    // 白色
        { area: '803', amount: 0 },    // 粉色
        { area: '804', amount: 50 },   // 藍色 
        { area: '805', amount: 0 },    // 紅色
        { area: '806', amount: 50 },    // 綠色
        { area: '807', amount: 0 },     // Any Double
        { area: '808', amount: 0 }      // Any Triple
      ]
    }
  }
};

/**
 * 獲取測試專用配置（根據測試檔案名稱）
 * @param {string} testName - 測試檔案名稱（如 'live-watch' 或 'full-flow'）
 * @returns {Object} 合併後的配置（專用配置優先於預設配置）
 */
function getTestConfig(testName) {
  const testSpecific = TEST_CONFIG.perTest && TEST_CONFIG.perTest[testName];
  if (!testSpecific) {
    // 如果沒有專用配置，返回預設配置
    return {
      targetRoom: TEST_CONFIG.targetRoom,
      bets: TEST_CONFIG.bets
    };
  }
  
  // 合併專用配置和預設配置（專用配置優先）
  return {
    targetRoom: testSpecific.targetRoom || TEST_CONFIG.targetRoom,
    bets: testSpecific.bets || TEST_CONFIG.bets
  };
}

module.exports = TEST_CONFIG;
module.exports.getTestConfig = getTestConfig;
module.exports.ACCOUNTS = ACCOUNTS;
module.exports.buildGameUrl = buildGameUrl;
module.exports.getAccountByKey = (key) => ACCOUNTS[key];

