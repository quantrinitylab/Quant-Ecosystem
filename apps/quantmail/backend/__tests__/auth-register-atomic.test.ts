/**
 * Registration atomicity: user + default folders + verification row must
 * commit together, or not at all.
 *
 * Regression: POST /auth/register created the user row first and the
 * email-verification row later as two sequential writes. When the
 * verification-row insert failed, an ACTIVE orphan user survived and the
 * retry 409'd USER_EXISTS — the account could never be verified.
 *
 * The proof here runs the REAL /auth/register handler against an in-memory
 * fake Prisma that implements real transaction semantics: $transaction
 * stages every write and commits only when the callback resolves. Forcing
 * the verification-row insert to fail must leave zero user rows behind, and
 * the subsequent retry must register cleanly (no USER_EXISTS).
 *
 * Structural guard: the fake's top-level user.create /
 * emailVerificationCode.create THROW when called outside $transaction, so
 * these tests also prove the handler performs no sequential out-of-tx
 * writes. The USER_EXISTS pre-check (findFirst) legitimately stays
 * outside the transaction.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const OUT_OF_TX = (op: string) =>
  new Error(`registration write "${op}" ran outside the transaction — must be atomic`);

const fakes = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
    folders: [] as any[],
    codes: [] as any[],
    failCodeInsert: false,
  };
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const userApi = (store: Map<string, any>) => ({
    findFirst: async ({ where }: any) => {
      for (const u of store.values()) {
        const or: any[] = where?.OR ?? [];
        if (
          or.some(
            (c: any) =>
              (c.email !== undefined && c.email === u.email) ||
              (c.username !== undefined && c.username === u.username),
          )
        ) {
          return { ...u };
        }
      }
      return null;
    },
    create: async ({ data }: any) => {
      const row = { id: nextId('user'), ...data };
      store.set(row.id, row);
      return { ...row };
    },
  });

  const codeApi = (arr: any[]) => ({
    create: async ({ data }: any) => {
      if (state.failCodeInsert) throw new Error('forced verification-row insert failure');
      const row = { id: nextId('evc'), ...data };
      arr.push(row);
      return { ...row };
    },
  });

  const folderApi = (arr: any[]) => ({
    createMany: async ({ data }: any) => {
      arr.push(...data.map((d: any) => ({ ...d })));
      return { count: data.length };
    },
  });

  // Interactive-transaction semantics: stage every write on copies, commit
  // only when the callback resolves; a throw discards everything.
  const $transaction = async (cb: (tx: any) => Promise<any>) => {
    if (typeof cb !== 'function') throw new Error('$transaction fake expects the callback form');
    const stagedUsers = new Map(state.users);
    const stagedFolders = [...state.folders];
    const stagedCodes = [...state.codes];
    const tx = {
      user: userApi(stagedUsers),
      emailVerificationCode: codeApi(stagedCodes),
      emailFolder: folderApi(stagedFolders),
    };
    const result = await cb(tx); // throws → staging discarded, nothing commits
    state.users = stagedUsers;
    state.folders = stagedFolders;
    state.codes = stagedCodes;
    return result;
  };

  const prisma = {
    // The USER_EXISTS pre-check reads outside the transaction — allowed.
    // Read state.users dynamically: $transaction swaps the map on commit.
    user: {
      findFirst: async (args: any) => userApi(state.users).findFirst(args),
      create: async () => {
        throw OUT_OF_TX('user.create');
      },
    },
    emailVerificationCode: {
      create: async () => {
        throw OUT_OF_TX('emailVerificationCode.create');
      },
    },
    emailFolder: {
      createMany: async () => {
        throw OUT_OF_TX('emailFolder.createMany');
      },
    },
    $transaction,
  };

  const sendVerificationEmail = vi.fn(async () => true);

  return { state, prisma, sendVerificationEmail };
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

const REGISTER = {
  email: 'atomic-orphan@quantmail.in',
  username: 'atomicorphan',
  displayName: 'Atomic Orphan',
  password: 's3cure-p4ssword',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.state.users = new Map();
  fakes.state.folders = [];
  fakes.state.codes = [];
  fakes.state.failCodeInsert = false;
});

describe('POST /auth/register — atomic signup', () => {
  const request = () => ({ headers: {}, body: { ...REGISTER }, ip: '203.0.113.9' });

  it('a forced verification-row insert failure leaves NO user row behind', async () => {
    fakes.state.failCodeInsert = true;

    await expect(call('/auth/register', request())).rejects.toThrow(
      'forced verification-row insert failure',
    );

    // No ACTIVE orphan: the rolled-back user must not exist anywhere.
    expect(fakes.state.users.size).toBe(0);
    expect(fakes.state.codes.length).toBe(0);
    expect(fakes.state.folders.length).toBe(0);
    // No verification email goes out for an account that does not exist.
    expect(fakes.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('retry after the failure registers cleanly — never USER_EXISTS', async () => {
    fakes.state.failCodeInsert = true;
    await expect(call('/auth/register', request())).rejects.toThrow();
    expect(fakes.state.users.size).toBe(0);

    // The poisoned insert is gone; the user retries with the same address.
    fakes.state.failCodeInsert = false;
    const reply = await call('/auth/register', request());

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(fakes.state.users.size).toBe(1);
    const [user] = [...fakes.state.users.values()];
    expect(user.email).toBe(REGISTER.email);
    expect(user.emailVerified).toBe(false);
    // The verification row exists and belongs to the new user.
    expect(fakes.state.codes.length).toBe(1);
    expect(fakes.state.codes[0].userId).toBe(user.id);
  });

  it('happy path commits user + 6 folders + verification row together', async () => {
    const reply = await call('/auth/register', request());

    expect(reply.statusCode).toBe(200);
    expect(fakes.state.users.size).toBe(1);
    expect(fakes.state.folders.length).toBe(6);
    expect(fakes.state.codes.length).toBe(1);
    const [user] = [...fakes.state.users.values()];
    expect(user.emailVerified).toBe(false);
    expect(user.status).toBe('ACTIVE');
    // All writes ran inside the transaction: the fake throws on any
    // top-level create, so reaching this line proves atomicity structurally.
    expect(fakes.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(reply.body.data.emailVerification.emailSent).toBe(true);
  });

  it('a duplicate email still 409s USER_EXISTS on the pre-check', async () => {
    await call('/auth/register', request());
    const reply = await call('/auth/register', request());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('USER_EXISTS');
    expect(fakes.state.users.size).toBe(1);
  });
});
