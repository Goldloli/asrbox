import { expect, test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

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
  supported_devices: ['cpu', 'cuda'],
  supports_timestamps: true,
  supports_word_timestamps: false,
  supports_diarization: false,
  supports_streaming: false,
  downloaded: true,
  downloading: false,
  loaded: false,
  error: null,
  compatible: true,
  compatibility_error: null,
  download_error: null,
  ...overrides,
});

const baseModel = modelStatus({});
const qwen3Model = modelStatus({
  model_name: 'qwen3-asr-0.6b',
  display_name: 'Qwen3 ASR 0.6B',
  engine: 'qwen3_asr',
  repo_id: 'Qwen/Qwen3-ASR-0.6B',
  model_size: '0.6b',
  size_mb: 1200,
});
const largeModel = modelStatus({
  model_name: 'whisper-large-v3-turbo',
  display_name: 'Whisper Large v3 Turbo',
  repo_id: 'openai/whisper-large-v3-turbo',
  model_size: 'large-v3-turbo',
  size_mb: 1600,
});

const asrSettings = (overrides: Record<string, unknown>) => ({
  id: 1,
  default_backend: 'local',
  default_model_name: null,
  default_provider_id: null,
  default_language: 'auto',
  timestamps: true,
  word_timestamps: false,
  diarization: false,
  vad: true,
  output_formats: ['txt', 'srt'],
  max_concurrent_local_tasks: 1,
  max_concurrent_provider_tasks: 2,
  ffmpeg_path: null,
  ffprobe_path: null,
  ...overrides,
});

const refetchSettingsViaWindowFocus = async (page: Page) => {
  // React Query refetches active queries on the hidden -> visible transition,
  // which is how a saved default changed "in the background" reaches the page.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    window.dispatchEvent(new Event('visibilitychange'));
  });
};

const field = (page: Page, label: string) => page.locator('label').filter({ has: page.getByText(label, { exact: true }) }).first();

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route('**/providers', (route) => route.fulfill({ json: { items: [] } }));
});

test('model management set-as-default writes the authoritative setting and home adopts it', async ({ page }) => {
  const savedPayloads: Array<Record<string, unknown>> = [];
  let current = asrSettings({});
  await page.route('**/settings/asr', (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      savedPayloads.push(payload);
      current = asrSettings(payload);
      return route.fulfill({ json: current });
    }
    return route.fulfill({ json: current });
  });
  await page.route('**/models/status', (route) => route.fulfill({ json: { models: [baseModel, qwen3Model] } }));

  await page.goto('/models');
  const qwenRow = page.getByTestId('model-row').filter({ hasText: 'Qwen3 ASR 0.6B' });
  await qwenRow.getByRole('button', { name: 'Set as default' }).click();

  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(savedPayloads[0]).toMatchObject({
    default_backend: 'local',
    default_model_name: 'qwen3-asr-0.6b',
    default_provider_id: null,
  });

  await page.goto('/');
  await expect(field(page, 'Backend').getByRole('combobox')).toContainText('Local model');
  await expect(field(page, 'Model').getByRole('combobox')).toContainText('Qwen3 ASR 0.6B');
});

test('home keeps a manually selected model when the saved default changes in the background', async ({ page }) => {
  let current = asrSettings({ default_model_name: 'whisper-base' });
  await page.route('**/settings/asr', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: current });
  });
  await page.route('**/models/status', (route) =>
    route.fulfill({ json: { models: [baseModel, qwen3Model, largeModel] } }));

  await page.goto('/');
  const modelCombo = field(page, 'Model').getByRole('combobox');
  await expect(modelCombo).toContainText('Whisper Base');

  await modelCombo.click();
  await page.getByRole('option', { name: /Qwen3 ASR 0\.6B/ }).click();
  await expect(modelCombo).toContainText('Qwen3 ASR 0.6B');

  current = asrSettings({ default_model_name: 'whisper-large-v3-turbo' });
  await refetchSettingsViaWindowFocus(page);

  await expect(modelCombo).toContainText('Qwen3 ASR 0.6B');
  await expect(modelCombo).not.toContainText('Whisper Large v3 Turbo');
});

test('a fresh home draft adopts the default saved while the page was closed', async ({ page }) => {
  let current = asrSettings({ default_model_name: 'whisper-base' });
  await page.route('**/settings/asr', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: current });
  });
  await page.route('**/models/status', (route) =>
    route.fulfill({ json: { models: [baseModel, qwen3Model, largeModel] } }));

  await page.goto('/');
  await expect(field(page, 'Model').getByRole('combobox')).toContainText('Whisper Base');

  current = asrSettings({ default_model_name: 'whisper-large-v3-turbo' });
  await page.reload();
  await expect(field(page, 'Model').getByRole('combobox')).toContainText('Whisper Large v3 Turbo');
});
