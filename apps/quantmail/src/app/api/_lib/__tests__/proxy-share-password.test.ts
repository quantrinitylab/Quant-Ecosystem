// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

/**
 * fix/qm-share-pw-query-param: share-link passwords travel ONLY in the
 * `x-share-password` header (never the query string). The generic proxy must
 * forward that header to the backend — without this hop the proxy would
 * strip the secret and every password-protected public download would 401.
 */

const BACKEND_PATH = '/drive/public/share/abc123/download';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const getRequest = (headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(`http://localhost:3000/api${BACKEND_PATH}`, {
    method: 'GET',
    headers,
  });

const forwardedHeaders = (fetchMock: ReturnType<typeof vi.fn>): Record<string, string> => {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('expected fetch to have been called at least once');
  const init = (call[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return init.headers as Record<string, string>;
};

describe('proxyToBackend x-share-password forwarding', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards the x-share-password header to the backend', async () => {
    await proxyToBackend(getRequest({ 'x-share-password': 's3cret' }), BACKEND_PATH);

    const headers = forwardedHeaders(fetchMock);
    expect(headers['x-share-password']).toBe('s3cret');
  });

  it('does not inject the header when the client sent none', async () => {
    await proxyToBackend(getRequest(), BACKEND_PATH);

    const headers = forwardedHeaders(fetchMock);
    expect(headers['x-share-password']).toBeUndefined();
  });
});
