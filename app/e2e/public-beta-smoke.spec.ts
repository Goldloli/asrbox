import { expect, test } from '@playwright/test';

test('public beta shell reaches the local backend and core routes', async ({ page, request }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });

  const health = await request.get('http://127.0.0.1:17496/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: 'healthy', version: '0.1.2-rc.2' });

  await page.goto('/');
  await expect(page.getByText('Backend online', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Transcribe', exact: true }).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);

  for (const [route, heading] of [
    ['/tasks', 'Tasks'],
    ['/models', 'Models'],
    ['/settings', 'Settings'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }

  await page.goto('/providers');
  await expect(page).toHaveURL(/\/settings\?tab=providers$/);
  await expect(page.getByRole('tab', { name: 'Online providers' })).toHaveAttribute('data-state', 'active');
  expect(pageErrors).toEqual([]);
});

test('transcription workspace confirms and stops the selected active task', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:17496';
  let cancelRequests = 0;
  let task = {
    id: 'running-local-task',
    filename: 'concert.mp4',
    source: 'local',
    audio_path: 'uploads/concert.mp4',
    normalized_audio_path: 'uploads/concert.wav',
    status: 'transcribing',
    progress: 60,
    language: 'zh',
    model_name: 'whisper-large-v3',
    provider_id: null,
    duration_ms: 687_500,
    text: null,
    error: null,
    error_code: null,
    options: {},
    segments: [],
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:01:00Z',
    completed_at: null,
    batch_id: null,
  };

  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route(`${serverUrl}/tasks`, (route) => route.fulfill({ json: { items: [task], total: 1 } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({
    json: {
      downloads: [],
      queued_tasks: [],
      running_tasks: task.status === 'transcribing' ? [task] : [],
      orphan_tasks: [],
      failed_resumable_tasks: [],
      running_chunks: [],
      local_queue_length: 0,
      provider_queue_length: 0,
      local_worker_count: 1,
      provider_worker_count: 1,
      max_concurrent_local_tasks: 1,
      max_concurrent_provider_tasks: 2,
      recent_error: null,
      worker_state: {},
      cancelled_task_ids: [],
    },
  }));
  await page.route(`${serverUrl}/tasks/${task.id}/cancel`, async (route) => {
    cancelRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    task = { ...task, status: 'cancelled', progress: 100, error_code: 'TASK_CANCELLED' };
    await route.fulfill({ json: task });
  });

  await page.goto('/');
  const stopButton = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stopButton).toBeVisible();
  await stopButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Stop transcription?' })).toBeVisible();
  await expect(dialog).toContainText('next queued task can continue');
  await dialog.getByRole('button', { name: 'Stop', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Stopping', exact: true })).toBeDisabled();
  await expect(page.getByText('Task cancelled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  expect(cancelRequests).toBe(1);
});

test('web start uploads once, shows transfer progress, and creates an importing task', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:17496';
  let preflightRequests = 0;
  let createRequests = 0;
  let createdTask: Record<string, unknown> | null = null;

  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route(`${serverUrl}/transcriptions/preflight`, async (route) => {
    preflightRequests += 1;
    await route.fulfill({ status: 500, json: { detail: 'Start must not call preflight' } });
  });
  await page.route(`${serverUrl}/transcriptions`, async (route) => {
    createRequests += 1;
    createdTask = {
      id: 'web-import-task',
      filename: 'short.wav',
      source: 'local',
      audio_path: 'uploads/web-import-task.wav',
      normalized_audio_path: null,
      status: 'importing',
      progress: 4,
      language: 'zh',
      model_name: 'whisper-base',
      provider_id: null,
      duration_ms: null,
      text: null,
      error: null,
      error_code: null,
      options: {},
      segments: [],
      created_at: '2026-07-22T11:00:00Z',
      updated_at: '2026-07-22T11:00:01Z',
      completed_at: null,
      batch_id: null,
    };
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: createdTask });
  });
  await page.route(`${serverUrl}/tasks`, (route) => route.fulfill({ json: { items: createdTask ? [createdTask] : [], total: createdTask ? 1 : 0 } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({ json: {
    downloads: [], queued_tasks: [], running_tasks: createdTask ? [createdTask] : [], orphan_tasks: [], failed_resumable_tasks: [], running_chunks: [],
    local_queue_length: 0, provider_queue_length: 0, local_worker_count: 1, provider_worker_count: 1,
    max_concurrent_local_tasks: 1, max_concurrent_provider_tasks: 2, recent_error: null, worker_state: {}, cancelled_task_ids: [],
  } }));
  await page.route(`${serverUrl}/models/status`, (route) => route.fulfill({ json: { models: [{
    model_name: 'whisper-base', display_name: 'Whisper Base', engine: 'whisper_transformers', source: 'huggingface', model_size: 'base', size_mb: 290,
    languages: ['auto', 'zh'], runtime: 'torch', supports_timestamps: true, supports_word_timestamps: true, supports_diarization: false,
    supports_streaming: false, downloaded: true, downloading: false, loaded: false, compatible: true, storage_status: 'available',
  }] } }));

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'short.wav', mimeType: 'audio/wav', buffer: Buffer.from('audio') });
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect(page.getByText('Uploading media', { exact: true })).toBeVisible();
  await expect(page.getByText('Transcription started', { exact: true })).toBeVisible();
  await expect(page.getByText('importing media', { exact: true }).first()).toBeVisible();
  expect(preflightRequests).toBe(0);
  expect(createRequests).toBe(1);
});
