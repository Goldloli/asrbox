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
  supported_devices: ['cpu', 'cuda', 'mps'],
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
  const whisperCard = page.locator('article').filter({ hasText: 'Whisper Base' }).first();
  await expect(whisperCard.getByText('CPU / GPU', { exact: true })).toBeVisible();

  const storagePanel = page.getByRole('heading', { name: 'Model storage' }).locator('xpath=ancestor::section[1]');
  await expect(storagePanel).toContainText('/tmp/asrbox/models');
  await expect(storagePanel).toContainText('21 MB');
  const firstStorageRow = storagePanel.getByText('storage-model-0', { exact: true }).locator('../..');
  const firstStorageRowBox = await firstStorageRow.boundingBox();
  expect(firstStorageRowBox?.height).toBeGreaterThan(44);
});

test('model page expands detailed model intro for a natively diarizing model', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });
  await page.route('**/models/status', (route) => route.fulfill({
    json: {
      models: [
        modelStatus({}),
        modelStatus({
          model_name: 'moss-transcribe-diarize',
          display_name: 'MOSS Transcribe Diarize 0.9B',
          engine: 'moss_transcribe_diarize',
          source: 'modelscope',
          repo_id: 'OpenMOSS-Team/MOSS-Transcribe-Diarize',
          model_size: '0.9b',
          size_mb: 1900,
          supported_devices: ['cpu', 'cuda'],
          supports_diarization: true,
        }),
      ],
    },
  }));
  await page.route('**/models/active-downloads', (route) => route.fulfill({ json: [] }));
  await page.route('**/models/storage', (route) => route.fulfill({
    json: { models_dir: '/tmp/asrbox/models', used_bytes: 0, free_bytes: 0, total_bytes: 0, models: [] },
  }));

  await page.goto('/models');
  await page.getByRole('button', { name: 'Speaker diarization' }).click();

  const card = page.locator('article').filter({ hasText: 'MOSS Transcribe Diarize 0.9B' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Model intro' }).click();

  await expect(card.getByText('Capabilities')).toBeVisible();
  await expect(card.getByText('End-to-end transcription + speaker diarization in one pass')).toBeVisible();
  await expect(card.getByText('Language coverage')).toBeVisible();
  await expect(card.getByText(/50\+ languages/)).toBeVisible();
  await expect(card.getByText('Supported devices')).toBeVisible();
  await expect(card.getByText('CPU', { exact: true })).toBeVisible();
  await expect(card.getByText('NVIDIA GPU', { exact: true })).toBeVisible();
  await expect(card.getByText('The device actually used depends on this computer and the available runtime.')).toBeVisible();
  await expect(card.getByText('Known limitations')).toBeVisible();
});

test('model page keeps the model ladder collapsed, then expands and sorts it predictably', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });
  await page.route('**/models/status', (route) => route.fulfill({
    json: {
      models: [
        modelStatus({ downloaded: true, compatible: true }),
        modelStatus({
          model_name: 'faster-whisper-small',
          display_name: 'Faster Whisper Small',
          engine: 'faster_whisper',
          model_size: 'small',
          supported_devices: ['cpu'],
        }),
        modelStatus({
          model_name: 'mlx-whisper-turbo',
          display_name: 'MLX Whisper Turbo',
          engine: 'mlx_whisper',
          runtime: 'mlx',
          model_size: 'turbo',
          supported_devices: ['mlx'],
        }),
      ],
    },
  }));
  await page.route('**/models/active-downloads', (route) => route.fulfill({ json: [] }));
  await page.route('**/models/storage', (route) => route.fulfill({
    json: { models_dir: '/tmp/asrbox/models', used_bytes: 0, free_bytes: 0, total_bytes: 0, models: [] },
  }));

  await page.goto('/models');

  const ladder = page.getByRole('heading', { name: 'Model ladder' }).locator('xpath=ancestor::section[1]');
  const toggle = ladder.getByRole('button', { name: /Model ladder/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(ladder.getByRole('table')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const table = ladder.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(4);

  const whisperRow = table.getByRole('row', { name: /Whisper Base/ });
  await expect(whisperRow.getByText('A', { exact: true })).toBeVisible();
  await expect(whisperRow.getByText('C', { exact: true })).toBeVisible();
  await expect(whisperRow.getByText('S', { exact: true })).toBeVisible();
  await expect(whisperRow.locator('[title="Downloaded"]')).toHaveCount(1);

  const mlxRow = table.getByRole('row', { name: /MLX Whisper Turbo/ });
  await expect(mlxRow.getByText('A*', { exact: true })).toHaveCount(2);
  await expect(mlxRow.getByText('S*', { exact: true })).toBeVisible();
  await expect(mlxRow.locator('[title="Not downloaded"]')).toHaveCount(1);

  await expect(ladder).toContainText('Windows + RTX 5080');
  await expect(ladder).toContainText('* marks estimates');

  const sort = ladder.getByRole('combobox', { name: 'Sort models by' });
  await sort.click();
  await page.getByRole('option', { name: 'Model name' }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Faster Whisper Small');

  await sort.click();
  await page.getByRole('option', { name: 'Downloaded' }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Whisper Base');

  await sort.click();
  await page.getByRole('option', { name: 'GPU' }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('MLX Whisper Turbo');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  const tableScroll = ladder.getByTestId('model-ladder-table-scroll');
  const scrollMetrics = await tableScroll.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);

  await expect(page.getByRole('heading', { name: 'Performance view' })).toHaveCount(0);
  await expect(page.getByText('Estimated from model metadata', { exact: false })).toHaveCount(0);
});

test('transcription model selector shows compact CPU and GPU support', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });
  await page.route('**/models/status', (route) => route.fulfill({
    json: {
      models: [
        modelStatus({ downloaded: true, compatible: true }),
        modelStatus({
          model_name: 'mlx-whisper-turbo',
          display_name: 'MLX Whisper Turbo',
          engine: 'mlx_whisper',
          runtime: 'mlx',
          supported_devices: ['mlx'],
          downloaded: true,
          compatible: true,
        }),
      ],
    },
  }));

  await page.goto('/');

  const modelField = page.getByText('Model', { exact: true }).locator('..');
  await expect(modelField).toContainText('CPU / GPU');
  await modelField.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: /Whisper Base · CPU \/ GPU/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /MLX Whisper Turbo · GPU only/ })).toBeVisible();
  await expect(modelField.getByText('The device actually used depends on this computer and the available runtime.')).toHaveCount(0);
});

test('downloading model row keeps progress, controls, and real errors on full-width rows', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });
  await page.route('**/models/status', (route) => route.fulfill({
    json: {
      models: [
        modelStatus({
          downloading: true,
          compatible: false,
          compatibility_error: 'Model whisper-base is not downloaded',
          compatibility_error_code: 'model_not_downloaded',
        }),
        modelStatus({
          model_name: 'faster-whisper-small',
          display_name: 'Faster Whisper Small',
          engine: 'faster_whisper',
          model_size: 'small',
          downloading: true,
          download_error: 'temporary network failure',
        }),
      ],
    },
  }));
  await page.route('**/models/active-downloads', (route) => route.fulfill({
    json: [
      { model_name: 'whisper-base', current: 25, total: 100, progress: 25, filename: 'model.safetensors', status: 'downloading', timestamp: new Date().toISOString() },
      { model_name: 'faster-whisper-small', current: 10, total: 100, progress: 10, filename: 'model.bin', status: 'downloading', timestamp: new Date().toISOString() },
    ],
  }));
  await page.route('**/models/storage', (route) => route.fulfill({
    json: { models_dir: '/tmp/asrbox/models', used_bytes: 0, free_bytes: 0, total_bytes: 0, models: [] },
  }));

  await page.goto('/models');

  const downloading = page.locator('[data-testid="model-row"]').filter({ hasText: 'Whisper Base' }).first();
  const rowBox = await downloading.boundingBox();
  const progressBox = await downloading.locator('div.col-span-full').first().boundingBox();
  expect(progressBox?.width).toBeGreaterThan((rowBox?.width ?? 0) * 0.9);
  await expect(downloading.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(downloading.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(downloading.getByText('Model files are not downloaded yet.')).toHaveCount(0);

  const failed = page.locator('[data-testid="model-row"]').filter({ hasText: 'Faster Whisper Small' }).first();
  const failedRowBox = await failed.boundingBox();
  const errorBox = await failed
    .getByText('Details', { exact: true })
    .locator('xpath=ancestor::div[1]')
    .boundingBox();
  expect(errorBox?.width).toBeGreaterThan((failedRowBox?.width ?? 0) * 0.9);
});
