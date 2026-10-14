// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

/**
 * fix/qm-quantgit-ci-logs-stream: the dedicated logs route must forward to
 * the backend `/ci/builds/:id/logs` endpoint in stream-through mode so the
 * SSE response reaches the browser's EventSource intact.
 */

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

describe('GET /api/ci/builds/[id]/logs streaming route', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('proxies to the backend logs endpoint with streaming (not JSON-buffering)', async () => {
    const sseChunk = 'id: 0\nevent: connected\ndata: {"status":"connected"}\n\n';
    fetchMock.mockResolvedValueOnce(
      new Response(sseChunk, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    const request = new NextRequest('http://localhost:3000/api/ci/builds/build-123/logs', {
      method: 'GET',
    });
    const res = await GET(request, { params: Promise.resolve({ id: 'build-123' }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/ci/builds/build-123/logs', BACKEND_URL).toString());

    // Stream-through: SSE content type, raw chunk, never JSON-wrapped.
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toBe(sseChunk);
  });

  it('URL-encodes the build id before forwarding', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('data: x\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    const request = new NextRequest('http://localhost:3000/api/ci/builds/a%2Fb/logs', {
      method: 'GET',
    });
    await GET(request, { params: Promise.resolve({ id: 'a/b' }) });

    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('/ci/builds/a%2Fb/logs');
  });
});
