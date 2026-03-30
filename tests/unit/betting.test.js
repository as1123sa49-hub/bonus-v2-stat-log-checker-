/**
 * 下注功能單元測試
 * 測試籌碼拆分算法
 */

const { test, expect } = require('@playwright/test');
const { splitBetAmount } = require('../../helpers/bettingHelper');

test.describe('籌碼拆分功能測試', () => {
  test('籌碼拆分 - 2400 應拆為 2000 + 200 + 200', () => {
    const result = splitBetAmount(2400);
    
    expect(result).toEqual([
      { value: 2000, sprite: 'chip_12' },
      { value: 200, sprite: 'chip_9' },
      { value: 200, sprite: 'chip_9' }
    ]);
    
    const total = result.reduce((sum, chip) => sum + chip.value, 0);
    expect(total).toBe(2400);
  });
  
  test('籌碼拆分 - 5000 應拆為單個 5000', () => {
    const result = splitBetAmount(5000);
    
    expect(result).toEqual([
      { value: 5000, sprite: 'chip_13' }
    ]);
  });
  
  test('籌碼拆分 - 12345 應正確拆分', () => {
    const result = splitBetAmount(12345);
    
    const total = result.reduce((sum, chip) => sum + chip.value, 0);
    expect(total).toBe(12345);
    
    // 檢查第一個籌碼是最大的（貪心算法）
    expect(result[0].value).toBe(10000);
  });
  
  test('籌碼拆分 - 100000 應拆為單個 100000', () => {
    const result = splitBetAmount(100000);
    
    expect(result).toEqual([
      { value: 100000, sprite: 'chip_17' }
    ]);
  });
  
  test('籌碼拆分 - 1 應拆為最小籌碼', () => {
    const result = splitBetAmount(1);
    
    expect(result).toEqual([
      { value: 1, sprite: 'chip_2' }
    ]);
  });
  
  test('籌碼拆分 - 複雜金額 23456', () => {
    const result = splitBetAmount(23456);
    
    const total = result.reduce((sum, chip) => sum + chip.value, 0);
    expect(total).toBe(23456);
    
    console.log('23456 拆分結果:', result.map(c => c.value));
  });
});


