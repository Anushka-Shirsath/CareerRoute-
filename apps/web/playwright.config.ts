import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 240000, expect: {timeout:45000}, workers: 1,
  use: { baseURL: process.env.WEB_URL || 'http://127.0.0.1:3000', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  reporter: [['list']],
});
