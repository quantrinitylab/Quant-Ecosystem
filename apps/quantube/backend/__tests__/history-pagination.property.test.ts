// @vitest-environment node
// ============================================================================
// quantube — GET /history pagination property test
// (quantube-real-data-wiring · Task 5.3)
// ============================================================================
//
// Feature: quantube-real-data-wiring, Property 6: For any (page,pageSize),
// items.length <= pageSize, page echoes the request, total is independent of
// page, and reading all pages yields the full ordered set exactly once (no
// duplicates, no omissions); pageSize > 100 is clamped to 100; an out-of-range
// page returns empty items with the same total.
//
// Runs against the REAL `GET /history` route (booted via the real `buildApp()`,
// mirroring engine-surfaces.seam.test.ts). History entries are seeded END TO END
// through the real `POST /history` route; the only seam-double is the lowest-level
// DB driver behind `VideoService` (an in-memory video store), so every seeded
// videoId RESOLVES and the resolvable set equals the full seeded set. The auth
// hook + route + HistoryService + pagination logic are all real.
//
// fast-check is NOT a quantube dependency; per the repo's realized convention this
// uses a seeded deterministic mulberry32 generator (>=100 samples) — see
// creator-tier-upgrade.bug3.seam.test.ts.
//
// **Validates: Requirements 10.3, 10.8, 10.10, 10.11**

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
  // This property test issues thousands of in-process `inject()` requests to seed
  // and page the history end to end through the REAL route. Raise the global
  // rate-limit ceiling so the seeded traffic is not throttled (429) — this tunes
  // ONLY the rate-limit budget; the auth hook, route, and pagination seam are
  // exercised unchanged.
  rateLimitMax: 10_000_000,
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
function signToken(scopes: string[], sub: string): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `seam-pg-${jtiCounter}`,
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

// --- Deterministic seeded RNG (mulberry32) — repo PBT convention -----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- in-memory video store seam-double (only the DB driver is doubled) ------
const MAX_N = 25; // bound dataset size per case to keep the seeded inject count tractable
const videoStore = new Map<
  string,
  {
    id: string;
    title: string;
    thumbnailUrl: string;
    channelId: string;
    duration: number;
    viewCount: number;
    deletedAt: null;
  }
>();
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

async function getPage(user: string, page: number, pageSize: number) {
  return app.inject({
    method: 'GET',
    url: `/history?page=${page}&pageSize=${pageSize}`,
    headers: { authorization: `Bearer ${signToken([], user)}` },
  });
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  installVideoStore(app);
  // Seed a shared, resolvable video pool reused across all cases (vid-0..vid-(MAX_N-1)).
  for (let i = 0; i < MAX_N; i += 1) {
    const id = `vid-${i}`;
    videoStore.set(id, {
      id,
      title: `Title ${id}`,
      thumbnailUrl: `https://cdn.example/${id}.jpg`,
      channelId: `chan-${id}`,
      duration: 100 + i,
      viewCount: 0,
      deletedAt: null,
    });
  }
});

afterAll(async () => {
  await app.close();
});

interface Case {
  n: number; // number of history entries
  requestedPageSize: number; // 1..130 (exercises the >100 clamp)
}

function generateCases(count: number): Case[] {
  const rand = mulberry32(0x50_47_36_30); // "PG60"
  const cases: Case[] = [];
  for (let i = 0; i < count; i += 1) {
    const n = Math.floor(rand() * (MAX_N + 1)); // 0..MAX_N
    const requestedPageSize = 1 + Math.floor(rand() * 130); // 1..130
    cases.push({ n, requestedPageSize });
  }
  return cases;
}

const PBT_N = 110; // >= 100 samples

describe('Property 6 (PBT): GET /history pagination over a seeded resolvable set', () => {
  it('FOR ALL (N, pageSize): pages tile the full ordered set exactly once; total page-independent; clamp + out-of-range hold', async () => {
    const cases = generateCases(PBT_N);
    console.info(
      'history pagination PBT samples:',
      cases
        .slice(0, 5)
        .map((c) => `N=${c.n},ps=${c.requestedPageSize}`)
        .join('  '),
    );

    for (let ci = 0; ci < cases.length; ci += 1) {
      const { n, requestedPageSize } = cases[ci];
      const user = `pg-user-${ci}`;
      const label = `[case ${ci}: N=${n}, requestedPageSize=${requestedPageSize}]`;

      // Seed N distinct, resolvable history entries for a fresh user.
      for (let i = 0; i < n; i += 1) {
        const res = await addHistory(user, `vid-${i}`, i); // watchDuration arbitrary (>=0)
        expect(res.statusCode, `${label} seed POST /history`).toBe(201);
      }

      const effective = Math.min(requestedPageSize, 100); // Req 10.4 clamp

      // Canonical ordered set: a single read large enough (clamped to 100 >= N) to
      // return every resolvable entry in the route's watchedAt-descending order.
      const refRes = await getPage(user, 1, 100);
      expect(refRes.statusCode, `${label} reference read`).toBe(200);
      const refBody = refRes.json().data as {
        items: HistoryItem[];
        total: number;
        pageSize: number;
      };
      expect(refBody.pageSize, `${label} reference effective pageSize clamped to 100`).toBe(100);
      expect(refBody.total, `${label} total equals resolvable count`).toBe(n);
      const expectedIds = refBody.items.map((i) => i.id);
      expect(expectedIds.length, `${label} reference returns all N`).toBe(n);

      // Read all pages with the case's pageSize and concatenate.
      const pageCount = Math.max(1, Math.ceil(n / effective));
      const concatenated: string[] = [];
      for (let p = 1; p <= pageCount; p += 1) {
        const res = await getPage(user, p, requestedPageSize);
        expect(res.statusCode, `${label} page ${p}`).toBe(200);
        const body = res.json().data as {
          items: HistoryItem[];
          total: number;
          page: number;
          pageSize: number;
        };

        // page echoes the request (Req 10.9 — included for completeness).
        expect(body.page, `${label} page ${p} echo`).toBe(p);
        // effective pageSize echoed (clamp, Req 10.4).
        expect(body.pageSize, `${label} page ${p} effective pageSize`).toBe(effective);
        // items.length <= pageSize (Req 10.3).
        expect(body.items.length, `${label} page ${p} items<=pageSize`).toBeLessThanOrEqual(
          effective,
        );
        // total independent of page (Req 10.10).
        expect(body.total, `${label} page ${p} total page-independent`).toBe(n);

        concatenated.push(...body.items.map((i) => i.id));
      }

      // Ordered concatenation equals the full ordered set EXACTLY ONCE
      // (no duplicates, no omissions) — Req 10.11.
      expect(concatenated, `${label} ordered tiling equals full set`).toEqual(expectedIds);
      expect(new Set(concatenated).size, `${label} no duplicates`).toBe(concatenated.length);

      // Out-of-range page -> empty items, same total (Req 10.8, 10.7).
      const oorRes = await getPage(user, pageCount + 1, requestedPageSize);
      expect(oorRes.statusCode, `${label} out-of-range page`).toBe(200);
      const oorBody = oorRes.json().data as { items: HistoryItem[]; total: number };
      expect(oorBody.items, `${label} out-of-range empty items`).toEqual([]);
      expect(oorBody.total, `${label} out-of-range same total`).toBe(n);
    }
  });
});
