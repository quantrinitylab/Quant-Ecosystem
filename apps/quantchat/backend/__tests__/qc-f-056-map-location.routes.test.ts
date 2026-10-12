// ===========================================================================
// QC-F-056 — Snap Map location publish / Ghost Mode regression tests
// ===========================================================================
//
// The defect: the web map page published the user's location ONLY as
// WebSocket frames (`location-update` / `ghost-mode-enabled`) that the
// backend `/ws/chat` handler never processes, and the api-client pointed at
// endpoints/shapes the backend never had (`POST /map/ghost-mode`,
// `POST /map/friends`, a `{ location: GeoLocation }` publish body the Zod
// schema rejects). So a web user's FriendLocation row was never written,
// and Ghost Mode never removed a server row. On top of that,
// LocationService.getFriendsOnMap had no freshness window — a row written
// once counted as "currently sharing" forever.
//
// These tests mount the REAL map route plugin + REAL LocationService on a
// bare Fastify instance (fake Prisma delegates only, in-memory), the way
// qc-f-031 does: a preHandler installs `request.auth` exactly like the
// server-core auth plugin, and an error handler mirrors the AppError
// mapping. The publish → read → ghost-clear round-trip is exercised end to
// end through HTTP, because that round-trip is what was broken.
//
// Negative control: against the pre-fix service (no freshness window) the
// "stale row" test fails — the 2-hour-old row is returned as live.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import mapRoutes from '../routes/map';
import {
  FRIEND_LOCATION_MAX_AGE_MS,
  type FriendLocationRecord,
  type LocationPrismaClient,
} from '../services/location.service';

const ALICE = 'user_alice';
const BOB = 'user_bob';

interface AppErrorLike {
  statusCode?: number;
  code?: string;
  message: string;
}

/** In-memory FriendLocation / CloseFriend / User delegates. */
function makeFakePrisma() {
  const locations = new Map<string, FriendLocationRecord>();
  const closeFriendEdges: Array<{ userId: string; friendId: string }> = [
    { userId: ALICE, friendId: BOB },
  ];
  const users = new Map([
    [ALICE, { id: ALICE, username: 'alice', displayName: 'Alice', avatarUrl: null }],
    [BOB, { id: BOB, username: 'bob', displayName: 'Bob', avatarUrl: null }],
  ]);

  const prisma: LocationPrismaClient = {
    friendLocation: {
      async upsert(args: unknown) {
        const a = args as {
          where: { userId: string };
          create: { userId: string; latitude: number; longitude: number };
        };
        const row: FriendLocationRecord = {
          id: `loc-${a.where.userId}`,
          userId: a.create.userId,
          latitude: a.create.latitude,
          longitude: a.create.longitude,
          updatedAt: new Date(),
        };
        locations.set(row.userId, row);
        return row;
      },
      async deleteMany(args: unknown) {
        const a = args as { where: { userId: string } };
        const had = locations.delete(a.where.userId);
        return { count: had ? 1 : 0 };
      },
      async findMany(args: unknown) {
        const a = args as {
          where: { userId: { in: string[] }; updatedAt?: { gte: Date } };
        };
        return [...locations.values()].filter((row) => {
          if (!a.where.userId.in.includes(row.userId)) return false;
          if (a.where.updatedAt && row.updatedAt < a.where.updatedAt.gte) return false;
          return true;
        });
      },
    },
    closeFriend: {
      async findMany(args: unknown) {
        const a = args as { where: { userId: string } };
        return closeFriendEdges
          .filter((e) => e.userId === a.where.userId)
          .map((e, i) => ({ id: `edge-${i}`, userId: e.userId, friendId: e.friendId, createdAt: new Date() }));
      },
    },
    user: {
      async findMany(args: unknown) {
        const a = args as { where: { id: { in: string[] } } };
        return a.where.id.in
          .map((id) => users.get(id))
          .filter((u): u is NonNullable<typeof u> => Boolean(u));
      },
    },
  };

  return { prisma, locations };
}

async function buildMapApp(prisma: LocationPrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as AppErrorLike;
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.decorate('prisma', prisma as never);
  // Install request.auth the way the real auth plugin does, per request.
  app.addHook('preHandler', async (req) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId === 'string' && userId) {
      (req as unknown as { auth: unknown }).auth = {
        userId,
        username: userId,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    }
  });
  await app.register(mapRoutes, { prefix: '/map' });
  await app.ready();
  return app;
}

describe('QC-F-056 map location routes (publish → read → ghost-clear)', () => {
  let app: FastifyInstance;
  let fake: ReturnType<typeof makeFakePrisma>;

  beforeEach(async () => {
    fake = makeFakePrisma();
    app = await buildMapApp(fake.prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /map/location stores the caller location and a close friend can read it back', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/map/location',
      headers: { 'x-test-user-id': BOB },
      payload: { latitude: 28.6139, longitude: 77.209 },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json().data).toMatchObject({ userId: BOB, latitude: 28.6139, longitude: 77.209 });

    const read = await app.inject({
      method: 'GET',
      url: '/map/friends',
      headers: { 'x-test-user-id': ALICE },
    });
    expect(read.statusCode).toBe(200);
    const friends = read.json().data.friends as Array<{ userId: string }>;
    expect(friends.map((f) => f.userId)).toEqual([BOB]);
  });

  it('DELETE /map/location (Ghost Mode) removes the row so friends no longer see the pin', async () => {
    await app.inject({
      method: 'POST',
      url: '/map/location',
      headers: { 'x-test-user-id': BOB },
      payload: { latitude: 28.6139, longitude: 77.209 },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: '/map/location',
      headers: { 'x-test-user-id': BOB },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toEqual({ cleared: true });

    const read = await app.inject({
      method: 'GET',
      url: '/map/friends',
      headers: { 'x-test-user-id': ALICE },
    });
    expect(read.json().data.friends).toEqual([]);
  });

  it('DELETE /map/location is idempotent when nothing was shared', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/map/location',
      headers: { 'x-test-user-id': BOB },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toEqual({ cleared: false });
  });

  it('a stale row (older than the freshness window) is not shown as currently sharing', async () => {
    // Seed a row that stopped being refreshed long ago — e.g. the owner
    // closed the app, or ghosted through a client whose clear never landed.
    fake.locations.set(BOB, {
      id: 'loc-stale',
      userId: BOB,
      latitude: 28.6139,
      longitude: 77.209,
      updatedAt: new Date(Date.now() - 2 * FRIEND_LOCATION_MAX_AGE_MS),
    });

    const read = await app.inject({
      method: 'GET',
      url: '/map/friends',
      headers: { 'x-test-user-id': ALICE },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.friends).toEqual([]);
  });

  it('publish and delete require authentication (401 without identity)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/map/location',
      payload: { latitude: 28.6139, longitude: 77.209 },
    });
    expect(post.statusCode).toBe(401);

    const del = await app.inject({ method: 'DELETE', url: '/map/location' });
    expect(del.statusCode).toBe(401);
  });

  it('publish rejects out-of-range coordinates (400)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/map/location',
      headers: { 'x-test-user-id': BOB },
      payload: { latitude: 123, longitude: 77.209 },
    });
    expect(post.statusCode).toBe(400);
  });
});
