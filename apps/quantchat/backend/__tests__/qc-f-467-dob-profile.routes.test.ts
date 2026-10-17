// ===========================================================================
// QC-F-467 — DOB write path of PUT /auth/profile + GET /auth/me.
//
// Before this fix, `User.dateOfBirth` existed in the schema but NO QuantChat
// route ever wrote or read it: updateProfileSchema (.strict()) admitted only
// displayName/bio/avatarUrl, so a DOB in the body was a 400, and /auth/me
// never selected the column. These tests pin the band contract:
//   set ('YYYY-MM-DD' string → UTC-midnight Date), clear (null → column
//   null), absent (field untouched), only-DOB body is a valid save,
//   impossible/future/pre-1900 dates are 400 with NO write, .strict()
//   still refuses foreign fields (nobody can write someone else's DOB or
//   smuggle a visibility pref through this route), and /auth/me returns
//   the owner's own DOB as a date-only string (key present, null when
//   unset).
//
// Harness mirrors qc-f-391 (bare Fastify + fake prisma capture + preHandler
// auth; the decorate cast pattern from the PR #903/#905 lesson).
// Negative control: on the pre-fix auth.ts every set/clear case fails —
// the schema rejects `dateOfBirth` outright (400 where 200 is expected)
// and /me carries no dateOfBirth key at all.
// ===========================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import authRoutes from '../routes/auth';

const OWNER = 'user-1';

async function buildRouteApp(
  prisma: unknown,
  opts: { authenticated?: boolean } = {},
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
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  if (opts.authenticated !== false) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = { userId: OWNER, username: 'user1' };
    });
  }
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  email: string;
  role: string;
  xpPoints: number;
  level: number;
  deletedAt: Date | null;
  dateOfBirth: Date | null;
}

describe('QC-F-467: PUT /auth/profile dateOfBirth + GET /auth/me', () => {
  let stored: StoredUser;
  let userUpdate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    stored = {
      id: OWNER,
      username: 'user1',
      displayName: 'User One',
      bio: null,
      avatarUrl: null,
      email: 'user1@example.test',
      role: 'USER',
      xpPoints: 0,
      level: 1,
      deletedAt: null,
      dateOfBirth: null,
    };
    userUpdate = vi.fn().mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(stored, data);
        return {
          id: stored.id,
          username: stored.username,
          displayName: stored.displayName,
          bio: stored.bio,
          avatarUrl: stored.avatarUrl,
          dateOfBirth: stored.dateOfBirth,
        };
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

  it('T1-1: sets the DOB — UTC-midnight Date written, date-only string returned', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { dateOfBirth: '2000-03-12' },
    });
    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const call = userUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    const written = call[0].data['dateOfBirth'] as Date;
    expect(written).toBeInstanceOf(Date);
    expect(written.toISOString()).toBe('2000-03-12T00:00:00.000Z');
    const body = res.json() as { data: { dateOfBirth: unknown } };
    expect(body.data.dateOfBirth).toBe('2000-03-12');
  });

  it('T1-2: null clears the column; an absent field leaves it untouched', async () => {
    stored.dateOfBirth = new Date(Date.UTC(1995, 5, 15));
    const clearRes = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { dateOfBirth: null },
    });
    expect(clearRes.statusCode).toBe(200);
    const clearCall = userUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(clearCall[0].data).toEqual({ dateOfBirth: null });
    expect((clearRes.json() as { data: { dateOfBirth: unknown } }).data.dateOfBirth).toBeNull();

    stored.dateOfBirth = new Date(Date.UTC(1995, 5, 15));
    userUpdate.mockClear();
    const bioRes = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { bio: 'hello' },
    });
    expect(bioRes.statusCode).toBe(200);
    const bioCall = userUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(bioCall[0].data).not.toHaveProperty('dateOfBirth');
  });

  it('T1-3: impossible, future, pre-1900, and mis-shaped values are 400 with no write', async () => {
    const badValues: unknown[] = [
      '2026-02-30', // not a real calendar date
      '2999-01-01', // future
      '1899-12-31', // before the sane range
      '12/03/2000', // wrong shape
      '2000-03-12T00:00:00.000Z', // datetime, not date-only
      20000312, // not a string
    ];
    for (const bad of badValues) {
      const res = await app.inject({
        method: 'PUT',
        url: '/auth/profile',
        payload: { dateOfBirth: bad },
      });
      expect(res.statusCode, `value ${String(bad)}`).toBe(400);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('T1-4: .strict() still refuses foreign fields (userId / whoCanSeeBirthday)', async () => {
    for (const payload of [
      { dateOfBirth: '2000-03-12', userId: 'someone-else' },
      { dateOfBirth: '2000-03-12', whoCanSeeBirthday: 'everyone' },
    ]) {
      const res = await app.inject({ method: 'PUT', url: '/auth/profile', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('T1-5: GET /auth/me returns the owner DOB as a string, key present + null when unset', async () => {
    const unset = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(unset.statusCode).toBe(200);
    const unsetData = (unset.json() as { data: Record<string, unknown> }).data;
    expect(unsetData).toHaveProperty('dateOfBirth', null);

    stored.dateOfBirth = new Date(Date.UTC(1990, 11, 25));
    const set = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(set.statusCode).toBe(200);
    expect((set.json() as { data: { dateOfBirth: unknown } }).data.dateOfBirth).toBe(
      '1990-12-25',
    );
  });

  it('T1-6: unauthenticated PUT is 401 (guard pin — passes pre- and post-fix)', async () => {
    const anonApp = await buildRouteApp(
      { user: { update: userUpdate, findUnique: vi.fn(async () => ({ ...stored })) } },
      { authenticated: false },
    );
    try {
      const res = await anonApp.inject({
        method: 'PUT',
        url: '/auth/profile',
        payload: { dateOfBirth: '2000-03-12' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await anonApp.close();
    }
  });
});
