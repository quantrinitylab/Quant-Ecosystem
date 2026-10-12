// ===========================================================================
// QC-F-056 — Snap Map location publish / Ghost Mode regression tests
// ===========================================================================
//
// The defect: the map page published the user's location only as WebSocket
// frames (`location-update` / `ghost-mode-enabled`) that the backend never
// handles — no FriendLocation row was ever written for a web user, and
// Ghost Mode never removed the server row. The api-client compounded it:
// `setGhostMode` POSTed to a non-existent `/map/ghost-mode`,
// `getFriendLocations` POSTed to the GET-only `/map/friends`, and
// `updateLocation`'s payload type never matched the backend Zod schema.
//
// These tests pin the fixed contract:
//   1. publishLocation POSTs {latitude, longitude} to /api/map/location
//      and reports success only on an OK response;
//   2. clearSharedLocation DELETEs /api/map/location (the Ghost Mode
//      action) and likewise never pretends success;
//   3. source guards: the page uses the REST helpers and no longer emits
//      the dead socket frames; the Next proxy route forwards POST+DELETE;
//      the api-client has no dead map endpoints left.
//
// Against the pre-fix code every one of these fails: the helper module and
// the proxy route did not exist, and the page/api-client still carried the
// dead frames and endpoints (verified by negative control).
// ===========================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { publishLocation, clearSharedLocation } from '../app/map/locationShare';

function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

describe('QC-F-056 locationShare REST helpers', () => {
  it('publishLocation POSTs the backend wire shape to /api/map/location', async () => {
    const fetchRaw = vi.fn(async () => ({ ok: true, status: 200 }));

    const ok = await publishLocation(fetchRaw, 28.6139, 77.209);

    expect(ok).toBe(true);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = fetchRaw.mock.calls[0] as unknown as [
      string,
      { method?: string; body?: string },
    ];
    expect(path).toBe('/api/map/location');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body ?? '{}')).toEqual({ latitude: 28.6139, longitude: 77.209 });
  });

  it('publishLocation reports failure honestly (non-OK and thrown)', async () => {
    const httpFail = vi.fn(async () => ({ ok: false, status: 503 }));
    await expect(publishLocation(httpFail, 1, 2)).resolves.toBe(false);

    const netFail = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(publishLocation(netFail, 1, 2)).resolves.toBe(false);
  });

  it('clearSharedLocation DELETEs /api/map/location (Ghost Mode removes the server row)', async () => {
    const fetchRaw = vi.fn(async () => ({ ok: true, status: 200 }));

    const ok = await clearSharedLocation(fetchRaw);

    expect(ok).toBe(true);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = fetchRaw.mock.calls[0] as unknown as [
      string,
      { method?: string },
    ];
    expect(path).toBe('/api/map/location');
    expect(init.method).toBe('DELETE');
  });

  it('clearSharedLocation reports failure honestly', async () => {
    const httpFail = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(clearSharedLocation(httpFail)).resolves.toBe(false);
  });
});

describe('QC-F-056 wiring guards (page, proxy, api-client)', () => {
  const pageSource = readAppSource('src/app/map/page.tsx');
  const apiClientSource = readAppSource('src/services/api-client.ts');

  it('map page publishes and ghost-clears through the REST helpers', () => {
    expect(pageSource).toContain('publishLocation');
    expect(pageSource).toContain('clearSharedLocation');
  });

  it('map page no longer emits the dead WebSocket location/ghost frames', () => {
    expect(pageSource).not.toContain("'location-update'");
    expect(pageSource).not.toContain('ghost-mode-enabled');
    expect(pageSource).not.toContain('ghost-mode-disabled');
  });

  it('Next proxy route forwards POST and DELETE to the real backend /map/location', () => {
    const routeSource = readAppSource('src/app/api/map/location/route.ts');
    expect(routeSource).toContain('export async function POST');
    expect(routeSource).toContain('export async function DELETE');
    expect(routeSource).toContain("'/map/location'");
    expect(routeSource).toContain('proxyToBackend');
  });

  it('api-client has no dead map endpoints and matches the backend routes', () => {
    expect(apiClientSource).not.toContain('/map/ghost-mode');
    expect(apiClientSource).not.toContain("this.post('/map/friends'");
    expect(apiClientSource).toContain("this.delete('/map/location')");
    expect(apiClientSource).toContain("this.get('/map/friends')");
  });
});
