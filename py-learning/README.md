# Python 學習指南

## 📚 學習檔案

- `step-01-basic.py` - 第 1 課：最基礎的東西（變數、計算、印出）

## 🔄 JavaScript vs Python 對照表

### 基本語法差異

| JavaScript | Python | 說明 |
|-----------|--------|------|
| `const name = "小明"` | `name = "小明"` | Python 不需要宣告關鍵字 |
| `let age = 25` | `age = 25` | Python 沒有 const/let，直接賦值 |
| `console.log("Hello")` | `print("Hello")` | 印出東西的方式 |
| `"Hello" + name` | `f"Hello {name}"` | 字串連接（Python 推薦用 f-string） |
| `100 + 50` | `100 + 50` | 計算方式相同 |
| `100 / 2` | `100 / 2` | 除法（Python 3 會得到小數） |
| - | `100 // 2` | Python 的整數除法 |
| `100 % 3` | `100 % 3` | 取餘數（相同） |
| `;` | 不需要 | Python 不需要分號 |
| `{}` | 縮排（4 空格） | Python 用縮排表示程式區塊 |

### 命名習慣

| JavaScript | Python | 說明 |
|-----------|--------|------|
| `myName` | `my_name` | JavaScript 用駝峰式，Python 用底線 |
| `testConfig` | `test_config` | 變數命名習慣不同 |
| `TEST_CONFIG` | `TEST_CONFIG` | 常數都用大寫（習慣上） |

### 字串格式化

**JavaScript:**
```javascript
const name = "小明";
console.log("我的名字是：", name);
console.log(`我的名字是：${name}`);  // 模板字串
```

**Python:**
```python
name = "小明"
print("我的名字是：", name)
print(f"我的名字是：{name}")  # f-string（推薦）
```

### 數字計算

**JavaScript:**
```javascript
const a = 10;
const b = 20;
const result = a + b;  // 30
const divide = b / a;   // 2
```

**Python:**
```python
a = 10
b = 20
result = a + b      # 30
divide = b / a      # 2.0（小數）
divide_int = b // a # 2（整數除法）
```

## 🎯 學習順序建議

1. **第 1 課**：變數、計算、印出（`step-01-basic.py`）
2. **第 2 課**：列表和字典（類似 JavaScript 的陣列和物件）
3. **第 3 課**：條件判斷（if/else）
4. **第 4 課**：迴圈（for/while）
5. **第 5 課**：函數（function）

## 💡 重要提醒

1. **縮排很重要**：Python 用縮排（4 個空格）來表示程式區塊，不是大括號
2. **不需要分號**：每行結束不需要 `;`
3. **變數命名**：習慣用底線 `my_name`，不是駝峰式 `myName`
4. **字串格式化**：推薦用 f-string `f"Hello {name}"`
5. **除法**：`/` 會得到小數，`//` 是整數除法

## 🚀 執行方式

```bash
# 執行 Python 檔案
python py-learning/step-01-basic.py

# 或使用 python3（某些系統）
python3 py-learning/step-01-basic.py
```

## 📝 練習建議

1. 先看範例，理解概念
2. 自己寫練習題
3. 執行看看結果對不對
4. 如果出錯，看錯誤訊息，慢慢改
5. 對照 JavaScript 版本，理解差異

## 🔍 常見錯誤

1. **縮排錯誤**：記得用 4 個空格，不要混用 Tab
2. **忘記冒號**：if/for/def 後面要加 `:`
3. **型別錯誤**：文字和數字不能直接相加，要先轉換
4. **變數命名**：Python 習慣用底線，不是駝峰式



