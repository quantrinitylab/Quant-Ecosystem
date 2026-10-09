// @vitest-environment node
// ============================================================================
// QM-UIUX-088 — api-client timeout + sanitized error mapping regression tests
// ============================================================================
//
// On the original code, QuantChatApiClient.request() passed NO timeout to
// apiFetchRaw (a hung backend hung the UI forever) and its catch collapsed
// every failure into the blanket 'Network request failed'. These tests FAIL
// on the original code and PASS on the fix. Global fetch is stubbed, the
// same pattern as channels-api-client.test.ts — apiFetchRaw calls the
// global fetch, so the stub observes the real timeout wiring (an armed
// AbortSignal) and drives the real abort path.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { QuantChatApiClient, REQUEST_TIMEOUT_MS } from '../services/api-client';

let client: QuantChatApiClient;

beforeEach(() => {
  client = new QuantChatApiClient();
  client.setTokens('access.jwt', 'refresh.jwt');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A fetch that never responds on its own; it only rejects when aborted. */
function stubHangingFetch() {
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // hangs forever — exactly the defect scenario
        if (signal.aborted) {
          reject(new DOMException('The operation was aborted', 'AbortError'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted', 'AbortError')),
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubRejectingFetch(error: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    throw error;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type PrivateRequest = (
  method: string,
  path: string,
  body?: unknown,
  options?: { timeout?: number; signal?: AbortSignal },
) => Promise<{ success: boolean; error?: { code: string; message: string; statusCode: number } }>;

function privateRequest(c: QuantChatApiClient): PrivateRequest {
  return (c as unknown as { request: PrivateRequest }).request.bind(c);
}

describe('api-client timeout (QM-UIUX-088)', () => {
  it('exports a positive default request timeout', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it('arms an AbortSignal on requests by default (timeout wired through)', async () => {
    const fetchMock = stubHangingFetch();
    const pending = privateRequest(client)('POST', '/ai/chat', { message: 'hi' }, { timeout: 40 });
    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('TIMEOUT');
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a per-call timeout expiry to a TIMEOUT error, not a blanket network error', async () => {
    stubHangingFetch();
    const res = await privateRequest(client)('POST', '/ai/chat', { message: 'hi' }, { timeout: 40 });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('TIMEOUT');
    expect(res.error?.message).toBe('Request timed out. Please try again.');
  });

  it('honours timeout: 0 as "no timeout" (no signal armed by the client)', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ success: true, data: { response: 'ok' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await privateRequest(client)('POST', '/ai/chat', { message: 'hi' }, { timeout: 0 });
    expect(res.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });

  it('the default 30s ceiling fires for a hung AI request (fake timers)', async () => {
    vi.useFakeTimers();
    stubHangingFetch();
    const pending = client.chatWithAI('hello');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('TIMEOUT');
  });
});

describe('api-client sanitized error mapping (QM-UIUX-088)', () => {
  it('surfaces the real failure message instead of the blanket "Network request failed"', async () => {
    stubRejectingFetch(new Error('Backend exploded while generating'));
    const res = await client.chatWithAI('hi');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NETWORK_ERROR');
    expect(res.error?.message).toBe('Backend exploded while generating');
    expect(res.error?.message).not.toBe('Network request failed');
  });

  it('sanitizes URLs, IPs, and credentials out of surfaced error messages', async () => {
    stubRejectingFetch(
      new Error(
        'POST http://10.1.2.3:9000/ai failed: Bearer abcdef1234567890XYZ api_key=sk-1234567890abcdef',
      ),
    );
    const res = await client.chatWithAI('hi');
    expect(res.success).toBe(false);
    expect(res.error?.message).not.toContain('10.1.2.3');
    expect(res.error?.message).not.toContain('http://');
    expect(res.error?.message).not.toContain('abcdef1234567890XYZ');
    expect(res.error?.message).not.toContain('sk-1234567890abcdef');
  });

  it('maps a TimeoutError rejection to TIMEOUT', async () => {
    stubRejectingFetch(new DOMException('timed out', 'TimeoutError'));
    const res = await client.chatWithAI('hi');
    expect(res.error?.code).toBe('TIMEOUT');
  });

  it('reports a caller-initiated abort as ABORTED, not TIMEOUT or NETWORK_ERROR', async () => {
    stubHangingFetch();
    const controller = new AbortController();
    const pending = privateRequest(client)(
      'POST',
      '/ai/chat',
      { message: 'hi' },
      { signal: controller.signal, timeout: 60_000 },
    );
    controller.abort();
    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ABORTED');
    expect(res.error?.message).toBe('Request cancelled');
  });

  it('still falls back to the generic message when the error carries no message', async () => {
    stubRejectingFetch(new Error(''));
    const res = await client.chatWithAI('hi');
    expect(res.error?.code).toBe('NETWORK_ERROR');
    expect(res.error?.message).toBe('Network request failed');
  });
});
