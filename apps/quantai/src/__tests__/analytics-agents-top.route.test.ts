// ============================================================================
// quantai — analytics agents/top route test (F-153)
// ============================================================================
//
// Verifies the Next App Router proxy handler for GET /api/analytics/agents/top
// (which previously had no handler and 404'd). The route must forward to the
// QuantAI backend GET /analytics/agents/top via the shared `proxyToBackend`
// utility, propagate the Bearer <redacted> relay the backend status, and fail
// honestly when the backend is down or returns garbage.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/analytics/agents/top/route';

const BACKEND = 'http://localhost:3020';

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('analytics proxy: GET /api/analytics/agents/top', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards to the backend /analytics/agents/top URL and propagates the Bearer <redacted>', async () => {
    const req = new NextRequest('http://localhost:3000/api/analytics/agents/top', {
      headers: { authorization: 'Bearer <redacted>' },
    });

    const res = await GET(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/analytics/agents/top`);
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer <redacted>');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('relays a backend 500 status verbatim instead of masking it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
    const req = new NextRequest('http://localhost:3000/api/analytics/agents/top');

    const res = await GET(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'boom' });
  });

  it('returns 502 with an honest error envelope when the backend is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const req = new NextRequest('http://localhost:3000/api/analytics/agents/top');

    const res = await GET(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('returns 502 when the backend replies with non-JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>gateway</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const req = new NextRequest('http://localhost:3000/api/analytics/agents/top');

    const res = await GET(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_RESPONSE');
  });
});
