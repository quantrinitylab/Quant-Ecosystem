/**
 * Soft-delete/status liveness gates at the auth entry points.
 *
 * Regression (queue L639): /auth/login had no soft-delete/status guard, so a
 * soft-deleted or admin-disabled account could still authenticate. The lookup
 * itself already excluded tombstoned rows (deletedAt: null), but a
 * SUSPENDED/DEACTIVATED live row sailed straight through to a session.
 *
 * The contract pinned here:
 * - /auth/login: SUSPENDED/DEACTIVATED + correct password → honest 401
 *   (ACCOUNT_SUSPENDED / ACCOUNT_DEACTIVATED); wrong password on a disabled
 *   account → generic INVALID_CREDENTIALS (no email→status oracle); a
 *   tombstoned address answers exactly like a missing one.
 * - /auth/register: a tombstoned email keeps its unique claim — 409
 *   USER_EXISTS, no silent revive, no new row.
 * - accountLiveness() unit contract.
 *
 * Runs the REAL /auth/* handlers against an in-memory Prisma fake with
 * fail-closed query-shape guards (same style as auth-email-case-normalize).
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
  };
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const stringMatches = (rowVal: unknown, filter: any): boolean => {
    if (filter === undefined) return true;
    if (typeof filter === 'string') return rowVal === filter;
    if (filter && typeof filter === 'object') {
      if ('equals' in filter) {
        const lhs = String(rowVal ?? '');
        const rhs = String(filter.equals);
        return filter.mode === 'insensitive'
          ? lhs.toLowerCase() === rhs.toLowerCase()
          : lhs === rhs;
      }
      if ('in' in filter) {
        return Array.isArray(filter.in) && filter.in.includes(rowVal);
      }
    }
    return false;
  };

  const userMatches = (u: any, where: any): boolean => {
    if (!where) return true;
    for (const key of Object.keys(where)) {
      if (key === 'OR') {
        const clauses: any[] = where.OR ?? [];
        if (!clauses.some((c) => userMatches(u, c))) return false;
        continue;
      }
      if (key === 'deletedAt') {
        const wantNull = where.deletedAt === null;
        if (wantNull ? u.deletedAt != null : u.deletedAt == null) return false;
        continue;
      }
      if (key === 'email' || key === 'username' || key === 'id') {
        if (!stringMatches(u[key], where[key])) return false;
        continue;
      }
      // Structural guard: an auth-handler query-shape change must surface
      // here, not silently pass against a permissive fake.
      throw new Error(`fake userMatches: unhandled filter key "${key}"`);
    }
    return true;
  };

  const userApi = (store: Map<string, any>) => ({
    findMany: async ({ where, take }: any) => {
      const out = [...store.values()].filter((u) => userMatches(u, where));
      return (take === undefined ? out : out.slice(0, take)).map((u) => ({ ...u }));
    },
    findFirst: async (args: any) => (await userApi(store).findMany(args))[0] ?? null,
    findUnique: async (args: any) => (await userApi(store).findMany(args))[0] ?? null,
  });

  const prisma = {
    user: {
      findMany: (args: any) => userApi(state.users).findMany(args),
      findFirst: (args: any) => userApi(state.users).findFirst(args),
      findUnique: (args: any) => userApi(state.users).findUnique(args),
    },
  };

  return { state, nextId, prisma };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

vi.mock('../lib/email-verification', () => ({
  // Full manual mock (no importOriginal): the real module pulls ses-sender →
  // @quant/server-core, whose worktree layout cannot resolve
  // fastify-type-provider-zod under vitest. These handlers only need the
  // code-generation helpers and the mailer stub below.
  MAX_VERIFICATION_ATTEMPTS: 5,
  generateVerificationCode: () => '123456',
  hashVerificationCode: (code: string) => `hash_${code}`,
  isVerificationCodeExpired: () => false,
  looksLikeVerificationCode: (code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code),
  sendVerificationEmail: vi.fn(async () => true),
  verificationCodeExpiry: () => new Date(Date.now() + 15 * 60 * 1000),
  verificationCodeMatches: (a: unknown, b: unknown) => a === b,
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('../lib/auth-session', () => ({
  REFRESH_COOKIE_NAME: 'qm_refresh',
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: () => ({}),
  setRefreshCookie: () => {},
  clearRefreshCookie: () => {},
  sessionUserPayload: (u: any) => ({ id: u.id, email: u.email }),
  authenticatedUserId: () => undefined,
  issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => ({
    success: true as const,
    data: { userId: user.id, user: { id: user.id, email: user.email } },
  })),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import * as argon2 from 'argon2';
import { authRoutes } from '../routes/auth';
import { accountLiveness } from '../lib/account-liveness';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: this suite is about the handlers. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
  };
  await authRoutes({
    post: register,
    get: register,
    patch: register,
    requireStepUp: () => async () => {},
  } as never);
  return handlers;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
    setCookie() {
      return this;
    },
  };
  return reply;
};

const call = async (path: string, request: Record<string, unknown>) => {
  const handlers = await loadHandlers();
  const reply = makeReply();
  await handlers.get(path)!(request, reply);
  return reply;
};

const seedUser = (overrides: Record<string, unknown> = {}) => {
  const row = {
    id: fakes.nextId('user'),
    email: 'alice@quantmail.in',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: 'hashed_correctpw',
    emailVerified: true,
    status: 'ACTIVE',
    deletedAt: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    ...overrides,
  };
  fakes.state.users.set(row.id, row);
  return row;
};

beforeEach(() => {
  vi.clearAllMocks();
  // argon2.verify defaults to "correct password" for these handlers.
  (argon2.verify as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  fakes.state.users = new Map();
});

describe('accountLiveness unit contract', () => {
  it('returns ok for null/undefined', () => {
    expect(accountLiveness(null)).toBe('ok');
    expect(accountLiveness(undefined)).toBe('ok');
  });
  it('returns deleted for a tombstoned row', () => {
    expect(accountLiveness({ deletedAt: new Date(), status: 'DEACTIVATED' })).toBe('deleted');
  });
  it('returns suspended/deactivated case-insensitively', () => {
    expect(accountLiveness({ deletedAt: null, status: 'SUSPENDED' })).toBe('suspended');
    expect(accountLiveness({ deletedAt: null, status: 'suspended' })).toBe('suspended');
    expect(accountLiveness({ deletedAt: null, status: 'DEACTIVATED' })).toBe('deactivated');
    expect(accountLiveness({ deletedAt: null, status: 'deactivated' })).toBe('deactivated');
  });
  it('returns ok for live, pending-verification and unknown statuses', () => {
    expect(accountLiveness({ deletedAt: null, status: 'ACTIVE' })).toBe('ok');
    expect(accountLiveness({ deletedAt: null, status: 'PENDING_VERIFICATION' })).toBe('ok');
    expect(accountLiveness({ deletedAt: null, status: null })).toBe('ok');
  });
});

describe('POST /auth/login — soft-delete/status gate', () => {
  it('suspended account with correct password gets honest 401 ACCOUNT_SUSPENDED', async () => {
    seedUser({ status: 'SUSPENDED' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'correctpw' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('deactivated account with correct password gets honest 401 ACCOUNT_DEACTIVATED', async () => {
    seedUser({ status: 'DEACTIVATED' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'correctpw' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('wrong password on a disabled account stays generic — no status oracle', async () => {
    seedUser({ status: 'SUSPENDED' });
    (argon2.verify as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'wrongpw' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('active account still signs in', async () => {
    seedUser({ status: 'ACTIVE' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'correctpw' },
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
  });

  it('tombstoned address answers exactly like a missing account', async () => {
    seedUser({ deletedAt: new Date('2026-01-01T00:00:00Z'), status: 'DEACTIVATED' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'correctpw' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('disabled account with 2FA enabled is blocked before any challenge is minted', async () => {
    seedUser({ status: 'SUSPENDED', twoFactorEnabled: true, twoFactorSecret: 'sekret' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 'correctpw' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(reply.body.data?.twoFactorRequired).toBeUndefined();
  });
});

describe('POST /auth/register — tombstone retention (no silent revive)', () => {
  const REGISTER_BODY = (email: string) => ({
    email,
    username: 'brandnew',
    displayName: 'Brand New',
    password: 'anewsecretpw',
  });

  it('tombstoned email stays 409 USER_EXISTS and no row is created', async () => {
    seedUser({ email: 'gone@quantmail.in', deletedAt: new Date('2026-01-01T00:00:00Z'), status: 'DEACTIVATED' });
    const before = fakes.state.users.size;
    const reply = await call('/auth/register', {
      headers: {},
      body: REGISTER_BODY('gone@quantmail.in'),
    });
    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
    expect(fakes.state.users.size).toBe(before);
  });

  it('live email still 409s (existing behavior unchanged)', async () => {
    seedUser({ email: 'taken@quantmail.in' });
    const reply = await call('/auth/register', {
      headers: {},
      body: REGISTER_BODY('taken@quantmail.in'),
    });
    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
  });
});
