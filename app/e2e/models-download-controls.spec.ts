import { expect, test } from '@playwright/test';

const modelStatus = (overrides: Record<string, unknown>) => ({
  model_name: 'whisper-base',
  display_name: 'Whisper Base',
  engine: 'whisper_transformers',
  source: 'huggingface',
  repo_id: 'openai/whisper-base',
  model_size: 'base',
  size_mb: 290,
  languages: ['auto', 'zh', 'en'],
  runtime: 'torch',
  supports_timestamps: true,
  supports_word_timestamps: false,
  supports_diarization: false,
  supports_streaming: false,
  downloaded: false,
  downloading: false,
  loaded: false,
  error: null,
  compatible: null,
  compatibility_error: null,
  download_error: null,
  ...overrides,
});

test('model page shows usable storage rows and download controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });
  await page.route('**/models/status', (route) => route.fulfill({
    json: {
      models: [
        modelStatus({ downloading: true }),
        modelStatus({
          model_name: 'faster-whisper-small',
          display_name: 'Faster Whisper Small',
          engine: 'faster_whisper',
          model_size: 'small',
          download_error: 'temporary network failure',
        }),
      ],
    },
  }));
  await page.route('**/models/active-downloads', (route) => route.fulfill({
    json: [{
      model_name: 'whisper-base',
      current: 25,
      total: 100,
      progress: 25,
      filename: 'model.safetensors',
      status: 'downloading',
      timestamp: new Date().toISOString(),
    }],
  }));
  await page.route('**/models/storage', (route) => route.fulfill({
    json: {
      models_dir: '/tmp/asrbox/models',
      used_bytes: 21 * 1024 * 1024,
      free_bytes: 374 * 1024 * 1024 * 1024,
      total_bytes: 926 * 1024 * 1024 * 1024,
      models: Array.from({ length: 14 }, (_, index) => ({
        model_name: `storage-model-${index}`,
        path: `/tmp/asrbox/models/storage-model-${index}`,
        size_bytes: (index + 1) * 1024,
      })),
    },
  }));

  await page.goto('/models');

  const downloadsPanel = page.getByRole('heading', { name: 'Download tasks' }).locator('xpath=ancestor::section[1]');
  await expect(downloadsPanel.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(downloadsPanel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

  const storagePanel = page.getByRole('heading', { name: 'Model storage' }).locator('xpath=ancestor::section[1]');
  await expect(storagePanel).toContainText('/tmp/asrbox/models');
  await expect(storagePanel).toContainText('21 MB');
  const firstStorageRow = storagePanel.getByText('storage-model-0', { exact: true }).locator('../..');
  const firstStorageRowBox = await firstStorageRow.boundingBox();
  expect(firstStorageRowBox?.height).toBeGreaterThan(44);
});
