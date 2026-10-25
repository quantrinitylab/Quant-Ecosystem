/**
 * Email/username case normalization at every auth entry point.
 *
 * Regression: register/login/verify-email/resend-verification used the RAW
 * body value for lookups and writes while password-reset normalized
 * (trim().toLowerCase()). `User@X.com` and `user@x.com` registered as TWO
 * distinct accounts on the same mailbox (the findFirst pre-check and the
 * @unique DB constraint are both case-sensitive), and login was an
 * exact-match findUnique, so retyping the address in a different case 401'd.
 *
 * The fix: normalizeIdentity() (trim + lowercase, mirroring
 * password-reset.ts) at all four entry points; new rows are stored
 * canonical; lookups are case-insensitive (findFirst/findMany with
 * mode: 'insensitive') so legacy mixed-case rows keep working. When two rows
 * already differ only by case — a data-corruption state new rows cannot
 * reach — every entry point answers an explicit 409 EMAIL_CASE_CONFLICT and
 * never silently signs into one of the accounts.
 *
 * The proof here runs the REAL /auth/* handlers against an in-memory Prisma
 * that implements real case-insensitive semantics for
 * `{ equals, mode: 'insensitive' }` (Postgres: LOWER(column) = LOWER(value)),
 * plus the register transaction staging from the atomicity suite. The fake
 * fails closed on unknown user-filter keys, so a handler query-shape change
 * surfaces here instead of silently passing.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
    codes: [] as any[],
  };
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  /**
   * Mirrors Postgres string-filter semantics for the shapes the auth
   * handlers use: exact strings, { equals, mode: 'insensitive' }, and
   * { in: [...] } for id lists.
   */
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

  const codeMatches = (r: any, where: any): boolean => {
    if (!where) return true;
    if (where.userId !== undefined && r.userId !== where.userId) return false;
    if (where.id !== undefined && !stringMatches(r.id, where.id)) return false;
    if (where.usedAt !== undefined) {
      const wantNull = where.usedAt === null;
      if (wantNull ? r.usedAt !== null : r.usedAt === null) return false;
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
    create: async ({ data }: any) => {
      const row = {
        id: nextId('user'),
        deletedAt: null,
        emailVerified: false,
        ...data,
      };
      store.set(row.id, row);
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = [...store.values()].find((u) => u.id === where.id);
      if (!row) throw new Error('fake user.update: row not found');
      Object.assign(row, data);
      return { ...row };
    },
  });

  const codeApi = (arr: any[]) => ({
    findFirst: async ({ where, orderBy }: any) => {
      const rows = arr.filter((r) => codeMatches(r, where));
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return rows[0] ? { ...rows[0] } : null;
    },
    // The verify-email transaction re-reads the row inside the transaction
    // (the TOCTOU fix): a plain id lookup, mirroring findFirst's matching.
    findUnique: async ({ where }: any) => {
      const rows = arr.filter((r) => codeMatches(r, where));
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: async ({ where }: any) =>
      arr.filter((r) => codeMatches(r, where)).map((r) => ({ ...r })),
    create: async ({ data }: any) => {
      const row = {
        id: nextId('evc'),
        createdAt: new Date(),
        usedAt: null,
        attempts: 0,
        ...data,
      };
      arr.push(row);
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = arr.find((r) => r.id === where.id);
      if (!row) throw new Error('fake emailVerificationCode.update: row not found');
      if (data?.attempts?.increment) row.attempts += data.attempts.increment;
      else Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const r of arr) {
        if (codeMatches(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
  });

  // Interactive-transaction semantics: stage on copies, commit only when the
  // callback resolves; a throw discards everything.
  const $transaction = async (cb: (tx: any) => Promise<any>) => {
    if (typeof cb !== 'function') throw new Error('$transaction fake expects the callback form');
    const stagedUsers = new Map(state.users);
    const stagedCodes = [...state.codes];
    const tx = {
      user: userApi(stagedUsers),
      emailVerificationCode: codeApi(stagedCodes),
      emailFolder: { createMany: async () => ({ count: 0 }) },
    };
    const result = await cb(tx);
    state.users = stagedUsers;
    state.codes = stagedCodes;
    return result;
  };

  const prisma = {
    user: {
      findMany: (args: any) => userApi(state.users).findMany(args),
      findFirst: (args: any) => userApi(state.users).findFirst(args),
      findUnique: (args: any) => userApi(state.users).findUnique(args),
    },
    emailVerificationCode: {
      findFirst: (args: any) => codeApi(state.codes).findFirst(args),
      findMany: (args: any) => codeApi(state.codes).findMany(args),
      update: (args: any) => codeApi(state.codes).update(args),
    },
    $transaction,
  };

  const sendVerificationEmail = vi.fn(async () => true);

  return { state, nextId, prisma, sendVerificationEmail };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, sendVerificationEmail: fakes.sendVerificationEmail };
});

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('../lib/auth-session', () => ({
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: () => ({}),
  setRefreshCookie: () => {},
  issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => ({
    success: true as const,
    data: { userId: user.id, user: { id: user.id, email: user.email } },
  })),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { authRoutes } from '../routes/auth';
import { hashVerificationCode } from '../lib/email-verification';

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
    passwordHash: 'hashed_x',
    emailVerified: false,
    deletedAt: null,
    ...overrides,
  };
  fakes.state.users.set(row.id, row);
  return row;
};

const seedCode = (userId: string, code = '123456') => {
  const row = {
    id: fakes.nextId('evc'),
    userId,
    codeHash: hashVerificationCode(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    usedAt: null,
    attempts: 0,
    createdAt: new Date(),
  };
  fakes.state.codes.push(row);
  return row;
};

const REGISTER = {
  email: 'alice@quantmail.in',
  username: 'alice',
  displayName: 'Alice',
  password: 's3cure-p4ssword',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.state.users = new Map();
  fakes.state.codes = [];
});

describe('POST /auth/register — canonical storage + case-insensitive pre-check', () => {
  it('stores a mixed-case, padded body lowercased and trimmed', async () => {
    const reply = await call('/auth/register', {
      headers: {},
      body: { ...REGISTER, email: '  MixedCase@Example.COM ', username: '  Alice_99 ' },
      ip: '203.0.113.9',
    });

    expect(reply.statusCode).toBe(200);
    const [user] = [...fakes.state.users.values()];
    expect(user.email).toBe('mixedcase@example.com');
    expect(user.username).toBe('alice_99');
    // The verification mail goes to the canonical address.
    expect(fakes.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(
      (fakes.sendVerificationEmail.mock.calls as unknown as Array<[{ to: string }]>)[0]?.[0]?.to,
    ).toBe('mixedcase@example.com');
  });

  it('a duplicate registration with different case 409s USER_EXISTS (takenField=email)', async () => {
    await call('/auth/register', { headers: {}, body: { ...REGISTER }, ip: '203.0.113.9' });
    const reply = await call('/auth/register', {
      headers: {},
      body: { ...REGISTER, email: 'ALICE@QUANTMAIL.IN', username: 'alice-second' },
      ip: '203.0.113.9',
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
    expect(reply.body.error.message).toContain('email');
    expect(fakes.state.users.size).toBe(1);
  });

  it('a duplicate username with different case 409s USER_EXISTS (takenField=username)', async () => {
    await call('/auth/register', { headers: {}, body: { ...REGISTER }, ip: '203.0.113.9' });
    const reply = await call('/auth/register', {
      headers: {},
      body: { ...REGISTER, email: 'alice2@quantmail.in', username: 'ALICE' },
      ip: '203.0.113.9',
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
    expect(reply.body.error.message).toContain('username');
    expect(fakes.state.users.size).toBe(1);
  });

  it('a legacy mixed-case row blocks re-registration with the lowercase form', async () => {
    seedUser({ email: 'LegacyCase@Example.com', username: 'LegacyCase' });
    const reply = await call('/auth/register', {
      headers: {},
      body: { ...REGISTER, email: 'legacycase@example.com', username: 'legacycase' },
      ip: '203.0.113.9',
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
    expect(fakes.state.users.size).toBe(1);
  });

  it('a whitespace-only email is a 400, not a stored empty address', async () => {
    const reply = await call('/auth/register', {
      headers: {},
      body: { ...REGISTER, email: '   ', username: 'alice' },
      ip: '203.0.113.9',
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(fakes.state.users.size).toBe(0);
  });
});

describe('POST /auth/login — case-insensitive lookup', () => {
  it('login with a different case than the registered address succeeds', async () => {
    seedUser();
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'ALICE@QUANTMAIL.IN', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
  });

  it('a legacy mixed-case row is found by its lowercase form', async () => {
    seedUser({ email: 'LegacyCase@Example.com' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'legacycase@example.com', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
  });

  it('two rows differing only by case answer an explicit 409, never silently picking one', async () => {
    seedUser({ id: 'user-a', email: 'Alice@Example.com' });
    seedUser({ id: 'user-b', email: 'alice@example.com' });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'ALICE@EXAMPLE.COM', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('EMAIL_CASE_CONFLICT');
  });

  it('a soft-deleted account cannot log in', async () => {
    seedUser({ deletedAt: new Date() });
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'alice@quantmail.in', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('an unknown address still 401s INVALID_CREDENTIALS', async () => {
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: 'nobody@quantmail.in', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('a whitespace-only email is a 400, not a 401', async () => {
    const reply = await call('/auth/login', {
      headers: {},
      body: { email: '   ', password: 's3cure-p4ssword' },
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/verify-email — case-insensitive lookup', () => {
  it('a code is redeemed when the address is typed in a different case', async () => {
    const user = seedUser();
    seedCode(user.id);
    const reply = await call('/auth/verify-email', {
      headers: {},
      body: { email: 'ALICE@QUANTMAIL.IN', code: '123456' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.emailVerified).toBe(true);
    expect(fakes.state.users.get(user.id).emailVerified).toBe(true);
  });

  it('two rows differing only by case answer 409 and burn NO code', async () => {
    const a = seedUser({ id: 'user-a', email: 'Alice@Example.com' });
    seedUser({ id: 'user-b', email: 'alice@example.com' });
    seedCode(a.id);
    const reply = await call('/auth/verify-email', {
      headers: {},
      body: { email: 'ALICE@EXAMPLE.COM', code: '123456' },
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('EMAIL_CASE_CONFLICT');
    expect(fakes.state.codes[0].usedAt).toBeNull();
  });

  it('an unknown address still answers wrong-or-expired, not a 404', async () => {
    const reply = await call('/auth/verify-email', {
      headers: {},
      body: { email: 'nobody@quantmail.in', code: '123456' },
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });
});

describe('POST /auth/resend-verification — case-insensitive lookup', () => {
  it('a resend with a different case finds the account and mails the stored address', async () => {
    const user = seedUser({ email: 'LegacyCase@Example.com' });
    const reply = await call('/auth/resend-verification', {
      headers: {},
      body: { email: 'legacycase@example.com' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.emailSent).toBe(true);
    expect(fakes.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(
      (fakes.sendVerificationEmail.mock.calls as unknown as Array<[{ to: string }]>)[0]?.[0]?.to,
    ).toBe('LegacyCase@Example.com');
    expect(fakes.state.codes.filter((c) => c.userId === user.id).length).toBe(1);
  });

  it('two rows differing only by case answer 409 and send NO email', async () => {
    seedUser({ id: 'user-a', email: 'Alice@Example.com' });
    seedUser({ id: 'user-b', email: 'alice@example.com' });
    const reply = await call('/auth/resend-verification', {
      headers: {},
      body: { email: 'ALICE@EXAMPLE.COM' },
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('EMAIL_CASE_CONFLICT');
    expect(fakes.sendVerificationEmail).not.toHaveBeenCalled();
    expect(fakes.state.codes.length).toBe(0);
  });

  it('a soft-deleted account 404s like an unknown address', async () => {
    seedUser({ deletedAt: new Date() });
    const reply = await call('/auth/resend-verification', {
      headers: {},
      body: { email: 'alice@quantmail.in' },
    });

    expect(reply.statusCode).toBe(404);
    expect(reply.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('an already-verified account short-circuits without issuing a code', async () => {
    seedUser({ emailVerified: true });
    const reply = await call('/auth/resend-verification', {
      headers: {},
      body: { email: 'ALICE@QUANTMAIL.IN' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.alreadyVerified).toBe(true);
    expect(fakes.sendVerificationEmail).not.toHaveBeenCalled();
    expect(fakes.state.codes.length).toBe(0);
  });
});
