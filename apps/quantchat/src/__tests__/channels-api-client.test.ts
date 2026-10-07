// @vitest-environment node
// ============================================================================
// quantchat — channels apiClient method tests (PR-B)
// ============================================================================
//
// The apiClient channel methods must hit the right /api/channels* endpoints
// with the right method/body, attach the bearer, and propagate a non-success
// envelope (e.g. the backend's 403) rather than masking it. Global fetch mock.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { QuantChatApiClient } from '../services/api-client';

let client: QuantChatApiClient;

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  client = new QuantChatApiClient();
  client.setTokens('access.jwt', 'refresh.jwt');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiClient channel methods', () => {
  it('getChannels GETs /api/channels with the bearer', async () => {
    const fetchMock = stubFetch(200, { success: true, data: [] });
    const res = await client.getChannels();
    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/channels');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access.jwt');
  });

  it('publishToChannel POSTs the content body to the publish endpoint', async () => {
    const fetchMock = stubFetch(201, { success: true, data: { id: 'm1' } });
    await client.publishToChannel('c1', 'hello subscribers');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/channels/c1/publish');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'hello subscribers' });
  });

  it('propagates a 403 publish rejection instead of masking it', async () => {
    stubFetch(403, {
      success: false,
      error: { code: 'CHANNEL_POST_FORBIDDEN', message: 'Only admins can post', statusCode: 403 },
    });
    const res = await client.publishToChannel('c1', 'nope');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('CHANNEL_POST_FORBIDDEN');
  });

  it('subscribeChannel POSTs to the subscribe endpoint', async () => {
    const fetchMock = stubFetch(200, { success: true, data: { subscribed: true } });
    await client.subscribeChannel('c1');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/channels/c1/subscribe');
    expect(init.method).toBe('POST');
  });
});
