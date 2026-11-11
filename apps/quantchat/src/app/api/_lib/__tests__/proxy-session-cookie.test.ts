import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

const originalFetch = global.fetch;

function mockBackend(handler: (url: string, init: RequestInit) => Response) {
  global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
}

describe('QC-F-154 proxy session-cookie behaviour', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('forwards the HttpOnly access cookie to the backend as Authorization (old client keeps its header)', () => {
    let seenAuth: string | undefined;
    mockBackend((_url, init) => {
      seenAuth = (init.headers as Record<string, string>)['Authorization'];
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    });
    const req = new NextRequest('http://localhost:3000/api/conversations', {
      headers: { cookie: 'quant_access_token=COOKIE_ACC; theme=dark' },
    });
    return proxyToBackend(req, '/conversations').then(async (res) => {
      expect(res.status).toBe(200);
      // Whitelisted: only the session cookie becomes the backend credential —
      // the raw Cookie header (theme=dark) is never blind-forwarded.
      expect(seenAuth).toBe('Bearer COOKIE_ACC');
    });
  });

  it('keeps forwarding a browser-sent Authorization header verbatim (old-client compat)', () => {
    let seenAuth: string | undefined;
    mockBackend((_url, init) => {
      seenAuth = (init.headers as Record<string, string>)['Authorization'];
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    });
    const req = new NextRequest('http://localhost:3000/api/conversations', {
      headers: { authorization: 'Bearer LOCALSTORAGE_TOK', cookie: 'quant_access_token=COOKIE_ACC' },
    });
    return proxyToBackend(req, '/conversations').then(async (res) => {
      expect(res.status).toBe(200);
      expect(seenAuth).toBe('Bearer LOCALSTORAGE_TOK');
    });
  });

  it('honest 401 when the backend rejects and there is no credential at all', async () => {
    mockBackend(() => new Response(JSON.stringify({ success: false }), { status: 401 }));
    const req = new NextRequest('http://localhost:3000/api/conversations');
    const res = await proxyToBackend(req, '/conversations');
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects a cross-origin mutating request 403 before touching the backend (CSRF)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const req = new NextRequest('http://localhost:3000/api/conversations', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com', cookie: 'quant_access_token=COOKIE_ACC' },
    });
    const res = await proxyToBackend(req, '/conversations');
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('CSRF_BLOCKED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets a same-origin mutating request through (no false CSRF positives)', async () => {
    mockBackend(() => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    const req = new NextRequest('http://localhost:3000/api/conversations', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: 'quant_access_token=COOKIE_ACC' },
    });
    const res = await proxyToBackend(req, '/conversations');
    expect(res.status).toBe(200);
  });
});
