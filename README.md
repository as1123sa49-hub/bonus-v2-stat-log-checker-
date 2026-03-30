# Playwright 測試項目

完整文檔已移至 `docs/`，請查看：`docs/README.md`、`docs/QUICK_START.md` 等。

## 📂 項目結構

```
playwright-test/
├── config/
│   └── testConfig.js          # 集中管理測試配置
│
├── src/helpers/               # 可重用的輔助函數
│   ├── webSocketHelper.js     # WebSocket 監聽與事件解析
│   ├── loginHelper.js         # 登入 + PWA 關閉
│   ├── roomHelper.js          # 房間操作（進房、檢查狀態）
│   ├── bettingHelper.js       # 下注邏輯（籌碼拆分、下注）
│   ├── payoutHelper.js        # 派彩驗證
│   ├── roadmapHelper.js       # 路書讀取與顯示
│   └── cocosHelper.js         # Cocos Creator 通用工具
│
├── tests/                      # 測試案例
│   ├── integration/           # 整合測試
│   │   ├── full-flow.test.js  # 完整流程測試（登入→進房→下注→派彩）
│   │   └── live-watch.test.js # 長駐觀察（500X 機率統計、CSV 匯出）
│   │
│   ├── unit/                   # 單元測試
│   │   └── betting.test.js    # 籌碼拆分算法測試
│   │
│   └── regression/             # 回歸測試
│       └── cgigojp1-bets.test.js  # CGIGOJP1 不同下注組合
│
├── tools/500x/                # 500X 機率分析工具腳本
│   ├── calculate-expected.js  # 計算預期機率
│   ├── check-stats.js         # 對比明細與彙總統計
│   ├── check-color-sum.js     # 按顏色統計
│   └── verify-rates.js        # 按倍率統計
├── docs/archive/              # 歷史檔案歸檔
│   └── room.test.js           # 最初版整合測試（僅供參考）
├── package.json
└── playwright.config.js
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 修改配置

編輯 `config/testConfig.js` 文件，設定您的測試參數：

```javascript
const TEST_CONFIG = {
  gameUrl: 'http://...',      // 遊戲 URL
  targetRoom: 'CGIGOJP1',      // 目標房間
  betAmount: 2400,             // 下注金額
  betArea: '804',              // 下注區域 (801-806)
  // ...
};
```

### 3. 執行測試

#### 執行所有測試
```bash
npx playwright test
```

#### 只執行整合測試
```bash
npx playwright test tests/integration
```

#### 只執行單元測試
```bash
npx playwright test tests/unit
```

#### 只執行回歸測試
```bash
npx playwright test tests/regression
```

#### 執行特定測試文件
```bash
npx playwright test tests/integration/full-flow.test.js
```

## 📋 測試類型說明

### 整合測試 (Integration Tests)
測試完整的業務流程，從登入到派彩：
- `full-flow.test.js` - 登入 → 進房 → 下注 → 派彩

### 單元測試 (Unit Tests)
測試單一功能模組：
- `betting.test.js` - 籌碼拆分算法測試

### 回歸測試 (Regression Tests)
確保現有功能不被破壞：
- `cgigojp1-bets.test.js` - 各種下注金額組合測試

## 🔧 Helper 函數說明

### webSocketHelper.js
- `initWebSocketMonitoring(page)` - 初始化 WebSocket 監聽
- `getLatestOpenRound(page, targetRoom)` - 獲取最新 openround
- `waitForNewOpenRound(page, targetRoom, ...)` - 等待新局開始

### loginHelper.js
- `loginGame(page, gameUrl)` - 登入遊戲
- `closePWAPopup(page)` - 關閉 PWA 彈窗

### roomHelper.js
- `checkIfInRoom(page)` - 檢查是否在房間內
- `getRoomList(page)` - 獲取房間列表
- `enterRoom(page, targetRoom)` - 進入指定房間

### bettingHelper.js
- `splitBetAmount(amount)` - 拆分下注金額為籌碼組合
- `getWalletBalance(page)` - 獲取錢包餘額
- `placeBet(page, amount, area, areaNames)` - 執行下注

### payoutHelper.js
- `waitForPayout(page, roundCode, walletBefore, ...)` - 等待派彩並驗證

## 💡 使用範例

### 創建新的測試

```javascript
const { test, expect } = require('@playwright/test');
const { loginGame, closePWAPopup } = require('../helpers/loginHelper');
const { enterRoom } = require('../helpers/roomHelper');
const { placeBet } = require('../helpers/bettingHelper');

test('我的自定義測試', async ({ page }) => {
  // 1. 登入
  await loginGame(page, 'http://...');
  await closePWAPopup(page);
  
  // 2. 進房
  await enterRoom(page, 'CGIGOJP1');
  
  // 3. 下注
  const result = await placeBet(page, 5000, '802');
  expect(result.success).toBe(true);
});
```

## 🎯 優勢

✅ **模組化** - 每個功能獨立，易於修改  
✅ **可重用** - 函數可以在不同測試中共享  
✅ **易維護** - 修改一處，所有測試都更新  
✅ **易擴展** - 輕鬆添加新測試案例  
✅ **易協作** - 團隊成員可以同時開發不同模組  

## 📝 注意事項

1. **修改配置**：所有配置集中在 `config/testConfig.js`
2. **修改登入邏輯**：只需修改 `helpers/loginHelper.js`
3. **新增房間**：複製回歸測試文件並修改房間名稱
4. **新增下注區域**：在 `testConfig.js` 的 `areaNames` 中添加

## 🐛 故障排除

### 測試找不到模組
確保使用 CommonJS 語法：
```javascript
const { test } = require('@playwright/test');
const helper = require('../helpers/xxx');
```

### WebSocket 監聽不到事件
確保在 `loginGame` 之前調用 `initWebSocketMonitoring(page)`

## 📞 聯繫方式

如有問題，請查看原始 `room.test.js` 文件作為參考。

---

**重構完成日期：** 2025-10-28  
**版本：** 2.0 (多文件模組化版本)


