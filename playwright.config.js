import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  outputDir: 'reports/results',
  use: {
    headless: false, // 顯示瀏覽器畫面
    viewport: { width: 1280, height: 720 }, 
    ignoreHTTPSErrors: true,
    contextOptions: {
      // 全局無痕設定
      storageState: undefined, // 每次都是乾淨 session
    },
  },
});