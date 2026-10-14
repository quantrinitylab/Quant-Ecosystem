/**
 * POST /auth/password-reset — concurrent-issuance race.
 *
 * Regression: burn-live-tokens `deleteMany` then `create` ran as sequential
 * awaits OUTSIDE any transaction, so two concurrent reset requests
 * interleaved (A burns, A creates L1, B burns L1, B creates L2) and the link
 * in A's just-sent email was already dead — the user clicked a seconds-old
 * link and got RESET_LINK_EXPIRED.
 *
 * The fix linearizes burn+create inside one transaction, same style as the
 * resend-verification fix (PR #1045): snapshot the links live when THIS
 * request began, delete exactly that snapshot with a compare-and-set
 * ({ id: { in: ids }, usedAt: null }), and require the deleted count to
 * match the snapshot size. A sibling request still in flight has its create
 * uncommitted, hence invisible to the snapshot — a request can never delete
 * a link whose email is still being sent. A loser fails BEFORE any email
 * goes out: one winner, one live link, one email.
 *
 * Unlike the resend fix's 409, the loser here answers the same
 * non-committal 200 as every other outcome — only an existing address can
 * lose a race, so a distinct status would be an enumeration oracle.
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
 *   it back with no email sent.
 *
 * Negative control: against the pre-fix handler (sequential awaits, no
 * transaction) the concurrent test below has no linearization point — both
 * requests burn and both email, and the first email's link is dead on
 * arrival. There is nothing in the old code for the test to hold onto.
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
    tokens: [] as any[],
  };
  let tokenSeq = 0;
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
    if (where.usedAt !== undefined) {
      const wantNull = where.usedAt === null;
      if (wantNull ? row.usedAt !== null : row.usedAt === null) return false;
    }
    return true;
  };

  // Rows visible to a transaction: committed state minus its own staged
  // deletes, plus its own staged creates. Siblings' staged writes stay
  // invisible (read-committed).
  const visibleRows = (slot: (typeof inflight)[number]) => [
    ...state.tokens.filter((r) => !slot.stagedDeletes.has(r.id)),
    ...slot.stagedCreates,
  ];

  const findUser = (where: any) => {
    for (const u of state.users.values()) {
      if (where.email !== undefined) {
        const cond = where.email;
        const stored = String(u.email ?? '');
        if (typeof cond === 'object' && cond !== null && 'equals' in cond) {
          const want = String(cond.equals);
          const match =
            cond.mode === 'insensitive'
              ? stored.toLowerCase() === want.toLowerCase()
              : stored === want;
          if (!match) continue;
        } else if (stored !== cond) continue;
      }
      if (where.id !== undefined && u.id !== where.id) continue;
      if (where.deletedAt !== undefined && u.deletedAt !== where.deletedAt) continue;
      return { ...u };
    }
    return null;
  };

  const testHooks: {
    beforeTransaction: (slotId: number) => Promise<void>;
    beforeCommit: (slotId: number) => Promise<void>;
    onBlocked: (() => void) | null;
    beforeTopDelete: () => Promise<void>;
    afterTopDelete: () => Promise<void>;
    afterTopCreate: () => Promise<void>;
  } = {
    beforeTransaction: async () => {},
    beforeCommit: async () => {},
    onBlocked: null,
    beforeTopDelete: async () => {},
    afterTopDelete: async () => {},
    afterTopCreate: async () => {},
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
      passwordResetToken: {
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
        create: async ({ data }: any) => {
          const row = { id: `prt-${++tokenSeq}`, usedAt: null, createdAt: new Date(), ...data };
          slot.stagedCreates.push(row);
          return { ...row };
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
      state.tokens = state.tokens.filter((r) => !slot.stagedDeletes.has(r.id));
      state.tokens.push(...slot.stagedCreates);
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
      findFirst: async ({ where }: any) => findUser(where ?? {}),
    },
    passwordResetToken: {
      // Top-level writes are autocommit (the pre-fix handler used these).
      deleteMany: async ({ where }: any) => {
        await testHooks.beforeTopDelete();
        const matched = state.tokens.filter((r) => matchWhere(r, where));
        state.tokens = state.tokens.filter((r) => !matchWhere(r, where));
        await testHooks.afterTopDelete();
        return { count: matched.length };
      },
      create: async ({ data }: any) => {
        const row = { id: `prt-${++tokenSeq}`, usedAt: null, createdAt: new Date(), ...data };
        state.tokens.push(row);
        await testHooks.afterTopCreate();
        return { ...row };
      },
    },
    $transaction,
  };

  return { state, prisma, testHooks };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
}));

const mailControl = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; url: string; token: string }>,
  // When set, the mocked send waits on this before resolving — lets a test
  // prove the handler answers without awaiting the SES round trip.
  gate: null as null | Promise<boolean>,
}));

vi.mock('../lib/password-reset', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    // The factory body must not dereference plain top-level bindings (it
    // runs during import evaluation, while they are still in TDZ); the
    // closure below only touches mailControl at call time, and mailControl
    // is vi.hoisted, so it is initialized before any import runs.
    sendPasswordResetEmail: async (opts: any) => {
      const match = String(opts.url).match(/reset-password\?token=([^&"'\s]+)/);
      mailControl.sent.push({ to: opts.to, url: opts.url, token: match?.[1] ?? '' });
      if (mailControl.gate) await mailControl.gate;
      return true;
    },
  };
});

vi.mock('../lib/auth-session', () => ({
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
}));

vi.mock('argon2', () => ({ hash: vi.fn(async () => 'hashed'), verify: vi.fn(async () => true) }));

import { passwordResetRoutes } from '../routes/password-reset';
import { hashResetToken } from '../lib/password-reset';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: this suite is about the handlers, and a
   real instance would drag in the plugin graph they do not use. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
  };
  await passwordResetRoutes({ post: register, get: register } as never);
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

const requestLink = (email: string) =>
  call('/auth/password-reset', { headers: {}, body: { email }, ip: '203.0.113.9' });

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  deletedAt: null,
};

const SENT_MESSAGE = 'If an account exists with that address, reset instructions have been sent.';

const tick = (n = 5) => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => new Promise((r) => setImmediate(r)));
  return p;
};

beforeEach(() => {
  vi.clearAllMocks();
  mailControl.sent.length = 0;
  mailControl.gate = null;
  process.env['PASSWORD_RESET_APP_URL'] = 'https://quantmail.in';
  fakes.state.users = new Map();
  fakes.state.tokens = [];
  fakes.testHooks.beforeTransaction = async () => {};
  fakes.testHooks.beforeCommit = async () => {};
  fakes.testHooks.onBlocked = null;
  fakes.testHooks.beforeTopDelete = async () => {};
  fakes.testHooks.afterTopDelete = async () => {};
  fakes.testHooks.afterTopCreate = async () => {};
  fakes.state.users.set(USER.id, { ...USER });
  // One live link from an earlier request.
  fakes.state.tokens.push({
    id: 'prt-old',
    userId: USER.id,
    tokenHash: hashResetToken('old-token-value'),
    expiresAt: new Date(Date.now() + 3_600_000),
    usedAt: null,
    createdAt: new Date(Date.now() - 60_000),
    requestedIp: '203.0.113.9',
  });
});

describe('POST /auth/password-reset — concurrent-issuance race', () => {
  it('two concurrent requests linearize: one winner, one live token, one email; the loser is answered "sent" and mails nothing', async () => {
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

    const pA = requestLink(USER.email);
    // Wait until A is genuinely parked at its commit gate before B starts.
    for (let i = 0; i < 200 && parked < 1; i++) await tick();
    expect(parked).toBe(1);

    const pB = requestLink(USER.email);
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

    // Both callers get the identical non-committal answer. The loser is NOT
    // 409'd: only an existing address can lose a race, so a distinct status
    // would be an enumeration oracle.
    expect(replyA.statusCode).toBe(200);
    expect(replyB.statusCode).toBe(200);
    expect(replyA.body).toEqual(replyB.body);
    expect(replyA.body).toEqual({ success: true, data: { message: SENT_MESSAGE } });

    // Exactly one email went out, and its link is live — the first-request
    // link stays valid instead of arriving dead (RESET_LINK_EXPIRED).
    expect(mailControl.sent).toHaveLength(1);
    expect(mailControl.sent[0]!.to).toBe(USER.email);
    const liveRows = fakes.state.tokens.filter((r: any) => r.usedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]!.tokenHash).toBe(hashResetToken(mailControl.sent[0]!.token));

    // The old link is gone; the loser created nothing (rolled back).
    expect(fakes.state.tokens.find((r: any) => r.id === 'prt-old')).toBeUndefined();
    expect(fakes.state.tokens).toHaveLength(1);
  });

  it('sequential requests keep working: the later request invalidates the earlier link', async () => {
    const first = await requestLink(USER.email);
    const second = await requestLink(USER.email);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    expect(mailControl.sent).toHaveLength(2);
    // Only the latest emailed link is live.
    const liveRows = fakes.state.tokens.filter((r: any) => r.usedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]!.tokenHash).toBe(hashResetToken(mailControl.sent[1]!.token));
    // The first link died only after its own request completed — legitimate
    // invalidation of a link the user already received, not the race.
    expect(
      fakes.state.tokens.find((r: any) => r.tokenHash === hashResetToken(mailControl.sent[0]!.token)),
    ).toBeUndefined();
  });

  it('an unknown address gets the identical answer with nothing created and nothing mailed', async () => {
    const reply = await requestLink('nobody@quantmail.in');

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ success: true, data: { message: SENT_MESSAGE } });
    expect(mailControl.sent).toHaveLength(0);
    // The seeded old link is untouched: nothing burned, nothing created.
    expect(fakes.state.tokens).toHaveLength(1);
    expect(fakes.state.tokens[0]!.usedAt).toBeNull();
  });

  it('answers before the SES round trip finishes — the send stays non-awaited', async () => {
    let released!: (v: boolean) => void;
    mailControl.gate = new Promise<boolean>((resolve) => {
      released = resolve;
    });

    const reply = await requestLink(USER.email);

    expect(reply.statusCode).toBe(200);
    // The reply was produced while the send was still in flight.
    let settled = false;
    void mailControl.gate.then(() => {
      settled = true;
    });
    await tick(10);
    expect(settled).toBe(false);
    released(true);
    await mailControl.gate;
  });
});
