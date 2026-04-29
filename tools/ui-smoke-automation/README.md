# UI Smoke Automation

使用 Playwright 執行 ColorGame 的第一批冒煙測試（C01~C03）：

- C01: 房內點返回大廳（`RoomExit`）
- C02: 大廳點齒輪開啟菜單（`Setting@Lobby`）
- C03: 房內點右下三點開啟菜單（`Setting@GameRoom`）

此工具會輸出：

- 每個 case 的 `before/after/fail` 截圖
- JSON 報表（機器可讀）
- Markdown 報表（人工可讀）

## 目錄

```text
tools/ui-smoke-automation/
  cases/smoke-lobby-room.json
  run-smoke.js
  reports/
  screenshots/
```

## 先決條件

- 根目錄已安裝 `@playwright/test`
- 可連上測試網址

## 執行方式

### PowerShell

```powershell
$env:TARGET_URL="https://your-target-url"
node tools/ui-smoke-automation/run-smoke.js
```

只跑單一 case（例如先 debug C02）：

```powershell
$env:TARGET_URL="https://your-target-url"
$env:CASE_ID="C02_lobby_setting_open"
node tools/ui-smoke-automation/run-smoke.js
```

### CMD

```cmd
set TARGET_URL=https://your-target-url
node tools/ui-smoke-automation/run-smoke.js
```

> 若未提供 `TARGET_URL`，會讀 `cases/smoke-lobby-room.json` 的 `env.base_url`。
> 建議不要把正式 token 直接寫進檔案，避免敏感資訊落版控。

## 設定說明

可調整 `cases/smoke-lobby-room.json`：

- `env.viewport`: 預設 `1920x1080`
- `env.headless`: 預設 `false`
- `env.log_timeout_ms`: 預設 `10000`
- `cases[].action.points`: 點擊比例座標（`x/y` 為 0~1）
- `CASE_ID`（環境變數）: 僅執行指定 case，可逗號分隔多個 case

目前採「比例座標 + 備援點位」策略，方便在不同螢幕下微調。

## 產物位置

- `tools/ui-smoke-automation/screenshots/`
- `tools/ui-smoke-automation/reports/report-<timestamp>.json`
- `tools/ui-smoke-automation/reports/report-<timestamp>.md`

## 已知限制

- 前置條件 `state: in_room` 目前只做流程語意標記，實際是否在房內仍以 log/assert 結果判定。
- Cocos 畫面若改版導致按鈕位移，請微調 `action.points`。

## 相關工具（建議搭配）

- 執行 UI smoke 後，若需要做前端 log 的欄位檢查或結構比對，可到倉庫根目錄的 **`tools-hub`**（預設 <http://localhost:3010>）使用 `LOG 結構比對（front-log-compare）`：
  - 雙檔比對：上傳舊版 + 新版 JSON（原始）
  - 單檔驗證：上傳 1 份 JSON 驗證欄位缺失（支援 `root.` / `data`）
