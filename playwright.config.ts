import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './app/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'en-US',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'ASRBOX_DATA_DIR=/tmp/asrbox-playwright-data ASRBOX_FFMPEG_PATH=$PWD/third_party/ffmpeg/darwin-arm64/ffmpeg ASRBOX_FFPROBE_PATH=$PWD/third_party/ffmpeg/darwin-arm64/ffprobe .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 17496',
      url: 'http://127.0.0.1:17496/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'bun run dev:web',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
