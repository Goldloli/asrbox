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
}: ConsumeSseOptions) {
  const headers = new Headers({ Accept: 'text/event-stream' });
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
