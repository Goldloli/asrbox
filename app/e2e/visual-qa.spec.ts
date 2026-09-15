import { test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  filename: '产品访谈_0914.m4a',
  source: '/tmp/interview.m4a',
  audio_path: '/tmp/interview.m4a',
  source_kind: 'managed',
  status: 'completed',
  progress: 1,
  language: 'zh',
  model_name: 'qwen3-asr-0.6b',
  provider_id: null,
  duration_ms: 42_160,
  text: '大家好，欢迎收听。本地化不仅意味着更安全，也能在没有网络的环境下正常工作。好的，那我们现在开始吧。',
  error: null,
  error_code: null,
  options: {},
  segments: [
    { id: 1, start: 0, end: 15, text: '大家好，欢迎收听。', speaker: '1' },
    { id: 2, start: 15, end: 30, text: '本地化不仅意味着更安全，也能在离线环境下正常工作。', speaker: '2' },
    { id: 3, start: 30, end: 42.16, text: '好的，那我们现在开始吧。', speaker: '1' },
  ],
  created_at: '2026-09-14T10:28:00Z',
  updated_at: '2026-09-14T10:30:00Z',
  completed_at: '2026-09-14T10:30:00Z',
  batch_id: null,
  ...overrides,
});

const modelStatus = (overrides: Record<string, unknown>) => ({
  model_name: 'whisper-large-v3-turbo',
  display_name: 'Whisper Large v3 Turbo',
  engine: 'whisper_transformers',
  source: 'huggingface',
  repo_id: 'openai/whisper-large-v3-turbo',
  model_size: 'large-v3-turbo',
  size_mb: 1600,
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
const ollamaModel = modelStatus({
  model_name: 'qwen3:8b-ollama',
  display_name: 'Qwen3 8B (Ollama)',
  engine: 'ollama',
  repo_id: 'ollama/qwen3:8b',
  model_size: '8b',
  size_mb: 5200,
});

async function setup(page: Page, { theme }: { theme: 'light' | 'dark' }) {
  await page.addInitScript(({ url, theme }) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
    localStorage.setItem('asrbox-ui', JSON.stringify({ state: { theme, sidebarMode: 'expanded', locale: 'zh' }, version: 0 }));
  }, { url: serverUrl, theme });
  await page.route('**/tasks', (route) => {
    const type = route.request().resourceType();
    if (type !== 'fetch' && type !== 'xhr') return route.fallback();
    return route.fulfill({ json: { items: [task()], total: 1 } });
  });
  await page.route('**/tasks/task-1/diagnostics', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/logs', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/versions', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/quality', (route) => route.fulfill({ json: { task_id: 'task-1', warnings: [], metrics: {} } }));
  await page.route('**/models/status', (route) => route.fulfill({ json: { models: [modelStatus({}), qwen3Model, ollamaModel] } }));
  await page.route('**/providers', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/settings/asr', (route) => route.fulfill({ json: {
    id: 1, default_backend: 'local', default_model_name: 'qwen3-asr-0.6b', default_provider_id: null,
    default_language: 'auto', timestamps: true, word_timestamps: false, diarization: false, vad: true,
    output_formats: ['txt', 'srt'], max_concurrent_local_tasks: 1, max_concurrent_provider_tasks: 2,
    ffmpeg_path: null, ffprobe_path: null,
  } }));
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('light and dark captures', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setup(page, { theme });
      await page.goto('/');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/qa/${theme}-home.png`, fullPage: false });

      await page.goto('/tasks');
      await page.getByText('产品访谈_0914.m4a').first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/qa/${theme}-task-center.png` });

      await page.goto('/models');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/qa/${theme}-models.png` });

      await page.goto('/settings?tab=general');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/qa/${theme}-settings-general.png` });

      await page.goto('/ai');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/qa/${theme}-ai.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/qa/${theme}-home-390.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test('accent colors apply immediately', async ({ page }) => {
    await setup(page, { theme: 'light' });
    await page.goto('/settings?tab=general');
    for (const accent of ['blue', 'green', 'gray']) {
      await page.getByTestId('accent-color-picker').getByRole('radio', { name: accent }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/qa/accent-${accent}.png` });
    }
    const htmlAccent = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
    if (htmlAccent !== 'gray') throw new Error(`data-accent not applied: ${htmlAccent}`);
  });

