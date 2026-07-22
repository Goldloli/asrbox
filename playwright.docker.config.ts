import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './app/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.ASRBOX_DOCKER_URL ?? 'http://127.0.0.1:17504',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
