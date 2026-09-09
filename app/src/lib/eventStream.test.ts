import { describe, expect, test } from 'bun:test';
import { ChatStreamError, consumeChatSseResponse, consumeSseResponse, reconnectDelayMs, runEventStreamLoop } from './eventStream';

describe('event stream', () => {
  test('uses Authorization without putting the token in the URL and parses split frames', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: message\ndata: {"type":"task.',
      'updated","task_id":"1"}\n\n',
      ': keepalive\n\n',
    ];
    let requestedUrl = '';
    let requestedAuthorization = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    };
    const events: unknown[] = [];

    await consumeSseResponse({
      url: 'http://127.0.0.1:17494/events',
      apiToken: 'process-token',
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
      fetchImpl,
    });

    expect(requestedUrl).toBe('http://127.0.0.1:17494/events');
    expect(requestedUrl).not.toContain('process-token');
    expect(requestedAuthorization).toBe('Bearer process-token');
    expect(events).toEqual([{ type: 'task.updated', task_id: '1' }]);
  });

  test('uses bounded exponential reconnect delay', () => {
    expect(reconnectDelayMs(0)).toBe(500);
    expect(reconnectDelayMs(3)).toBe(4000);
    expect(reconnectDelayMs(30)).toBe(10000);
  });

  test('retries after the first connection fails', async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    let connections = 0;

    await runEventStreamLoop({
      url: 'http://127.0.0.1:17494/events',
      signal: controller.signal,
      onEvent: () => controller.abort(),
      consume: async (options) => {
        connections += 1;
        if (connections === 1) throw new Error('sidecar is not ready');
        options.onEvent({ type: 'task.updated' });
      },
      wait: async (delay) => {
        delays.push(delay);
      },
    });

    expect(connections).toBe(2);
    expect(delays).toEqual([500]);
  });
});

describe('chat completion stream', () => {
  function streamResponse(chunks: string[], status = 200, json?: unknown) {
    const encoder = new TextEncoder();
    if (json !== undefined) return async () => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    return async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }), { status });
  }

  test('posts the question with bearer token and replays ordered deltas before done', async () => {
    const doneMessage = { id: 2, session_id: 's1', role: 'assistant', content: '你好', status: 'complete', created_at: '2026-09-09T00:00:00Z' };
    const fetchImpl: typeof fetch = streamResponse([
      'event: delta\ndata: {"content":"你"}\n\nevent: del',
      'ta\ndata: {"content":"好"}\n\n',
      `event: done\ndata: ${JSON.stringify({ message: doneMessage })}\n\n`,
    ]) as typeof fetch;
    let authorization = '';
    let body = '';
    const wrapped: typeof fetch = async (input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      body = String(init?.body);
      return fetchImpl(input, init);
    };
    const deltas: string[] = [];

    const result = await consumeChatSseResponse<typeof doneMessage>({
      url: 'http://127.0.0.1:17494/chat/sessions/s1/messages',
      apiToken: 'process-token',
      content: '打招呼',
      signal: new AbortController().signal,
      onDelta: (delta) => deltas.push(delta),
      fetchImpl: wrapped,
    });

    expect(authorization).toBe('Bearer process-token');
    expect(JSON.parse(body)).toEqual({ content: '打招呼' });
    expect(deltas).toEqual(['你', '好']);
    expect(result.message).toEqual(doneMessage);
  });

  test('maps mid-stream error events to classified ChatStreamError', async () => {
    const fetchImpl = streamResponse([
      'event: delta\ndata: {"content":"半截"}\n\n',
      'event: error\ndata: {"code":"LLM_PROVIDER_RATE_LIMITED","message":"rate limited","message_id":7}\n\n',
    ]) as typeof fetch;
    const deltas: string[] = [];

    const failure = await consumeChatSseResponse({
      url: 'http://127.0.0.1:17494/chat/sessions/s1/messages',
      content: 'hi',
      signal: new AbortController().signal,
      onDelta: (delta) => deltas.push(delta),
      fetchImpl,
    }).catch((error) => error);

    expect(deltas).toEqual(['半截']);
    expect(failure).toBeInstanceOf(ChatStreamError);
    expect(failure.code).toBe('LLM_PROVIDER_RATE_LIMITED');
    expect(failure.messageId).toBe(7);
  });

  test('classifies pre-stream HTTP errors from the detail payload', async () => {
    const fetchImpl = streamResponse([], 400, { detail: { code: 'CHAT_PROVIDER_REQUIRED', message: 'configure a provider' } }) as typeof fetch;
    const failure = await consumeChatSseResponse({
      url: 'http://127.0.0.1:17494/chat/sessions/s1/messages',
      content: 'hi',
      signal: new AbortController().signal,
      fetchImpl,
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(ChatStreamError);
    expect(failure.code).toBe('CHAT_PROVIDER_REQUIRED');
    expect(failure.message).toBe('configure a provider');
  });

  test('rejects a stream that ends without a done event', async () => {
    const fetchImpl = streamResponse(['event: delta\ndata: {"content":"断流"}\n\n']) as typeof fetch;
    const failure = await consumeChatSseResponse({
      url: 'http://127.0.0.1:17494/chat/sessions/s1/messages',
      content: 'hi',
      signal: new AbortController().signal,
      fetchImpl,
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(ChatStreamError);
    expect(failure.code).toBe('CHAT_STREAM_INCOMPLETE');
  });
});
