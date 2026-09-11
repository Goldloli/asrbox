import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isWindows = process.platform === 'win32';
const root = path.resolve(__dirname);
const venvPython = isWindows
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python');
const ffmpegDir = path.join(root, 'third_party', 'ffmpeg', isWindows ? 'win32-x64' : 'darwin-arm64');
const ffmpegPath = path.join(ffmpegDir, isWindows ? 'ffmpeg.exe' : 'ffmpeg');
const ffprobePath = path.join(ffmpegDir, isWindows ? 'ffprobe.exe' : 'ffprobe');

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
      command: `"${venvPython}" -m uvicorn backend.main:app --host 127.0.0.1 --port 17496`,
      env: {
        ASRBOX_DATA_DIR: path.join(os.tmpdir(), 'asrbox-playwright-data'),
        ASRBOX_FFMPEG_PATH: ffmpegPath,
        ASRBOX_FFPROBE_PATH: ffprobePath,
      },
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
