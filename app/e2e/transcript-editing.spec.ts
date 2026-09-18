import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

type MockSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
  confidence: number;
};

type MockTask = {
  id: string;
  filename: string;
  source: string;
  audio_path: string;
  source_kind: string;
  status: string;
  progress: number;
  language: string;
  duration_ms: number;
  text: string;
  options: Record<string, unknown>;
  segments: MockSegment[];
  created_at: string;
  updated_at: string;
  completed_at: string;
};

type SegmentPayload = { id: number; start: number; end: number; text: string; speaker: string | null };

const baseTask: MockTask = {
  id: 'editing-task',
  filename: 'meeting.wav',
  source: 'local',
  audio_path: 'uploads/meeting.wav',
  source_kind: 'managed',
  status: 'completed',
  progress: 100,
  language: 'en',
  duration_ms: 8_000,
  text: 'opening wrong text ending',
  options: {},
  segments: [
    { id: 1, start: 0, end: 2, text: 'opening', speaker: null, confidence: 0.9 },
    { id: 2, start: 2, end: 4, text: 'wrong text', speaker: null, confidence: 0.9 },
    { id: 3, start: 4, end: 8, text: 'ending', speaker: null, confidence: 0.9 },
  ],
  created_at: '2026-07-21T10:00:00Z',
  updated_at: '2026-07-21T10:00:00Z',
  completed_at: '2026-07-21T10:00:00Z',
};

async function mockEditingTask(page: Page, options: { failPut?: boolean; failExport?: boolean } = {}) {
  let currentTask: MockTask = JSON.parse(JSON.stringify(baseTask)) as MockTask;
  let lastPutPayload: { segments: SegmentPayload[] } | undefined;

  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route(`${serverUrl}/tasks`, (route) => route.fulfill({ json: { items: [currentTask], total: 1 } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`${serverUrl}/tasks/${baseTask.id}`, (route) => route.fulfill({ json: currentTask }));
  await page.route(`${serverUrl}/tasks/${baseTask.id}/segments`, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    lastPutPayload = (await route.request().postDataJSON()) as { segments: SegmentPayload[] };
    if (options.failPut) {
      return route.fulfill({ status: 400, json: { detail: 'Segment ids do not match the current task segments' } });
    }
    currentTask = {
      ...currentTask,
      segments: lastPutPayload.segments.map((segment, index) => ({
        ...segment,
        confidence: currentTask.segments[index]?.confidence ?? 0,
      })),
      text: lastPutPayload.segments.map((segment) => segment.text).join(' '),
      updated_at: '2026-07-21T10:05:00Z',
    };
    return route.fulfill({ json: currentTask });
  });
  await page.route(`${serverUrl}/tasks/${baseTask.id}/versions`, (route) => route.fulfill({ json: [] }));
  await page.route(new RegExp(`${serverUrl}/tasks/${baseTask.id}/(diagnostics|logs)$`), (route) => route.fulfill({ json: [] }));
  await page.route(`${serverUrl}/tasks/${baseTask.id}/quality`, (route) => route.fulfill({ json: { task_id: baseTask.id, warnings: [], metrics: {} } }));
  await page.route(`${serverUrl}/tasks/${baseTask.id}/export/srt`, (route) => {
    const body = currentTask.segments
      .map((segment, index) => `${index + 1}\n00:00:0${segment.start},000 --> 00:00:0${segment.end},000\n${segment.text}`)
      .join('\n\n');
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });
  });
  await page.route(`${serverUrl}/tasks/${baseTask.id}/export/txt`, (route) => route.fulfill(options.failExport ? {
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Export unavailable' }),
  } : {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: currentTask.text,
  }));
  await page.route(`${serverUrl}/tasks/${baseTask.id}/audio`, (route) => route.fulfill({ status: 404, body: 'missing test audio' }));

  return { getLastPutPayload: () => lastPutPayload };
}

async function openTaskDetails(page: Page) {
  await page.goto('/tasks');
  await page.getByRole('button', { name: /meeting\.wav/ }).click();
  await expect(page.getByRole('heading', { name: 'Audio player' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transcript', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit subtitles', exact: true })).toBeVisible();
  await expect(page.getByLabel('Segment text')).toHaveCount(0);
}

test('home result keeps full text with only SRT and TXT quick downloads', async ({ page }) => {
  await mockEditingTask(page);
  await page.route(`${serverUrl}/transcriptions/readiness`, (route) => route.fulfill({ json: { ready: true, issues: [], warnings: [], missing_models: [] } }));
  await page.route(`${serverUrl}/settings/asr`, (route) => route.fulfill({ json: {
    id: 1,
    default_backend: 'local',
    default_model_name: 'whisper-base',
    default_provider_id: null,
    default_language: 'en',
    timestamps: true,
    word_timestamps: false,
    diarization: false,
    vad: true,
    output_formats: ['txt', 'srt'],
    max_concurrent_local_tasks: 1,
    max_concurrent_provider_tasks: 1,
  } }));
  await page.route(`${serverUrl}/models/status`, (route) => route.fulfill({ json: { models: [] } }));
  await page.route(`${serverUrl}/providers`, (route) => route.fulfill({ json: { items: [] } }));

  await page.goto('/');

  await expect(page.getByText(baseTask.text, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audio player' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Subtitle preview' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Segments' })).toHaveCount(0);
  await expect(page.getByLabel('Segment text')).toHaveCount(0);

  const downloads = page.getByRole('heading', { name: 'Download result' }).locator('..');
  await expect(downloads.getByRole('button')).toHaveCount(2);
  await expect(downloads.getByRole('button', { name: 'VTT' })).toHaveCount(0);

  for (const format of ['SRT', 'TXT'] as const) {
    const downloadPromise = page.waitForEvent('download');
    await downloads.getByRole('button', { name: format, exact: true }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const content = await readFile(downloadPath as string, 'utf-8');
    expect(content).toContain(format === 'SRT' ? 'wrong text' : baseTask.text);
  }
});

test('home quick download reports export failures without exposing the segment editor', async ({ page }) => {
  await mockEditingTask(page, { failExport: true });
  await page.goto('/');

  await page.getByRole('button', { name: 'TXT', exact: true }).click();
  await expect(page.getByText('Action failed', { exact: true })).toBeVisible();
  await expect(page.getByText('The operation could not be completed. Review the technical details and retry.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Segment text')).toHaveCount(0);
});

test('task detail keeps the transcript read-only and exports the original subtitle', async ({ page }) => {
  const mock = await mockEditingTask(page);
  await openTaskDetails(page);

  await expect(page.getByTestId('segment-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
  expect(mock.getLastPutPayload()).toBeUndefined();

  const outputFilesPanel = page.getByRole('heading', { name: 'Output files' }).locator('xpath=../..');
  const downloadPromise = page.waitForEvent('download');
  await outputFilesPanel.getByRole('button', { name: 'SRT', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const content = await readFile(downloadPath as string, 'utf-8');
  expect(content).toContain('wrong text');
});

test('task detail reports export errors while staying in read-only transcript mode', async ({ page }) => {
  const mock = await mockEditingTask(page, { failExport: true });
  await openTaskDetails(page);

  const outputFilesPanel = page.getByRole('heading', { name: 'Output files' }).locator('xpath=../..');
  await outputFilesPanel.getByRole('button', { name: 'TXT', exact: true }).click();
  await expect(page.getByText('Action failed', { exact: true })).toBeVisible();
  await expect(page.getByText('The operation could not be completed. Review the technical details and retry.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Segment text')).toHaveCount(0);
  expect(mock.getLastPutPayload()).toBeUndefined();
});

test('edit mode saves staged segment edits from the header row', async ({ page }) => {
  const mock = await mockEditingTask(page);
  await openTaskDetails(page);

  await page.getByRole('button', { name: 'Edit subtitles', exact: true }).click();
  const textInputs = page.getByLabel('Segment text');
  await expect(textInputs).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  await textInputs.nth(1).fill('corrected text');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved. A new subtitle version was created.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  const payload = mock.getLastPutPayload();
  expect(payload?.segments).toHaveLength(3);
  expect(payload?.segments.map((segment) => segment.id)).toEqual([1, 2, 3]);
  expect(payload?.segments[1]?.text).toBe('corrected text');
  expect(payload?.segments[0]?.text).toBe('opening');
});

test('edit mode keeps drafts and shows an error when saving fails', async ({ page }) => {
  await mockEditingTask(page, { failPut: true });
  await openTaskDetails(page);

  await page.getByRole('button', { name: 'Edit subtitles', exact: true }).click();
  const textInputs = page.getByLabel('Segment text');
  await textInputs.nth(1).fill('corrected text');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Failed to save changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(textInputs.nth(1)).toHaveValue('corrected text');
});

test('task detail keeps its content and controls reachable at desktop and narrow widths', async ({ page }) => {
  await mockEditingTask(page);
  await page.setViewportSize({ width: 1280, height: 820 });
  await openTaskDetails(page);

  const detailRegion = page.getByTestId('task-center-detail');
  const inspectorRegion = page.getByTestId('task-center-inspector');
  await expect(page.getByTestId('task-center-list')).toBeVisible();
  await expect(detailRegion).toBeVisible();
  await expect(inspectorRegion).toBeVisible();
  let detailBox = await detailRegion.boundingBox();
  expect(detailBox?.width).toBeLessThanOrEqual(1080);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(detailRegion).toBeVisible();
  await expect(inspectorRegion).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible();
  detailBox = await detailRegion.boundingBox();
  expect(detailBox?.width).toBeLessThanOrEqual(390);
  const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);

  const firstSegment = page.getByRole('button', { name: /Jump to segment(?: time)? 0\.00/ });
  await firstSegment.scrollIntoViewIfNeeded();
  const segmentBox = await firstSegment.boundingBox();
  expect(segmentBox?.x).toBeGreaterThanOrEqual(0);
  expect((segmentBox?.x ?? 0) + (segmentBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(inspectorRegion.getByRole('button', { name: 'SRT', exact: true })).toBeVisible();
  await expect(inspectorRegion.getByRole('button', { name: 'TXT', exact: true })).toBeVisible();
  await expect(page.getByLabel('Segment text')).toHaveCount(0);
});
