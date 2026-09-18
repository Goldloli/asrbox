import { expect, test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

const primaryRoutes = ['/', '/tasks', '/ai', '/models', '/settings'] as const;

const settingsTabs = ['general', 'transcription', 'acceleration', 'providers', 'llm', 'storage', 'about'] as const;

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  filename: 'interview.m4a',
  source: '/tmp/asrbox-e2e/interview.m4a',
  audio_path: '/tmp/asrbox-e2e/interview.m4a',
  source_kind: 'managed',
  status: 'completed',
  progress: 1,
  language: 'zh',
  model_name: 'whisper-base',
  provider_id: null,
  duration_ms: 42_160,
  text: 'Hello and welcome. Local processing keeps data private.',
  error: null,
  error_code: null,
  options: {},
  segments: [
    { id: 1, start: 0, end: 15, text: 'Hello and welcome.', speaker: '1' },
    { id: 2, start: 15, end: 30, text: 'Local processing keeps data private.', speaker: '2' },
  ],
  created_at: '2026-09-14T10:28:00Z',
  updated_at: '2026-09-14T10:30:00Z',
  completed_at: '2026-09-14T10:30:00Z',
  batch_id: null,
  ...overrides,
});

const stubTasks = (page: Page, items: unknown[]) =>
  page.route('**/tasks', (route) => {
    // Only intercept API calls — the /tasks document navigation must pass through.
    const type = route.request().resourceType();
    if (type !== 'fetch' && type !== 'xhr') return route.fallback();
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: { items, total: items.length } });
  });

const stubTaskWorkspaces = (page: Page, taskId: string) => {
  void page.route(`**/tasks/${taskId}/diagnostics`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/logs`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/versions`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/quality`, (route) =>
    route.fulfill({ json: { task_id: taskId, warnings: [], metrics: {} } }));
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('desktop shell defaults to the expanded sidebar with text labels for new users', async ({ page }) => {
  await page.goto('/');

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-mode', 'expanded');
  await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Task center' })).toBeVisible();
});

test('primary routes share the page shell without page-level horizontal overflow', async ({ page }) => {
  for (const route of primaryRoutes) {
    await page.goto(route);
    const pageTitle = page.getByTestId('page-title');
    await expect(pageTitle).toBeVisible();
    await expect.poll(async () => {
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      return scrollWidth - clientWidth;
    }, { message: `route ${route} must not overflow horizontally` }).toBeLessThanOrEqual(0);
  }
});

test('home transcription controls share one visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const controls = [
    page.getByRole('combobox', { name: /^Backend$/ }),
    page.getByRole('combobox', { name: /^Model\b/ }),
    page.getByRole('combobox', { name: /^Language$/ }),
    page.getByRole('button', { name: 'More settings' }),
    page.getByRole('button', { name: /^Start$/ }),
  ];
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const tops = boxes.map((box) => box!.y);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
});

test('home result keeps only quick downloads and does not preload task audio', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  let audioRequests = 0;
  await page.route(`**/tasks/${item.id}/audio*`, (route) => {
    audioRequests += 1;
    return route.abort();
  });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'SRT', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'TXT', exact: true })).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(0);
  expect(audioRequests).toBe(0);
});

test('primary routes keep main actions reachable on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of primaryRoutes) {
    await page.goto(route);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect.poll(async () => {
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      return scrollWidth - clientWidth;
    }, { message: `route ${route} must not overflow horizontally at 390px` }).toBeLessThanOrEqual(0);
  }
});

test('light and dark preferences keep the same shell structure', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
  await expect(page.getByTestId('page-title')).toBeVisible();
});

test('task center renders a persistent three-region workspace on selection', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const listRegion = page.getByTestId('task-center-list');
  const detailRegion = page.getByTestId('task-center-detail');
  const inspectorRegion = page.getByTestId('task-center-inspector');
  await expect(listRegion).toBeVisible();
  await expect(detailRegion).toBeVisible();
  await expect(inspectorRegion).toBeVisible();

  await expect(listRegion.getByRole('button', { name: /import/i })).toHaveCount(0);
  await expect(detailRegion.getByText('interview.m4a').first()).toBeVisible();
  await expect(inspectorRegion.getByRole('heading', { name: 'Task status' })).toBeVisible();
  await expect(inspectorRegion.getByText('Transcription settings')).toHaveCount(0);
  await expect(inspectorRegion.getByText('Speaker recognition')).toHaveCount(0);
});

test('task center uses one continuous surface across its sidebar and workspace columns', async ({ page }) => {
  await stubTasks(page, [task()]);
  stubTaskWorkspaces(page, 'task-1');
  await page.goto('/tasks');

  const regions = [
    page.getByTestId('app-sidebar'),
    page.getByTestId('task-center-list'),
    page.getByTestId('task-center-detail'),
    page.getByTestId('task-center-inspector'),
  ];
  const backgrounds = await Promise.all(regions.map((region) => region.evaluate((element) => getComputedStyle(element).backgroundColor)));
  expect(new Set(backgrounds).size).toBe(1);
});

test('transcript segments expose the active segment for playback linkage', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const segments = page.getByTestId('transcript-segments');
  await expect(segments).toBeVisible();
  const rows = segments.getByTestId('segment-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-active', 'true');
});

test('audio time events and transcript segment playback stay synchronized', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const detail = page.getByTestId('task-center-detail');
  const audio = detail.locator('audio');
  const rows = detail.getByTestId('segment-row');
  await expect(audio).toHaveCount(1);

  await audio.evaluate((element) => {
    const media = element as HTMLMediaElement & { dataset: DOMStringMap };
    let mediaTime = 0;
    Object.defineProperty(media, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value: number) => {
        mediaTime = value;
        queueMicrotask(() => media.dispatchEvent(new Event('seeked')));
      },
    });
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: () => {
        media.dataset.playRequested = 'true';
        media.dispatchEvent(new Event('play'));
        return Promise.resolve();
      },
    });
    mediaTime = 16;
    media.dispatchEvent(new Event('timeupdate'));
  });

  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(rows.first()).not.toHaveAttribute('data-active', 'true');

  await audio.evaluate((element) => {
    const media = element as HTMLMediaElement;
    media.currentTime = 0;
    media.dispatchEvent(new Event('timeupdate'));
  });
  await expect(rows.first()).toHaveAttribute('data-active', 'true');

  await rows.nth(1).getByRole('button', { name: /Jump to segment time 15\.00/ }).click();
  await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBe(15);
  await expect(audio).toHaveAttribute('data-play-requested', 'true');
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(detail.getByText('0:15 / 0:00')).toBeVisible();
});

test('paused waveform seek updates the active transcript segment immediately', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const detail = page.getByTestId('task-center-detail');
  const audio = detail.locator('audio');
  const rows = detail.getByTestId('segment-row');
  await audio.evaluate((element) => {
    const media = element as HTMLMediaElement;
    let mediaTime = 0;
    Object.defineProperty(media, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value: number) => {
        mediaTime = value;
      },
    });
    Object.defineProperty(media, 'duration', { configurable: true, get: () => 30 });
    media.dispatchEvent(new Event('loadedmetadata'));
  });

  const waveform = detail.getByRole('button', { name: 'Click waveform to seek audio' });
  await waveform.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + rect.width * 0.75,
      clientY: rect.top + rect.height / 2,
    }));
  });

  await expect.poll(async () => {
    const time = await audio.evaluate((element) => (element as HTMLMediaElement).currentTime);
    return time > 22 && time < 23;
  }).toBe(true);
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(rows.first()).not.toHaveAttribute('data-active', 'true');
});

test('general settings exposes the accent color palette', async ({ page }) => {
  await page.goto('/settings?tab=general');

  const picker = page.getByTestId('accent-color-picker');
  await expect(picker).toBeVisible();
  for (const accent of ['orange', 'blue', 'purple', 'pink', 'red', 'green', 'cyan', 'gray']) {
    await expect(picker.getByRole('radio', { name: accent })).toHaveCount(1);
  }
});

test('runtime warnings follow the interface language without refetching their source', async ({ page }) => {
  const rawWarning = 'pyannote.audio is installed but HF_TOKEN is not configured';
  let runtimeRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-ui', JSON.stringify({ state: { locale: 'zh', sidebarMode: 'expanded' }, version: 0 }));
  });
  await page.route(`${serverUrl}/runtime/status`, (route) => {
    runtimeRequests += 1;
    return route.fulfill({ json: {
      platform: 'macOS-15-arm64', python_version: '3.13', data_dir: '/tmp/asrbox', models_dir: '/tmp/asrbox/models',
      free_disk_bytes: 100_000_000_000, ffmpeg_available: true, ffprobe_available: true, torch_available: true,
      faster_whisper_available: true, funasr_available: true, mlx_available: true, qwen3_asr_available: true,
      pyannote_available: true, diarization_ready: false, warnings: [rawWarning],
    } });
  });
  await page.route(`${serverUrl}/settings/asr`, (route) => route.fulfill({ json: {
    id: 1, default_backend: 'local', default_model_name: null, default_provider_id: null, default_language: 'auto',
    timestamps: true, word_timestamps: false, diarization: false, vad: true, output_formats: ['txt', 'srt'],
    max_concurrent_local_tasks: 1, max_concurrent_provider_tasks: 2, ffmpeg_path: null, ffprobe_path: null,
  } }));
  await page.route(`${serverUrl}/models/status`, (route) => route.fulfill({ json: { models: [] } }));
  await page.route(`${serverUrl}/models/storage`, (route) => route.fulfill({ json: {
    root: '/tmp/asrbox', models_dir: '/tmp/asrbox/models', status: 'available', available: true, writable: true,
    cache_dirs: {}, cache_usage: [], cache_bytes: 0, allowed_roots: ['/tmp/asrbox'], root_locked: false,
    runtime: 'desktop', network_filesystem: false, used_bytes: 0, models: [], total_size_mb: 0,
  } }));
  await page.route(`${serverUrl}/providers`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({ json: { items: [], recent_error: null } }));
  await page.route(`${serverUrl}/health`, (route) => route.fulfill({ json: { ok: true } }));

  await page.goto('/settings?tab=storage');
  await expect(page.getByText('已安装 pyannote.audio，但尚未配置 HF_TOKEN，因此说话人分离暂不可用。')).toBeVisible();
  const initialRuntimeRequests = runtimeRequests;

  await page.getByRole('tab', { name: '通用' }).click();
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.getByRole('tab', { name: 'Storage and diagnostics' }).click();

  await expect(page.getByText('pyannote.audio is installed, but speaker diarization is unavailable until HF_TOKEN is configured.')).toBeVisible();
  expect(runtimeRequests).toBe(initialRuntimeRequests);
  await expect(page.getByText(rawWarning, { exact: true })).toBeHidden();
  await page.getByText('Details', { exact: true }).last().click();
  await expect(page.getByText(rawWarning, { exact: true })).toBeVisible();
});

test('every maintained settings tab renders through the shared shell', async ({ page }) => {
  for (const tab of settingsTabs) {
    await page.goto(`/settings?tab=${tab}`);
    await expect(page.getByTestId('page-title')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
      message: `settings tab ${tab} must not overflow horizontally`,
    }).toBeLessThanOrEqual(0);
  }
});
