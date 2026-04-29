# bonus-v2-stat-log-checker

本倉庫以 **`tools/`** 集中各項 QA 工具，並以倉庫根目錄的 **`tools-hub/`** 作為單一入口（見 `tools-hub/README.md`）。

| 路徑 | 說明 |
|------|------|
| `tools/bonus-v2/` | 500X V2 電子骰機率驗證（Express + Playwright，見該目錄 `README.md`） |
| `tools/front-log-checker/` | 前端 LOG 攔截腳本 `intercept.js`（貼到目標網站 DevTools Console 執行） |
| `tools-hub/` | QA Tools Hub：整合導覽與 iframe 子工具 |

## 快速開始

### Bonus V2（500X）

```bash
npm install
npm run start:bonus-v2
```

瀏覽器開啟：<http://localhost:3001>（詳見 `tools/bonus-v2/README.md`）。

### front-log-checker

開啟 `tools/front-log-checker/intercept.js`，複製全文到目標頁面的 Console 執行。

### Tools Hub（整合入口）

```bash
cd tools-hub
npm install
npm start
```

瀏覽器開啟：<http://localhost:3010>。
