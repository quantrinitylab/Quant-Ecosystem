// ============================================================================
// QC-F-259 — user directory search discoverability regression tests
//
// GET /users/search filtered with an ACTIVE allow-list (`status: 'ACTIVE'`).
// Phone-OTP users stay PENDING_VERIFICATION for their whole account life by
// design (QC-F-041 — the account-status gate is deliberately a DENY-list so
// that population is never locked out), so the allow-list hid EVERY phone
// user from the New Chat directory forever: they could use the app, but no
// one could ever find them to start a first chat. The same query also had no
// deletedAt filter, so a soft-deleted ACTIVE user stayed discoverable
// (QC-F-136a).
//
// The fix makes the directory query use the gate's deny-list predicate:
//   deletedAt: null  +  status: { notIn: ['SUSPENDED', 'DEACTIVATED'] }
// Invariant: anyone the account-status gate resolves 'ok' is discoverable.
//
// These tests run the REAL route against a fake prisma whose findMany
// HONESTLY evaluates the Prisma where clause (status equality / notIn / in,
// deletedAt null-vs-set, id not/in, OR of case-insensitive contains) —
// unlike the QC-F-042 search fake, which ignores the where and therefore
// cannot see a status-filter defect. Negative control: the phone-user,
// deleted-user, and query-shape cases FAIL against the pre-fix query
// (`status: 'ACTIVE'`, no deletedAt) and pass with the fix.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import usersRoutes from '../routes/users';

// Stable module-level identities.
const SEARCHER = { userId: 'user_searcher', username: 'searcher' };

interface DirectoryRow {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  deletedAt: Date | null;
  phoneVerified: boolean;
  preferences: unknown;
}

function row(partial: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    username: partial.id,
    displayName: partial.id,
    email: `${partial.id}@example.test`,
    avatarUrl: null,
    bio: null,
    status: 'ACTIVE',
    deletedAt: null,
    phoneVerified: false,
    preferences: null,
    ...partial,
  };
}

// Every row below matches q='asha' on displayName, so the ONLY thing that
// decides inclusion is the status/deletedAt predicate under test (plus the
// self-exclusion and the QC-F-042 hideFromSearch post-filter).
const ROWS: DirectoryRow[] = [
  row({
    id: SEARCHER.userId,
    username: 'asha_searcher',
    displayName: 'Asha Searcher',
    status: 'ACTIVE',
  }),
  row({
    id: 'user_phone',
    username: 'asha_phone',
    displayName: 'Asha Phone',
    status: 'PENDING_VERIFICATION', // phone-OTP user, QC-F-041 design
    phoneVerified: true,
  }),
  row({
    id: 'user_sso',
    username: 'asha_sso',
    displayName: 'Asha Sso',
    status: 'ACTIVE',
  }),
  row({
    id: 'user_suspended',
    username: 'asha_suspended',
    displayName: 'Asha Suspended',
    status: 'SUSPENDED',
  }),
  row({
    id: 'user_deactivated',
    username: 'asha_deactivated',
    displayName: 'Asha Deactivated',
    status: 'DEACTIVATED',
  }),
  row({
    id: 'user_deleted_active',
    username: 'asha_deleted_active',
    displayName: 'Asha Deletedactive',
    status: 'ACTIVE', // SSO-created, then soft-deleted (QC-F-136a)
    deletedAt: new Date('2026-10-01T00:00:00.000Z'),
  }),
  row({
    id: 'user_deleted_pending',
    username: 'asha_deleted_pending',
    displayName: 'Asha Deletedpending',
    status: 'PENDING_VERIFICATION',
    phoneVerified: true,
    deletedAt: new Date('2026-10-01T00:00:00.000Z'),
  }),
  row({
    id: 'user_hidden_phone',
    username: 'asha_hidden_phone',
    displayName: 'Asha Hiddenphone',
    status: 'PENDING_VERIFICATION',
    phoneVerified: true,
    preferences: { chatSettings: { privacy: { hideFromSearch: true } } },
  }),
];

// ---------------------------------------------------------------------------
// Honest Prisma-where evaluation (the subset this route's query can use)
// ---------------------------------------------------------------------------
type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === 'string') return value === cond;
  if (cond instanceof Date) {
    return value instanceof Date && value.getTime() === cond.getTime();
  }
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    if ('not' in c) return !matchField(value, c.not);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('contains' in c) {
      const hay = String(value ?? '');
      const needle = String(c.contains);
      return c.mode === 'insensitive'
        ? hay.toLowerCase().includes(needle.toLowerCase())
        : hay.includes(needle);
    }
  }
  return value === cond;
}

function matchWhere(r: DirectoryRow, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const clauses = cond as Where[];
      if (!clauses.some((clause) => matchWhere(r, clause))) return false;
    } else if (key === 'AND') {
      const clauses = cond as Where[];
      if (!clauses.every((clause) => matchWhere(r, clause))) return false;
    } else if (!matchField((r as unknown as Record<string, unknown>)[key], cond)) {
      return false;
    }
  }
  return true;
}

interface CapturedQuery {
  where: Where;
}

function directoryPrisma(captured: CapturedQuery[]) {
  return {
    user: {
      async findMany(args: unknown) {
        const a = args as {
          where?: Where;
          select?: Record<string, boolean>;
          take?: number;
          orderBy?: { displayName?: string };
        };
        // PrivacyService.resolveMany batch read (QC-F-042 post-filter).
        if (a.select?.preferences) {
          const ids = (a.where?.id as { in?: string[] } | undefined)?.in ?? [];
          return ROWS.filter((r) => ids.includes(r.id)).map((r) => ({
            id: r.id,
            preferences: r.preferences,
          }));
        }
        // Directory query: evaluate the where honestly, then order/take/project.
        captured.push({ where: a.where ?? {} });
        let out = ROWS.filter((r) => matchWhere(r, a.where ?? {}));
        if (a.orderBy?.displayName === 'asc') {
          out = [...out].sort((x, y) => x.displayName.localeCompare(y.displayName));
        }
        if (typeof a.take === 'number') out = out.slice(0, a.take);
        const select = a.select ?? {};
        return out.map((r) => {
          const projected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) projected[key] = (r as unknown as Record<string, unknown>)[key];
          }
          return projected;
        });
      },
      async findUnique(args: unknown) {
        const id = (args as { where: { id: string } }).where.id;
        const found = ROWS.find((r) => r.id === id);
        return found ? { preferences: found.preferences } : null;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Route-level harness (bare Fastify + fake prisma, QC-F-042 pattern)
// ---------------------------------------------------------------------------
const apps: FastifyInstance[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function buildTestApp(
  prisma: unknown,
  auth: { userId: string; username: string } | null,
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
  app.decorate('prisma', prisma as never);
  if (auth) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(usersRoutes, { prefix: '/users' });
  await app.ready();
  apps.push(app);
  return app;
}

async function searchIds(app: FastifyInstance): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/users/search?q=asha' });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { success: boolean; data: Array<{ id: string }> };
  expect(body.success).toBe(true);
  return body.data.map((u) => u.id);
}

// ---------------------------------------------------------------------------
// QC-F-259 — discoverability follows the deny-list gate predicate
// ---------------------------------------------------------------------------
describe('QC-F-259 search: deny-list discoverability', () => {
  it('phone-OTP user (PENDING_VERIFICATION for life) IS discoverable', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).toContain('user_phone');
  });

  it('ACTIVE (SSO) user remains discoverable (control)', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).toContain('user_sso');
  });

  it('SUSPENDED and DEACTIVATED users are NOT discoverable', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).not.toContain('user_suspended');
    expect(ids).not.toContain('user_deactivated');
  });

  it('soft-deleted ACTIVE user is NOT discoverable (QC-F-136a)', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).not.toContain('user_deleted_active');
  });

  it('soft-deleted PENDING user is NOT discoverable (deletedAt clause is load-bearing)', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).not.toContain('user_deleted_pending');
  });

  it('the requesting user is excluded even though they match', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).not.toContain(SEARCHER.userId);
  });

  it('hideFromSearch post-filter (QC-F-042) still applies to the widened population', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect(ids).not.toContain('user_hidden_phone');
    // …while the non-hidden phone user on the same query still shows.
    expect(ids).toContain('user_phone');
  });

  it('full result set is exactly the gate-ok, non-hidden, non-self population', async () => {
    const app = await buildTestApp(directoryPrisma([]), SEARCHER);
    const ids = await searchIds(app);
    expect([...ids].sort()).toEqual(['user_phone', 'user_sso']);
  });

  it('query shape pin: deny-list where, no ACTIVE allow-list', async () => {
    const captured: CapturedQuery[] = [];
    const app = await buildTestApp(directoryPrisma(captured), SEARCHER);
    await searchIds(app);
    expect(captured).toHaveLength(1);
    const where = captured[0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toEqual({ notIn: ['SUSPENDED', 'DEACTIVATED'] });
    expect(where.status).not.toBe('ACTIVE');
    expect((where.status as Record<string, unknown> | undefined)?.in).toBeUndefined();
  });

  it('unauthenticated search is rejected 401', async () => {
    const app = await buildTestApp(directoryPrisma([]), null);
    const res = await app.inject({ method: 'GET', url: '/users/search?q=asha' });
    expect(res.statusCode).toBe(401);
  });
});
