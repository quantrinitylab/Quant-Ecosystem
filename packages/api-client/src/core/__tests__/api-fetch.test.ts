import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiFetch, apiFetchRaw } from '../api-fetch';

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes an enveloped body through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { a: 1 } }));
    const res = await apiFetch<{ a: number }>('/api/things');
    expect(res).toEqual({ success: true, data: { a: 1 } });
  });

  it('wraps a non-enveloped JSON body as { success: true, data }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ blocklist: ['x'] }));
    const res = await apiFetch<{ blocklist: string[] }>('/api/brand-safety');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ blocklist: ['x'] });
  });

  it('wraps a JSON array body as { success: true, data }', async () => {
    fetchMock.mockResolvedValue(jsonResponse([1, 2, 3]));
    const res = await apiFetch<number[]>('/api/list');
    expect(res).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('treats an empty 2xx body as success with undefined data', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await apiFetch('/api/things/1', { method: 'DELETE' });
    expect(res.success).toBe(true);
    expect(res.data).toBeUndefined();
  });

  it('maps a non-JSON 2xx body to INVALID_RESPONSE (never throws)', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>edge error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const res = await apiFetch('/api/things');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_RESPONSE');
  });

  it('keeps mapping HTTP errors into the error envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NOPE', message: 'no' }, { status: 404 }));
    const res = await apiFetch('/api/missing');
    expect(res.success).toBe(false);
    expect(res.error?.statusCode).toBe(404);
  });

  it('still rejects non-/api/* paths', async () => {
    const res = await apiFetch('/auth/login', { method: 'POST' });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_PATH');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiFetchRaw', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (_url: string, _init?: RequestInit) => new Response('ok', { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the native Response untouched', async () => {
    const res = await apiFetchRaw('/api/things');
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('allows same-origin non-/api/* paths (e.g. /auth/* proxies)', async () => {
    await apiFetchRaw('/auth/login', { method: 'POST', body: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('rejects backend URLs with a TypeError', async () => {
    await expect(apiFetchRaw('https://backend.example.com/api/x')).rejects.toThrow(TypeError);
    await expect(apiFetchRaw('//evil.example.com/api')).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects path traversal', async () => {
    await expect(apiFetchRaw('/api/../secret')).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('JSON-encodes plain-object bodies and sets a JSON content type', async () => {
    await apiFetchRaw('/api/things', { method: 'POST', body: { keyword: 'x' } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"keyword":"x"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('passes pre-stringified bodies through byte-identical (no double-encoding)', async () => {
    const s = JSON.stringify({ keyword: 'x' });
    await apiFetchRaw('/api/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: s,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(s);
  });

  it('does not force a JSON content type on string bodies without one', async () => {
    await apiFetchRaw('/api/raw', { method: 'POST', body: 'plain' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('plain');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('passes FormData through without JSON-encoding it', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'x.txt');
    await apiFetchRaw('/api/upload', { method: 'POST', body: fd });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(fd);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('does not send a body on GET', async () => {
    await apiFetchRaw('/api/things', { body: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it('accepts HeadersInit tuple-array headers', async () => {
    await apiFetchRaw('/api/things', {
      headers: [['X-A', '1'], ['X-B', '2']] as [string, string][],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-A']).toBe('1');
    expect(headers['X-B']).toBe('2');
  });

  it('attaches a Bearer token and merges caller headers', async () => {
    const h = new Headers();
    h.set('X-Custom', '1');
    await apiFetchRaw('/api/things', {
      headers: h,
      token: 'tok123',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok123');
    expect(headers['x-custom']).toBe('1'); // Headers instances lowercase names
  });

  it('passes credentials/cache/mode through (behavior-preserving)', async () => {
    await apiFetchRaw('/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('manual');
  });

  it('appends params to the path', async () => {
    await apiFetchRaw('/api/things', { params: { a: '1', b: 'two' } });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/things?a=1&b=two');
  });

  it('wires an AbortSignal through without a default timeout', async () => {
    const controller = new AbortController();
    await apiFetchRaw('/api/slow', { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('aborts when an explicit timeout elapses', async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(apiFetchRaw('/api/slow', { timeout: 10 })).rejects.toThrow();
  });
});
