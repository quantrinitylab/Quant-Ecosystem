/**
 * POST /auth/2fa/backup-codes — concurrent-regeneration race.
 *
 * Regression: `issueBackupCodes` ran `deleteMany` then `createMany` as
 * sequential awaits OUTSIDE any transaction, so two concurrent "fresh
 * recovery codes" requests (the realistic trigger is a double-click or a
 * retried tap — the endpoint is rate-limited to 5/min, and two rapid taps
 * both pass) interleaved: A deletes, A creates A1, B deletes A1, B creates
 * B1. Both responses answered 200, but the FIRST response's plaintext codes
 * were already dead — the user saved recovery codes that do not work and
 * discovered it only when locked out.
 *
 * The fix linearizes burn+create inside one transaction, same style as the
 * password-reset issuance fix: snapshot the rows live when THIS request
 * began, delete exactly that snapshot with a compare-and-set
 * ({ id: { in: ids } }), and require the deleted count to match the snapshot
 * size. A sibling request still in flight has its create uncommitted, hence
 * invisible to the snapshot — a request can never delete a batch whose
 * plaintext is still on its way to the user. The loser throws BEFORE any
 * codes are returned and the route answers 409 REGENERATE_SUPERSEDED (the
 * endpoint is authenticated, so unlike password-reset's non-committal 200
 * there is no enumeration concern).
 *
 * The in-memory prisma below emulates real Postgres read-committed
 * semantics for the burn, which is what makes the concurrency test honest:
 * - each transaction sees committed state plus its own staged writes;
 *   a sibling's staged (uncommitted) create is invisible;
 * - `deleteMany` is statement-atomic, and when its WHERE matches a row
 *   another in-flight transaction has staged a delete for, it WAITS for
 *   that transaction (row-lock wait) and then re-evaluates the WHERE against
 *   the fresh committed state — exactly like DELETE ... WHERE under a row
 *   lock. That re-evaluation is what turns the loser into count 0 and rolls
 *   it back before any codes go out.
 *
 * Negative control: against the pre-fix handler (sequential awaits, no
 * transaction) the concurrent test below has no linearization point — both
 * requests answer 200 with codes, and the first response's codes hash to
 * nothing in the store. There is nothing in the old code for the test to
 * hold onto.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const fakes = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
    codes: [] as any[],
  };
  let codeSeq = 0;
  let txSeq = 0;

  // In-flight transactions: staged writes invisible to everyone else, plus
  // the commit signal other transactions' DELETEs wait on (row-lock wait).
  const inflight: Array<{
    id: number;
    stagedDeletes: Set<string>;
    stagedCreates: any[];
    done: boolean;
    committed: ReturnType<typeof deferred>;
  }> = [];

  const matchWhere = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if (where.id !== undefined) {
      if (typeof where.id === 'object' && where.id !== null && 'in' in where.id) {
        if (!where.id.in.includes(row.id)) return false;
      } else if (row.id !== where.id) return false;
    }
    return true;
  };

  // Rows visible to a transaction: committed state minus its own staged
  // deletes, plus its own staged creates. Siblings' staged writes stay
  // invisible (read-committed).
  const visibleRows = (slot: (typeof inflight)[number]) => [
    ...state.codes.filter((r) => !slot.stagedDeletes.has(r.id)),
    ...slot.stagedCreates,
  ];

  const testHooks: {
    beforeTransaction: (slotId: number) => Promise<void>;
    beforeCommit: (slotId: number) => Promise<void>;
    onBlocked: (() => void) | null;
  } = {
    beforeTransaction: async () => {},
    beforeCommit: async () => {},
    onBlocked: null,
  };

  const $transaction = async (cb: (tx: any) => Promise<any>) => {
    if (typeof cb !== 'function') throw new Error('$transaction fake expects the callback form');
    const slot = {
      id: ++txSeq,
      stagedDeletes: new Set<string>(),
      stagedCreates: [] as any[],
      done: false,
      committed: deferred(),
    };
    inflight.push(slot);
    const tx = {
      twoFactorBackupCode: {
        findMany: async ({ where }: any) => visibleRows(slot).filter((r) => matchWhere(r, where)),
        // Statement-atomic compare-and-set. If another in-flight transaction
        // staged a delete of a row our WHERE matches, wait for it (row-lock
        // wait, like Postgres) and re-evaluate the WHERE afterwards.
        deleteMany: async ({ where }: any) => {
          let matched = visibleRows(slot).filter((r) => matchWhere(r, where));
          const blockers = inflight.filter(
            (s) => s !== slot && !s.done && matched.some((r) => s.stagedDeletes.has(r.id)),
          );
          if (blockers.length > 0) {
            testHooks.onBlocked?.();
            for (const b of blockers) await b.committed.promise;
            matched = visibleRows(slot).filter((r) => matchWhere(r, where));
          }
          for (const r of matched) slot.stagedDeletes.add(r.id);
          return { count: matched.length };
        },
        createMany: async ({ data }: any) => {
          const rows = (Array.isArray(data) ? data : [data]).map((d: any) => ({
            id: `bc-${++codeSeq}`,
            usedAt: null,
            createdAt: new Date(),
            ...d,
          }));
          slot.stagedCreates.push(...rows);
          return { count: rows.length };
        },
      },
    };
    try {
      await testHooks.beforeTransaction(slot.id);
      const result = await cb(tx);
      // Test-driven interleave point: pause between the callback finishing
      // and the commit applying, so a sibling transaction can start while
      // this one's writes are still uncommitted.
      await testHooks.beforeCommit(slot.id);
      state.codes = state.codes.filter((r) => !slot.stagedDeletes.has(r.id));
      state.codes.push(...slot.stagedCreates);
      slot.done = true;
      slot.committed.resolve();
      return result;
    } catch (err) {
      slot.done = true;
      slot.committed.resolve();
      throw err;
    } finally {
      const i = inflight.indexOf(slot);
      if (i >= 0) inflight.splice(i, 1);
    }
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: any) => {
        const u = state.users.get(where?.id);
        return u ? { ...u } : null;
      },
    },
    $transaction,
  };

  return { state, prisma, testHooks };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret',
}));

vi.mock('@quant/auth', () => ({
  totpService: { generateSecret: vi.fn(), verify: vi.fn(async () => true) },
}));

vi.mock('../lib/auth-session', () => ({
  authenticatedUserId: () => USER_ID,
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  issueBrowserSession: vi.fn(),
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: () => ({}),
}));

// The real crypto: the test proves the winner's plaintext verifies against
// the stored hashes, so the lib must hash for real.
import { BACKUP_CODE_COUNT, hashBackupCode } from '../lib/two-factor';
import { twoFactorRoutes } from '../routes/two-factor';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: this suite is about the handlers, and a
   real instance would drag in the plugin graph they do not use. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, a: unknown, b?: RouteHandler) => {
    handlers.set(path, (b ?? a) as RouteHandler);
  };
  await twoFactorRoutes({ post: register, get: register } as never);
  return handlers;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    code(s: number) {
      this.statusCode = s;
      return this;
    },
    send(b: unknown) {
      this.body = b;
      return b;
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

const USER_ID = 'user-1';
const regenerate = () =>
  call('/auth/2fa/backup-codes', { headers: {}, body: { password: 'correct-horse' } });

const USER = {
  id: USER_ID,
  email: 'kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  passwordHash: 'hashed_correct-horse',
  twoFactorEnabled: true,
  twoFactorSecret: 'LIVESECRET',
  twoFactorPendingSecret: null,
  twoFactorConfirmedAt: new Date().toISOString(),
  twoFactorLastUsedStep: null,
};

const tick = (n = 5) => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => new Promise((r) => setImmediate(r)));
  return p;
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.state.users = new Map();
  fakes.state.codes = [];
  fakes.testHooks.beforeTransaction = async () => {};
  fakes.testHooks.beforeCommit = async () => {};
  fakes.testHooks.onBlocked = null;
  fakes.state.users.set(USER.id, { ...USER });
  // A live batch from an earlier regeneration — the thing the race burns.
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    fakes.state.codes.push({
      id: `bc-old-${i}`,
      userId: USER.id,
      codeHash: hashBackupCode(`OLDCODE-${i}`),
      usedAt: null,
      createdAt: new Date(Date.now() - 60_000),
    });
  }
});

describe('POST /auth/2fa/backup-codes — concurrent-regeneration race', () => {
  it('two concurrent regenerations linearize: one winner with live codes, the loser gets 409 REGENERATE_SUPERSEDED and no codes', async () => {
    // Hold A's transaction open after its burn+create, before commit, so
    // B's transaction genuinely overlaps it (B starts while A's writes are
    // still uncommitted) — the interleaving the old code got wrong.
    const gateA = deferred();
    let parked = 0;
    let wasBlocked = false;
    fakes.testHooks.beforeCommit = async () => {
      parked += 1;
      if (parked === 1) await gateA.promise;
    };
    fakes.testHooks.onBlocked = () => {
      wasBlocked = true;
    };

    const pA = regenerate();
    // Wait until A is genuinely parked at its commit gate before B starts.
    for (let i = 0; i < 200 && parked < 1; i++) await tick();
    expect(parked).toBe(1);

    const pB = regenerate();
    // Let B reach its burn and block on A's row lock, like Postgres.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('B never blocked on A — no genuine overlap')), 5000);
      const poll = () => {
        if (wasBlocked) {
          clearTimeout(timer);
          resolve();
        } else setTimeout(poll, 10);
      };
      poll();
    });
    await tick();
    gateA.resolve();

    const [replyA, replyB] = await Promise.all([pA, pB]);

    // B really did overlap A: it blocked on A's row lock.
    expect(wasBlocked).toBe(true);

    // Exactly one request wins with a fresh batch; the loser is told so with
    // a distinct, honest 409 — never handed plaintext that is already dead.
    expect(replyA.statusCode).toBe(200);
    expect(replyA.body.success).toBe(true);
    expect(replyA.body.data.backupCodes).toHaveLength(BACKUP_CODE_COUNT);
    expect(replyA.body.data.count).toBe(BACKUP_CODE_COUNT);

    expect(replyB.statusCode).toBe(409);
    expect(replyB.body.success).toBe(false);
    expect(replyB.body.error.code).toBe('REGENERATE_SUPERSEDED');
    // The loser gets no codes at all — nothing dead-on-arrival to save.
    expect(replyB.body.data).toBeUndefined();
    expect(JSON.stringify(replyB.body)).not.toContain('backupCodes');

    // Exactly one batch survives, and it is the winner's: every plaintext
    // the winner returned hashes to a live stored row.
    expect(fakes.state.codes).toHaveLength(BACKUP_CODE_COUNT);
    const liveHashes = new Set(fakes.state.codes.map((r: any) => r.codeHash));
    for (const code of replyA.body.data.backupCodes as string[]) {
      expect(liveHashes.has(hashBackupCode(code))).toBe(true);
    }
    // The pre-race batch is gone; the loser created nothing (rolled back).
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      expect(liveHashes.has(hashBackupCode(`OLDCODE-${i}`))).toBe(false);
    }
  });

  it('sequential regenerations keep working: the later batch invalidates the earlier one', async () => {
    const first = await regenerate();
    const second = await regenerate();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.body.data.backupCodes).toHaveLength(BACKUP_CODE_COUNT);
    expect(second.body.data.backupCodes).toHaveLength(BACKUP_CODE_COUNT);

    // Only the latest batch is live — legitimate invalidation of a batch the
    // user already received, not the race.
    expect(fakes.state.codes).toHaveLength(BACKUP_CODE_COUNT);
    const liveHashes = new Set(fakes.state.codes.map((r: any) => r.codeHash));
    for (const code of second.body.data.backupCodes as string[]) {
      expect(liveHashes.has(hashBackupCode(code))).toBe(true);
    }
    for (const code of first.body.data.backupCodes as string[]) {
      expect(liveHashes.has(hashBackupCode(code))).toBe(false);
    }
  });
});
