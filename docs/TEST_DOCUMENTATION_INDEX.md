# 測試文檔索引 (Test Documentation Index)

## 📋 文檔概覽

本文檔提供所有測試相關文檔的索引和說明。

## 🎯 核心測試文檔（必讀）

### 1. [TEST_SPECIFICATION.md](./TEST_SPECIFICATION.md)
**測試規格文檔** - 定義測試的標準和規範

**內容**:
- 測試範圍和目標
- 業務規則定義（下注、派彩、聊天）
- 測試場景矩陣
- 測試數據定義
- 驗證點定義
- 測試執行標準

**適用對象**: 所有測試開發人員

**更新頻率**: 每次新增測試場景或修改業務規則時更新

---

### 2. [TEST_STANDARDS.md](./TEST_STANDARDS.md)
**測試標準與規範** - 定義測試代碼的編寫標準

**內容**:
- 測試分類標準（單元/整合/E2E）
- 測試文件命名規範
- 測試代碼規範
- 測試數據管理標準
- 錯誤處理標準
- 日誌標準
- 測試執行標準
- 代碼審查檢查清單

**適用對象**: 所有測試開發人員

**更新頻率**: 當測試標準變更時更新

---

### 3. [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md)
**測試場景矩陣** - 所有測試場景的完整列表

**內容**:
- 下注功能測試場景（7 個）
- 派彩功能測試場景（6 個）
- 聊天功能測試場景（12 個）
- 房間功能測試場景（5 個）
- 登入功能測試場景（3 個）
- 統計功能測試場景（4 個）
- 測試狀態追蹤
- 測試覆蓋率統計
- 測試缺口分析

**適用對象**: 測試經理、測試開發人員

**更新頻率**: 每次新增或修改測試場景時更新

---

## 📖 技術文檔

### 4. [LOGGER_USAGE.md](./LOGGER_USAGE.md)
**日誌工具使用指南** - logger 工具的使用說明

**適用對象**: 所有開發人員

---

### 5. [QUICK_START.md](./QUICK_START.md)
**快速開始指南** - 新成員快速上手指南

**適用對象**: 新成員

---

### 6. [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
**故障排除指南** - 常見問題和解決方案

**適用對象**: 所有開發人員

---

### 7. [CHANGELOG.md](./CHANGELOG.md)
**變更日誌** - 記錄所有重要變更

**適用對象**: 所有開發人員

---

## 🔍 如何查找文檔

### 按角色查找

**測試開發人員**:
1. 開始新測試 → 閱讀 [TEST_STANDARDS.md](./TEST_STANDARDS.md)
2. 定義測試場景 → 參考 [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md)
3. 了解業務規則 → 閱讀 [TEST_SPECIFICATION.md](./TEST_SPECIFICATION.md)

**測試經理**:
1. 了解測試覆蓋率 → 查看 [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md)
2. 審查測試標準 → 查看 [TEST_STANDARDS.md](./TEST_STANDARDS.md)
3. 規劃測試策略 → 參考 [TEST_SPECIFICATION.md](./TEST_SPECIFICATION.md)

**新成員**:
1. 快速上手 → 閱讀 [QUICK_START.md](./QUICK_START.md)
2. 了解測試標準 → 閱讀 [TEST_STANDARDS.md](./TEST_STANDARDS.md)
3. 遇到問題 → 查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### 按任務查找

**新增測試場景**:
1. 在 [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md) 中定義場景
2. 參考 [TEST_STANDARDS.md](./TEST_STANDARDS.md) 編寫測試代碼
3. 更新 [TEST_SPECIFICATION.md](./TEST_SPECIFICATION.md) 中的業務規則（如需要）

**修改測試代碼**:
1. 參考 [TEST_STANDARDS.md](./TEST_STANDARDS.md) 確保符合規範
2. 更新 [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md) 中的測試狀態

**審查測試代碼**:
1. 使用 [TEST_STANDARDS.md](./TEST_STANDARDS.md) 中的檢查清單
2. 對照 [TEST_SCENARIO_MATRIX.md](./TEST_SCENARIO_MATRIX.md) 確認覆蓋率

## 📝 文檔維護責任

| 文檔 | 主要維護者 | 審查者 | 更新頻率 |
|------|-----------|--------|----------|
| TEST_SPECIFICATION.md | 測試團隊 | 測試經理 | 每次新增測試場景 |
| TEST_STANDARDS.md | 測試團隊 | 技術負責人 | 標準變更時 |
| TEST_SCENARIO_MATRIX.md | 測試團隊 | 測試經理 | 每次新增/修改測試 |
| LOGGER_USAGE.md | 開發團隊 | 技術負責人 | 工具更新時 |
| QUICK_START.md | 測試團隊 | 測試經理 | 流程變更時 |
| TROUBLESHOOTING.md | 測試團隊 | 全體 | 發現新問題時 |

## 🔄 文檔更新流程

1. **識別需要更新的文檔**
   - 新增測試場景 → 更新 TEST_SCENARIO_MATRIX.md
   - 修改測試標準 → 更新 TEST_STANDARDS.md
   - 新增業務規則 → 更新 TEST_SPECIFICATION.md

2. **執行更新**
   - 修改對應文檔
   - 更新版本號和日期
   - 記錄變更原因

3. **審查和批准**
   - 提交 PR
   - 相關人員審查
   - 合併到主分支

4. **通知團隊**
   - 在團隊會議中通知
   - 更新文檔索引（如需要）

## 📞 文檔問題反饋

如發現文檔問題或需要補充內容，請：
1. 創建 Issue 描述問題
2. 或直接提交 PR 修正
3. 標記相關維護者

---

**最後更新**: 2025-01-XX  
**維護者**: 測試團隊

