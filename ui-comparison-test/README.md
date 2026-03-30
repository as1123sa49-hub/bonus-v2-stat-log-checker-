# UI 比對自動化測試框架

基於 Playwright + Python 的 UI 比對自動化測試框架，用於比對兩個 URL 環境的 UI 是否完全相同。

## 功能特點

- ✅ 支援 Cocos Creator 節點定位（使用節點路徑和 getBoundingBox）
- ✅ 並行執行兩個瀏覽器實例（URL_A 和 URL_B）
- ✅ 混合模式截圖（整頁 + 元素級別）
- ✅ API 監聽機制（WebSocket 和 HTTP）
- ✅ 差異視覺化（紅色圓圈 + 矩形標示）
- ✅ 自動生成測試報告（HTML + 文字 + JSON）
- ✅ 排除區域處理（聊天室清單、系統時間等）

## 安裝

1. 安裝 Python 依賴：

```bash
pip install -r requirements.txt
```

2. 安裝 Playwright 瀏覽器：

```bash
playwright install chromium
```

## 配置

### 環境變數

設定環境變數 `URL_A` 和 `URL_B`：

```bash
# Windows PowerShell
$env:URL_A="https://example.com"
$env:URL_B="https://rd.example.com"

# Linux/Mac
export URL_A="https://example.com"
export URL_B="https://rd.example.com"
```

### 測試案例配置

編輯 `config/test_cases.yaml` 來定義測試案例。每個測試案例包含：

- `name`: 測試案例名稱
- `steps`: 測試步驟列表
- `expected`: 預期內容描述
- `wait_for_api`: 需要等待的 API 事件（如 "payout", "openround"）
- `screenshot`: 截圖配置
  - `mode`: 截圖模式（"full_page", "element", "both"）
  - `element_node_path`: 元素節點路徑（當 mode 為 "element" 或 "both" 時需要）

## 使用方式

執行測試：

```bash
pytest tests/test_ui_comparison.py -v
```

查看測試報告：

測試報告會生成在 `reports/` 目錄下：
- `report_YYYYMMDD_HHMMSS.html` - HTML 報告（包含截圖對比）
- `report_YYYYMMDD_HHMMSS.txt` - 文字報告
- `report_YYYYMMDD_HHMMSS.json` - JSON 報告（供 CI/CD 整合）

截圖會保存在 `screenshots/` 目錄下：
- `url_a/` - URL_A 的截圖
- `url_b/` - URL_B 的截圖
- `diffs/` - 差異截圖（紅色標示差異區域）

## 專案結構

```
ui-comparison-test/
├── config/
│   ├── test_config.py          # 測試環境配置
│   └── test_cases.yaml         # 測試案例定義
├── src/
│   ├── cocos/                  # Cocos Creator 相關模組
│   │   ├── cocos_helper.py
│   │   └── node_locator.py
│   ├── api/                    # API 監聽模組
│   │   ├── websocket_monitor.py
│   │   └── http_monitor.py
│   ├── comparison/             # 比對相關模組
│   │   ├── screenshot_engine.py
│   │   ├── diff_engine.py
│   │   └── exclusion_handler.py
│   ├── actions/                # 測試操作模組
│   │   └── test_actions.py
│   └── utils/                  # 工具模組
│       ├── logger.py
│       └── report_generator.py
├── tests/
│   ├── conftest.py             # pytest fixtures
│   └── test_ui_comparison.py   # 主要測試套件
├── reports/                    # 測試報告輸出目錄
├── screenshots/                # 截圖輸出目錄
├── requirements.txt            # Python 依賴
└── pytest.ini                  # pytest 配置
```

## Cocos 節點路徑

測試案例中使用 Cocos 節點路徑來定位元素，例如：

```
Canvas/viewRoot/Layer_Default/ColorGameRoomView/.../JPAmountLabel
```

節點路徑使用 `/` 分隔，從場景根節點開始，使用 `getChildByName()` 遍歷節點樹。

## 注意事項

1. 確保 Cocos Creator 遊戲已經載入完成再執行測試步驟
2. 排除區域的節點路徑需要在 `config/test_config.py` 或環境變數中配置
3. 差異容忍度可以在配置中調整（預設為 1%）

