import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const server = 'http://127.0.0.1:17496';
const base = `${server}/tasks/translation-task/translation-runs`;
const task = {
  id: 'translation-task', filename: 'languages.wav', source: 'local', audio_path: null,
  status: 'completed', progress: 100, language: 'ja', duration_ms: 4000, text: '日本語 原文', options: {},
  segments: [{ id: 1, start: 0, end: 2, text: '日本語' }, { id: 2, start: 2, end: 4, text: '原文' }],
  created_at: '2026-09-06T01:00:00Z', updated_at: '2026-09-06T01:00:00Z', completed_at: '2026-09-06T01:00:00Z',
};
const provider = { id: 'ollama', name: 'Ollama', preset: 'ollama', base_url: 'http://localhost:11434/v1',
  api_key_masked: null, default_model: 'qwen3', enabled: true, is_local: true, created_at: task.created_at, updated_at: task.updated_at };
const completed = { id: 'run-1', task_id: task.id, source_version_id: 1,
  source_language: { kind: 'preset', code: 'ja' }, target_language: { kind: 'preset', code: 'fr' },
  source_is_current: true, llm_provider_id: provider.id, provider_name: provider.name, provider_preset: provider.preset,
  model_name: provider.default_model, status: 'completed', attempt: 1, total_batches: 2, completed_batches: 2,
  total_segments: 2, completed_segments: 2, latest_translation_version_id: 10 as number | null,
  can_retry: false, can_edit: true, can_export: true, error_code: null as string | null, error: null,
  created_at: task.created_at, updated_at: task.updated_at, completed_at: task.completed_at };
const version = { id: 10, run_id: completed.id, revision: 1, version_type: 'translate', parent_version_id: null as number | null,
  created_at: task.created_at, source_version_id: 1, source_language: completed.source_language, target_language: completed.target_language,
  segments: task.segments.map((s, i) => ({ ...s, speaker: null, source_text: s.text, text: i ? 'Bonjour' : 'مرحبا' })) };

async function mock(page: Page, options: { empty?: boolean; activeTask?: boolean; noProvider?: boolean; conflict?: boolean } = {}) {
  const state = { runs: options.empty ? [] : [{ ...completed }], versions: [{ ...version }], posts: [] as Record<string, unknown>[], downloads: [] as string[] };
  await page.addInitScript(url => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
    localStorage.setItem('asrbox-ui', JSON.stringify({ state: { locale: 'en' }, version: 0 }));
  }, server);
  await page.route(`${server}/tasks`, route => route.fulfill({ json: { items: [{ ...task, status: options.activeTask ? 'transcribing' : 'completed' }], total: 1 } }));
  await page.route(`${server}/tasks/active`, route => route.fulfill({ json: { items: [] } }));
  await page.route(`${server}/tasks/${task.id}/versions`, route => route.fulfill({ json: [
    { id: 2, version_type: 'proofread', created_at: task.created_at, segments: task.segments },
    { id: 1, version_type: 'transcribe', created_at: task.created_at, segments: task.segments },
  ] }));
  await page.route(`${server}/llm-providers`, route => route.fulfill({ json: { items: options.noProvider ? [] : [provider] } }));
  await page.route(`${server}/tasks/${task.id}/proofreading-runs`, route => route.fulfill({ json: { items: [] } }));
  await page.route(base, route => {
    if (route.request().method() === 'POST') {
      state.posts.push(route.request().postDataJSON());
      state.runs = [{ ...completed, status: 'queued', completed_segments: 0, completed_batches: 0, latest_translation_version_id: null, can_edit: false, can_export: false }];
      return route.fulfill({ json: state.runs[0] });
    }
    return route.fulfill({ json: { items: state.runs } });
  });
  await page.route(`${base}/run-1/cancel`, route => {
    state.runs[0] = { ...state.runs[0], status: 'cancelled', can_retry: true };
    return route.fulfill({ json: state.runs[0] });
  });
  await page.route(`${base}/run-1/retry`, route => {
    state.runs[0] = { ...state.runs[0], status: 'running', can_retry: false, attempt: state.runs[0].attempt + 1 };
    return route.fulfill({ json: state.runs[0] });
  });
  await page.route(`${base}/run-1/versions`, route => {
    if (route.request().method() === 'POST') {
      if (options.conflict) return route.fulfill({ status: 409, json: { detail: { code: 'TRANSLATION_VERSION_CONFLICT', message: 'Reload before saving' } } });
      const payload = route.request().postDataJSON() as { base_version_id: number; segments: Array<{ id: number; text: string }> };
      state.posts.push(payload);
      const saved = { ...version, id: 11, revision: 2, parent_version_id: 10, version_type: 'edit', segments: version.segments.map(s => ({ ...s, text: payload.segments.find(v => v.id === s.id)!.text })) };
      state.versions.unshift(saved); state.runs[0].latest_translation_version_id = 11;
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: { items: state.versions } });
  });
  await page.route(new RegExp(`${base}/run-1/versions/\\d+$`), route => route.fulfill({ json: state.versions.find(v => route.request().url().endsWith(`/${v.id}`)) }));
  await page.route(`${base}/run-1/versions/*/export/*`, route => {
    state.downloads.push(route.request().url());
    const url = new URL(route.request().url());
    const vid = Number(url.pathname.split('/versions/')[1].split('/')[0]);
    const saved = state.versions.find(v => v.id === vid)!;
    return route.fulfill({ body: `1\n00:00:00,000 --> 00:00:02,000\n${saved.segments[0].source_text}\n${saved.segments[0].text}\n`, contentType: 'text/plain', headers: { 'Content-Disposition': 'attachment; filename="languages-fr-bilingual.srt"', 'Access-Control-Expose-Headers': 'Content-Disposition' } });
  });
  return state;
}

async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('starts a non-English to non-Chinese translation from a chosen saved source and restores its URL', async ({ page }) => {
  const state = await mock(page, { empty: true });
  await page.goto('/ai?task=translation-task');
  await expect(page.getByRole('heading', { name: 'Subtitle proofreading' })).toBeVisible();
  await page.getByRole('link', { name: 'Subtitle translation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subtitle translation', exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  await select(page, 'Source language', 'Japanese');
  await page.getByRole('textbox', { name: 'Target language · Search languages' }).fill('French');
  await select(page, 'Target language', 'French');
  await page.getByRole('combobox', { name: 'Source subtitle version' }).click();
  await page.getByRole('option', { name: /#1 · transcribe/ }).click();
  await page.getByRole('button', { name: 'Start translation', exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toEqual({ provider_id: 'ollama', source_version_id: 1, source_language: { kind: 'preset', code: 'ja' }, target_language: { kind: 'preset', code: 'fr' } });
  await expect(page).toHaveURL(/mode=translation.*run=run-1/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cancel translation' })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  state.runs = [{ ...completed }];
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toHaveValue('مرحبا');
});

test('reviews every segment, preserves drafts on navigation, saves one revision and downloads the selected saved version', async ({ page }) => {
  const state = await mock(page);
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  const editor = page.getByRole('textbox', { name: 'Translation 1', exact: true });
  await expect(editor).toHaveAttribute('dir', 'auto');
  await expect(page.getByText('Source media is unavailable.', { exact: false })).toBeVisible();
  await editor.fill('Edited translation');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Subtitle proofreading', exact: true }).click();
  await expect(editor).toHaveValue('Edited translation');
  await page.getByRole('textbox', { name: 'Search source and translation' }).fill('Bonjour');
  await expect(page.getByTestId('translation-segments').getByRole('textbox')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search source and translation' }).fill('');
  await page.getByRole('button', { name: 'Save translation', exact: true }).click();
  await expect.poll(() => state.versions.length).toBe(2);
  expect(state.posts[0]).toEqual({ base_version_id: 10, segments: [{ id: 1, text: 'Edited translation' }, { id: 2, text: 'Bonjour' }] });
  await expect(page.getByRole('button', { name: 'Save translation', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Saved translation version' }).click();
  await page.getByRole('option', { name: /^v1 ·/ }).click();
  await expect(editor).toHaveValue('مرحبا');
  await select(page, 'Export content', 'Bilingual');
  await select(page, 'Bilingual order', 'Translation first');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export translation', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('languages-fr-bilingual.srt');
  expect(await readFile((await download.path())!, 'utf8')).toContain('مرحبا');
  expect(state.downloads[0]).toContain('/versions/10/export/srt?mode=bilingual&order=target-first');
});

test('cancel and resume preserve progress; provider changes block resuming; no partial version is shown', async ({ page }) => {
  const state = await mock(page, { empty: true });
  state.runs = [{ ...completed, status: 'running', completed_segments: 1, completed_batches: 1, latest_translation_version_id: null, can_edit: false, can_export: false }];
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await expect(page.getByText('1 / 2 segments · 1 / 2 batches saved')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel translation' }).click();
  await expect(page.getByRole('button', { name: 'Resume unfinished batches' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export translation', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume unfinished batches' }).click();
  await expect(page.getByRole('button', { name: 'Cancel translation' })).toBeVisible();
  expect(state.runs[0].attempt).toBe(2);
  state.runs[0] = { ...state.runs[0], status: 'failed', can_retry: false, error_code: 'TRANSLATION_PROVIDER_CHANGED' };
  await expect(page.getByRole('button', { name: 'Resume unfinished batches' })).toBeDisabled();
  await expect(page.getByText('The provider is unavailable or its configuration changed.', { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(0);
});

test('saved history remains readable without a provider or while source transcription is active; narrow RTL layout fits', async ({ page }) => {
  const state = await mock(page, { noProvider: true, activeTask: true });
  state.runs[0] = { ...state.runs[0], source_is_current: false, can_edit: false };
  state.versions[0].segments[0].text = 'مرحبا'.repeat(150);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start translation', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export translation', exact: true })).toBeEnabled();
  await expect(page.getByText('The source subtitle has changed.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/asrbox-translation-mobile.png', fullPage: true });
});

test('invalid languages are blocked; custom language and script variants work; save conflicts preserve draft', async ({ page }) => {
  await mock(page, { conflict: true });
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await select(page, 'Source language', 'Simplified Chinese');
  await expect(page.getByRole('button', { name: 'Start translation', exact: true })).toBeDisabled();
  await select(page, 'Target language', 'Traditional Chinese');
  await expect(page.getByRole('button', { name: 'Start translation', exact: true })).toBeEnabled();
  await select(page, 'Target language', 'Custom language');
  await page.getByRole('textbox', { name: 'Target language · Language name (1–80 characters)', exact: true }).fill('Esperanto');
  await expect(page.getByRole('button', { name: 'Start translation', exact: true })).toBeEnabled();
  const editor = page.getByRole('textbox', { name: 'Translation 1', exact: true });
  await editor.fill('My draft');
  await page.getByRole('button', { name: 'Save translation', exact: true }).click();
  await expect(page.getByText('Could not save. Your edits are preserved.', { exact: false })).toBeVisible();
  await expect(editor).toHaveValue('My draft');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('link', { name: 'Subtitle proofreading', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subtitle proofreading' })).toBeVisible();
});

test('switching tasks never carries a run or draft into another task; unknown run does not fall back', async ({ page }) => {
  await mock(page);
  const second = { ...task, id: 'second-task', filename: 'second.wav' };
  await page.route(`${server}/tasks`, route => route.fulfill({ json: { items: [task, second], total: 2 } }));
  await page.route(`${server}/tasks/second-task/versions`, route => route.fulfill({ json: [{ id: 22, version_type: 'transcribe', segments: task.segments, created_at: task.created_at }] }));
  await page.route(`${server}/tasks/second-task/translation-runs`, route => route.fulfill({ json: { items: [] } }));
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /second\.wav/ }).click();
  await expect(page).toHaveURL(/task=second-task&mode=translation$/);
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toHaveCount(0);
  await page.goto('/ai?task=translation-task&mode=translation&run=foreign-run');
  await expect(page.getByText('The requested translation is unavailable for this task.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toHaveCount(0);
});

test('source playback seeks to the chosen cue and a missing file leaves editing and export usable', async ({ page }) => {
  await mock(page);
  await page.route(`${server}/tasks`, route => route.fulfill({ json: { items: [{ ...task, audio_path: 'uploads/synthetic.wav' }], total: 1 } }));
  // Four seconds of synthetic silence; no user media is used.
  const pcm = Buffer.alloc(44 + 16000 * 2 * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(16000, 24); pcm.writeUInt32LE(32000, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(pcm.length - 44, 40);
  await page.route(`${server}/tasks/${task.id}/audio`, route => route.fulfill({ body: pcm, contentType: 'audio/wav' }));
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await page.getByRole('button', { name: 'Play source segment 2', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Close player', exact: true }).click();
  await page.route(`${server}/tasks/${task.id}/audio`, route => route.fulfill({ status: 404, json: { detail: 'Media missing' } }));
  await page.reload();
  await page.getByRole('button', { name: 'Play source segment 1', exact: true }).click();
  await expect(page.getByText('Source media is unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Translation 1', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export translation', exact: true })).toBeEnabled();
});

test('shows real batch waiting time without inventing progress, then exposes timeout and explicit resume', async ({ page }) => {
  const state = await mock(page, { empty: true });
  const now = new Date('2026-09-07T02:15:00Z');
  await page.clock.install({ time: now });
  state.runs = [{ ...completed, status: 'running', completed_segments: 0, completed_batches: 0,
    latest_translation_version_id: null, can_edit: false, can_export: false,
    updated_at: '2026-09-07T02:14:45.000000' }];
  await page.goto('/ai?task=translation-task&mode=translation&run=run-1');
  await expect(page.getByTestId('translation-wait')).toContainText('Waiting for this batch: 15s.');
  await expect(page.getByTestId('translation-wait')).toContainText('90-second limit');
  await page.clock.fastForward(5000);
  await expect(page.getByTestId('translation-wait')).toContainText('Waiting for this batch: 20s.');
  await expect(page.getByText('0 / 2 segments · 0 / 2 batches saved')).toBeVisible();
  state.runs[0] = { ...state.runs[0], status: 'failed', error_code: 'LLM_PROVIDER_TIMEOUT', can_retry: true };
  await page.clock.fastForward(2000);
  await expect(page.getByText('The provider did not finish within 90 seconds.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('translation-wait')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume unfinished batches' })).toBeEnabled();
  expect(state.posts).toHaveLength(0);
});
