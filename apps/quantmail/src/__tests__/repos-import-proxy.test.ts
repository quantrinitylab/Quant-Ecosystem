// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as importRepo } from '../app/api/repos/import/route';

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

const backendJson = (body: unknown, options: ResponseInit = {}): Response => {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    ...options,
    status: options.status ?? 200,
    headers,
  });
};

// R18-NEW-1 regression: POST /api/repos/import was captured by the dynamic
// sibling apps/quantmail/src/app/api/repos/[id]/route.ts (GET + DELETE only),
// so Next.js answered every import attempt with 405 and the backend's
// POST /api/repos/import (handleImportRepo) was never reached. The static
// route must forward POST /api/repos/import to the backend instead.
describe('POST /api/repos/import proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exports a POST handler so /api/repos/import is not swallowed by the [id] route', async () => {
    expect(typeof importRepo).toBe('function');
    fetchMock.mockResolvedValueOnce(
      backendJson({ success: true, data: { id: 'repo-1' } }, { status: 201 }),
    );
    const request = new NextRequest('http://localhost:3000/api/repos/import', {
      method: 'POST',
      headers: { authorization: 'Bearer access-token' },
    });
    const response = await importRepo(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The [id] sibling has no POST export: calling it would have thrown a
    // 405 "Method Not Allowed" at the routing layer before any fetch.
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { id: 'repo-1' } });
  });

  it('forwards the import payload and bearer token to the backend /repos/import endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, repo: { id: 'repo-1' }, importedCommits: 0 },
        { status: 201 },
      ),
    );
    const body = JSON.stringify({
      sourceUrl: 'https://github.com/example/repo',
      provider: 'github',
      targetRepoName: 'repo',
      isPrivate: false,
      importPipelines: false,
      importEnv: false,
    });
    const request = new NextRequest('http://localhost:3000/api/repos/import', {
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      body,
    });

    const response = await importRepo(request);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(new URL('/repos/import', BACKEND_URL).toString());
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      repo: { id: 'repo-1' },
      importedCommits: 0,
    });
  });

  it('preserves the backend 401 so auth stays enforced server-side', async () => {
    fetchMock.mockResolvedValueOnce(
      backendJson({ success: false, error: { code: 'UNAUTHORIZED', statusCode: 401 } }, { status: 401 }),
    );
    const request = new NextRequest('http://localhost:3000/api/repos/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceUrl: 'https://github.com/example/repo' }),
    });

    const response = await importRepo(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it('fails closed when the backend is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:3010'));
    const request = new NextRequest('http://localhost:3000/api/repos/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceUrl: 'https://github.com/example/repo' }),
    });

    const response = await importRepo(request);
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe('BACKEND_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('ECONNREFUSED');
  });
});
