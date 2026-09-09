export interface ConsumeSseOptions {
  url: string;
  apiToken?: string | null;
  signal: AbortSignal;
  onEvent: (event: unknown) => void;
  fetchImpl?: typeof fetch;
}

export interface RunEventStreamOptions extends ConsumeSseOptions {
  consume?: (options: ConsumeSseOptions) => Promise<void>;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export function reconnectDelayMs(attempt: number) {
  return Math.min(10_000, 500 * (2 ** Math.max(0, attempt)));
}

function emitFrame(frame: string, onEvent: (event: unknown) => void) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return;
  onEvent(JSON.parse(data));
}

export async function consumeSseResponse({
  url,
  apiToken,
  signal,
  onEvent,
  fetchImpl = fetch,
}: ConsumeSseOptions) {  const headers = new Headers({ Accept: 'text/event-stream' });
  if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Event stream failed with HTTP ${response.status}`);
  if (!response.body) throw new Error('Event stream response has no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop() ?? '';
      for (const frame of frames) emitFrame(frame, onEvent);
      if (done) break;
    }
    if (pending.trim()) emitFrame(pending, onEvent);
  } finally {
    reader.releaseLock();
  }
}

export function waitForReconnect(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, delayMs);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

export async function runEventStreamLoop({
  consume = consumeSseResponse,
  wait = waitForReconnect,
  ...options
}: RunEventStreamOptions) {
  let attempt = 0;
  while (!options.signal.aborted) {
    try {
      await consume(options);
      attempt = 0;
    } catch {
      if (options.signal.aborted) return;
    }
    if (options.signal.aborted) return;
    await wait(reconnectDelayMs(attempt), options.signal);
    attempt += 1;
  }
}

export interface ChatSseDelta {
  content: string;
}

export interface ChatSseDone<TMessage = unknown> {
  message: TMessage | null;
  aborted?: boolean;
}

export interface ChatSseErrorPayload {
  code: string;
  message: string;
  message_id?: number | null;
}

export class ChatStreamError extends Error {
  constructor(
    public code: string,
    message: string,
    public messageId?: number | null,
  ) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

export interface ConsumeChatSseOptions<TMessage = unknown> {
  url: string;
  apiToken?: string | null;
  content: string;
  signal: AbortSignal;
  onDelta?: (content: string) => void;
  fetchImpl?: typeof fetch;
}

function parseNamedFrame(frame: string): { event: string; data: unknown } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trimStart();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join('\n')) };
}

async function chatStreamHttpError(response: Response): Promise<ChatStreamError> {
  const fallback = `Chat stream failed with HTTP ${response.status}`;
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
      return new ChatStreamError(detail.code, typeof detail.message === 'string' ? detail.message : fallback);
    }
    if (typeof detail === 'string') return new ChatStreamError(`HTTP_${response.status}`, detail);
  } catch {
    // fall through to the generic error
  }
  return new ChatStreamError(`HTTP_${response.status}`, fallback);
}

export async function consumeChatSseResponse<TMessage = unknown>({
  url,
  apiToken,
  content,
  signal,
  onDelta,
  fetchImpl = fetch,
}: ConsumeChatSseOptions<TMessage>): Promise<ChatSseDone<TMessage>> {
  const headers = new Headers({ Accept: 'text/event-stream', 'Content-Type': 'application/json' });
  if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw await chatStreamHttpError(response);
  if (!response.body) throw new ChatStreamError('CHAT_STREAM_EMPTY', 'Chat stream response has no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: ChatSseDone<TMessage> | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop() ?? '';
      for (const frame of frames) {
        const parsed = parseNamedFrame(frame);
        if (!parsed) continue;
        if (parsed.event === 'delta') {
          onDelta?.((parsed.data as ChatSseDelta).content);
        } else if (parsed.event === 'done') {
          result = parsed.data as ChatSseDone<TMessage>;
        } else if (parsed.event === 'error') {
          const payload = parsed.data as ChatSseErrorPayload;
          throw new ChatStreamError(payload.code, payload.message, payload.message_id ?? null);
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new ChatStreamError('CHAT_STREAM_INCOMPLETE', 'Chat stream ended without a done event');
  return result;
}
