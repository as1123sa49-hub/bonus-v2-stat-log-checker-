# 日誌管理工具使用指南

## 概述

`src/utils/logger.js` 提供統一的日誌管理功能，支援不同類型的日誌輸出，並可根據遊戲類型自訂格式。

## 基本使用

```javascript
const logger = require('../../src/utils/logger');

// 基本日誌
logger.success('操作成功');
logger.error('操作失敗');
logger.warning('警告訊息');
logger.info('資訊訊息');

// 業務邏輯日誌
logger.betting('下注成功');
logger.payout('派彩完成');
logger.roadmap('路書讀取完成');
logger.electronicDice('電子骰結果');
logger.jackpot('獎池資訊');
logger.roulette('轉盤結果');
logger.scratch('刮刮樂結果');

// 未來新增的測試類型
logger.gift('送禮成功');
logger.chat('發話成功');
logger.undo('下注取消成功');
logger.x2('X2下注成功');

// 其他日誌
logger.stats('統計資訊');
logger.calc('計算結果');
logger.detect('偵測結果');
logger.room('房間操作');
logger.wallet('錢包變化');
```

## 多行日誌

```javascript
logger.multiLine('betting', [
  '實際下注: 50',
  '派彩: 100.00',
  '賠率: 2.00x (含本金) / 1.00x (不含本金)'
], {
  header: 'Yellow (黃) (801):',
  footer: ''
});
```

## 縮排控制

```javascript
logger.info('開始處理');
logger.indent(); // 增加縮排
logger.info('步驟 1');
logger.info('步驟 2');
logger.unindent(); // 減少縮排
logger.info('處理完成');
```

## 配置

```javascript
// 設定日誌配置
logger.setConfig({
  enabled: true,        // 是否啟用日誌
  showTimestamp: false, // 是否顯示時間戳
  showType: true,       // 是否顯示類型標籤
  indent: 0            // 初始縮排
});
```

## 遷移範例

### 舊代碼
```javascript
console.log(`✅ 下注成功: ${area} ${amount}`);
console.log(`💰 派彩: ${payout}`);
console.log(`🎲 電子骰結果: ${result}`);
```

### 新代碼
```javascript
const logger = require('../../src/utils/logger');

logger.betting(`下注成功: ${area} ${amount}`);
logger.payout(`派彩: ${payout}`);
logger.electronicDice(`電子骰結果: ${result}`);
```

## 向後兼容

如果需要保持向後兼容，可以使用 `logger.raw()`：

```javascript
logger.raw('原始日誌輸出'); // 等同於 console.log
```

## 未來擴展

當新增測試類型時，只需在 `logger.js` 中：
1. 在 `LogType` 中新增類型
2. 在 `LogIcons` 中新增圖示
3. 在 `logger` 物件中新增便利函數

例如，新增「快速下注」測試：

```javascript
// 在 LogType 中新增
QUICK_BET: 'quick_bet',

// 在 LogIcons 中新增
[LogType.QUICK_BET]: '⚡',

// 在 logger 物件中新增
quickBet: (msg, opts) => log(LogType.QUICK_BET, msg, opts),
```

