// @vitest-environment node
// ============================================================================
// quantube — GET /history enrichment seam tests (quantube-real-data-wiring · 5.2)
// ============================================================================
//
// Traverses the REAL integration seam for the Library "Watch History" tab,
// using Fastify `inject()` against quantube's REAL `buildApp()`. Mirrors the
// engine-surfaces.seam.test.ts harness (real global auth hook, real route layer,
// HS256 signToken). History entries are seeded END TO END through the real
// `POST /history` route (the in-memory HistoryService singleton), then read back
// through the real `GET /history` enrichment handler.
//
// ---------------------------------------------------------------------------
// SEEDING APPROACH (documented honestly):
//   `GET /history` enriches each thin WatchHistoryEntry by building
//   `new VideoService(fastify.prisma)` and calling `prisma.video.findUnique`
//   (VideoService.getVideo THROWS on a missing/deleted row → the route SKIPS the
//   entry as an orphan and does NOT count it toward `total`). The sandbox has no
//   Postgres, so a real `findUnique` would throw for every id and ALL entries
//   would be treated as orphans — making the enrichment-totality / ordering
//   assertions impossible.
//
//   So we replace ONLY the lowest-level DB driver after boot: `app.prisma` is
//   swapped for an in-memory video store seeded with known videos. EVERYTHING
//   ELSE STAYS REAL — the global auth hook, the `POST /history` + `GET /history`
//   route handlers, the real `VideoService` class (its throw-on-missing →
//   orphan-skip path is exercised verbatim by seeding ONE entry whose video is
//   intentionally absent), the real `HistoryService`, and the real pagination /
//   ordering / progress-clamp logic. This is the "mock at the appropriate
//   boundary" path sanctioned by the task: the auth+route+service seam is unchanged.
// ---------------------------------------------------------------------------
//
// Coverage — design Correctness Properties:
//   P4 (enrichment totality) — every emitted HistoryItem has all fields defined
//                              and 0 <= progress <= 1; orphan-video entries omitted
//                              and not counted toward total.
//   P5 (ordering)            — items returned watchedAt-descending.
//   P1 (envelope)            — HistoryListResponse { items, total, page, pageSize }.
//
// **Validates: Requirements 1.8, 1.9, 1.10, 1.11, 1.12, 8.2**

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';
import type { HistoryItem } from '../../src/pages/library';
import { createWatchHistoryDouble } from './helpers/in-memory-watch-history';

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
function signToken(scopes: string[], sub = 'hist-user'): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `seam-hist-${jtiCounter}`,
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
    thumbnailUrl: `{{https://cdn.example/${v.id}}}.jpg`,
    channelId: `channel-${v.id}`,
    duration: 120,
    viewCount: 0,
    deletedAt: null,
    ...v,
  });
}
function installVideoStore(app: FastifyInstance): void {
  (app as unknown as { prisma: unknown }).prisma = {
    video: {
      findUnique: async ({ where }: { where: { id: string } }) => videoStore.get(where.id) ?? null,
    },
    // HistoryService is Prisma-backed; provide the watchHistory delegate too so
    // POST/GET /history exercise the real service against an in-memory store.
    watchHistory: createWatchHistoryDouble(),
  };
}

async function addHistory(user: string, videoId: string, watchDuration: number) {
  return app.inject({
    method: 'POST',
    url: '/history',
    headers: { authorization: `Bearer ${signToken([], user)}` },
    payload: { videoId, watchDuration },
  });
}

// Small delay so each seeded entry gets a distinct watchedAt (HistoryService
// stamps `new Date()` at add time; Date resolution is coarser than inject speed).
// This makes the watchedAt-descending ordering assertion deterministic.
const tick = () => new Promise((r) => setTimeout(r, 5));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  installVideoStore(app);
  // Resolvable videos with distinct durations to exercise the progress clamp.
  seedVideo({ id: 'vid-A', title: 'Video A', channelId: 'chan-A', duration: 100 });
  seedVideo({ id: 'vid-B', title: 'Video B', channelId: 'chan-B', duration: 200 });
  seedVideo({ id: 'vid-C', title: 'Video C', channelId: 'chan-C', duration: 50 });
  // NOTE: 'vid-orphan' is deliberately NOT seeded -> getVideo throws -> orphan path.
});

afterAll(async () => {
  await app.close();
});

describe('seam: GET /history enrichment (Req 1.8–1.12, 8.2; P1/P4/P5)', () => {
  const user = 'enrich-user';

  beforeAll(async () => {
    // Seed in a known order (A, orphan, B, C) with distinct timestamps. Insertion
    // order ascending => watchedAt-descending order should be C, B, A (orphan dropped).
    await addHistory(user, 'vid-A', 50); // progress 50/100 = 0.5
    await tick();
    await addHistory(user, 'vid-orphan', 30); // orphan: video not seeded -> omitted
    await tick();
    await addHistory(user, 'vid-B', 999); // watchDuration > duration -> progress clamped to 1
    await tick();
    await addHistory(user, 'vid-C', 0); // progress 0/50 = 0
  });

  it('returns the HistoryListResponse envelope { items, total, page, pageSize } (P1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { authorization: `Bearer ${signToken([], user)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    const { items, total, page, pageSize } = body.data;
    expect(Array.isArray(items)).toBe(true);
    expect(typeof total).toBe('number');
    expect(page).toBe(1); // default page (Req 10.1)
    expect(pageSize).toBe(20); // default pageSize (Req 10.2)
    expect(total).toBeGreaterThanOrEqual(0);
    expect(items.length).toBeLessThanOrEqual(pageSize);
  });

  it('omits orphan-video entries and does not count them toward total (Req 1.10, P4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { authorization: `Bearer ${signToken([], user)}` },
    });
    const { items, total } = res.json().data as { items: HistoryItem[]; total: number };
    // 4 entries seeded, 1 orphan -> exactly 3 resolvable, total excludes the orphan.
    expect(total).toBe(3);
    expect(items.length).toBe(3);
    expect(items.some((i) => i.videoId === 'vid-orphan')).toBe(false);
  });

  it('enriches every HistoryItem with all fields defined and 0 <= progress <= 1 (Req 1.9, 1.11, 8.2, P4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { authorization: `Bearer ${signToken([], user)}` },
    });
    const items = res.json().data.items as HistoryItem[];
    for (const item of items) {
      // Totality: every declared HistoryItem field present & non-null, correct type.
      expect(item.id).toBeTypeOf('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.videoId).toBeTypeOf('string');
      expect(item.title).toBeTypeOf('string');
      expect(item.thumbnail).toBeTypeOf('string');
      expect(item.channelName).toBeTypeOf('string');
      expect(item.duration).toBeTypeOf('number');
      expect(Number.isInteger(item.duration)).toBe(true);
      expect(item.duration).toBeGreaterThanOrEqual(0); // whole seconds, >= 0
      expect(item.watchedAt).toBeTypeOf('string');
      // watchedAt is ISO-8601 UTC -> round-trips to a valid date.
      expect(Number.isNaN(Date.parse(item.watchedAt))).toBe(false);
      expect(item.progress).toBeTypeOf('number');
      expect(item.progress).toBeGreaterThanOrEqual(0);
      expect(item.progress).toBeLessThanOrEqual(1);
    }

    // Concrete progress values (clamp behaviour, Req 1.11).
    const byId = Object.fromEntries(items.map((i) => [i.videoId, i]));
    expect(byId['vid-A'].progress).toBeCloseTo(0.5, 5);
    expect(byId['vid-B'].progress).toBe(1); // 999/200 clamped to 1
    expect(byId['vid-C'].progress).toBe(0); // 0/50
    // Enriched metadata flows from the (real) VideoService boundary.
    expect(byId['vid-A']).toMatchObject({ title: 'Video A', channelName: 'chan-A', duration: 100 });
  });

  it('returns items in watchedAt-descending order (Req 1.12, P5)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { authorization: `Bearer ${signToken([], user)}` },
    });
    const items = res.json().data.items as HistoryItem[];
    // Expected desc order from insertion A, B, C (orphan dropped) => C, B, A.
    expect(items.map((i) => i.videoId)).toEqual(['vid-C', 'vid-B', 'vid-A']);
    // And the timestamps are non-increasing.
    const times = items.map((i) => Date.parse(i.watchedAt));
    for (let k = 1; k < times.length; k += 1) {
      expect(times[k - 1]).toBeGreaterThanOrEqual(times[k]);
    }
  });

  it('empty history for a fresh user -> empty items, total 0 (P1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { authorization: `Bearer ${signToken([], 'empty-history-user')}` },
    });
    expect(res.statusCode).toBe(200);
    const { items, total } = res.json().data;
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it('unauthenticated GET /history -> 401 (seam holds; service not reached)', async () => {
    const res = await app.inject({ method: 'GET', url: '/history' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });
});
