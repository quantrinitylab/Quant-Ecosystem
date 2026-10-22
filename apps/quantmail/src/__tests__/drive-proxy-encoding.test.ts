// @vitest-environment node
// ============================================================================
// quantmail — drive proxy fileId/versionId URL-encoding (finding: raw
// ${fileId} interpolations in 9 drive proxy files)
// ============================================================================
//
// The drive proxy routes forward to the QuantDrive backend with the route's
// `:fileId` (and `:versionId`) interpolated into the backend URL path. Raw
// interpolation breaks any id containing `/`, spaces, `+` or `%` — the
// backend would see a different path (or a 404), and a hostile id could walk
// into a different route. Every interpolation must be encodeURIComponent'd,
// matching the convention already used by links/open/purge/restore routes.
//
// `fetch` is mocked, so "reached the backend" means `safeFetch` was called
// with the correctly-encoded URL — not that a backend is running.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import * as fileRoute from '../app/api/drive/files/[fileId]/route';
import * as downloadRoute from '../app/api/drive/files/[fileId]/download/route';
import * as detailsRoute from '../app/api/drive/files/[fileId]/details/route';
import * as activityRoute from '../app/api/drive/files/[fileId]/activity/route';
import * as versionsRoute from '../app/api/drive/files/[fileId]/versions/route';
import * as starRoute from '../app/api/drive/files/[fileId]/star/route';
import * as copyRoute from '../app/api/drive/files/[fileId]/copy/route';
import * as shareRoute from '../app/api/drive/files/[fileId]/share/route';
import * as versionRestoreRoute from '../app/api/drive/files/[fileId]/versions/[versionId]/restore/route';

const BACKEND =
  process.env['QUANTDRIVE_BACKEND_URL'] ??
  process.env['QUANTMAIL_BACKEND_URL'] ??
  'http://localhost:3010';

const AUTH = 'Bearer test-session-token';

// A fileId with every character that breaks naive path interpolation: slash,
// space, plus and a literal percent sequence.
const HOSTILE_ID = 'file/a b+1%2F';
const HOSTILE_ENCODED = encodeURIComponent(HOSTILE_ID);
const HOSTILE_VERSION = 'v 1/2';
const HOSTILE_VERSION_ENCODED = encodeURIComponent(HOSTILE_VERSION);

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

describe('drive proxy routes encode fileId/versionId in backend URLs', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let lastUrl: () => string;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    lastUrl = () => (fetchMock.mock.calls[0] as [string, RequestInit])[0];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUT /api/drive/files/:fileId encodes the id', async () => {
    await fileRoute.PUT(
      requestFor('/files/x', 'PUT', { name: 'renamed.txt' }),
      paramsFor({ fileId: HOSTILE_ID }),
    );
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}`);
  });

  it('DELETE /api/drive/files/:fileId encodes the id', async () => {
    await fileRoute.DELETE(requestFor('/files/x', 'DELETE'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}`);
  });

  it('GET /api/drive/files/:fileId/download encodes the id', async () => {
    await downloadRoute.GET(requestFor('/files/x/download', 'GET'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/download`);
  });

  it('GET /api/drive/files/:fileId/details encodes the id', async () => {
    await detailsRoute.GET(requestFor('/files/x/details', 'GET'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/details`);
  });

  it('GET /api/drive/files/:fileId/activity encodes the id', async () => {
    await activityRoute.GET(requestFor('/files/x/activity', 'GET'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/activity`);
  });

  it('GET /api/drive/files/:fileId/versions encodes the id', async () => {
    await versionsRoute.GET(requestFor('/files/x/versions', 'GET'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/versions`);
  });

  it('PUT /api/drive/files/:fileId/star encodes the id', async () => {
    await starRoute.PUT(requestFor('/files/x/star', 'PUT'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/star`);
  });

  it('DELETE /api/drive/files/:fileId/star encodes the id', async () => {
    await starRoute.DELETE(requestFor('/files/x/star', 'DELETE'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/star`);
  });

  it('POST /api/drive/files/:fileId/copy encodes the id', async () => {
    await copyRoute.POST(
      requestFor('/files/x/copy', 'POST', {}),
      paramsFor({ fileId: HOSTILE_ID }),
    );
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/copy`);
  });

  it('GET /api/drive/files/:fileId/share encodes the id', async () => {
    await shareRoute.GET(requestFor('/files/x/share', 'GET'), paramsFor({ fileId: HOSTILE_ID }));
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/share`);
  });

  it('POST /api/drive/files/:fileId/share encodes the id', async () => {
    await shareRoute.POST(
      requestFor('/files/x/share', 'POST', { email: 'a@b.c', role: 'viewer' }),
      paramsFor({ fileId: HOSTILE_ID }),
    );
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/share`);
  });

  it('DELETE /api/drive/files/:fileId/share encodes the id', async () => {
    await shareRoute.DELETE(
      requestFor('/files/x/share', 'DELETE', { email: 'a@b.c' }),
      paramsFor({ fileId: HOSTILE_ID }),
    );
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/${HOSTILE_ENCODED}/share`);
  });

  it('POST /api/drive/files/:fileId/versions/:versionId/restore encodes both ids', async () => {
    await versionRestoreRoute.POST(
      requestFor('/files/x/versions/y/restore', 'POST'),
      paramsFor({ fileId: HOSTILE_ID, versionId: HOSTILE_VERSION }),
    );
    expect(lastUrl()).toBe(
      `${BACKEND}/drive/files/${HOSTILE_ENCODED}/versions/${HOSTILE_VERSION_ENCODED}/restore`,
    );
  });

  it('plain ids pass through byte-identical (no over-encoding regression)', async () => {
    const res = await downloadRoute.GET(
      requestFor('/files/file-123/download', 'GET'),
      paramsFor({ fileId: 'file-123' }),
    );
    expect(lastUrl()).toBe(`${BACKEND}/drive/files/file-123/download`);
    expect(res.status).toBe(200);
  });

  it('no raw ${fileId}/${versionId}/${shareId} interpolation remains in the drive API surface', () => {
    const driveApiDir = join(__dirname, '..', 'app', 'api', 'drive');
    const files = [
      'files/[fileId]/route.ts',
      'files/[fileId]/download/route.ts',
      'files/[fileId]/details/route.ts',
      'files/[fileId]/activity/route.ts',
      'files/[fileId]/versions/route.ts',
      'files/[fileId]/star/route.ts',
      'files/[fileId]/copy/route.ts',
      'files/[fileId]/share/route.ts',
      'files/[fileId]/versions/[versionId]/restore/route.ts',
      'files/[fileId]/links/route.ts',
      'files/[fileId]/open/route.ts',
      'files/[fileId]/purge/route.ts',
      'files/[fileId]/restore/route.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(join(driveApiDir, rel), 'utf8');
      const stripped = src.replace(/\$\{encodeURIComponent\(([^)]*)\)\}/g, '');
      for (const token of ['${fileId}', '${versionId}', '${shareId}']) {
        expect(stripped, `${rel} contains raw ${token}`).not.toContain(token);
      }
    }
  });
});
