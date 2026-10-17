// ===========================================================================
// QC-F-466 Slice 1 — expiring emoji status: the WRITE path (PUT /auth/profile)
// and the caller's own read path (GET /auth/me).
//
// Before this slice QuantChat had no emoji status at all: the User row had
// no status columns, `updateProfileSchema` was .strict() over
// displayName/bio/avatarUrl only (so an `emojiStatus` field was rejected as
// unknown), and no DTO ever carried a status. Slice 1 (brief
// specialist-qc-f-466-buildprep.md §3.3/§3.4/§5-T1) adds:
//   * a nested `emojiStatus: { key, duration }` write on the EXISTING
//     PUT /auth/profile — set/replace with a SERVER-computed expiry from
//     the closed duration enum ('1h' | '24h' | '7d'), explicit null =
//     clear, absent = untouched;
//   * the key must resolve in the first-party QC-F-336 catalog mirror
//     (backend/lib/emoji-status.ts) — arbitrary unicode / unknown keys are
//     400, never stored;
//   * .strict() keeps foreign fields (a body `userId`, an absolute
//     `expiresAt`) out — the write can only ever land on the caller's own
//     row (request.auth.userId) with a server-chosen expiry;
//   * PUT response + GET /auth/me serve the status ONLY through the
//     read-time expiry helper — an expired stored status reads null.
//
// Harness mirrors qc-f-391-profile-bio-clear.routes.test.ts (bare Fastify +
// fake prisma capture + preHandler auth stub + @quant/auth stub), including
// its decorate pattern so the PrismaClient augmentation cannot produce the
// PR #903/#905 TS2345.
//
// Negative control (brief §5): on the pre-fix auth.ts, cases 1–6 and 8 FAIL
// (.strict() rejects `emojiStatus` as an unknown field → 400 where 200 is
// expected; the clear/absent pins fail because no status is ever written or
// served). Case 7 (no-auth 401) is a guard pin — it passes pre- and
// post-fix by design and is NOT counted in the NC tally.
// ===========================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// routes/auth.ts pulls @quant/auth (see qc-f-041 header for why this stub
// keeps the suite loadable in a worktree test env).
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import authRoutes from '../routes/auth';

const OWNER = 'user-owner';

interface StoredUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
  xpPoints: number;
  level: number;
  statusEmoji: string | null;
  statusEmojiExpiresAt: Date | null;
  deletedAt: Date | null;
}

function baseUser(partial: Partial<StoredUser> = {}): StoredUser {
  return {
    id: OWNER,
    email: 'owner@example.test',
    username: 'owner',
    displayName: 'Owner One',
    bio: 'hello',
    avatarUrl: null,
    role: 'USER',
    xpPoints: 0,
    level: 1,
    statusEmoji: null,
    statusEmojiExpiresAt: null,
    deletedAt: null,
    ...partial,
  };
}

async function buildRouteApp(
  prisma: unknown,
  opts: { withAuth?: boolean } = {},
): Promise<FastifyInstance> {
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
  // Helper takes the real decorated type pattern used by qc-f-041 (the
  // `unknown`-param decorate broke CI typecheck in PR #903/#905's lesson).
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  if (opts.withAuth !== false) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = { userId: OWNER, username: 'owner' };
    });
  }
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

describe('QC-F-466: PUT /auth/profile emoji status write path', () => {
  let stored: StoredUser;
  let userUpdate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    stored = baseUser();
    userUpdate = vi.fn().mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(stored, data);
        return { ...stored };
      },
    );
    const prisma = {
      user: {
        update: userUpdate,
        findUnique: vi.fn(async () => ({ ...stored })),
      },
    };
    app = await buildRouteApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  function lastUpdateCall(): { where: { id: string }; data: Record<string, unknown> } {
    const call = userUpdate.mock.calls[0] as unknown as [
      { where: { id: string }; data: Record<string, unknown> },
    ];
    return call[0];
  }

  it('1: set {key, duration:1h} writes BOTH columns together, expiry ≈ now+1h from the SERVER clock, response serves the live status', async () => {
    const before = Date.now();
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { emojiStatus: { key: 'quant:flame', duration: '1h' } },
    });
    const after = Date.now();

    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const { data } = lastUpdateCall();
    expect(data.statusEmoji).toBe('quant:flame');
    expect(data.statusEmojiExpiresAt).toBeInstanceOf(Date);
    const expiryMs = (data.statusEmojiExpiresAt as Date).getTime();
    expect(expiryMs).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 1000);

    const body = res.json() as { data: { emojiStatus: { key: string; expiresAt: string } | null } };
    expect(body.data.emojiStatus?.key).toBe('quant:flame');
    expect(body.data.emojiStatus?.expiresAt).toBe((data.statusEmojiExpiresAt as Date).toISOString());
  });

  it('2: durations 24h and 7d map to their own server-computed expiries', async () => {
    for (const [duration, ms] of [
      ['24h', 24 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
    ] as const) {
      userUpdate.mockClear();
      const before = Date.now();
      const res = await app.inject({
        method: 'PUT',
        url: '/auth/profile',
        payload: { emojiStatus: { key: 'quant:rocket', duration } },
      });
      const after = Date.now();
      expect(res.statusCode).toBe(200);
      const { data } = lastUpdateCall();
      const expiryMs = (data.statusEmojiExpiresAt as Date).getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + ms - 1000);
      expect(expiryMs).toBeLessThanOrEqual(after + ms + 1000);
    }
  });

  it('3: explicit null clears BOTH columns and the response reads null', async () => {
    stored = baseUser({
      statusEmoji: 'quant:wave',
      statusEmojiExpiresAt: new Date(Date.now() + 60_000),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { emojiStatus: null },
    });

    expect(res.statusCode).toBe(200);
    const { data } = lastUpdateCall();
    expect(data.statusEmoji).toBeNull();
    expect(data.statusEmojiExpiresAt).toBeNull();
    const body = res.json() as { data: { emojiStatus: unknown } };
    expect(body.data.emojiStatus).toBeNull();
  });

  it('4: absent emojiStatus leaves the status untouched — a bio-only edit writes no status columns and the live status survives', async () => {
    const liveExpiry = new Date(Date.now() + 3_600_000);
    stored = baseUser({ statusEmoji: 'quant:gem', statusEmojiExpiresAt: liveExpiry });
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { bio: 'new bio' },
    });

    expect(res.statusCode).toBe(200);
    const { data } = lastUpdateCall();
    expect(data).not.toHaveProperty('statusEmoji');
    expect(data).not.toHaveProperty('statusEmojiExpiresAt');
    const body = res.json() as { data: { emojiStatus: { key: string } | null } };
    expect(body.data.emojiStatus?.key).toBe('quant:gem');
  });

  it('5: unknown key, foreign pack, raw unicode, and non-enum durations are 400 with NO write', async () => {
    const badPayloads: Array<Record<string, unknown>> = [
      { emojiStatus: { key: 'quant:nope', duration: '1h' } },
      { emojiStatus: { key: 'other:flame', duration: '1h' } },
      { emojiStatus: { key: '🔥', duration: '1h' } },
      { emojiStatus: { key: 'quant:flame', duration: '2h' } },
      { emojiStatus: { key: 'quant:flame', duration: '2999-01-01T00:00:00.000Z' } },
      { emojiStatus: { key: 'quant:flame', duration: 3600 } },
    ];
    for (const payload of badPayloads) {
      userUpdate.mockClear();
      const res = await app.inject({ method: 'PUT', url: '/auth/profile', payload });
      expect(res.statusCode).toBe(400);
      expect(userUpdate).not.toHaveBeenCalled();
    }
  });

  it('6: .strict() census — a body userId, a top-level expiresAt, or an expiresAt inside emojiStatus is 400 with NO write (no forging another user, no forging an expiry)', async () => {
    const forged: Array<Record<string, unknown>> = [
      { emojiStatus: { key: 'quant:flame', duration: '1h' }, userId: 'user-victim' },
      { emojiStatus: { key: 'quant:flame', duration: '1h' }, expiresAt: '2999-01-01T00:00:00.000Z' },
      { emojiStatus: { key: 'quant:flame', duration: '1h', expiresAt: '2999-01-01T00:00:00.000Z' } },
    ];
    for (const payload of forged) {
      userUpdate.mockClear();
      const res = await app.inject({ method: 'PUT', url: '/auth/profile', payload });
      expect(res.statusCode).toBe(400);
      expect(userUpdate).not.toHaveBeenCalled();
    }
  });

  it('7 (guard pin): without auth the write is 401 and nothing is written', async () => {
    const anonUpdate = vi.fn();
    const anonApp = await buildRouteApp(
      { user: { update: anonUpdate, findUnique: vi.fn(async () => ({ ...stored })) } },
      { withAuth: false },
    );
    try {
      const res = await anonApp.inject({
        method: 'PUT',
        url: '/auth/profile',
        payload: { emojiStatus: { key: 'quant:flame', duration: '1h' } },
      });
      expect(res.statusCode).toBe(401);
      expect(anonUpdate).not.toHaveBeenCalled();
    } finally {
      await anonApp.close();
    }
  });

  it("8: the write lands ONLY on the caller's own row (where.id === auth userId)", async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { emojiStatus: { key: 'quant:bolt', duration: '24h' } },
    });
    expect(res.statusCode).toBe(200);
    expect(lastUpdateCall().where).toEqual({ id: OWNER });
  });

  it('9: an emojiStatus-only payload satisfies the at-least-one-field rule (no 400)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { emojiStatus: { key: 'quant:wave', duration: '7d' } },
    });
    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('QC-F-466: GET /auth/me serves only a LIVE status', () => {
  let stored: StoredUser;
  let app: FastifyInstance;

  async function buildWith(row: StoredUser): Promise<FastifyInstance> {
    stored = row;
    const prisma = {
      user: {
        update: vi.fn(async () => ({ ...stored })),
        findUnique: vi.fn(async () => ({ ...stored })),
      },
    };
    return buildRouteApp(prisma);
  }

  afterEach(async () => {
    await app.close();
  });

  it('10: a live stored status is served as {key, expiresAt}', async () => {
    const expiry = new Date(Date.now() + 60_000);
    app = await buildWith(baseUser({ statusEmoji: 'quant:moon-star', statusEmojiExpiresAt: expiry }));
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { emojiStatus: { key: string; expiresAt: string } | null } };
    expect(body.data.emojiStatus).toEqual({ key: 'quant:moon-star', expiresAt: expiry.toISOString() });
  });

  it('11: an EXPIRED stored status reads null — stale is never served', async () => {
    app = await buildWith(
      baseUser({
        statusEmoji: 'quant:moon-star',
        statusEmojiExpiresAt: new Date(Date.now() - 1000),
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    const body = res.json() as { data: { emojiStatus: unknown } };
    expect(body.data.emojiStatus).toBeNull();
  });

  it('12: half-written rows (emoji without expiry, expiry without emoji, unknown key) all read null', async () => {
    for (const partial of [
      { statusEmoji: 'quant:wave', statusEmojiExpiresAt: null },
      { statusEmoji: null, statusEmojiExpiresAt: new Date(Date.now() + 60_000) },
      { statusEmoji: 'quant:deleted-name', statusEmojiExpiresAt: new Date(Date.now() + 60_000) },
    ]) {
      app = await buildWith(baseUser(partial));
      const res = await app.inject({ method: 'GET', url: '/auth/me' });
      const body = res.json() as { data: { emojiStatus: unknown } };
      expect(body.data.emojiStatus).toBeNull();
      await app.close();
    }
    // Rebuild a live app so afterEach has an open instance to close.
    app = await buildWith(baseUser());
  });
});
