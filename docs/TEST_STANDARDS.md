# 測試標準與規範 (Testing Standards)

## 文檔版本
- **版本**: 1.0
- **最後更新**: 2025-01-XX
- **適用範圍**: 所有測試文件

## 1. 測試分類標準

### 1.1 單元測試 (Unit Tests)
**定義**: 測試單一函數或模組，無外部依賴

**標準**:
- ✅ 不依賴真實瀏覽器
- ✅ 不依賴網路連接
- ✅ 不依賴後端服務
- ✅ 執行時間 < 1 秒
- ✅ 可並行執行

**範例**:
```javascript
// ✅ 正確：純函數測試
test('splitBetAmount - 2400', () => {
  const result = splitBetAmount(2400);
  expect(result.reduce((sum, c) => sum + c.value, 0)).toBe(2400);
});

// ❌ 錯誤：依賴 page 對象
test('splitBetAmount - 2400', async ({ page }) => {
  // 這不是單元測試
});
```

### 1.2 整合測試 (Integration Tests)
**定義**: 測試多個模組協作，可能有外部依賴

**標準**:
- ✅ 測試模組間協作
- ⚠️ 可能依賴配置或模擬數據
- ✅ 執行時間 < 30 秒
- ✅ 可重複執行

**範例**:
```javascript
// ✅ 正確：測試下注流程整合
test('下注流程整合', async ({ page }) => {
  await loginGame(page, gameUrl);
  await enterRoom(page, 'CGIGOJP1');
  const result = await placeBet(page, [{ area: '804', amount: 2400 }], 'CGIGOJP1');
  expect(result.success).toBe(true);
});
```

### 1.3 E2E 測試 (End-to-End Tests)
**定義**: 測試完整用戶流程，依賴真實環境

**標準**:
- ✅ 需要真實瀏覽器
- ✅ 需要網路連接
- ✅ 需要後端服務
- ⚠️ 執行時間可能較長（1-5 分鐘）
- ⚠️ 可能不穩定（網路、服務依賴）

**範例**:
```javascript
// ✅ 正確：完整聊天流程 E2E
test('聊天功能 E2E', async ({ page, browser }) => {
  await loginGame(page, gameUrl);
  await enterRoom(page, 'CG500X');
  await sendEmoji(page, 'emoji_03');
  // ... 完整流程
});
```

## 2. 測試文件命名規範

### 2.1 文件命名規則
```
{功能名稱}.test.js
```

**範例**:
- ✅ `betting.test.js` - 下注功能測試
- ✅ `chat.test.js` - 聊天功能測試
- ✅ `full-flow.test.js` - 完整流程測試
- ❌ `test-betting.js` - 不符合規範
- ❌ `betting_spec.js` - 不符合規範

### 2.2 測試目錄結構
```
tests/
├── unit/              # 單元測試
│   └── {module}.test.js
├── integration/       # 整合測試
│   └── {feature}.test.js
├── e2e/              # E2E 測試
│   └── {feature}.test.js
└── regression/       # 回歸測試
    └── {feature}-{room}.test.js
```

## 3. 測試代碼規範

### 3.1 測試結構標準

```javascript
/**
 * 測試文件描述
 * 說明測試目標和範圍
 */

const { test, expect } = require('@playwright/test');
// 導入依賴

// 常數定義
const TEST_CONSTANTS = {
  // ...
};

// 輔助函數
async function helperFunction() {
  // ...
}

// 測試套件
test.describe('功能名稱測試', () => {
  // 測試用例
  test('具體測試場景', async ({ page }) => {
    // Arrange: 準備
    // Act: 執行
    // Assert: 驗證
  });
});
```

### 3.2 測試用例命名規範

**格式**: `{場景描述} - {預期結果}`

**範例**:
```javascript
// ✅ 正確
test('下注 2400 到藍色區域 - 應成功扣款', async ({ page }) => {});
test('L4 在 Channel All 發送訊息 - 所有玩家應收到', async ({ page }) => {});

// ❌ 錯誤
test('test1', async ({ page }) => {});
test('下注測試', async ({ page }) => {});
```

### 3.3 斷言標準

**優先使用明確的斷言**:
```javascript
// ✅ 正確
expect(result.success).toBe(true);
expect(amount).toBeGreaterThan(0);
expect(messages.length).toBeGreaterThan(0);

// ❌ 錯誤
expect(result).toBeTruthy(); // 不夠明確
expect(amount).toBe(!!amount); // 邏輯混亂
```

## 4. 測試數據管理標準

### 4.1 測試數據定義
- ✅ 集中定義在文件頂部
- ✅ 使用常數而非魔法數字
- ✅ 提供清晰的註釋

```javascript
// ✅ 正確
const TEST_BETS = [
  { area: '801', amount: 2400, description: '黃色區域標準下注' },
  { area: '802', amount: 5000, description: '白色區域大額下注' },
];

// ❌ 錯誤
test('下注測試', async ({ page }) => {
  await placeBet(page, [{ area: '801', amount: 2400 }]); // 魔法數字
});
```

### 4.2 測試數據隔離
- ✅ 每個測試使用獨立的測試數據
- ✅ 避免測試間數據污染
- ✅ 使用 `beforeEach` 重置狀態

## 5. 錯誤處理標準

### 5.1 錯誤訊息規範
```javascript
// ✅ 正確：包含上下文信息
throw new Error(`等待新訊息超時 (當前: ${previousCount}, 等待時間: ${timeoutMs}ms)`);

// ❌ 錯誤：訊息不明確
throw new Error('失敗');
```

### 5.2 錯誤處理策略
- ✅ 使用 try-catch 處理預期錯誤
- ✅ 記錄錯誤上下文
- ✅ 提供清晰的錯誤訊息

```javascript
// ✅ 正確
try {
  await performAction();
} catch (error) {
  logger.error(`操作失敗: ${error.message}`, { context: { step: 'action' } });
  throw error;
}
```

## 6. 日誌標準

### 6.1 日誌級別使用
- `logger.success()` - 成功操作
- `logger.error()` - 錯誤情況
- `logger.warning()` - 警告信息
- `logger.info()` - 一般信息
- `logger.betting()` - 下注相關
- `logger.payout()` - 派彩相關

### 6.2 日誌格式標準
```javascript
// ✅ 正確：結構化日誌
logger.success(`📤 [L${userLevel}][${channel}] 表情: ${emojiName}`);

// ❌ 錯誤：非結構化日誌
console.log('發送成功');
```

## 7. 測試執行標準

### 7.1 測試超時設置
```javascript
// 單元測試：無需設置（默認足夠）
test('單元測試', () => {});

// 整合測試：30 秒
test('整合測試', async ({ page }) => {
  test.setTimeout(30000);
});

// E2E 測試：3 分鐘
test('E2E 測試', async ({ page }) => {
  test.setTimeout(180000);
});
```

### 7.2 測試隔離標準
- ✅ 每個測試獨立執行
- ✅ 不依賴其他測試的狀態
- ✅ 使用 `beforeEach` 設置初始狀態
- ✅ 使用 `afterEach` 清理狀態

## 8. 測試覆蓋率標準

### 8.1 覆蓋率目標
- **單元測試**: ≥ 80% 代碼覆蓋率
- **整合測試**: ≥ 60% 業務流程覆蓋率
- **E2E 測試**: 100% 關鍵流程覆蓋率

### 8.2 覆蓋率報告
- 每次 CI/CD 執行後生成報告
- 定期審查覆蓋率趨勢
- 識別測試缺口並補充

## 9. 測試維護標準

### 9.1 測試更新流程
1. 修改業務邏輯 → 更新相關測試
2. 新增功能 → 新增對應測試
3. 修復 Bug → 新增回歸測試
4. 重構代碼 → 更新測試以保持一致性

### 9.2 測試文檔更新
- 新增測試場景 → 更新 `TEST_SPECIFICATION.md`
- 修改測試標準 → 更新本文檔
- 新增測試工具 → 更新 `README.md`

## 10. 代碼審查檢查清單

### 10.1 測試代碼審查
- [ ] 測試命名清晰明確
- [ ] 測試結構符合標準
- [ ] 測試數據集中管理
- [ ] 錯誤處理完善
- [ ] 日誌輸出規範
- [ ] 測試隔離良好
- [ ] 測試文檔更新

### 10.2 測試執行檢查
- [ ] 所有測試通過
- [ ] 測試執行時間合理
- [ ] 測試穩定性良好
- [ ] 測試覆蓋率達標

## 11. 參考標準
- Playwright 官方文檔
- JavaScript 測試最佳實踐
- 項目內部測試規範

