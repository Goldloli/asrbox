import { expect, test, type Page, type Route } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

const eligibleTask = {
  id: 'chat-task',
  filename: 'interview.wav',
  source: 'local',
  audio_path: 'uploads/interview.wav',
  status: 'completed',
  progress: 100,
  language: 'zh',
  duration_ms: 8_000,
  text: '第一句 第二句',
  options: {},
  segments: [
    { id: 1, start: 0, end: 2, text: '第一句', speaker: null, confidence: 0.9 },
    { id: 2, start: 2, end: 4, text: '第二句', speaker: null, confidence: 0.9 },
  ],
  created_at: '2026-09-09T10:00:00Z',
  updated_at: '2026-09-09T10:00:00Z',
  completed_at: '2026-09-09T10:00:00Z',
};

const provider = {
  id: 'ollama-local',
  name: 'Ollama',
  preset: 'ollama',
  base_url: 'http://localhost:11434/v1',
  api_key_masked: null,
  default_model: 'qwen3:8b',
  enabled: true,
  is_local: true,
  compatibility: { protocol: 'auto', thinking: 'auto', output_format: 'auto', transport: 'json' },
  created_at: '2026-09-09T10:00:00Z',
  updated_at: '2026-09-09T10:00:00Z',
};

type ChatMessage = {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'partial' | 'error';
  created_at: string;
};

type MockState = {
  sessionCreated: boolean;
  messages: ChatMessage[];
  deleted: boolean;
  streamBody: string;
  streamDelayMs: number;
  taskId: string | null;
  lastPatch: Record<string, unknown> | null;
};

function sseBody(events: Array<[string, unknown]>) {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function sessionSummary(state: MockState) {
  return {
    id: 'chat-1',
    task_id: state.taskId,
    provider_id: provider.id,
    title: state.messages.find((message) => message.role === 'user')?.content ?? '',
    created_at: '2026-09-09T10:01:00Z',
    updated_at: '2026-09-09T10:01:00Z',
  };
}

async function mockChat(page: Page, state: MockState, options: { providers?: unknown[] } = {}) {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
  await page.route(`${serverUrl}/tasks`, (route) => route.fulfill({ json: { items: [eligibleTask], total: 1 } }));
  await page.route(`${serverUrl}/tasks/active`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`${serverUrl}/llm-providers`, (route) => route.fulfill({ json: { items: options.providers ?? [provider] } }));
  await page.route(`${serverUrl}/llm-providers/presets`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`${serverUrl}/chat/sessions`, (route) => {
    if (route.request().method() === 'POST') {
      state.sessionCreated = true;
      return route.fulfill({ json: { ...sessionSummary(state), messages: [] } });
    }
    return route.fulfill({ json: { items: state.sessionCreated && !state.deleted ? [sessionSummary(state)] : [] } });
  });
  await page.route(`${serverUrl}/chat/sessions/chat-1`, (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      state.deleted = true;
      return route.fulfill({ json: { message: 'deleted' } });
    }
    if (method === 'PATCH') {
      const patch = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      state.lastPatch = patch;
      if ('task_id' in patch) state.taskId = patch.task_id as string | null;
      return route.fulfill({ json: { ...sessionSummary(state), messages: state.messages } });
    }
    return route.fulfill({ json: { ...sessionSummary(state), messages: state.messages } });
  });
  await page.route(`${serverUrl}/chat/sessions/chat-1/messages`, async (route) => {
    const question = (route.request().postDataJSON() as { content: string }).content;
    state.messages.unshift({
      id: 1,
      session_id: 'chat-1',
      role: 'user',
      content: question,
      status: 'complete',
      created_at: '2026-09-09T10:02:00Z',
    });
    if (state.streamDelayMs) await new Promise((resolve) => setTimeout(resolve, state.streamDelayMs));
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: state.streamBody,
    });
  });
}

const okState = (): MockState => {
  const state: MockState = { sessionCreated: false, messages: [], deleted: false, streamBody: '', streamDelayMs: 0, taskId: null, lastPatch: null };
  const answer: ChatMessage = {
    id: 2,
    session_id: 'chat-1',
    role: 'assistant',
    content: '可以导出 SRT 等格式。',
    status: 'complete',
    created_at: '2026-09-09T10:02:05Z',
  };
  state.streamBody = sseBody([
    ['delta', { content: '可以导出 ' }],
    ['delta', { content: 'SRT 等格式。' }],
    ['done', { message: answer }],
  ]);
  state.messages.push(answer);
  return state;
};

test('chat tab answers a question with streamed deltas and persists the reply', async ({ page }) => {
  const state = okState();
  state.streamDelayMs = 400;
  await mockChat(page, state);
  await page.goto('/ai?mode=chat');

  await expect(page.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Persisted conversations')).toBeVisible();
  await expect(page.getByText('No transcript bound: answers rely on the built-in documentation knowledge base.')).toBeVisible();

  await page.getByPlaceholder('Ask about ASRbox or the bound subtitles…').fill('如何导出字幕？');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByRole('paragraph').filter({ hasText: '如何导出字幕？' })).toBeVisible();
  await expect(page.getByText('可以导出 SRT 等格式。')).toBeVisible();
  await expect(page.getByRole('button', { name: /如何导出字幕？/ })).toBeVisible();
});

test('shows a classified error when the provider fails mid-stream', async ({ page }) => {
  const state: MockState = { sessionCreated: false, messages: [], deleted: false, streamBody: '', streamDelayMs: 0, taskId: null, lastPatch: null };
  state.streamBody = sseBody([
    ['delta', { content: '半截回答' }],
    ['error', { code: 'LLM_PROVIDER_RATE_LIMITED', message: 'LLM provider rate limit reached', message_id: 2 }],
  ]);
  state.messages.push({
    id: 2,
    session_id: 'chat-1',
    role: 'assistant',
    content: '半截回答',
    status: 'error',
    created_at: '2026-09-09T10:02:05Z',
  });
  await mockChat(page, state);
  await page.goto('/ai?mode=chat');

  await page.getByPlaceholder('Ask about ASRbox or the bound subtitles…').fill('讲个故事');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Request limit reached')).toBeVisible();
  await expect(page.getByText(/LLM_PROVIDER_RATE_LIMITED/)).toBeVisible();
  await expect(page.getByText('半截回答')).toBeVisible();
  await expect(page.getByText('Failed', { exact: true })).toBeVisible();
});

test('guides to settings when no LLM provider is configured', async ({ page }) => {
  const state = okState();
  await mockChat(page, state, { providers: [] });
  await page.goto('/ai?mode=chat');

  await expect(page.getByText('No LLM provider available')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configure provider' })).toBeVisible();
});

test('deletes a persisted chat session after confirmation', async ({ page }) => {
  const state = okState();
  state.sessionCreated = true;
  state.messages.unshift({
    id: 1,
    session_id: 'chat-1',
    role: 'user',
    content: '如何导出字幕？',
    status: 'complete',
    created_at: '2026-09-09T10:02:00Z',
  });
  await mockChat(page, state);
  await page.goto('/ai?mode=chat');

  const sessionRow = page.getByRole('button', { name: /如何导出字幕？/ });
  await sessionRow.hover();
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(page.getByText('No chats yet')).toBeVisible();
});

test('binds and unbinds a transcript task via the labelled selectors', async ({ page }) => {
  const state = okState();
  await mockChat(page, state);
  await page.goto('/ai?mode=chat');

  await expect(page.getByText('Model selection')).toBeVisible();
  await expect(page.getByText('Feature: bind a transcript for Q&A')).toBeVisible();

  await page.getByPlaceholder('Ask about ASRbox or the bound subtitles…').fill('你好');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 10_000 });

  const bindSelect = page.getByRole('combobox', { name: 'Bound transcript' });
  await bindSelect.click();
  await page.getByRole('option', { name: 'interview.wav' }).click();
  expect(state.lastPatch).toMatchObject({ task_id: 'chat-task' });
  await expect(bindSelect).toContainText('interview.wav');

  await bindSelect.click();
  await page.getByRole('option', { name: 'No transcript (app Q&A only)' }).click();
  expect(state.lastPatch).toMatchObject({ task_id: null });
  await expect(bindSelect).toContainText('No transcript');
});

test('renders assistant markdown as rich text', async ({ page }) => {
  const state: MockState = { sessionCreated: false, messages: [], deleted: false, streamBody: '', streamDelayMs: 0, taskId: null, lastPatch: null };
  const markdown = '支持这些格式：\n\n- **SRT**\n- `VTT`';
  const answer: ChatMessage = {
    id: 2,
    session_id: 'chat-1',
    role: 'assistant',
    content: markdown,
    status: 'complete',
    created_at: '2026-09-09T10:02:05Z',
  };
  state.streamBody = sseBody([['delta', { content: markdown }], ['done', { message: answer }]]);
  state.messages.push(answer);
  await mockChat(page, state);
  await page.goto('/ai?mode=chat');

  await page.getByPlaceholder('Ask about ASRbox or the bound subtitles…').fill('支持哪些格式？');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('strong').filter({ hasText: 'SRT' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('listitem').filter({ hasText: 'VTT' })).toBeVisible();
  await expect(page.locator('code').filter({ hasText: 'VTT' })).toBeVisible();
});
