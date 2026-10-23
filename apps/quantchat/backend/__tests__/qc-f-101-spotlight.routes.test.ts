// ===========================================================================
// QC-F-101 — spotlight featured notifications regression tests (cases 16-19)
//
// The REAL spotlight route plugin on a bare Fastify instance (the QC-F-021
// pattern), requested ANONYMOUSLY: the route's viewer-gating
// (QC-F-447 privacy + personalization) is skipped without auth, so the
// featured-diff + DB-dedupe write path is exercised in isolation against an
// in-memory fake (reel rows + notification store).
//
// The writer runs the REAL NotificationService bound to the fake's
// notification delegate — one create per newly-featured reel, guarded by
// the (userId, type, sourceEntityId) findFirst dedupe.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import spotlightRoutes from '../routes/spotlight';

// Stable identities (module-level).
const CREATOR_C = 'user_spot_c';
const CREATOR_C1 = 'user_spot_c1';
const CREATOR_C2 = 'user_spot_c2';

interface FakeReelRow {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  createdAt: Date;
  creator: { username: string; avatarUrl: string };
}

function reel(
  id: string,
  creatorId: string,
  likeCount: number,
  extra: Partial<FakeReelRow> = {},
): FakeReelRow {
  return {
    id,
    creatorId,
    videoUrl: `https://video.example/${id}.mp4`,
    thumbnailUrl: `https://img.example/${id}.jpg`,
    caption: `caption ${id}`,
    duration: 30,
    likeCount,
    commentCount: 0,
    shareCount: 0,
    watchThroughRate: 0,
    createdAt: new Date(),
    creator: { username: `creator_${creatorId}`, avatarUrl: 'https://img.example/a.jpg' },
    ...extra,
  };
}

interface StoredNotification {
  id: string;
  userId: string;
  type: string;
  sourceEntityId: string;
  [key: string]: unknown;
}

function makeSpotlightFakePrisma() {
  // Mutable reel source — the test rewrites it between refreshes.
  let reelSource: FakeReelRow[] = [];
  // Pre-seeded notification rows (the DB-dedupe fixture).
  const notifications: StoredNotification[] = [];
  const calls = { reelFindMany: 0, findFirst: 0, create: 0 };
  const created: Array<Record<string, unknown>> = [];

  const notification = {
    async findFirst({ where }: any) {
      calls.findFirst++;
      return (
        notifications.find(
          (n) =>
            n.userId === where.userId &&
            n.type === where.type &&
            n.sourceEntityId === where.sourceEntityId,
        ) ?? null
      );
    },
    async create({ data }: any) {
      calls.create++;
      const row = { id: `n_spot_${notifications.length + 1}`, ...data };
      notifications.push(row);
      created.push(data);
      return row;
    },
  };

  const prisma = {
    reel: {
      async findMany() {
        calls.reelFindMany++;
        return reelSource.map((r) => ({ ...r, creator: { ...r.creator } }));
      },
    },
    notification,
  };

  return {
    prisma,
    calls,
    notifications,
    created,
    seedReels(rows: FakeReelRow[]) {
      reelSource = rows;
    },
    seedNotification(row: StoredNotification) {
      notifications.push(row);
    },
  };
}

async function buildSpotlightApp(fake: ReturnType<typeof makeSpotlightFakePrisma>) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.decorate('prisma', fake.prisma as never);
  await app.register(spotlightRoutes, { prefix: '/spotlight' });
  await app.ready();
  return app;
}

describe('QC-F-101 spotlight featured notifications (cases 16-19)', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeSpotlightFakePrisma>;

  beforeEach(() => {
    fake = makeSpotlightFakePrisma();
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  // Case 16 — first refresh: the creator gets exactly one row, exact shape,
  // and the response shape is unchanged.
  it('case 16: first refresh creates one exact-shape row for the featured creator', async () => {
    fake.seedReels([reel('reel_L', CREATOR_C, 100)]);
    app = await buildSpotlightApp(fake);

    const res = await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Response shape unchanged: reels + the ranking envelope.
    expect(Array.isArray(body.data.reels)).toBe(true);
    expect(body.data.reels).toHaveLength(1);
    expect(body.data.reels[0]).toMatchObject({ id: 'reel_L', isFeatured: true });

    expect(fake.created).toHaveLength(1);
    const row = fake.created[0]!;
    expect(row).toEqual({
      userId: CREATOR_C,
      type: 'spotlight_featured',
      title: 'Your reel is featured in Spotlight',
      body: 'Your reel made the Spotlight featured list.',
      imageUrl: 'https://img.example/reel_L.jpg',
      actionUrl: '/spotlight',
      sourceApp: 'quantchat',
      sourceUserId: null,
      sourceEntityId: 'reel_L',
      data: { reelId: 'reel_L', category: 'REELS' },
    });
  });

  // Case 17a — cache-fresh second GET: refreshed=false, no new rows.
  it('case 17a: a cache-fresh second GET writes nothing', async () => {
    fake.seedReels([reel('reel_L', CREATOR_C, 100)]);
    app = await buildSpotlightApp(fake);

    const first = await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(first.statusCode).toBe(200);
    expect(fake.created).toHaveLength(1);

    const second = await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(second.statusCode).toBe(200);
    expect(fake.created).toHaveLength(1);
    expect(fake.calls.create).toBe(1);
  });

  // Case 17b — forced refresh with the same featured set: newly-featured
  // diff is empty, so no new rows.
  it('case 17b: forced refresh with the same featured set writes nothing', async () => {
    fake.seedReels([reel('reel_L', CREATOR_C, 100)]);
    app = await buildSpotlightApp(fake);

    await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(fake.created).toHaveLength(1);

    const res = await app.inject({ method: 'GET', url: '/spotlight/?refresh=true' });
    expect(res.statusCode).toBe(200);
    expect(fake.created).toHaveLength(1);
    // The writer ran (the ranking recomputed) but the diff was empty —
    // the DB dedupe never even needed to fire for reel_L.
    expect(fake.calls.create).toBe(1);
  });

  // Case 17c — DB dedupe: a row already in the store means create is never
  // called, even for a genuinely newly-featured reel.
  it('case 17c: a pre-existing (user/type/entity) row blocks create on refresh', async () => {
    fake.seedReels([reel('reel_L1', CREATOR_C1, 100), reel('reel_L2', CREATOR_C2, 90)]);
    fake.seedNotification({
      id: 'n_seed',
      userId: CREATOR_C2,
      type: 'spotlight_featured',
      sourceEntityId: 'reel_L2',
    });
    app = await buildSpotlightApp(fake);

    const res = await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(res.statusCode).toBe(200);

    // L1 newly featured -> created. L2 newly featured -> findFirst hit -> skipped.
    expect(fake.calls.findFirst).toBe(2);
    expect(fake.calls.create).toBe(1);
    expect(fake.created.map((c) => c.sourceEntityId)).toEqual(['reel_L1']);
    expect(fake.notifications).toHaveLength(2); // seeded + L1
  });

  // Case 18 — a NEW reel entering the featured set notifies only its creator.
  it('case 18: a newly-featured reel notifies only its own creator', async () => {
    // Refresh 1: featured = top-3 (A, f1, f2); f3 is not featured.
    fake.seedReels([
      reel('reel_A', CREATOR_C1, 100),
      reel('reel_f1', 'user_filler1', 50),
      reel('reel_f2', 'user_filler2', 40),
      reel('reel_f3', 'user_filler3', 30),
    ]);
    app = await buildSpotlightApp(fake);

    await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(fake.created.map((c) => c.userId)).toEqual([
      CREATOR_C1,
      'user_filler1',
      'user_filler2',
    ]);

    // Refresh 2: a new reel B outranks everyone and enters the featured set;
    // A/f1 stay featured, f2 drops out, f3 still out.
    fake.seedReels([
      reel('reel_B', CREATOR_C2, 500),
      reel('reel_A', CREATOR_C1, 100),
      reel('reel_f1', 'user_filler1', 50),
      reel('reel_f2', 'user_filler2', 40),
      reel('reel_f3', 'user_filler3', 30),
    ]);
    const res = await app.inject({ method: 'GET', url: '/spotlight/?refresh=true' });
    expect(res.statusCode).toBe(200);

    // Only B's creator got a new row — nobody got a second one.
    expect(fake.created.map((c) => c.userId)).toEqual([
      CREATOR_C1,
      'user_filler1',
      'user_filler2',
      CREATOR_C2,
    ]);
    expect(fake.created[fake.created.length - 1]!.sourceEntityId).toBe('reel_B');
    expect(fake.calls.create).toBe(4);
    expect(fake.created.filter((c) => c.userId === CREATOR_C1)).toHaveLength(1);
  });

  // Case 19 — best-effort: a throwing create never breaks the feed.
  it('case 19: notification.create throwing keeps GET /spotlight at 200 with reels', async () => {
    const broken = makeSpotlightFakePrisma();
    broken.seedReels([reel('reel_L', CREATOR_C, 100)]);
    (broken.prisma.notification as { create: unknown }).create = async () => {
      throw new Error('notification db down');
    };
    app = await buildSpotlightApp(broken);

    const res = await app.inject({ method: 'GET', url: '/spotlight/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.reels).toHaveLength(1);
    expect(body.data.reels[0]).toMatchObject({ id: 'reel_L', isFeatured: true });
  });
});
