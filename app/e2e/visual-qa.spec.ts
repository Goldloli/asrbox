import { expect, test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  filename: '产品访谈_0914.m4a',
  source: '/tmp/interview.m4a',
  audio_path: '/tmp/interview.m4a',
  source_kind: 'managed',
  status: 'completed',
  progress: 100,
  language: 'zh',
  model_name: 'qwen3-asr-0.6b',
  provider_id: null,
  duration_ms: 42_160,
  text: '大家好，欢迎收听。智能手机改变了支付方式。我们也观察到，越来越多的用户开始关注数据隐私和本地处理。本地化不仅意味着更安全，也能在没有网络的环境下正常工作。接下来我们会演示一个真实的使用场景。好的，那我们现在开始吧。',
  error: null,
  error_code: null,
  options: {},
  segments: [
    { id: 1, start: 0, end: 7, text: '大家好，欢迎收听。', speaker: '1' },
    { id: 2, start: 7, end: 14, text: '智能手机改变了支付方式。', speaker: '2' },
    { id: 3, start: 14, end: 21, text: '我们也观察到，越来越多的用户开始关注数据隐私和本地处理。', speaker: '1' },
    { id: 4, start: 21, end: 28, text: '本地化不仅意味着更安全，也能在没有网络的环境下正常工作。', speaker: '2' },
    { id: 5, start: 28, end: 35, text: '接下来我们会演示一个真实的使用场景。', speaker: '1' },
    { id: 6, start: 35, end: 42.16, text: '好的，那我们现在开始吧。', speaker: '2' },
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
  engine: 'transformers_speech_lm',
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
const mlxModel = modelStatus({
  model_name: 'mlx-whisper-turbo', display_name: 'MLX Whisper Turbo', engine: 'mlx_whisper', runtime: 'mlx',
  repo_id: 'mlx-community/whisper-large-v3-turbo', model_size: 'large-v3-turbo', size_mb: 1200,
  supported_devices: ['mps'],
});
const senseVoiceModel = modelStatus({
  model_name: 'sensevoice-small', display_name: 'SenseVoice Small', engine: 'sensevoice', repo_id: 'FunAudioLLM/SenseVoiceSmall',
  model_size: 'small', size_mb: 800, downloaded: false, supported_devices: ['cpu', 'mps'],
});
const fasterModel = modelStatus({
  model_name: 'faster-whisper-medium', display_name: 'Faster Whisper Medium', engine: 'faster_whisper',
  repo_id: 'Systran/faster-whisper-medium', model_size: 'medium', size_mb: 1100, downloaded: false,
});

const llmProvider = {
  id: 'openai', name: 'OpenAI', preset: 'openai', base_url: 'https://api.openai.com/v1',
  api_key_masked: 'sk-...test', default_model: 'gpt-5.4-mini', enabled: true, is_local: false,
  compatibility: {},
  created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
};

const llmProviders = [
  llmProvider,
  { ...llmProvider, id: 'ollama', name: 'Ollama 本地服务', preset: 'ollama', base_url: 'http://127.0.0.1:11434/v1', api_key_masked: null, default_model: 'qwen3:8b', is_local: true },
  { ...llmProvider, id: 'deepseek', name: 'DeepSeek', preset: 'deepseek', base_url: 'https://api.deepseek.com', api_key_masked: 'sk-...demo', default_model: 'deepseek-chat' },
];

const asrProviders = [
  { id: 'aliyun-asr', name: '阿里云 Paraformer', provider_type: 'aliyun', base_url: 'https://dashscope.aliyuncs.com', api_key_masked: 'sk-...demo', default_model: 'paraformer-v2', enabled: true, options: {}, created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z' },
  { id: 'openai-asr', name: 'OpenAI Whisper API', provider_type: 'openai-compatible', base_url: 'https://api.openai.com/v1', api_key_masked: 'sk-...test', default_model: 'whisper-1', enabled: true, options: {}, created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z' },
  { id: 'custom-asr', name: '公司内部 ASR', provider_type: 'custom', base_url: 'https://asr.example.com/v1', api_key_masked: 'key-...demo', default_model: 'asr-pro', enabled: false, options: {}, created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z' },
];

const proofreadingRun = {
  id: 'visual-proofreading-run', task_id: 'task-1', source_version_id: 1,
  llm_provider_id: 'openai', provider_name: 'OpenAI', provider_preset: 'openai', model_name: 'gpt-5.4-mini',
  status: 'completed', total_batches: 1, completed_batches: 1, error_code: null, error: null, stale: false,
  suggestions: [
    { id: 1, segment_id: 1, original_text: '大家好，欢迎收听。', suggested_text: '大家好，欢迎收听！', reason: '优化标点', resolution: 'pending' },
    { id: 2, segment_id: 2, original_text: '智能手机改变了支付方式。', suggested_text: '智能手机已经改变了支付方式。', reason: '补充语气', resolution: 'pending' },
    { id: 3, segment_id: 3, original_text: '越来越多的用户开始关注数据隐私和本地处理。', suggested_text: '越来越多用户开始关注数据隐私与本地处理。', reason: '表达精简', resolution: 'pending' },
    { id: 4, segment_id: 4, original_text: '本地化不仅意味着更安全。', suggested_text: '本地处理不仅意味着更安全。', reason: '指代明确', resolution: 'pending' },
    { id: 5, segment_id: 5, original_text: '接下来我们会演示一个真实的使用场景。', suggested_text: '接下来，我们将演示一个真实使用场景。', reason: '语句优化', resolution: 'pending' },
    { id: 6, segment_id: 6, original_text: '好的，那我们现在开始吧。', suggested_text: '好的，我们现在开始。', reason: '表达简洁', resolution: 'pending' },
  ],
  created_at: '2026-09-14T10:31:00Z', updated_at: '2026-09-14T10:34:00Z', completed_at: '2026-09-14T10:34:00Z', applied_at: null,
};

const translationRun = {
  id: 'visual-translation-run', task_id: 'task-1', source_version_id: 1,
  source_language: { kind: 'preset', code: 'zh-Hans' }, target_language: { kind: 'preset', code: 'en' },
  source_is_current: true, llm_provider_id: 'openai', provider_name: 'OpenAI', provider_preset: 'openai', model_name: 'gpt-5.4-mini',
  status: 'completed', attempt: 1, total_batches: 1, completed_batches: 1, total_segments: 6, completed_segments: 6,
  latest_translation_version_id: 1, can_retry: false, can_edit: true, can_export: true, error_code: null, error: null,
  created_at: '2026-09-14T10:31:00Z', updated_at: '2026-09-14T10:34:00Z', completed_at: '2026-09-14T10:34:00Z',
};

const translationVersion = {
  id: 1, run_id: translationRun.id, revision: 1, version_type: 'translate', parent_version_id: null,
  source_version_id: 1, source_language: translationRun.source_language, target_language: translationRun.target_language,
  created_at: translationRun.completed_at,
  segments: task().segments.map((segment, index: number) => ({
    id: segment.id, start: segment.start, end: segment.end, speaker: segment.speaker,
    source_text: segment.text,
    text: [
      'Hello everyone, and welcome.',
      'Smartphones have changed the way we pay.',
      'More users are paying attention to data privacy and on-device processing.',
      'Local processing is safer and continues to work without a network.',
      'Next, we will demonstrate a real use case.',
      'All right, let us begin.',
    ][index],
  })),
};

const chatSession = {
  id: 'visual-chat-session', task_id: 'task-1', provider_id: 'openai', title: '隐私与本地处理',
  created_at: '2026-09-14T10:31:00Z', updated_at: '2026-09-14T10:34:00Z',
  messages: [
    { id: 1, session_id: 'visual-chat-session', role: 'user', content: '这次访谈中提到了哪些隐私与本地处理优势？', status: 'complete', created_at: '2026-09-14T10:32:00Z' },
    { id: 2, session_id: 'visual-chat-session', role: 'assistant', content: '访谈强调了三点：数据留在本机、离线可用，以及用户对数据始终保持控制。', status: 'complete', created_at: '2026-09-14T10:33:00Z' },
  ],
};

const visualTasks = [
  task(),
  task({ id: 'task-2', filename: 'Quinn Guides.mp4', duration_ms: 1_803_000, created_at: '2026-09-08T06:07:00Z', updated_at: '2026-09-08T06:37:00Z' }),
  task({ id: 'task-3', filename: 'demo-zh-tech.wav', duration_ms: 57_000, created_at: '2026-09-12T12:27:00Z', updated_at: '2026-09-12T12:28:00Z' }),
  task({ id: 'task-4', filename: '会议记录_0908.m4a', duration_ms: 4_354_000, created_at: '2026-09-08T16:05:00Z', updated_at: '2026-09-08T17:18:00Z' }),
  task({ id: 'task-5', filename: '采访_技术趋势.mp3', duration_ms: 1_697_000, created_at: '2026-09-07T09:03:00Z', updated_at: '2026-09-07T09:31:00Z' }),
  task({ id: 'task-6', filename: '用户访谈_A01.wav', duration_ms: 965_000, created_at: '2026-09-05T11:20:00Z', updated_at: '2026-09-05T11:36:00Z' }),
];

function makeToneWav() {
  const sampleRate = 8000;
  const sampleCount = Math.round(sampleRate * 42.16);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const seconds = index / sampleRate;
    const envelope = 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(seconds * 1.9)) + 0.25 * Math.sin(seconds * 0.47) ** 2;
    buffer.writeInt16LE(Math.round(Math.sin(index / 8) * envelope * 18000), 44 + index * 2);
  }
  return buffer;
}

async function setup(page: Page, { theme }: { theme: 'light' | 'dark' }) {
  await page.addInitScript(({ url, theme }) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
    localStorage.setItem('asrbox-ui', JSON.stringify({ state: { theme, sidebarMode: 'expanded', locale: 'zh' }, version: 0 }));
  }, { url: serverUrl, theme });
  await page.route('**/tasks', (route) => {
    const type = route.request().resourceType();
    if (type !== 'fetch' && type !== 'xhr') return route.fallback();
    return route.fulfill({ json: { items: visualTasks, total: visualTasks.length } });
  });
  await page.route('**/tasks/*/audio*', (route) => route.fulfill({ contentType: 'audio/wav', body: makeToneWav() }));
  await page.route('**/tasks/task-1/diagnostics', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/logs', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/versions', (route) => route.fulfill({ json: [] }));
  await page.route('**/tasks/task-1/quality', (route) => route.fulfill({ json: { task_id: 'task-1', warnings: [], metrics: {} } }));
  await page.route('**/models/status', (route) => route.fulfill({ json: { models: [modelStatus({}), mlxModel, qwen3Model, senseVoiceModel, fasterModel, ollamaModel] } }));
  await page.route('**/providers', (route) => route.fulfill({ json: { items: asrProviders } }));
  await page.route('**/llm-providers', (route) => route.fulfill({ json: { items: llmProviders } }));
  await page.route('**/llm-providers/presets', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/tasks/task-1/proofreading-runs', (route) => route.fulfill({ json: { items: [proofreadingRun] } }));
  await page.route('**/tasks/task-1/translation-runs', (route) => route.fulfill({ json: { items: [translationRun] } }));
  await page.route('**/tasks/task-1/translation-runs/visual-translation-run/versions', (route) => route.fulfill({ json: { items: [translationVersion] } }));
  await page.route('**/tasks/task-1/translation-runs/visual-translation-run/versions/1', (route) => route.fulfill({ json: translationVersion }));
  await page.route('**/chat/sessions', (route) => route.fulfill({ json: { items: [chatSession] } }));
  await page.route('**/chat/sessions/visual-chat-session', (route) => route.fulfill({ json: chatSession }));
  await page.route('**/tasks/task-1/versions', (route) => route.fulfill({ json: [{
    id: 1, task_id: 'task-1', version_type: 'transcribe', text: visualTasks[0].text,
    segments: visualTasks[0].segments, created_at: visualTasks[0].completed_at,
  }] }));
  await page.route('**/settings/asr', (route) => route.fulfill({ json: {
    id: 1, default_backend: 'local', default_model_name: 'qwen3-asr-0.6b', default_provider_id: null,
    default_language: 'auto', timestamps: true, word_timestamps: false, diarization: false, vad: true,
    output_formats: ['txt', 'srt'], max_concurrent_local_tasks: 1, max_concurrent_provider_tasks: 2,
    ffmpeg_path: null, ffprobe_path: null,
  } }));
  await page.setViewportSize({ width: 1487, height: 1058 });
}

async function expectNoLayoutOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    escapedPanels: Array.from(document.querySelectorAll<HTMLElement>('.app-panel'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      })
      .filter((rect) => rect.left < -1 || rect.right > document.documentElement.clientWidth + 1),
  }));
  expect(result.documentWidth, `document width ${result.documentWidth}px exceeds viewport ${result.viewportWidth}px`).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.escapedPanels).toEqual([]);
}

test('light and dark captures', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setup(page, { theme });
      await page.goto('/');
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-home.png`, fullPage: false });

      await page.goto('/tasks');
      await page.setViewportSize({ width: 1586, height: 992 });
      await page.getByText('产品访谈_0914.m4a').first().click();
      await page.getByTestId('task-center-list').waitFor();
      await page.getByTestId('task-center-detail').waitFor();
      await page.getByTestId('task-center-inspector').waitFor();
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      const taskColumns = await Promise.all([
        page.getByTestId('task-center-list').boundingBox(),
        page.getByTestId('task-center-detail').boundingBox(),
        page.getByTestId('task-center-inspector').boundingBox(),
      ]);
      expect(taskColumns.every(Boolean)).toBe(true);
      expect(taskColumns[0]!.x + taskColumns[0]!.width).toBeLessThanOrEqual(taskColumns[1]!.x + 1);
      expect(taskColumns[1]!.x + taskColumns[1]!.width).toBeLessThanOrEqual(taskColumns[2]!.x + 1);
      await page.screenshot({ path: `test-results/qa/${theme}-task-center.png` });

      await page.setViewportSize({ width: 1487, height: 1058 });
      await page.goto('/models');
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-models.png` });
      await page.getByRole('button', { name: /展开|Expand/ }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/qa/${theme}-models-ladder.png` });

      await page.goto('/settings?tab=general');
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-settings-general.png` });
      for (const tab of ['transcription', 'acceleration', 'providers', 'llm', 'storage', 'about']) {
        await page.goto(`/settings?tab=${tab}`);
        await page.waitForTimeout(500);
        await expectNoLayoutOverflow(page);
        await page.screenshot({ path: `test-results/qa/${theme}-settings-${tab}.png` });
      }

      await page.goto('/ai');
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-ai.png` });

      await page.goto('/ai?task=task-1&mode=translation&run=visual-translation-run');
      await page.waitForTimeout(600);
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-ai-translation.png` });

      await page.goto('/ai?mode=chat');
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '隐私与本地处理' }).click();
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectNoLayoutOverflow(page);
      await page.screenshot({ path: `test-results/qa/${theme}-ai-chat.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/qa/${theme}-home-390.png` });
      await page.setViewportSize({ width: 1487, height: 1058 });
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

  test('models and settings keep safe inset and complete card corners', async ({ page }) => {
    await setup(page, { theme: 'light' });

    await page.goto('/models');
    const modelsPage = page.locator('section.product-page').first();
    const modelsPageBox = await modelsPage.boundingBox();
    const modelsTitleBox = await page.getByTestId('page-title').boundingBox();
    expect(modelsPageBox).not.toBeNull();
    expect(modelsTitleBox).not.toBeNull();
    expect(modelsTitleBox!.x - modelsPageBox!.x).toBeGreaterThanOrEqual(20);

    await page.goto('/settings?tab=acceleration');
    const settings = page.locator('.settings-page');
    const headerPanel = settings.locator(':scope > .app-panel').first();
    const contentPanel = page.getByRole('tabpanel').locator('section.app-panel').first();
    const [headerBox, contentBox] = await Promise.all([headerPanel.boundingBox(), contentPanel.boundingBox()]);
    expect(headerBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.y - (headerBox!.y + headerBox!.height)).toBeGreaterThanOrEqual(12);
    for (const panel of [headerPanel, contentPanel]) {
      const radii = await panel.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
      });
      expect(new Set(radii)).toEqual(new Set(['16px']));
    }
  });
