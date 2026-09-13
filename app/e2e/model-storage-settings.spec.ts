import { expect, test } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('docker web shows allowlisted model-storage mounts and container path actions', async ({ page }) => {
  await page.route(`${serverUrl}/models/storage`, (route) => route.fulfill({ json: {
    root: '/data',
    models_dir: '/data/models',
    status: 'available',
    reason: null,
    detail: null,
    available: true,
    writable: true,
    cache_dirs: { huggingface: '/data/cache/huggingface', modelscope: '/data/cache/modelscope', torch: '/data/cache/torch', xdg: '/data/cache/xdg' },
    cache_usage: [{ name: 'huggingface', path: '/data/cache/huggingface', size_bytes: 1024, shared: false, selected: true }],
    cache_bytes: 1024,
    allowed_roots: ['/data', '/model-storage'],
    root_locked: false,
    runtime: 'container',
    network_filesystem: false,
    filesystem_type: 'ext4',
    total_bytes: 100_000,
    used_bytes: 2048,
    free_bytes: 90_000,
    models: [],
    total_size_mb: 0,
    free_disk_bytes: 90_000,
  } }));
  await page.route(`${serverUrl}/models/storage/relocation`, (route) => route.fulfill({ json: {
    status: 'idle', phase: 'idle', copied_bytes: 0, total_bytes: 0, progress: 0, warnings: [], conflicts: [], cleanup_required: false, cleanup_paths: [],
  } }));

  await page.goto('/settings?tab=storage');

  const panel = page.getByRole('heading', { name: 'Model storage location' }).locator('xpath=ancestor::section[1]');
  await expect(panel).toContainText('/data');
  await expect(panel.getByRole('button', { name: 'Copy path' })).toBeVisible();
  await panel.getByRole('button', { name: 'Change location' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Allowed container mount');
  await dialog.getByRole('combobox').first().click();
  await expect(page.getByRole('option', { name: '/model-storage' })).toBeVisible();
});

test('model page reports unavailable storage without offering download', async ({ page }) => {
  await page.route(`${serverUrl}/models/status`, (route) => route.fulfill({ json: { models: [{
    model_name: 'whisper-base', display_name: 'Whisper Base', engine: 'whisper_transformers', source: 'huggingface', model_size: 'base', size_mb: 290,
    languages: ['auto'], runtime: 'torch', supported_devices: ['cpu'], supports_timestamps: true, supports_word_timestamps: false, supports_diarization: false, supports_streaming: false,
    downloaded: null, downloading: false, loaded: false, storage_status: 'unavailable', storage_error: '模型存储位置不可用',
  }] } }));
  await page.route(`${serverUrl}/models/active-downloads`, (route) => route.fulfill({ json: [] }));
  await page.route(`${serverUrl}/models/storage`, (route) => route.fulfill({ json: {
    root: '/model-storage', models_dir: '/model-storage/models', status: 'unavailable', available: false, writable: false,
    cache_dirs: {}, cache_usage: [], cache_bytes: 0, allowed_roots: ['/data', '/model-storage'], root_locked: false, runtime: 'container',
    network_filesystem: false, used_bytes: 0, models: [], total_size_mb: 0,
  } }));

  await page.goto('/models');
  await expect(page.getByText('Model storage location unavailable').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeDisabled();
});

test('model-storage settings remain within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings?tab=storage');

  const panel = page.getByRole('heading', { name: 'Model storage location' }).locator('xpath=ancestor::section[1]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(panel.getByRole('button', { name: 'Copy path' })).toBeVisible();
});
