// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

/**
 * fix/qm-emails-search-proxy: GET /api/emails/search must proxy through
 * proxyToBackend like the sibling search routes (/api/search/all), so
 * Cookie/Origin are forwarded, Set-Cookie is relayed, and the frontend
 * `query` param is renamed to the backend schema's required `q`.
 * Regression: the route hand-rolled fetch with only Authorization, so
 * cookie-authenticated search requests 401'd here.
 */

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const searchRequest = (
  params: string,
  headers: Record<string, string> = {},
): NextRequest =>
  new NextRequest(`http://localhost:3000/api/emails/search?${params}`, {
    method: 'GET',
    headers,
  });

describe('GET /api/emails/search auth parity', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards Cookie, Origin and Authorization to the backend like sibling search routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    const res = await GET(
      searchRequest('q=hello&page=2', {
        Authorization: 'Bearer token-123',
        Cookie: 'session=abc; refresh=xyz',
        Origin: 'https://quantmail.in',
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/emails/search');
    const sent = init.headers as Record<string, string>;
    expect(sent['Authorization']).toBe('Bearer token-123');
    expect(sent['Cookie']).toBe('session=abc; refresh=xyz');
    expect(sent['Origin']).toBe('https://quantmail.in');
  });

  it('relays the backend Set-Cookie on the response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: [] }, 200, {
        'set-cookie': 'session=new-abc; Path=/; HttpOnly',
      }),
    );

    const res = await GET(searchRequest('q=hello', { Cookie: 'session=abc' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session=new-abc');
  });

  it('renames frontend `query` to the backend `q` param and forwards filter params verbatim', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    await GET(
      searchRequest(
        'query=invoice&from=a%40x.com&to=b%40x.com&page=3&pageSize=25&hasAttachment=true&label=l1&dateFrom=2026-01-01&dateTo=2026-02-01&subject=tax',
      ),
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const backendParams = new URL(url).searchParams;
    expect(backendParams.get('q')).toBe('invoice');
    expect(backendParams.has('query')).toBe(false);
    expect(backendParams.get('from')).toBe('a@x.com');
    expect(backendParams.get('to')).toBe('b@x.com');
    expect(backendParams.get('page')).toBe('3');
    expect(backendParams.get('pageSize')).toBe('25');
    expect(backendParams.get('hasAttachment')).toBe('true');
    expect(backendParams.get('label')).toBe('l1');
    expect(backendParams.get('dateFrom')).toBe('2026-01-01');
    // subject/dateTo were silently dropped by the hand-rolled mapping; the
    // helper forwards them verbatim and the backend schema accepts them.
    expect(backendParams.get('dateTo')).toBe('2026-02-01');
    expect(backendParams.get('subject')).toBe('tax');
  });

  it('keeps the old precedence: `query` wins when both `query` and `q` are sent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    await GET(searchRequest('query=new&q=old'));

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const backendParams = new URL(url).searchParams;
    expect(backendParams.get('q')).toBe('new');
    expect(backendParams.has('query')).toBe(false);
  });

  it('targets the backend emails/search endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    await GET(searchRequest('q=x'));

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(new URL('/emails/search?q=x', BACKEND_URL).toString());
  });
});
