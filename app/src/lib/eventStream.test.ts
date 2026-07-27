import { describe, expect, test } from 'bun:test';
import { consumeSseResponse, reconnectDelayMs, runEventStreamLoop } from './eventStream';

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
