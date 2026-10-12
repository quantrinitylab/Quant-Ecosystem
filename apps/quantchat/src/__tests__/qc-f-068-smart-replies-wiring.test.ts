// @vitest-environment node
// ============================================================================
// QC-F-068 — cross-app memory (smart replies) wiring regression tests
// ============================================================================
//
// The defect: the backend's ONLY consumer of QuantMail-learned style +
// relationship memory (POST /ai/smart-replies -> AISmartRepliesService) was
// unreachable from the shipped web app —
//   (a) no Next proxy route existed, so every call 404'd;
//   (b) apiClient.getSmartReplies sent `{message}`, which the backend Zod
//       schema (SmartReplyInputSchema) rejects, and declared a fabricated
//       result shape the backend never returns;
//   (c) apiClient.chatWithAI targeted POST /ai/chat, a route that does not
//       exist anywhere;
//   (d) the live thread's ReplySuggestions called the ai-agent /ai/suggestions
//       endpoint, which never reads the cross-app memory.
//
// On the original code this suite FAILS: the proxy module does not exist,
// getSmartReplies posts the wrong body to a 404, chatWithAI exists, and the
// default suggestions fetcher posts `messages`/`draft` to /api/ai/suggestions.
// Global fetch is stubbed; module-level mocks only (no fresh-identity mocks).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as smartRepliesProxyPost } from '../app/api/ai/smart-replies/route';
import { QuantChatApiClient } from '../services/api-client';
import { defaultFetchSuggestions } from '../components/chat/ReplySuggestions';

const BACKEND = 'http://localhost:3002';

function jsonFetch(status: number, payload: unknown) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function firstCall(fetchMock: ReturnType<typeof jsonFetch>) {
  const c = fetchMock.mock.calls[0]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('QC-F-068 Next proxy — POST /api/ai/smart-replies', () => {
  it('forwards body + Authorization to the backend smart-replies route and relays the result', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { suggestions: ['Sounds good!'] },
    });
    vi.stubGlobal('fetch', fetchMock);
    const body = {
      conversationId: 'conv-1',
      recentMessages: [{ sender: 'them', content: 'lunch tomorrow?' }],
      count: 3,
    };
    const req = new NextRequest('http://localhost:3000/api/ai/smart-replies', {
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await smartRepliesProxyPost(req);

    expect(res.status).toBe(200);
    const { url, init, headers } = firstCall(fetchMock);
    expect(url).toBe(`${BACKEND}/ai/smart-replies`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(headers['Authorization']).toBe('Bearer test-access-token');
    const json = (await res.json()) as { success: boolean; data: { suggestions: string[] } };
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual(['Sounds good!']);
  });

  it('backend down -> honest 503, never fabricated suggestions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );
    const req = new NextRequest('http://localhost:3000/api/ai/smart-replies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: 'c', recentMessages: [] }),
    });

    const res = await smartRepliesProxyPost(req);

    expect(res.status).toBe(503);
    const json = (await res.json()) as {
      success: boolean;
      error: { code: string };
      data?: unknown;
    };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(json.data).toBeUndefined();
  });
});

describe('QC-F-068 apiClient — real smart-replies contract', () => {
  it('posts the backend contract verbatim to /ai/smart-replies and returns {suggestions}', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { suggestions: ['On my way', 'Give me 5 minutes'] },
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QuantChatApiClient();
    client.setTokens('access.jwt', 'refresh.jwt');

    const input = {
      conversationId: 'conv-9',
      recentMessages: [
        { sender: 'them', content: 'where are you?' },
        { sender: 'self', content: 'leaving now' },
      ],
      count: 3,
    };
    const res = await client.getSmartReplies(input);

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ suggestions: ['On my way', 'Give me 5 minutes'] });
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe('/api/ai/smart-replies');
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it('chatWithAI is gone — the phantom POST /ai/chat client method was removed', () => {
    const client = new QuantChatApiClient() as unknown as Record<string, unknown>;
    expect(client['chatWithAI']).toBeUndefined();
  });
});

describe('QC-F-068 ReplySuggestions default fetcher — live thread uses the memory-backed endpoint', () => {
  it('posts {conversationId, recentMessages, count} to /api/ai/smart-replies (isSelf stripped)', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { suggestions: ['Sure!', 'Tomorrow works'] },
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const out = await defaultFetchSuggestions({
      conversationId: 'conv-1',
      messages: [
        { sender: 'them', content: 'lunch tomorrow?', isSelf: false },
        { sender: 'self', content: 'maybe', isSelf: true },
      ],
      draft: 'ye',
      signal: controller.signal,
    });

    expect(out).toEqual(['Sure!', 'Tomorrow works']);
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe('/api/ai/smart-replies');
    expect(JSON.parse(String(init.body))).toEqual({
      conversationId: 'conv-1',
      recentMessages: [
        { sender: 'them', content: 'lunch tomorrow?' },
        { sender: 'self', content: 'maybe' },
      ],
      count: 3,
    });
  });

  it('no settled messages -> no request, no suggestions (nothing truthful to base them on)', async () => {
    const fetchMock = jsonFetch(200, { success: true, data: { suggestions: ['x'] } });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const out = await defaultFetchSuggestions({
      conversationId: 'conv-1',
      messages: [],
      draft: 'hello',
      signal: controller.signal,
    });

    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backend failure -> empty list, never invented chips', async () => {
    const fetchMock = jsonFetch(503, {
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Backend service is unavailable', statusCode: 503 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const out = await defaultFetchSuggestions({
      conversationId: 'conv-1',
      messages: [{ sender: 'them', content: 'hi' }],
      signal: controller.signal,
    });

    expect(out).toEqual([]);
  });
});
