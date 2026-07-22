import { expect, test, type Page, type Route } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';
const runsUrl = `${serverUrl}/tasks/proofreading-task/proofreading-runs`;

const eligibleTask = {
  id: 'proofreading-task',
  filename: 'interview.wav',
  source: 'local',
  audio_path: 'uploads/interview.wav',
  status: 'completed',
  progress: 100,
  language: 'zh',
  duration_ms: 8_000,
  text: 'opening wrong text keep this ending',
  options: {},
  segments: [
    { id: 1, start: 0, end: 2, text: 'opening', speaker: null, confidence: 0.9 },
    { id: 2, start: 2, end: 4, text: 'wrong text', speaker: null, confidence: 0.9 },
    { id: 3, start: 4, end: 6, text: 'keep this', speaker: null, confidence: 0.8 },
    { id: 4, start: 6, end: 8, text: 'ending', speaker: null, confidence: 0.9 },
  ],
  created_at: '2026-07-21T10:00:00Z',
  updated_at: '2026-07-21T10:00:00Z',
  completed_at: '2026-07-21T10:00:00Z',
};

const runningTask = {
  ...eligibleTask,
  id: 'running-task',
  filename: 'still-running.wav',
  status: 'transcribing',
  progress: 42,
  segments: [],
  text: null,
  completed_at: null,
};

const suggestions = [
  { id: 1, segment_id: 2, original_text: 'wrong text', suggested_text: 'correct text', reason: 'Clear transcription error', resolution: 'pending' },
  { id: 2, segment_id: 3, original_text: 'keep this', suggested_text: 'Keep this.', reason: 'Add punctuation', resolution: 'pending' },
];

const run = {
  id: 'proofreading-run',
  task_id: eligibleTask.id,
  source_version_id: 1,
  llm_provider_id: 'deepseek',
  provider_name: 'DeepSeek',
  provider_preset: 'deepseek',
  model_name: 'deepseek-chat',
  status: 'completed',
  total_batches: 1,
  completed_batches: 1,
  error_code: null,
  error: null,
  stale: false,
  suggestions,
  created_at: '2026-07-21T10:01:00Z',
  updated_at: '2026-07-21T10:02:00Z',
  completed_at: '2026-07-21T10:02:00Z',
  applied_at: null,
};

const provider = {
  id: 'deepseek',
  name: 'DeepSeek',
  preset: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key_masked: 'sec...ken',
  default_model: 'deepseek-chat',
  enabled: true,
  is_local: false,
  created_at: '2026-07-21T10:00:00Z',
  updated_at: '2026-07-21T10:00:00Z',
};

const ollamaProvider = {
  ...provider,
  id: 'ollama-local',
  name: 'Ollama',
  preset: 'ollama',
  base_url: 'http://localhost:11434/v1',
  api_key_masked: null,
  default_model: 'qwen3:8b',
  is_local: true,
};

const presets = [
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com', requires_api_key: true, local_default: false },
  { id: 'ollama', name: 'Ollama', base_url: 'http://localhost:11434/v1', requires_api_key: false, local_default: true },
];

type Dynamic<T> = T | (() => T);
type MockOptions = {
  tasks?: Dynamic<Array<Record<string, unknown>>>;
  runs?: Dynamic<Array<Record<string, unknown>>>;
  providers?: Dynamic<Array<Record<string, unknown>>>;
  presets?: Dynamic<Array<Record<string, unknown>>>;
  runsRoute?: (route: Route) => Promise<void> | void;
  providersRoute?: (route: Route) => Promise<void> | void;
};

function resolve<T>(value: Dynamic<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

async function mockProofreading(page: Page, options: MockOptions = {}) {
  const tasks = options.tasks ?? [runningTask, eligibleTask];
  const runs = options.runs ?? [run];
  const providers = options.providers ?? [provider];
  const providerPresets = options.presets ?? presets;

  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route(`${serverUrl}/tasks`, (route) => route.fulfill({ json: { items: resolve(tasks), total: resolve(tasks).length } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`${serverUrl}/tasks/${eligibleTask.id}`, (route) => route.fulfill({ json: eligibleTask }));
  await page.route(`${serverUrl}/tasks/${eligibleTask.id}/versions`, (route) => route.fulfill({
    json: [{
      id: 1,
      task_id: eligibleTask.id,
      version_type: 'transcribe',
      text: eligibleTask.text,
      segments: eligibleTask.segments,
      created_at: eligibleTask.completed_at,
    }],
  }));
  await page.route(runsUrl, (route) => {
    if (options.runsRoute) return options.runsRoute(route);
    return route.fulfill({ json: { items: resolve(runs) } });
  });
  await page.route(`${serverUrl}/llm-providers`, (route) => {
    if (options.providersRoute) return options.providersRoute(route);
    return route.fulfill({ json: { items: resolve(providers) } });
  });
  await page.route(`${serverUrl}/llm-providers/presets`, (route) => route.fulfill({ json: { items: resolve(providerPresets) } }));
}

test('AI workspace filters eligible tasks and folds each unchanged range independently', async ({ page }) => {
  await mockProofreading(page);
  await page.goto('/ai?task=proofreading-task');

  await expect(page.getByRole('heading', { name: 'Subtitle proofreading' })).toBeVisible();
  await expect(page.getByRole('button', { name: /interview\.wav/ })).toBeVisible();
  await expect(page.getByText('still-running.wav')).toHaveCount(0);
  await expect(page.getByText('third-party provider receives segment text and limited neighboring context')).toBeVisible();

  const foldedRanges = page.getByRole('button', { name: /Show 1 unchanged subtitle/ });
  await expect(foldedRanges).toHaveCount(2);
  await expect(page.getByText('opening', { exact: true })).toHaveCount(0);
  await foldedRanges.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('opening', { exact: true })).toBeVisible();
  await expect(page.getByText('ending', { exact: true })).toHaveCount(0);

  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(0)).not.toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByRole('button', { name: /Apply selected \(0\)/ })).toBeDisabled();
});

test('starts, polls, reviews, confirms, and applies one proofreading run', async ({ page }) => {
  let phase: 'idle' | 'queued' | 'completed' | 'applied' = 'idle';
  let appliedIds: number[] = [];
  const queuedRun = { ...run, status: 'queued', suggestions: [], total_batches: 2, completed_batches: 0, completed_at: null };
  const appliedRun = {
    ...run,
    status: 'applied',
    suggestions: suggestions.map((item, index) => ({ ...item, resolution: index === 0 ? 'applied' : 'skipped' })),
    applied_at: '2026-07-21T10:04:00Z',
  };

  await mockProofreading(page, {
    runs: [],
    runsRoute: (route) => {
      if (route.request().method() === 'POST') {
        phase = 'queued';
        return route.fulfill({ json: queuedRun });
      }
      const items = phase === 'idle' ? [] : [phase === 'queued' ? queuedRun : phase === 'completed' ? run : appliedRun];
      return route.fulfill({ json: { items } });
    },
  });
  await page.route(`${runsUrl}/${run.id}/apply`, async (route) => {
    appliedIds = (await route.request().postDataJSON()).suggestion_ids;
    phase = 'applied';
    await route.fulfill({
      json: {
        run: appliedRun,
        version: { id: 2, task_id: eligibleTask.id, version_type: 'proofread', text: eligibleTask.text, segments: eligibleTask.segments, created_at: appliedRun.applied_at },
      },
    });
  });

  await page.goto('/ai?task=proofreading-task');
  await page.getByRole('button', { name: 'Start proofreading' }).click();
  await expect(page.getByText('0 / 2 batches completed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Proofreading' })).toBeDisabled();

  phase = 'completed';
  await expect(page.getByRole('checkbox')).toHaveCount(2, { timeout: 4_000 });
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Apply selected (1)' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText('Apply 1 selected suggestions');
  await expect(confirmation).toContainText('other 1 suggestions will be skipped');
  await confirmation.getByRole('button', { name: 'Apply selected', exact: true }).click();

  await expect.poll(() => appliedIds).toEqual([1]);
  await expect(page.getByText('1 suggestions applied. A new subtitle version was created.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View new transcript' })).toHaveAttribute('href', /\/tasks\?task=proofreading-task/);
  await expect(page.getByRole('button', { name: 'Run again' })).toHaveCount(2);
});

test('completed task has a lightweight AI entry and settings has a top-level LLM tab', async ({ page }) => {
  await mockProofreading(page);
  await page.route(new RegExp(`${serverUrl}/tasks/${eligibleTask.id}/(diagnostics|logs)$`), (route) => route.fulfill({ json: [] }));
  await page.route(`${serverUrl}/tasks/${eligibleTask.id}/quality`, (route) => route.fulfill({ json: { task_id: eligibleTask.id, warnings: [], metrics: {} } }));

  await page.goto('/tasks');
  await page.getByRole('button', { name: /interview\.wav/ }).click();
  const aiEntry = page.getByRole('link', { name: 'AI subtitle proofreading' });
  await expect(aiEntry).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Subtitle proofreading' })).toHaveCount(0);
  await aiEntry.click();
  await expect(page).toHaveURL(/\/ai\?task=proofreading-task$/);

  await page.goto('/settings?tab=llm');
  await expect(page.getByRole('tab', { name: 'AI LLM providers' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('button', { name: /Test connection/ })).toBeVisible();
});

test('shows distinct task and search empty states', async ({ page }) => {
  let taskItems: Array<Record<string, unknown>> = [];
  await mockProofreading(page, { tasks: () => taskItems, runs: [] });
  await page.goto('/ai');
  await expect(page.getByRole('heading', { name: 'No transcription tasks yet' })).toBeVisible();

  taskItems = [runningTask];
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No subtitles ready yet' })).toBeVisible();

  taskItems = [eligibleTask];
  await page.reload();
  await page.getByPlaceholder('Search by filename').fill('missing-file');
  await expect(page.getByRole('heading', { name: 'No matching transcripts' })).toBeVisible();
});

test('shows provider setup when no enabled LLM provider exists', async ({ page }) => {
  await mockProofreading(page, { providers: [], runs: [] });
  await page.goto('/ai?task=proofreading-task');
  await expect(page.getByRole('heading', { name: 'An LLM provider is required' })).toBeVisible();
  await page.getByRole('link', { name: 'Configure LLM provider' }).click();
  await expect(page).toHaveURL(/\/settings\?tab=llm/);
  await expect(page.getByRole('tab', { name: 'AI LLM providers' })).toHaveAttribute('data-state', 'active');
});

test('keeps stale history read-only and defaults to the newest run', async ({ page }) => {
  const oldRun = {
    ...run,
    id: 'old-run',
    provider_name: 'Legacy',
    model_name: 'old-model',
    stale: true,
    created_at: '2026-07-20T10:01:00Z',
  };
  await mockProofreading(page, { runs: [oldRun, run] });
  await page.goto('/ai?task=proofreading-task');
  await expect(page.getByText('ready to review', { exact: true }).first()).toBeVisible();

  await page.locator('summary').filter({ hasText: 'Proofreading history' }).click();
  await page.getByRole('button', { name: /Legacy · old-model/ }).click();
  await expect(page.getByText(/based on an older transcript version/)).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /Apply selected/ })).toHaveCount(0);
});

test('distinguishes successful empty results from provider failure categories', async ({ page }) => {
  let currentRun: Record<string, unknown> = { ...run, suggestions: [] };
  await mockProofreading(page, { runs: () => [currentRun] });
  await page.goto('/ai?task=proofreading-task');
  await expect(page.getByText('No changes were suggested', { exact: true })).toBeVisible();

  const failures = [
    ['LLM_PROVIDER_AUTH_FAILED', 'Authentication failed'],
    ['LLM_PROVIDER_RATE_LIMITED', 'Request limit reached'],
    ['LLM_PROVIDER_TIMEOUT', 'The request timed out'],
    ['LLM_PROVIDER_UNAVAILABLE', 'Unable to reach the LLM provider'],
    ['LLM_PROVIDER_MODEL_REQUIRED', 'The provider or model configuration is not usable'],
    ['LLM_PROVIDER_CONTEXT_TOO_LONG', 'This transcript exceeds the model context limit'],
    ['LLM_PROVIDER_INVALID_RESPONSE', 'The model returned an unreadable result'],
  ] as const;
  for (const [errorCode, title] of failures) {
    currentRun = { ...run, status: 'failed', suggestions: [], error_code: errorCode, error: `technical: ${errorCode}` };
    await page.reload();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText('No changes were suggested', { exact: true })).toHaveCount(0);
  }

  await page.getByText('Technical details', { exact: true }).click();
  await expect(page.getByText('technical: LLM_PROVIDER_INVALID_RESPONSE', { exact: false })).toBeVisible();
  currentRun = { ...run, status: 'interrupted', suggestions: [], error_code: 'PROOFREADING_INTERRUPTED', error: 'worker restarted' };
  await page.reload();
  await expect(page.getByText('Proofreading was interrupted', { exact: true })).toBeVisible();
});

test('creates local Ollama without an API key and tests it automatically', async ({ page }) => {
  let createdPayload: Record<string, unknown> | undefined;
  let testRequests = 0;
  let providerItems: Array<Record<string, unknown>> = [];
  await mockProofreading(page, {
    providers: () => providerItems,
    providersRoute: async (route) => {
      if (route.request().method() === 'POST') {
        createdPayload = await route.request().postDataJSON();
        providerItems = [ollamaProvider];
        return route.fulfill({ json: ollamaProvider });
      }
      return route.fulfill({ json: { items: providerItems } });
    },
  });
  await page.route(`${serverUrl}/llm-providers/${ollamaProvider.id}/test`, (route) => {
    testRequests += 1;
    return route.fulfill({ json: { ok: true, message: 'Ollama is ready' } });
  });

  await page.goto('/settings?tab=llm');
  await page.getByRole('button', { name: 'Add LLM provider' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Ollama' }).click();
  await expect(dialog.getByText(/loopback endpoint is classified as local/)).toBeVisible();
  await dialog.getByLabel('Default model').fill('qwen3:8b');
  await expect(dialog.getByLabel('API key')).not.toHaveAttribute('required');
  await expect(dialog.getByLabel('API key')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect.poll(() => createdPayload).toMatchObject({
    preset: 'ollama',
    base_url: 'http://localhost:11434/v1',
    default_model: 'qwen3:8b',
  });
  expect(createdPayload).not.toHaveProperty('api_key');
  await expect.poll(() => testRequests).toBe(1);
  await expect(page.getByText('LLM connection succeeded')).toBeVisible();
});

test('edits, disables, tests failure, and deletes an LLM provider', async ({ page }) => {
  let providerItems: Array<Record<string, unknown>> = [provider];
  let updatedPayload: Record<string, unknown> | undefined;
  await mockProofreading(page, {
    providers: () => providerItems,
  });
  await page.route(`${serverUrl}/llm-providers/${provider.id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      updatedPayload = await route.request().postDataJSON();
      providerItems = [{ ...provider, ...updatedPayload }];
      return route.fulfill({ json: providerItems[0] });
    }
    providerItems = [];
    return route.fulfill({ json: { message: 'deleted' } });
  });
  await page.route(`${serverUrl}/llm-providers/${provider.id}/test`, (route) => route.fulfill({
    json: { ok: false, message: 'Invalid API key', error_code: 'LLM_PROVIDER_AUTH_FAILED' },
  }));

  await page.goto('/settings?tab=llm');
  await page.getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog');
  await editDialog.getByRole('switch').click();
  await editDialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => updatedPayload?.enabled).toBe(false);
  await expect(page.getByText('LLM connection failed')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('disabled', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.locator('article').getByText('Invalid API key', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No LLM providers configured' })).toBeVisible();
});

test('mobile navigation exposes AI without horizontal overflow', async ({ page }) => {
  await mockProofreading(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai?task=proofreading-task');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'AI' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
