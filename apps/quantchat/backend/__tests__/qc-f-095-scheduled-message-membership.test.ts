// ===========================================================================
// QC-F-095 — scheduled-message injection BOLA regression tests
// ===========================================================================
//
// POST /ai/schedule persisted a ScheduledMessage for ANY conversationId a
// logged-in user supplied — no membership check — and
// ScheduledMessageWorker delivered it as a real Message without re-checking.
// A non-member could therefore inject messages into private conversations
// they were never part of, and rows for conversations that never existed
// retried forever (poison rows).
//
// Fix pinned here (specialist brief §3):
//  - Creation gate in routes/ai-agent.ts: conversationMember.findFirst
//    ({ conversationId, userId, leftAt: null }) → 403 NOT_A_MEMBER, the exact
//    MessageService.sendMessage pattern; a nonexistent conversation gets the
//    same 403 (no existence oracle). Past scheduledFor → 400 VALIDATION_ERROR
//    AFTER the membership gate. Pinned order: zod 400 → auth 401 → 403 → 400.
//  - Delivery gate in services/scheduled-message-worker.ts: membership is
//    re-checked before delivery; a deterministic null flips the row to
//    CANCELLED (terminal — no Message, no onDelivered, no onError); a
//    transient lookup throw leaves the row PENDING for retry.
//
// AMEND (worker races, CODEX-REVIEW on PR #966): the delivery gate now runs
// as a single atomic authorization/claim operation INSIDE one transaction —
// a conditional updateMany claims the row (PENDING → SENT) and membership
// is re-checked after the claim, in the same transaction. The observable
// behaviour pinned by cases 8-16 is unchanged (cancel on deterministic gate
// failure, retry on transient throw); the race-specific pins (revocation
// between poll and transaction, two concurrent workers, cancellation
// racing delivery) live in qc-f-095-amend-concurrency.test.ts.
//
// The membership fakes model rows with a leftAt timestamp and honour the
// query's leftAt filter the way the real delegate does — so a gate that
// dropped `leftAt: null` would return former members and fail cases 3/9.
//
// Negative control: on the pre-fix code the authz cases (1, 2, 3, 5-past,
// 9, 10, 11, 13-cancel-half, 16) fail; the behaviour pins (4, 6, 7, 8, 12,
// 15) pass on both old and new code.
// ===========================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import aiAgentRoutes, { type ScheduledMessagePrisma } from '../routes/ai-agent';
import type { QuantAIAgent } from '../lib/ai-agent';
import {
  ScheduledMessageWorker,
  type ScheduledMessageRecord,
  type SchedulerPrisma,
} from '../services/scheduled-message-worker';

const CONV = 'conv-c';
const CONV2 = 'conv-c2';
const MEMBER = 'user_m1';
const FORMER = 'user_former';
const OUTSIDER = 'user_x';

const key = (userId: string, conversationId: string) => `${userId}::${conversationId}`;

/** Membership rows: key → leftAt (null = active member, Date = has left). */
type MembershipMap = Map<string, Date | null>;

function lookupMembership(
  memberships: MembershipMap,
  where: { conversationId: string; userId: string; leftAt: null },
): { id: string } | null {
  const leftAt = memberships.get(key(where.userId, where.conversationId));
  if (leftAt === undefined) return null; // no membership row at all
  if (where.leftAt === null && leftAt !== null) return null; // left-member filtered out
  return { id: `mem_${where.userId}_${where.conversationId}` };
}

// ---------------------------------------------------------------------------
// Route fake — memberships + recorded scheduledMessage.create calls.
// ---------------------------------------------------------------------------
function makeRouteFake(memberships: MembershipMap) {
  const createCalls: Array<{
    userId: string;
    conversationId: string;
    content: string;
    scheduledFor: Date;
    status: 'PENDING';
  }> = [];
  let seq = 0;
  const prisma: ScheduledMessagePrisma = {
    conversationMember: {
      findFirst: async ({ where }) => lookupMembership(memberships, where),
    },
    scheduledMessage: {
      create: async ({ data }) => {
        createCalls.push(data);
        seq += 1;
        return {
          id: `sched_${seq}`,
          conversationId: data.conversationId,
          scheduledFor: data.scheduledFor,
          status: data.status,
        };
      },
    },
  };
  return { prisma, createCalls };
}

describe('QC-F-095 POST /ai/schedule membership gate', () => {
  let apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps = [];
  });

  async function openApp(
    authUserId: string | null,
    prisma: ScheduledMessagePrisma,
  ): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (name: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    if (authUserId) {
      app.addHook('onRequest', (request, _reply, done) => {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
        done();
      });
    }
    await app.register(aiAgentRoutes, {
      prefix: '/ai',
      agent: {} as unknown as QuantAIAgent,
    });
    await app.ready();
    apps.push(app);
    return app;
  }

  const future = () => new Date(Date.now() + 3_600_000).toISOString();
  const past = () => new Date(Date.now() - 3_600_000).toISOString();

  interface ScheduleResponse {
    success?: boolean;
    error?: { code?: string };
    data?: { id?: string; status?: string };
  }

  async function schedule(
    app: FastifyInstance,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: ScheduleResponse }> {
    const res = await app.inject({ method: 'POST', url: '/ai/schedule', payload });
    return { statusCode: res.statusCode, body: res.json() as ScheduleResponse };
  }

  it('1. non-member injection is denied 403 NOT_A_MEMBER and creates no row', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));
    const app = await openApp(OUTSIDER, prisma);

    const res = await schedule(app, {
      conversationId: CONV,
      content: 'spam from outside',
      scheduledFor: future(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
    expect(createCalls).toHaveLength(0);
  });

  it('2. nonexistent conversation gets the same 403 (no existence oracle)', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));
    const app = await openApp(MEMBER, prisma);

    const res = await schedule(app, {
      conversationId: 'does-not-exist',
      content: 'hello?',
      scheduledFor: future(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
    expect(createCalls).toHaveLength(0);
  });

  it('3. former member (leftAt set) is denied — the leftAt:null filter is the pin', async () => {
    const memberships: MembershipMap = new Map([
      [key(MEMBER, CONV), null],
      [key(FORMER, CONV), new Date('2025-01-01T00:00:00Z')], // row exists, but left
    ]);
    const { prisma, createCalls } = makeRouteFake(memberships);
    const app = await openApp(FORMER, prisma);

    const res = await schedule(app, {
      conversationId: CONV,
      content: 'I left but still scheduling',
      scheduledFor: future(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
    expect(createCalls).toHaveLength(0);
  });

  it('4. active member schedules successfully — 201, PENDING, no minimum delay', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));
    const app = await openApp(MEMBER, prisma);

    const inTenSeconds = new Date(Date.now() + 10_000).toISOString();
    const res = await schedule(app, {
      conversationId: CONV,
      content: 'kal bhej dena',
      scheduledFor: inTenSeconds,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data?.status).toBe('PENDING');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      userId: MEMBER,
      conversationId: CONV,
      content: 'kal bhej dena',
      status: 'PENDING',
    });
    expect(createCalls[0]!.scheduledFor.toISOString()).toBe(inTenSeconds);
  });

  it('5. past scheduledFor → 400 for a member, but 403 first for a non-member (order pin)', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));

    const memberApp = await openApp(MEMBER, prisma);
    const memberRes = await schedule(memberApp, {
      conversationId: CONV,
      content: 'already due',
      scheduledFor: past(),
    });
    expect(memberRes.statusCode).toBe(400);
    expect(memberRes.body.error?.code).toBe('VALIDATION_ERROR');

    const outsiderApp = await openApp(OUTSIDER, prisma);
    const outsiderRes = await schedule(outsiderApp, {
      conversationId: CONV,
      content: 'already due',
      scheduledFor: past(),
    });
    expect(outsiderRes.statusCode).toBe(403);
    expect(outsiderRes.body.error?.code).toBe('NOT_A_MEMBER');

    expect(createCalls).toHaveLength(0);
  });

  it('6. unauthenticated request stays 401 and creates no row', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));
    const app = await openApp(null, prisma);

    const res = await schedule(app, {
      conversationId: CONV,
      content: 'anon',
      scheduledFor: future(),
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(createCalls).toHaveLength(0);
  });

  it('7. invalid body stays 400 VALIDATION_ERROR (gate does not swallow zod)', async () => {
    const { prisma, createCalls } = makeRouteFake(new Map([[key(MEMBER, CONV), null]]));
    const app = await openApp(MEMBER, prisma);

    const emptyContent = await schedule(app, {
      conversationId: CONV,
      content: '',
      scheduledFor: future(),
    });
    expect(emptyContent.statusCode).toBe(400);
    expect(emptyContent.body.error?.code).toBe('VALIDATION_ERROR');

    const badDate = await schedule(app, {
      conversationId: CONV,
      content: 'fine',
      scheduledFor: 'not-a-date',
    });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.body.error?.code).toBe('VALIDATION_ERROR');

    expect(createCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Worker fake — membership state is independent of the rows, so membership
// can end (or never exist) after a row was created.
// ---------------------------------------------------------------------------
interface SchedRow extends ScheduledMessageRecord {
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

interface CreatedMessage {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
}

function makeWorkerFake(
  rows: SchedRow[],
  opts: {
    memberships: MembershipMap;
    existingConversations?: Set<string>;
    findFirstImpl?: (
      where: { conversationId: string; userId: string; leftAt: null },
      call: number,
    ) => Promise<{ id: string } | null>;
  },
) {
  const created: CreatedMessage[] = [];
  const conversationUpdates: Array<{ id: string }> = [];
  const existing = opts.existingConversations ?? new Set(rows.map((r) => r.conversationId));
  let findFirstCalls = 0;

  const scheduledUpdate = async (args: unknown) => {
    const { where, data } = args as {
      where: { id: string };
      data: { status: SchedRow['status'] };
    };
    const row = rows.find((r) => r.id === where.id);
    if (row) row.status = data.status;
    return row;
  };

  // QC-F-095 AMEND: the atomic claim. The check-and-set runs synchronously
  // in the body, so it is atomic under JS interleaving the way the row lock
  // makes the real updateMany atomic in Postgres: only a caller whose
  // `where.status` still matches mutates the row, and it sees count 1.
  const scheduledUpdateMany = (args: unknown) => {
    const { where, data } = args as {
      where: { id: string; status: SchedRow['status'] };
      data: { status: SchedRow['status'] };
    };
    const row = rows.find((r) => r.id === where.id);
    if (!row || row.status !== where.status) return Promise.resolve({ count: 0 });
    row.status = data.status;
    return Promise.resolve({ count: 1 });
  };

  const findFirst = async (args: unknown) => {
    const { where } = args as {
      where: { conversationId: string; userId: string; leftAt: null };
    };
    findFirstCalls += 1;
    if (opts.findFirstImpl) return opts.findFirstImpl(where, findFirstCalls);
    return lookupMembership(opts.memberships, where);
  };

  const prisma: SchedulerPrisma = {
    scheduledMessage: {
      findMany: async ({ where }) =>
        rows
          .filter((r) => r.status === where.status && r.scheduledFor <= where.scheduledFor.lte)
          .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()),
    },
    // $transaction models rollback: a throw inside restores row statuses
    // and drops messages/conversation updates made inside the transaction,
    // exactly what the real interactive transaction guarantees.
    $transaction: async (fn) => {
      const statusSnapshot = rows.map((r) => r.status);
      const createdSnapshot = created.length;
      const updatesSnapshot = conversationUpdates.length;
      try {
        return await fn({
          conversationMember: { findFirst },
          message: {
            create: async (args: unknown) => {
              const { data } = args as { data: CreatedMessage };
              created.push(data);
              return { id: `m_${created.length}`, ...data };
            },
          },
          conversation: {
            update: async (args: unknown) => {
              const { where } = args as { where: { id: string } };
              if (!existing.has(where.id)) {
                throw new Error(`Conversation ${where.id} not found`);
              }
              conversationUpdates.push(where);
              return {};
            },
          },
          scheduledMessage: { updateMany: scheduledUpdateMany, update: scheduledUpdate },
        });
      } catch (error) {
        rows.forEach((r, i) => {
          r.status = statusSnapshot[i]!;
        });
        created.length = createdSnapshot;
        conversationUpdates.length = updatesSnapshot;
        throw error;
      }
    },
  };
  return { prisma, created, conversationUpdates };
}

const dueRow = (over: Partial<SchedRow> = {}): SchedRow => ({
  id: 's1',
  userId: MEMBER,
  conversationId: CONV,
  content: 'scheduled hello',
  scheduledFor: new Date('2025-01-01T11:59:50Z'),
  status: 'PENDING',
  ...over,
});
const NOW = new Date('2025-01-01T12:00:00Z');
const activeHere: MembershipMap = new Map([[key(MEMBER, CONV), null]]);

describe('QC-F-095 ScheduledMessageWorker delivery gate', () => {
  it('8. active member still delivers — Message created, row SENT, onDelivered fires', async () => {
    const rows = [dueRow()];
    const { prisma, created, conversationUpdates } = makeWorkerFake(rows, {
      memberships: activeHere,
    });
    const onDelivered = vi.fn();
    const worker = new ScheduledMessageWorker(prisma, { onDelivered });

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(1);
    expect(created).toEqual([
      { conversationId: CONV, senderId: MEMBER, content: 'scheduled hello', type: 'TEXT' },
    ]);
    expect(conversationUpdates).toEqual([{ id: CONV }]);
    expect(rows[0]!.status).toBe('SENT');
    expect(onDelivered).toHaveBeenCalledTimes(1);
  });

  it('9. membership ended after scheduling → CANCELLED, no Message, no hooks', async () => {
    const rows = [dueRow()];
    const { prisma, created } = makeWorkerFake(rows, {
      memberships: new Map([[key(MEMBER, CONV), new Date('2025-01-01T11:00:00Z')]]),
    });
    const onDelivered = vi.fn();
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(prisma, { onDelivered, onError });

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(0);
    expect(created).toHaveLength(0);
    expect(rows[0]!.status).toBe('CANCELLED');
    expect(onDelivered).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('10. never-member poison row is CANCELLED once and never retried', async () => {
    const rows = [dueRow({ id: 'poison', userId: OUTSIDER })];
    const { prisma, created } = makeWorkerFake(rows, { memberships: activeHere });
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(prisma, { onError });

    await worker.tick(NOW);
    expect(rows[0]!.status).toBe('CANCELLED');

    const deliveredSecond = await worker.tick(new Date('2025-01-01T12:00:30Z'));
    expect(deliveredSecond).toBe(0);
    expect(created).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('11. conversation hard-deleted (memberships cascaded away) → CANCELLED, no error', async () => {
    const rows = [dueRow()];
    const { prisma, created } = makeWorkerFake(rows, {
      memberships: new Map(),
      existingConversations: new Set(),
    });
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(prisma, { onError });

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(0);
    expect(created).toHaveLength(0);
    expect(rows[0]!.status).toBe('CANCELLED');
    expect(onError).not.toHaveBeenCalled();
  });

  it('12. archived conversation still delivers — archive is not a rights loss', async () => {
    const rows = [dueRow()];
    // Archive state is deliberately not part of the gate surface: neither
    // sendMessage nor this worker reads isArchived. The fake has no archive
    // concept at all — delivery must proceed purely on membership.
    const { prisma, created } = makeWorkerFake(rows, { memberships: activeHere });
    const worker = new ScheduledMessageWorker(prisma);

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(1);
    expect(created).toHaveLength(1);
    expect(rows[0]!.status).toBe('SENT');
  });

  it('13. poison row first does not block a real row in the same tick', async () => {
    const rows = [
      dueRow({
        id: 'poison',
        userId: OUTSIDER,
        conversationId: 'does-not-exist',
        content: 'junk',
        scheduledFor: new Date('2025-01-01T11:58:00Z'), // earliest — processed first
      }),
      dueRow({ id: 'real', scheduledFor: new Date('2025-01-01T11:59:00Z') }),
    ];
    const { prisma, created } = makeWorkerFake(rows, { memberships: activeHere });
    const worker = new ScheduledMessageWorker(prisma);

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(1);
    expect(rows[0]!.status).toBe('CANCELLED');
    expect(rows[1]!.status).toBe('SENT');
    expect(created).toHaveLength(1);
    expect(created[0]!.content).toBe('scheduled hello');
  });

  it('14. transient membership-lookup throw keeps the row PENDING; next tick delivers', async () => {
    const rows = [dueRow()];
    const { prisma, created } = makeWorkerFake(rows, {
      memberships: activeHere,
      findFirstImpl: async (where, call) => {
        if (call === 1) throw new Error('DB temporarily unavailable');
        return { id: `mem_${where.userId}` };
      },
    });
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(prisma, { onError });

    const first = await worker.tick(NOW);
    expect(first).toBe(0);
    expect(rows[0]!.status).toBe('PENDING');
    expect(created).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);

    const second = await worker.tick(new Date('2025-01-01T12:00:30Z'));
    expect(second).toBe(1);
    expect(rows[0]!.status).toBe('SENT');
    expect(created).toHaveLength(1);
  });

  it('15. terminal states are final — SENT and CANCELLED rows are never reprocessed', async () => {
    const rows = [dueRow({ id: 'ok' }), dueRow({ id: 'bad', userId: OUTSIDER })];
    const { prisma, created } = makeWorkerFake(rows, { memberships: activeHere });
    const worker = new ScheduledMessageWorker(prisma);

    await worker.tick(NOW);
    await worker.tick(new Date('2025-01-01T12:00:30Z'));
    await worker.tick(new Date('2025-01-01T12:01:00Z'));

    expect(created).toHaveLength(1);
    expect(rows[0]!.status).toBe('SENT');
    expect(rows[1]!.status).toBe('CANCELLED');
  });

  it('16. membership in a DIFFERENT conversation does not authorize delivery', async () => {
    const rows = [dueRow()];
    const { prisma, created } = makeWorkerFake(rows, {
      memberships: new Map([[key(MEMBER, CONV2), null]]), // member of C2 only, row targets C
    });
    const worker = new ScheduledMessageWorker(prisma);

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(0);
    expect(created).toHaveLength(0);
    expect(rows[0]!.status).toBe('CANCELLED');
  });
});
