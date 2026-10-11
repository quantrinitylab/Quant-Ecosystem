// @vitest-environment node
// ============================================================================
// quantmail — QM-SCREEN-010 proxy-gap fixes: drive proxy route tests
// ============================================================================
//
// useDrive.ts calls Next endpoints for which no `src/app/api/drive/*` proxy
// route existed (trash, files/:id/restore, files/:id/purge, shares/received,
// shares/sent, shares/:id/accept, shares/:id/decline, /drive/move), so every
// call 404'd even though the backend implements them. These tests pin each new
// route to its backend path, method, auth forwarding and honest-502 behaviour.
//
// `fetch` is mocked, so "reached the backend" means `safeFetch` was called
// with the right URL — not that a backend is running.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import * as trashRoute from '../app/api/drive/trash/route';
import * as restoreRoute from '../app/api/drive/files/[fileId]/restore/route';
import * as purgeRoute from '../app/api/drive/files/[fileId]/purge/route';
import * as receivedRoute from '../app/api/drive/shares/received/route';
import * as sentRoute from '../app/api/drive/shares/sent/route';
import * as acceptRoute from '../app/api/drive/shares/[shareId]/accept/route';
import * as declineRoute from '../app/api/drive/shares/[shareId]/decline/route';
import * as moveRoute from '../app/api/drive/move/route';
import * as foldersRoute from '../app/api/drive/folders/route';

const BACKEND =
  process.env['QUANTDRIVE_BACKEND_URL'] ??
  process.env['QUANTMAIL_BACKEND_URL'] ??
  'http://localhost:3010';

const AUTH = 'Bearer test-session-token';

const requestFor = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3000/api/drive${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      Authorization: AUTH,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const paramsFor = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('QM-SCREEN-010 drive proxy gaps', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/drive/trash proxies to backend GET /drive/trash', async () => {
    const res = await trashRoute.GET(requestFor('/trash', 'GET'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/trash`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('POST /api/drive/files/:id/restore proxies to backend POST /drive/files/:id/restore', async () => {
    const res = await restoreRoute.POST(
      requestFor('/files/file-123/restore', 'POST'),
      paramsFor({ fileId: 'file-123' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/files/file-123/restore`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(res.status).toBe(200);
  });

  it('DELETE /api/drive/files/:id/purge proxies to backend DELETE /drive/files/:id/purge', async () => {
    const res = await purgeRoute.DELETE(
      requestFor('/files/file-123/purge', 'DELETE'),
      paramsFor({ fileId: 'file-123' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/files/file-123/purge`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(res.status).toBe(200);
  });

  it('GET /api/drive/shares/received proxies to backend GET /drive/shares/received', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ shares: [] }));
    const res = await receivedRoute.GET(requestFor('/shares/received', 'GET'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/shares/received`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(await res.json()).toEqual({ shares: [] });
  });

  it('GET /api/drive/shares/sent proxies to backend GET /drive/shares/sent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const res = await sentRoute.GET(requestFor('/shares/sent', 'GET'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/shares/sent`);
    expect(await res.json()).toEqual({ items: [] });
  });

  it('POST /api/drive/shares/:id/accept proxies to backend POST /drive/shares/:id/accept', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    const res = await acceptRoute.POST(
      requestFor('/shares/share-9/accept', 'POST'),
      paramsFor({ shareId: 'share-9' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/shares/share-9/accept`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(await res.json()).toEqual({ success: true });
  });

  it('POST /api/drive/shares/:id/decline proxies to backend POST /drive/shares/:id/decline', async () => {
    const res = await declineRoute.POST(
      requestFor('/shares/share-9/decline', 'POST'),
      paramsFor({ shareId: 'share-9' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/shares/share-9/decline`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(res.status).toBe(200);
  });

  it('POST /api/drive/move proxies to backend POST /drive/move with the body verbatim', async () => {
    const body = { fileIds: ['f1', 'f2'], targetFolderId: 'folder-7' };
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, movedFiles: 2, movedFolders: 0 }));
    const res = await moveRoute.POST(requestFor('/move', 'POST', body));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/move`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(await res.json()).toEqual({ ok: true, movedFiles: 2, movedFolders: 0 });
  });

  it('backend errors pass through with their status, not a 200', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { message: 'Trash item not found' } }, 404),
    );
    const res = await restoreRoute.POST(
      requestFor('/files/missing/restore', 'POST'),
      paramsFor({ fileId: 'missing' }),
    );
    expect(res.status).toBe(404);
  });

  it('an unreachable backend yields an honest 502 UPSTREAM_UNAVAILABLE, never a 404', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    const res = await trashRoute.GET(requestFor('/trash', 'GET'));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  // QM-FIX drive-folders-405: Quanty's organize flow calls GET
  // /api/drive/folders (resolveFolderId). The route only exported POST, so
  // every GET 405'd and the lookup silently fell back to null. These pin the
  // new GET export to the backend's GET /drive/folders (flat list of all
  // non-deleted folders, every depth), keeping the caller's `{ folders }`
  // contract.
  it('GET /api/drive/folders proxies to backend GET /drive/folders', async () => {
    const payload = {
      folders: [
        { id: 'fld-1', name: 'Receipts', parentId: null, path: '/Receipts' },
        { id: 'fld-2', name: '2024', parentId: 'fld-1', path: '/Receipts/2024' },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));
    const res = await foldersRoute.GET(requestFor('/folders', 'GET'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/folders`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(AUTH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });

  it('GET /api/drive/folders passes backend errors through with their status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { message: 'nope', code: 'X' } }, 500),
    );
    const res = await foldersRoute.GET(requestFor('/folders', 'GET'));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it('GET /api/drive/folders yields an honest 502 when the backend is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    const res = await foldersRoute.GET(requestFor('/folders', 'GET'));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('POST /api/drive/folders still proxies folder creation to the backend', async () => {
    const body = { name: 'Invoices', parentId: null };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'fld-9', name: 'Invoices' }, 201),
    );
    const res = await foldersRoute.POST(requestFor('/folders', 'POST', body));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}/drive/folders`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(res.status).toBe(201);
  });
});
