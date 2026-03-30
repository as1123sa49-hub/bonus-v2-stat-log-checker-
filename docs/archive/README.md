# 歸檔目錄

此目錄用於保存專案歷史檔案，記錄演進過程。

## 檔案說明

### `room.test.js`
- 狀態：歷史基礎檔（已遷移至模組化版本）
- 日期：2025/10/28
- 說明：最初版整合測試，單檔包含所有邏輯（1332 行）
  - WebSocket 攔截
  - 登入
  - 進房
  - 下注
  - 派彩
  - 路書讀取
- 遷移狀態：已完成模組化
  - `tests/integration/full-flow.test.js` - 完整流程測試
  - `tests/integration/live-watch.test.js` - 長駐觀察測試
  - `src/helpers/` - 各類 helper 模組
  - `config/testConfig.js` - 統一配置

## 注意事項

- 此處檔案僅作為歷史參考
- 不建議直接執行
- 請使用新的模組化測試檔

