// ===========================================================================
// QC-F-391 — contract pins for the bio-clear path of PUT /auth/profile.
//
// The defect lives in the web form (it dropped a cleared bio before the
// request was ever built); the backend was already correct: the zod schema
// accepts `bio: ''` (trim, max 280, NO min) and the handler writes any
// defined field verbatim. Before this file, no test ever sent `bio: ''`, so
// that correct behaviour was unpinned — a future schema "tidy-up" (adding
// min(1), filtering empty strings) would have silently broken clearing for
// every client. These two cases pin the contract at the route level.
//
// They are CONTRACT pins, not a negative control (brief §6.2/§6.3): both
// PASS on the pre-fix backend, because the backend never had the bug. The
// behavioural negative control for QC-F-391 is the frontend suite
// (src/__tests__/qc-f-391-profile-edit.test.tsx).
//
// Harness mirrors qc-f-330-media-url-validator.test.ts (bare Fastify +
// fake prisma user.update capture + preHandler auth), including its
// decorate pattern: the app is cast for `decorate('prisma', …)` so the
// PrismaClient augmentation cannot produce the PR #903/#905 TS2345.
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

const OWNER = 'user-1';

async function buildRouteApp(prisma: unknown): Promise<FastifyInstance> {
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
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = { userId: OWNER, username: 'user1' };
  });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

describe('QC-F-391: PUT /auth/profile bio-clear contract', () => {
  let userUpdate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    userUpdate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: OWNER,
      username: 'user1',
      displayName: 'User One',
      bio: null,
      avatarUrl: null,
      ...data,
    }));
    app = await buildRouteApp({ user: { update: userUpdate } });
  });

  afterEach(async () => {
    await app.close();
  });

  it('B1: bio:"" is accepted (200) and written verbatim — the row is actually cleared', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { bio: '' },
    });

    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const call = userUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(call[0].data).toEqual({ bio: '' });
    expect((res.json() as { data: { bio: string } }).data.bio).toBe('');
  });

  it('B2: a spaces-only bio is trimmed by the schema and written as ""', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { bio: '   ' },
    });

    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const call = userUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(call[0].data.bio).toBe('');
  });
});
