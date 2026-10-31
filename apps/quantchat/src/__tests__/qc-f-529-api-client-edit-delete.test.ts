// @vitest-environment node
// ============================================================================
// quantchat — api-client edit/delete wire-shape tests (QC-F-529)
// ============================================================================
//
// `editMessage` existed but sent `{ newContent }` while the backend's
// editMessageSchema accepts ONLY `{ content }` — zod rejected every edit
// with 400 even once the proxy existed. A1 pins the corrected wire body
// (fails on the original client). A2 pins deleteMessage's DELETE wire
// shape (already correct on the original — a deliberate regression pin).
// Global fetch is stubbed; apiFetchRaw calls the global fetch
// (api-client-ai-error-timeout.test.ts pattern).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { QuantChatApiClient } from '../services/api-client';

let client: QuantChatApiClient;

beforeEach(() => {
  client = new QuantChatApiClient();
  client.setTokens('access.jwt', 'refresh.jwt');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubJsonFetch(status: number, payload: unknown) {
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

describe('api-client edit/delete (QC-F-529)', () => {
  it('A1: editMessage PUTs { content } (NOT { newContent }) to /api/messages/:id', async () => {
    const fetchMock = stubJsonFetch(200, {
      success: true,
      data: { id: 'm1', content: 'edited hello', isEdited: true },
    });
    const res = await client.editMessage('m1', 'edited hello');
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/messages/m1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ content: 'edited hello' });
  });

  it('A2: deleteMessage issues DELETE to /api/messages/:id (regression pin)', async () => {
    const fetchMock = stubJsonFetch(200, { success: true, data: { id: 'm1' } });
    const res = await client.deleteMessage('m1');
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/messages/m1');
    expect(init.method).toBe('DELETE');
  });
});
