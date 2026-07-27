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

async function mockEditingTask(page: Page, options: { failPut?: boolean } = {}) {
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

  return { getLastPutPayload: () => lastPutPayload };
}

async function openTranscriptTab(page: Page) {
  await page.goto('/tasks');
  await page.getByRole('button', { name: /meeting\.wav/ }).click();
  await page.getByRole('tab', { name: 'Transcript' }).click();
}

test('edits a segment, saves it to the backend, and exports the edited subtitle', async ({ page }) => {
  const mock = await mockEditingTask(page);
  await openTranscriptTab(page);

  const segmentTextboxes = page.getByLabel('Segment text');
  await expect(segmentTextboxes).toHaveCount(3);
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  await segmentTextboxes.nth(1).fill('corrected words');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved. A new subtitle version was created.')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  expect(mock.getLastPutPayload()?.segments).toEqual([
    { id: 1, start: 0, end: 2, text: 'opening', speaker: null },
    { id: 2, start: 2, end: 4, text: 'corrected words', speaker: null },
    { id: 3, start: 4, end: 8, text: 'ending', speaker: null },
  ]);
  await expect(segmentTextboxes.nth(1)).toHaveValue('corrected words');

  const outputFilesPanel = page.getByRole('heading', { name: 'Output files' }).locator('xpath=../..');
  const downloadPromise = page.waitForEvent('download');
  await outputFilesPanel.getByRole('button', { name: 'SRT', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const content = await readFile(downloadPath as string, 'utf-8');
  expect(content).toContain('corrected words');
  expect(content).not.toContain('wrong text');
});

test('keeps the draft and reports an error when saving fails', async ({ page }) => {
  const mock = await mockEditingTask(page, { failPut: true });
  await openTranscriptTab(page);

  const segmentTextboxes = page.getByLabel('Segment text');
  await segmentTextboxes.nth(1).fill('corrected words');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Failed to save changes')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(segmentTextboxes.nth(1)).toHaveValue('corrected words');
  expect(mock.getLastPutPayload()?.segments).toHaveLength(3);

  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await expect(segmentTextboxes.nth(1)).toHaveValue('wrong text');
});
