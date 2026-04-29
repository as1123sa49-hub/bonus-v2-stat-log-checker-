# LOG 結構比對（front-log-compare）

此工具支援兩種模式，並可獨立啟動（不依賴 `tools-hub`）：

- 雙檔比對：比對兩份 `front-log-checker` 匯出的 `JSON(原始)` 檔案
- 單檔驗證：上傳 1 份 `JSON(原始)`，檢查指定欄位缺失

## 啟動方式

```bash
cd tools/front-log-compare
npm install
npm start
```

開啟：`http://localhost:3020`

## 使用方式

### A. 雙檔比對（舊版 vs 新版）

1. 執行模式選 `雙檔比對`。
2. 分別上傳舊版與新版 `JSON(原始)`。
3. 選擇匹配鍵（預設 `function_name + event`）。
4. 預設僅比對有 `function_name` 的資料；可視需要取消此條件。
5. 視需要勾選 data/root 欄位比對並填入欄位名稱（支援 `root.xxx` 指定最外層）。
6. 點擊「開始比對」查看 PASS/WARN/FAIL。
7. 差異結果分頁顯示（全部明細 / 整組缺失 / jsondata 結構差異 / data/root 欄位差異）。
8. 如需留存再點「下載差異 CSV」。

### B. 單檔驗證（欄位缺失）

1. 執行模式選 `單檔驗證`。
2. 上傳 1 份 `JSON(原始)`。
3. 透過「自動掃描欄位」勾選推薦欄位，或手動填入「單檔驗證欄位」。
4. 點擊「開始比對」查看欄位缺失結果（PASS/WARN/FAIL）。
5. 分頁說明：
   - `全部明細` / `缺失明細`：欄位缺失結果
   - `jsondata 摘要`：僅展示實際 jsondata 樣本，不做結構差異判定
   - `欄位分組摘要`：按匹配組查看欄位驗證結果
6. 如需留存可下載單檔驗證 CSV。

## 欄位層級說明

- `root`：response 最外層欄位（例如 `event`、`status`、`host`）。
- `data`：`response.data` 欄位（例如 `function_name`、`balance`、`seq_index`）。
- `jsondata`：`data.jsondata`（字串 JSON）解析後內容。
- 自訂匹配鍵與 data/root 欄位比對：
  - 不加前綴時，預設使用 `data` 欄位（例如 `balance`）。
  - 加上 `root.` 可明確指定最外層（例如 `root.status`）。

## 判定規則

### 雙檔比對（結構差異）

- 固定比對 `jsondata` 的 path/type。
- 缺欄位：`FAIL`
- 型別改變：`FAIL`
- 多欄位：`WARN`
- 支援忽略欄位（預設：`timestamp,_capturedAt,trace_id,token,host`）。

### 單檔驗證（欄位缺失）

- 缺失（`undefined`/`null`）：`FAIL`
- 空值（`''`）：`WARN`
- 其餘有值：`PASS`
