// @vitest-environment node
// ============================================================================
// quantube — /playlists seam tests (quantube-real-data-wiring · Task 5.1)
// ============================================================================
//
// Traverses the REAL integration seam for the Library "Playlists" + "Watch
// Later" surfaces, using Fastify `inject()` against quantube's REAL
// `buildApp()` (apps/quantube/backend/app.ts). Mirrors the as-shipped
// engine-surfaces.seam.test.ts harness: no network, no mocked server-core — the
// global `onRequest` auth hook from `createApp()`, the per-request Prisma-backed
// PlaylistService, the route-layer Zod validation /
// enrichment, and the route-boundary error classification are all exercised
// exactly as in production. JWTs are HS256-signed with Node's built-in `crypto`
// (matching the engine-surfaces template), adding no new dependency.
//
// ---------------------------------------------------------------------------
// SEEDING APPROACH (documented honestly):
//   The route's watch-later ENRICHMENT path builds `new VideoService(fastify.prisma)`
//   per request and calls `prisma.video.findUnique` (VideoService.getVideo THROWS
//   on a missing/deleted row → the route treats the throw as an orphan and SKIPS
//   the entry). There is no Postgres in the sandbox, so a real `findUnique` would
//   throw a connection error for EVERY id and every watch-later entry would be
//   skipped — making it impossible to assert that an added video is reflected in
//   the list.
//
//   To keep the assertions meaningful WITHOUT weakening the seam, we replace ONLY
//   the lowest-level DB driver after boot: `app.prisma` is swapped for an in-memory
//   video store seeded with known videos. EVERYTHING ELSE STAYS REAL — the global
//   auth hook, the `library:write` scope preHandler, the route handlers, the real
//   `VideoService` class logic (including its throw-on-missing → orphan-skip
//   behaviour), and the real in-memory `PlaylistService`. Per-request server-core
//   hooks (audit/notifications) capture the original module-level prisma at boot,
//   not `fastify.prisma`, so swapping the decorated value affects only the
//   VideoService reads under test. This is the "mock at the appropriate boundary"
//   path sanctioned by the task: the auth+route+service seam is unchanged.
// ---------------------------------------------------------------------------
//
// Coverage — design Correctness Properties:
//   P1 (envelope invariant)   — { success, data } on success; { success:false,
//                                error.code/statusCode } on failure.
//   P2 (auth seam, 401)       — every /playlists route is non-public; no/invalid
//                                bearer → 401, service never reached.
//   P3 (scope seam, 403)      — mutating routes require `library:write`; missing
//                                scope → 403; present → 2xx; never 500 for authz.
//   P8 (user isolation)       — A's playlist invisible to B; B's GET of A's id → 404.
//
// **Validates: Requirements 5.1, 5.2, 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 2.7, 2.8,
//   2.17, 3.8, 3.9**

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3006,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
// Hand-roll an HS256 JWT the auth plugin's jose.jwtVerify accepts (matches the
// engine-surfaces signToken helper exactly).
function signToken(scopes: string[], sub = 'user-123'): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `seam-pl-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: `${sub}@example.com`,
      username: sub,
      role: 'user',
      scopes,
      app: 'quantube',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// --- in-memory video store seam-double (see SEEDING APPROACH above) ---------
interface SeedVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string;
  duration: number;
  viewCount: number;
  deletedAt: Date | null;
}
const videoStore = new Map<string, SeedVideo>();
function seedVideo(v: Partial<SeedVideo> & { id: string }): void {
  videoStore.set(v.id, {
    title: `Title ${v.id}`,
    thumbnailUrl: `https://cdn.example/${v.id}.jpg`,
    channelId: `channel-${v.id}`,
    duration: 120,
    viewCount: 0,
    deletedAt: null,
    ...v,
  });
}
function installVideoStore(app: FastifyInstance): void {
  // Replace ONLY the DB driver; the real VideoService + PlaylistService classes
  // and the routes are untouched. The PlaylistService is now Prisma-backed and
  // constructed PER-REQUEST from `fastify.prisma`, so the same swapped fake
  // backs BOTH the video-enrichment reads AND the durable playlist/watch-later
  // storage. The fake faithfully models the two playlist delegates (assigning
  // ids + timestamps, enforcing @@unique([playlistId, videoId]), honouring
  // orderBy on createdAt/position) — every invariant under test is the REAL
  // service logic.
  type Row = Record<string, unknown>;
  const playlists: Row[] = [];
  const items: Row[] = [];
  let seq = 0;
  const nextId = (p: string): string => {
    seq += 1;
    return `${p}-${seq}`;
  };
  const matchRow = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.keys(where).every((k) => row[k] === where[k]);
  const orderRows = (rows: Row[], orderBy?: unknown): Row[] => {
    if (!orderBy || typeof orderBy !== 'object') return rows;
    const [field, dir] = Object.entries(orderBy as Record<string, 'asc' | 'desc'>)[0] ?? [];
    if (!field) return rows;
    return [...rows].sort((a, b) => {
      const av = a[field] as number | string | Date;
      const bv = b[field] as number | string | Date;
      const an = av instanceof Date ? av.getTime() : av;
      const bn = bv instanceof Date ? bv.getTime() : bv;
      if (an < bn) return dir === 'desc' ? 1 : -1;
      if (an > bn) return dir === 'desc' ? -1 : 1;
      return 0;
    });
  };

  (app as unknown as { prisma: unknown }).prisma = {
    video: {
      findUnique: async ({ where }: { where: { id: string } }) => videoStore.get(where.id) ?? null,
    },
    playlist: {
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row: Row = {
          id: nextId('pl'),
          videoCount: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        playlists.push(row);
        return { ...row };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const f = playlists.find((r) => matchRow(r, where));
        return f ? { ...f } : null;
      },
      findMany: async ({
        where,
        orderBy,
      }: { where?: Record<string, unknown>; orderBy?: unknown } = {}) =>
        orderRows(
          playlists.filter((r) => matchRow(r, where)),
          orderBy,
        ).map((r) => ({ ...r })),
      update: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const row = playlists.find((r) => matchRow(r, where))!;
        Object.assign(row, data);
        return { ...row };
      },
    },
    playlistItem: {
      create: async ({ data }: { data: Row }) => {
        if (
          items.some(
            (r) => r['playlistId'] === data['playlistId'] && r['videoId'] === data['videoId'],
          )
        ) {
          throw new Error('Unique constraint failed on (playlistId, videoId)');
        }
        const row: Row = { id: nextId('pli'), addedAt: new Date(), ...data };
        items.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        const i = items.findIndex((r) => matchRow(r, where));
        const [removed] = items.splice(i, 1);
        return { ...(removed as Row) };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (let i = items.length - 1; i >= 0; i -= 1) {
          if (matchRow(items[i]!, where)) {
            items.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      findMany: async ({
        where,
        orderBy,
      }: { where?: Record<string, unknown>; orderBy?: unknown } = {}) =>
        orderRows(
          items.filter((r) => matchRow(r, where)),
          orderBy,
        ).map((r) => ({ ...r })),
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: unknown;
      }) => {
        const f = orderRows(
          items.filter((r) => matchRow(r, where)),
          orderBy,
        );
        return f.length ? { ...(f[0] as Row) } : null;
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        items.filter((r) => matchRow(r, where)).length,
      update: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const row = items.find((r) => matchRow(r, where))!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  installVideoStore(app);
  seedVideo({ id: 'vid-wl-1', title: 'Watch Later One', duration: 300 });
  seedVideo({ id: 'vid-wl-2', title: 'Watch Later Two', duration: 90 });
});

afterAll(async () => {
  await app.close();
});

// ===========================================================================
// Harness sanity — the Prisma-backed PlaylistService is DURABLE: it is
// constructed per-request from the shared `fastify.prisma`, so state written in
// one request is visible to a later request because both reach the same store
// (Req 5.1, 5.2 — durability now lives in Postgres, not a boot singleton).
// ===========================================================================
describe('seam: durable PlaylistService across requests (Req 5.1, 5.2)', () => {
  it('persists service state across requests (Prisma-backed store, P1 envelope)', async () => {
    // A create in one request must be visible to a list in a LATER request — only
    // possible if both requests read/write the same durable store (Req 5.2).
    const token = signToken(['library:write'], 'persist-user');
    const created = await app.inject({
      method: 'POST',
      url: '/playlists',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Persisted playlist' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      success: true,
      data: { playlist: { title: 'Persisted playlist' } },
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/playlists',
      headers: { authorization: `Bearer ${signToken([], 'persist-user')}` },
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.some((p: { title: string }) => p.title === 'Persisted playlist')).toBe(
      true,
    );
  });
});

// ===========================================================================
// GET /playlists — read surface. Unauth → 401 (P2); authed token-only → 200.
// ===========================================================================
describe('seam: GET /playlists (read; Req 5.5, 6.1, 6.5, P2)', () => {
  const url = '/playlists';

  it('unauthenticated -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass; service not reached)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated with token only (no scope) -> 200 + { success, data:{ items } } envelope', async () => {
    const token = signToken([], 'read-user');
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

// ===========================================================================
// POST /playlists — mutating, library:write. Full 401/403/2xx matrix (P2/P3).
// ===========================================================================
describe('seam: POST /playlists (mutating, library:write; Req 6.1, 6.4, 6.6, 6.7, P3)', () => {
  const url = '/playlists';
  const payload = { title: 'My new playlist' };

  it('unauthenticated -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated WITHOUT library:write -> 403 FORBIDDEN (never 500; data unchanged)', async () => {
    const token = signToken(['library:read'], 'noscope-user');
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('authenticated WITH library:write -> 201 and reaches the PlaylistService', async () => {
    const token = signToken(['library:write'], 'create-user');
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Service reached: created playlist, server-assigned isSystem=false, default private.
    expect(body.data.playlist).toMatchObject({
      title: 'My new playlist',
      isSystem: false,
      visibility: 'private',
    });
  });
});

// ===========================================================================
// Create validation — invalid bodies → 400, no row created (Req 2.17, P1).
// ===========================================================================
describe('seam: POST /playlists validation (Req 2.17)', () => {
  const url = '/playlists';

  it('empty title -> 400 VALIDATION_ERROR (no playlist created)', async () => {
    const token = signToken(['library:write'], 'invalid-empty-user');
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });

    // No row created: the list (besides the reserved Watch Later system playlist)
    // contains no user-created playlist.
    const listed = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${signToken([], 'invalid-empty-user')}` },
    });
    const items = listed.json().data.items as Array<{ isSystem: boolean }>;
    expect(items.every((p) => p.isSystem === true)).toBe(true);
  });

  it('title longer than 200 chars -> 400 VALIDATION_ERROR', async () => {
    const token = signToken(['library:write'], 'invalid-long-user');
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'x'.repeat(201) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

// ===========================================================================
// GET /playlists/:id — unknown id → 404, no existence leakage (Req 2.8).
// ===========================================================================
describe('seam: GET /playlists/:id not found (Req 2.8)', () => {
  it('unknown id -> 404 NOT_FOUND (no leakage; not 403/500)', async () => {
    const token = signToken([], 'detail-user');
    const res = await app.inject({
      method: 'GET',
      url: '/playlists/does-not-exist',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

// ===========================================================================
// User isolation (Req 2.7, 2.8, P8) — A's playlist invisible to B; B's GET of
// A's id → 404 (indistinguishable from a truly-unknown id).
// ===========================================================================
describe('seam: user isolation across signed subjects (Req 2.7, 2.8, P8)', () => {
  it("A's created playlist is not visible to B, and B's GET of A's id -> 404", async () => {
    // A creates a playlist.
    const createRes = await app.inject({
      method: 'POST',
      url: '/playlists',
      headers: { authorization: `Bearer ${signToken(['library:write'], 'isolation-A')}` },
      payload: { title: "A's secret playlist" },
    });
    expect(createRes.statusCode).toBe(201);
    const playlistId = createRes.json().data.playlist.id as string;

    // A can read it.
    const aDetail = await app.inject({
      method: 'GET',
      url: `/playlists/${playlistId}`,
      headers: { authorization: `Bearer ${signToken([], 'isolation-A')}` },
    });
    expect(aDetail.statusCode).toBe(200);

    // B's list excludes A's playlist.
    const bList = await app.inject({
      method: 'GET',
      url: '/playlists',
      headers: { authorization: `Bearer ${signToken([], 'isolation-B')}` },
    });
    expect(bList.statusCode).toBe(200);
    const bItems = bList.json().data.items as Array<{ id: string }>;
    expect(bItems.some((p) => p.id === playlistId)).toBe(false);

    // B's GET of A's id -> 404 (no existence leakage).
    const bDetail = await app.inject({
      method: 'GET',
      url: `/playlists/${playlistId}`,
      headers: { authorization: `Bearer ${signToken([], 'isolation-B')}` },
    });
    expect(bDetail.statusCode).toBe(404);
    expect(bDetail.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

// ===========================================================================
// Watch Later add/list/remove — idempotent, always 2xx, never 500 (Req 3.8,
// 3.9, 6.4). Enrichment reflects added (resolvable) videos (P1).
// ===========================================================================
describe('seam: watch-later add/list/remove (Req 3.8, 3.9, 6.4)', () => {
  const addUrl = '/playlists/watch-later';
  const listUrl = '/playlists/watch-later';

  it('add (library:write) reflected in list; add is idempotent (2xx, no duplicate)', async () => {
    const user = 'wl-user';
    const writeToken = signToken(['library:write'], user);
    const readToken = signToken([], user);

    // unauth add -> 401 (P2)
    const unauth = await app.inject({
      method: 'POST',
      url: addUrl,
      payload: { videoId: 'vid-wl-1' },
    });
    expect(unauth.statusCode).toBe(401);

    // add without scope -> 403 (P3)
    const noScope = await app.inject({
      method: 'POST',
      url: addUrl,
      headers: { authorization: `Bearer ${signToken(['library:read'], user)}` },
      payload: { videoId: 'vid-wl-1' },
    });
    expect(noScope.statusCode).toBe(403);

    // add with scope -> 201
    const add1 = await app.inject({
      method: 'POST',
      url: addUrl,
      headers: { authorization: `Bearer ${writeToken}` },
      payload: { videoId: 'vid-wl-1' },
    });
    expect(add1.statusCode).toBe(201);
    expect(add1.json()).toMatchObject({ success: true, data: { entry: { videoId: 'vid-wl-1' } } });
    const entryId = add1.json().data.entry.id as string;

    // list reflects the (resolvable) video, enriched.
    const list1 = await app.inject({
      method: 'GET',
      url: listUrl,
      headers: { authorization: `Bearer ${readToken}` },
    });
    expect(list1.statusCode).toBe(200);
    const items1 = list1.json().data.items as Array<{
      videoId: string;
      title: string;
      duration: number;
    }>;
    expect(items1.length).toBe(1);
    expect(items1[0]).toMatchObject({
      videoId: 'vid-wl-1',
      title: 'Watch Later One',
      duration: 300,
    });

    // idempotent add: same video again -> still 2xx, still exactly one entry.
    const add2 = await app.inject({
      method: 'POST',
      url: addUrl,
      headers: { authorization: `Bearer ${writeToken}` },
      payload: { videoId: 'vid-wl-1' },
    });
    expect(add2.statusCode).toBe(201);
    const list2 = await app.inject({
      method: 'GET',
      url: listUrl,
      headers: { authorization: `Bearer ${readToken}` },
    });
    expect((list2.json().data.items as unknown[]).length).toBe(1);

    // remove (library:write) -> 2xx; list now empty.
    const del1 = await app.inject({
      method: 'DELETE',
      url: `/playlists/watch-later/${entryId}`,
      headers: { authorization: `Bearer ${writeToken}` },
    });
    expect(del1.statusCode).toBe(200);
    expect(del1.json()).toMatchObject({ success: true });
    const list3 = await app.inject({
      method: 'GET',
      url: listUrl,
      headers: { authorization: `Bearer ${readToken}` },
    });
    expect((list3.json().data.items as unknown[]).length).toBe(0);

    // idempotent remove: removing an absent entry -> still 2xx, NEVER 500.
    const del2 = await app.inject({
      method: 'DELETE',
      url: `/playlists/watch-later/${entryId}`,
      headers: { authorization: `Bearer ${writeToken}` },
    });
    expect(del2.statusCode).toBe(200);
    expect(del2.statusCode).not.toBe(500);
    expect(del2.json()).toMatchObject({ success: true });

    // remove unauth -> 401; remove without scope -> 403 (seam holds for DELETE).
    const delUnauth = await app.inject({
      method: 'DELETE',
      url: `/playlists/watch-later/${entryId}`,
    });
    expect(delUnauth.statusCode).toBe(401);
    const delNoScope = await app.inject({
      method: 'DELETE',
      url: `/playlists/watch-later/${entryId}`,
      headers: { authorization: `Bearer ${signToken(['library:read'], user)}` },
    });
    expect(delNoScope.statusCode).toBe(403);
  });
});
