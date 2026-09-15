import { expect, test } from '@playwright/test';

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

const qwen3Model = modelStatus({
  model_name: 'qwen3-asr-0.6b',
  display_name: 'Qwen3 ASR 0.6B',
  engine: 'qwen3_asr',
  repo_id: 'Qwen/Qwen3-ASR-0.6B',
  model_size: '0.6b',
  size_mb: 1200,
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

const stubModels = (page: import('@playwright/test').Page, models: unknown[]) =>
  page.route('**/models/status', (route) => route.fulfill({ json: { models } }));

const stubProviders = (page: import('@playwright/test').Page, items: unknown[]) =>
  page.route('**/providers', (route) => route.fulfill({ json: { items } }));

const stubSettings = (page: import('@playwright/test').Page, settings: Record<string, unknown>) =>
  page.route('**/settings/asr', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: settings });
  });

const field = (scope: import('@playwright/test').Page, label: string) => scope.locator('label').filter({ has: scope.getByText(label, { exact: true }) }).first();

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('transcribe page preselects saved default local model and language', async ({ page }) => {
  await stubSettings(page, asrSettings({ default_model_name: 'qwen3-asr-0.6b' }));
  await stubModels(page, [modelStatus({}), qwen3Model]);
  await stubProviders(page, []);

  await page.goto('/');

  await expect(field(page, 'Backend').getByRole('combobox')).toContainText('Local model');
  await expect(field(page, 'Model').getByRole('combobox')).toContainText('Qwen3 ASR 0.6B');
  await expect(field(page, 'Language').getByRole('combobox')).toContainText('Auto detect');
});

test('transcribe page preselects saved default provider', async ({ page }) => {
  await stubSettings(page, asrSettings({ default_backend: 'provider', default_provider_id: 'prov-1' }));
  await stubModels(page, [modelStatus({})]);
  await stubProviders(page, [{
    id: 'prov-1',
    name: 'Test Online',
    provider_type: 'openai_compatible',
    base_url: 'https://example.com/v1',
    api_key_masked: 'sk-***',
    default_model: 'sensevoice',
    enabled: true,
    options: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }]);

  await page.goto('/');

  await expect(field(page, 'Provider').getByRole('combobox')).toContainText('Test Online');
});

test('transcribe page falls back when the saved default model is unavailable', async ({ page }) => {
  await stubSettings(page, asrSettings({ default_model_name: 'deleted-model', default_language: 'zh' }));
  await stubModels(page, [modelStatus({})]);
  await stubProviders(page, []);

  await page.goto('/');

  await expect(field(page, 'Model').getByRole('combobox')).toContainText('Whisper Base');
  await expect(field(page, 'Language').getByRole('combobox')).toContainText('Chinese Simplified');
});

test('settings page saves default model with linked backend and clears via auto', async ({ page }) => {
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
  await stubModels(page, [modelStatus({}), qwen3Model]);
  await stubProviders(page, [{
    id: 'prov-1',
    name: 'Test Online',
    provider_type: 'openai_compatible',
    base_url: 'https://example.com/v1',
    api_key_masked: 'sk-***',
    default_model: 'sensevoice',
    enabled: true,
    options: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }]);

  const field = (label: string) => page.locator('label').filter({ has: page.getByText(label, { exact: true }) }).first();
  const defaultModelCombo = field('Default model').getByRole('combobox');

  await page.goto('/settings?tab=transcription');
  await expect(defaultModelCombo).toContainText('Auto');

  // Local model: backend is derived and locked while a concrete default is chosen.
  await defaultModelCombo.click();
  await page.getByRole('option', { name: /Qwen3 ASR 0\.6B/ }).click();
  await expect(field('Default backend').getByRole('combobox')).toBeDisabled();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(savedPayloads[0]).toMatchObject({
    default_backend: 'local',
    default_model_name: 'qwen3-asr-0.6b',
    default_provider_id: null,
  });

  // Provider: writes provider backend + provider id, clears the local model.
  await expect(defaultModelCombo).toContainText('Qwen3 ASR 0.6B');
  await defaultModelCombo.click();
  await page.getByRole('option', { name: /Test Online/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => savedPayloads.length).toBe(2);
  expect(savedPayloads[1]).toMatchObject({
    default_backend: 'provider',
    default_provider_id: 'prov-1',
    default_model_name: null,
  });

  // Auto: clears both fields so the fallback chain decides.
  await expect(defaultModelCombo).toContainText('Test Online');
  await defaultModelCombo.click();
  await page.getByRole('option', { name: 'Auto (first available)' }).click();
  await expect(field('Default backend').getByRole('combobox')).toBeEnabled();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => savedPayloads.length).toBe(3);
  expect(savedPayloads[2]).toMatchObject({
    default_model_name: null,
    default_provider_id: null,
  });
});
