/**
 * POST /auth/resend-verification — concurrent-burn race.
 *
 * Regression: burn-pending `updateMany` then `create` ran as sequential
 * awaits OUTSIDE any transaction, so two concurrent resends interleaved
 * (A burns, A creates A1, B burns A1, B creates B1) and the code in A's
 * just-sent email was already dead — INVALID_OR_EXPIRED_CODE for a code the
 * user received seconds ago.
 *
 * The fix linearizes burn+create inside one transaction, same style as the
 * verify-email fix: snapshot the codes pending when THIS request began, burn
 * exactly that snapshot with a compare-and-set ({ id, usedAt: null }), and
 * require the affected-count to match the snapshot size. A sibling resend
 * still in flight has its create uncommitted, hence invisible to the
 * snapshot — a request can never burn a code whose email is still being
 * sent. A loser fails with 409 RESEND_SUPERSEDED BEFORE any email goes out.
 *
 * The in-memory prisma below emulates real Postgres read-committed
 * semantics for the burn, which is what makes the concurrency test honest:
 * - each transaction sees committed state plus its own staged writes;
 *   a sibling's staged (uncommitted) create is invisible;
 * - `updateMany` is statement-atomic, and when its WHERE matches a row
 *   another in-flight transaction has staged a burn for, it WAITS for that
 *   transaction (row-lock wait) and then re-evaluates the WHERE against the
 *   fresh committed state — exactly like UPDATE ... WHERE under a row lock.
 *   That re-evaluation is what turns the loser into count 0 → 409.
 * - `create` emulates the partial unique index
 *   email_verification_codes_user_live_unique (migration 0107): a create whose
 *   user already has a committed live row fails P2002 at once, and a create
 *   racing a sibling's staged create WAITS for the sibling (speculative-
 *   insertion wait) and re-checks — this is what closes the empty-empty
 *   race that the compare-and-set alone cannot serialize.
 *
 * Negative control: this suite FAILS against the pre-fix handler (verified
 * by stashing the fix): with no transaction, concurrent resends both
 * succeed, both email, and the interleaving burns a just-created code —
 * there is no linearization point at all.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
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
  // the commit signal other transactions' UPDATEs wait on (row-lock wait).
  const inflight: Array<{
    id: number;
    stagedBurns: Set<string>;
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

  // Rows visible to a transaction: committed state, with its own staged
  // burns applied and its own staged creates added. Siblings' staged writes
  // stay invisible (read-committed).
  const visibleRows = (slot: (typeof inflight)[number]) => {
    const rows = state.codes.map((r) =>
      slot.stagedBurns.has(r.id) ? { ...r, usedAt: new Date() } : r,
    );
    return [...rows, ...slot.stagedCreates];
  };

  // Mirrors Postgres `{ equals, mode: 'insensitive' }` string-filter semantics
  // for the identity lookups the resend handler now performs (the handler
  // normalizes once and looks up case-insensitively, so a legacy mixed-case
  // row must still match).
  const insensitiveEquals = (stored: unknown, filter: any): boolean => {
    if (typeof filter === 'string') return stored === filter;
    if (filter && typeof filter === 'object' && 'equals' in filter) {
      const lhs = String(stored ?? '');
      const rhs = String(filter.equals);
      return filter.mode === 'insensitive' ? lhs.toLowerCase() === rhs.toLowerCase() : lhs === rhs;
    }
    return false;
  };

  const findUser = (where: any) => {
    for (const u of state.users.values()) {
      if (where.email !== undefined && !insensitiveEquals(u.email, where.email)) continue;
      if (where.id !== undefined && u.id !== where.id) continue;
      if (where.deletedAt !== undefined) {
        const wantNull = where.deletedAt === null;
        if (wantNull ? u.deletedAt != null : u.deletedAt == null) continue;
      }
      return { ...u };
    }
    return null;
  };

  const findUsers = (where: any, take?: number) => {
    const out: any[] = [];
    for (const u of state.users.values()) {
      if (where.email !== undefined && !insensitiveEquals(u.email, where.email)) continue;
      if (where.id !== undefined && u.id !== where.id) continue;
      if (where.deletedAt !== undefined) {
        const wantNull = where.deletedAt === null;
        if (wantNull ? u.deletedAt != null : u.deletedAt == null) continue;
      }
      out.push({ ...u });
    }
    return take === undefined ? out : out.slice(0, take);
  };

  const testHooks: {
    beforeTransaction: (slotId: number) => Promise<void>;
    beforeCommit: (slotId: number) => Promise<void>;
    onBlocked: (() => void) | null;
    onCreateBlocked: (() => void) | null;
  } = {
    beforeTransaction: async () => {},
    beforeCommit: async () => {},
    onBlocked: null,
    onCreateBlocked: null,
  };

  // Prisma P2002 shape for the partial unique index
  // email_verification_codes_user_live_unique (migration 0107). The route
  // duck-types on `code`, like routes/auth.ts register does.
  const uniqueViolation = () => {
    const err = new Error(
      'Unique constraint failed on the constraint: "email_verification_codes_user_live_unique"',
    ) as Error & { code: string; meta: { target: string[] } };
    err.code = 'P2002';
    err.meta = { target: ['email_verification_codes_user_live_unique'] };
    return err;
  };

  const $transaction = async (cb: (tx: any) => Promise<any>) => {
    if (typeof cb !== 'function') throw new Error('$transaction fake expects the callback form');
    const slot = {
      id: ++txSeq,
      stagedBurns: new Set<string>(),
      stagedCreates: [] as any[],
      done: false,
      committed: deferred(),
    };
    inflight.push(slot);
    const tx = {
      user: {
        findUnique: async ({ where }: any) => findUser(where ?? {}),
      },
      emailVerificationCode: {
        findMany: async ({ where }: any) => visibleRows(slot).filter((r) => matchWhere(r, where)),
        // Statement-atomic compare-and-set. If another in-flight transaction
        // staged a burn on a row our WHERE matches, wait for it (row-lock
        // wait, like Postgres) and re-evaluate the WHERE afterwards.
        updateMany: async ({ where, data }: any) => {
          let matched = visibleRows(slot).filter((r) => matchWhere(r, where));
          const blockers = inflight.filter(
            (s) => s !== slot && !s.done && matched.some((r) => s.stagedBurns.has(r.id)),
          );
          if (blockers.length > 0) {
            testHooks.onBlocked?.();
            for (const b of blockers) await b.committed.promise;
            matched = visibleRows(slot).filter((r) => matchWhere(r, where));
          }
          for (const r of matched) slot.stagedBurns.add(r.id);
          void data;
          return { count: matched.length };
        },
        create: async ({ data }: any) => {
          // Emulates the partial unique index
          // email_verification_codes_user_live_unique(userId) WHERE usedAt IS
          // NULL (migration 0107), which closes the empty-empty race the
          // compare-and-set cannot serialize: a create conflicts with a
          // committed live row for the user (visible immediately) or with a
          // sibling's staged (uncommitted) create — in the latter case it
          // WAITS for the sibling (Postgres speculative-insertion wait) and
          // re-checks afterwards, raising P2002 only if the row survived.
          // The transaction's own staged burns free the slot first, so the
          // burn-then-create sequence never self-conflicts.
          const effUsedAt = data.usedAt ?? null;
          if (effUsedAt === null && typeof data.userId === 'string') {
            const liveConflict = (rows: any[]) =>
              rows.some((r) => r.userId === data.userId && r.usedAt === null);
            const committedLive = () =>
              state.codes.filter((r) => !slot.stagedBurns.has(r.id));
            if (liveConflict(committedLive())) throw uniqueViolation();
            let blockers = inflight.filter(
              (s) => s !== slot && !s.done && liveConflict(s.stagedCreates),
            );
            while (blockers.length > 0) {
              testHooks.onCreateBlocked?.();
              for (const b of blockers) await b.committed.promise;
              if (liveConflict(committedLive())) throw uniqueViolation();
              blockers = inflight.filter(
                (s) => s !== slot && !s.done && liveConflict(s.stagedCreates),
              );
            }
          }
          const row = { id: `evc-${++codeSeq}`, usedAt: null, attempts: 0, createdAt: new Date(), ...data };
          slot.stagedCreates.push(row);
          return { ...row };
        },
      },
    };
    try {
      // Test-driven interleave point: runs after the slot is visible to
      // siblings but before the callback, so a test can flip committed
      // state (e.g. prove the address) mid-flight.
      await testHooks.beforeTransaction(slot.id);
      const result = await cb(tx);
      // Test-driven interleave point: pause between the callback finishing
      // and the commit applying, so a sibling transaction can start while
      // this one's writes are still uncommitted.
      await testHooks.beforeCommit(slot.id);
      for (const id of slot.stagedBurns) {
        const row = state.codes.find((r) => r.id === id);
        if (row) row.usedAt = new Date();
      }
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
      findUnique: async ({ where }: any) => findUser(where ?? {}),
      findMany: async ({ where, take }: any) => findUsers(where ?? {}, take),
    },
    emailVerificationCode: {
      // Top-level writes are autocommit (the pre-fix path used these).
      updateMany: async ({ where, data }: any) => {
        const matched = state.codes.filter((r) => matchWhere(r, where));
        for (const r of matched) if (data?.usedAt !== undefined) r.usedAt = data.usedAt;
        return { count: matched.length };
      },
      create: async ({ data }: any) => {
        const row = { id: `evc-${++codeSeq}`, usedAt: null, attempts: 0, createdAt: new Date(), ...data };
        state.codes.push(row);
        return { ...row };
      },
    },
    $transaction,
  };

  return { state, prisma, testHooks, nextCodeId: () => `evc-${codeSeq + 1}` };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
}));

const sentEmails: Array<{ to: string; code: string }> = [];
vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    sendVerificationEmail: vi.fn(async ({ to, code }: any) => {
      sentEmails.push({ to, code });
      return true;
    }),
  };
});

vi.mock('../lib/auth-session', () => ({
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: () => ({}),
  setRefreshCookie: () => {},
  issueBrowserSession: async () => ({ success: true, data: {} }),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { authRoutes } from '../routes/auth';
import { hashVerificationCode } from '../lib/email-verification';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

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

const resend = (email: string) =>
  call('/auth/resend-verification', { headers: {}, body: { email }, ip: '203.0.113.9' });

const USER = { id: 'user-1', email: 'Kundan@quantmail.in', username: 'kundan', displayName: 'Kundan' };

const tick = (n = 5) => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => new Promise((r) => setImmediate(r)));
  return p;
};

beforeEach(() => {
  vi.clearAllMocks();
  sentEmails.length = 0;
  fakes.state.users = new Map();
  fakes.state.codes = [];
  fakes.testHooks.beforeTransaction = async () => {};
  fakes.testHooks.beforeCommit = async () => {};
  fakes.testHooks.onBlocked = null;
  fakes.testHooks.onCreateBlocked = null;
  fakes.state.users.set(USER.id, { ...USER, emailVerified: false });
  // One live code from the original registration mail.
  fakes.state.codes.push({
    id: 'evc-old',
    userId: USER.id,
    codeHash: hashVerificationCode('111111'),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    usedAt: null,
    attempts: 0,
    createdAt: new Date(Date.now() - 60_000),
  });
});

describe('POST /auth/resend-verification — concurrent-burn race', () => {
  it('two concurrent resends linearize: one winner, one live code, one email; the loser 409s before emailing', async () => {
    // Hold A's transaction open after its burn+create, before commit, so
    // B's transaction genuinely overlaps it (B starts while A's writes are
    // still uncommitted) — the interleaving the old code got wrong.
    const gateA = deferred();
    let commits = 0;
    const blocked = deferred();
    fakes.testHooks.beforeCommit = async () => {
      commits += 1;
      if (commits === 1) await gateA.promise;
    };
    fakes.testHooks.onBlocked = () => blocked.resolve();

    const pA = resend(USER.email);
    await tick();
    const pB = resend(USER.email);
    // Let B reach its burn and block on A's row lock, like Postgres.
    await blocked.promise;
    await tick();
    gateA.resolve();

    const [replyA, replyB] = await Promise.all([pA, pB]);

    // Exactly one winner.
    expect(replyA.statusCode).toBe(200);
    expect(replyA.body.data.emailSent).toBe(true);
    expect(replyB.statusCode).toBe(409);
    expect(replyB.body.error.code).toBe('RESEND_SUPERSEDED');

    // Exactly one email went out, and its code is live — a just-received
    // code never arrives dead.
    expect(sentEmails).toHaveLength(1);
    const emailed = sentEmails[0]!;
    expect(emailed.to).toBe(USER.email);
    const liveRows = fakes.state.codes.filter((r: any) => r.usedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0].codeHash).toBe(hashVerificationCode(emailed.code));

    // The old code is burned; the loser created nothing (rolled back).
    const old = fakes.state.codes.find((r: any) => r.id === 'evc-old');
    expect(old.usedAt).not.toBeNull();
    expect(fakes.state.codes).toHaveLength(2);
  });

  it('two concurrent resends against an EMPTY snapshot: one live code, one email; the loser hits the unique index and mails nothing', async () => {
    // The empty-snapshot case the compare-and-set alone cannot serialize:
    // no live codes exist (e.g. the registration code was already
    // consumed), so both findMany calls return [], both updateMany calls
    // return 0, and both pass 0===0 under READ COMMITTED. The partial
    // unique index email_verification_codes_user_live_unique (migration
    // 0107) is the second layer — the loser's create blocks on the winner's
    // uncommitted row (Postgres speculative-insertion wait, emulated by the
    // fake) and fails P2002 once the winner commits. The route maps P2002
    // onto the RESEND_SUPERSEDED loser path.
    fakes.state.codes = [];

    // Park A after its create is staged but before commit, so B's create
    // genuinely overlaps it at the unique index.
    const gateA = deferred();
    let parked = 0;
    let createBlocked = false;
    fakes.testHooks.beforeCommit = async () => {
      parked += 1;
      if (parked === 1) await gateA.promise;
    };
    fakes.testHooks.onCreateBlocked = () => {
      createBlocked = true;
    };

    const pA = resend(USER.email);
    // Wait until A is genuinely parked at its commit gate before B starts.
    for (let i = 0; i < 200 && parked < 1; i++) await tick();
    expect(parked).toBe(1);

    const pB = resend(USER.email);
    // Let B reach its create and block on A's uncommitted row, like Postgres.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('B never blocked on the unique index — no genuine overlap')),
        5000,
      );
      const poll = () => {
        if (createBlocked) {
          clearTimeout(timer);
          resolve();
        } else {
          setImmediate(poll);
        }
      };
      poll();
    });
    gateA.resolve();

    const [replyA, replyB] = await Promise.all([pA, pB]);

    // Exactly one winner; the loser gets the honest "use your latest email"
    // answer instead of a second code.
    expect(replyA.statusCode).toBe(200);
    expect(replyA.body.data.emailSent).toBe(true);
    expect(replyB.statusCode).toBe(409);
    expect(replyB.body.error.code).toBe('RESEND_SUPERSEDED');

    // Exactly one email went out, and its code is the one live row — no
    // inbox ever receives a code that is already dead.
    expect(sentEmails).toHaveLength(1);
    const emailed = sentEmails[0]!;
    expect(emailed.to).toBe(USER.email);
    const liveRows = fakes.state.codes.filter((r: any) => r.usedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0].codeHash).toBe(hashVerificationCode(emailed.code));

    // The loser created nothing: its transaction rolled back at P2002.
    expect(fakes.state.codes).toHaveLength(1);
  });

  it('sequential resends keep working: the later resend invalidates the earlier code', async () => {
    const first = await resend(USER.email);
    expect(first.statusCode).toBe(200);
    const second = await resend(USER.email);
    expect(second.statusCode).toBe(200);

    expect(sentEmails).toHaveLength(2);
    // Only the latest emailed code is live.
    const liveRows = fakes.state.codes.filter((r: any) => r.usedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0].codeHash).toBe(hashVerificationCode(sentEmails[1]!.code));
    // The first code died only after its own request completed — legitimate
    // invalidation of a code the user already received, not the race.
    const firstCodeRow = fakes.state.codes.find(
      (r: any) => r.codeHash === hashVerificationCode(sentEmails[0]!.code),
    );
    expect(firstCodeRow.usedAt).not.toBeNull();
  });

  it('an address proven mid-flight is answered as alreadyVerified, not issued a code', async () => {
    // The address gets proven after the outer pre-check but before the
    // transaction's re-check: the in-tx re-check must see it and answer
    // alreadyVerified instead of issuing a code for a proven address.
    let flipped = false;
    fakes.testHooks.beforeTransaction = async () => {
      if (!flipped) {
        flipped = true;
        fakes.state.users.get(USER.id).emailVerified = true;
      }
    };

    const reply = await resend(USER.email);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.alreadyVerified).toBe(true);
    expect(sentEmails).toHaveLength(0);
    // Nothing burned, nothing created: the transaction threw before any write.
    expect(fakes.state.codes).toHaveLength(1);
    expect(fakes.state.codes[0].usedAt).toBeNull();
  });
});
