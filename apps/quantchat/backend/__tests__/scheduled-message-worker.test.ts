import { describe, it, expect } from 'vitest';
import {
  ScheduledMessageWorker,
  SCHEDULED_POLL_INTERVAL_MS,
  SCHEDULED_DELIVERY_TOLERANCE_MS,
  type ScheduledMessageRecord,
} from '../services/scheduled-message-worker';

interface Row extends ScheduledMessageRecord {
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

// Minimal in-memory Prisma double covering only what the worker touches.
// QC-F-095: the worker re-checks conversation membership before delivering.
// QC-F-095 AMEND: claim + membership + delivery happen inside ONE
// transaction, so the fake's tx serves `conversationMember.findFirst` and a
// compare-and-swap `scheduledMessage.updateMany` (synchronous check-and-set
// in the body, so it is atomic under JS interleaving the way the row lock
// makes it atomic in Postgres), and $transaction models rollback: a throw
// restores row statuses and drops messages created inside the transaction.
// By default every row's (userId, conversationId) pair counts as an active
// member, preserving these tests' original claims.
function makeFakePrisma(rows: Row[]) {
  const created: Array<{ conversationId: string; senderId: string; content: string }> = [];
  const members = new Set(rows.map((r) => `${r.userId}::${r.conversationId}`));
  const scheduledUpdate = async ({
    where,
    data,
  }: {
    where: { id: string };
    data: { status: Row['status'] };
  }) => {
    const row = rows.find((r) => r.id === where.id);
    if (row) row.status = data.status;
    return row;
  };
  const scheduledUpdateMany = ({
    where,
    data,
  }: {
    where: { id: string; status: Row['status'] };
    data: { status: Row['status'] };
  }) => {
    const row = rows.find((r) => r.id === where.id);
    if (!row || row.status !== where.status) return Promise.resolve({ count: 0 });
    row.status = data.status;
    return Promise.resolve({ count: 1 });
  };
  const tx = {
    conversationMember: {
      findFirst: async ({
        where,
      }: {
        where: { conversationId: string; userId: string; leftAt: null };
      }) =>
        members.has(`${where.userId}::${where.conversationId}`)
          ? { id: `mem_${where.userId}_${where.conversationId}` }
          : null,
      // QC-F-359 fixture migration: the worker's blocked-pair gate
      // derives peers from active members — the same `members` set
      // findFirst answers from. These scenarios seed only the
      // scheduler per conversation, so the peer set is empty and the
      // gate skips. Assertions unchanged.
      findMany: async ({
        where,
      }: {
        where: { conversationId: string; leftAt: null };
      }) =>
        [...members]
          .filter((k) => k.endsWith(`::${where.conversationId}`))
          .map((k) => ({ userId: k.slice(0, k.lastIndexOf('::')) })),
    },
    // QC-F-359 fixture migration: gate reads — conversation type from
    // the row (a conversation exists here iff a scheduled row names
    // it; the scenarios are 1:1 scheduled sends, so DIRECT is the
    // real type) and block lists from user preferences (null =
    // readable empty list, 'clear'). Assertions unchanged.
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        preferences: null,
      }),
    },
    message: {
      create: async ({
        data,
      }: {
        data: { conversationId: string; senderId: string; content: string };
      }) => {
        created.push(data);
        return { id: `m_${created.length}`, ...data };
      },
    },
    conversation: {
      update: async () => ({}),
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.some((r) => r.conversationId === where.id)
          ? { id: where.id, type: 'DIRECT' }
          : null,
    },
    scheduledMessage: { updateMany: scheduledUpdateMany, update: scheduledUpdate },
  };
  const prisma = {
    scheduledMessage: {
      findMany: async ({ where }: { where: { status: string; scheduledFor: { lte: Date } } }) =>
        rows.filter((r) => r.status === where.status && r.scheduledFor <= where.scheduledFor.lte),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const statusSnapshot = rows.map((r) => r.status);
      const createdSnapshot = created.length;
      try {
        return await fn(tx);
      } catch (error) {
        rows.forEach((r, i) => {
          r.status = statusSnapshot[i]!;
        });
        created.length = createdSnapshot;
        throw error;
      }
    },
  };
  return { prisma, created };
}

describe('ScheduledMessageWorker (Task 12.4)', () => {
  it('polls more frequently than the 60s delivery tolerance', () => {
    expect(SCHEDULED_POLL_INTERVAL_MS).toBeLessThan(SCHEDULED_DELIVERY_TOLERANCE_MS);
  });

  it('delivers due PENDING messages and marks them SENT', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const rows: Row[] = [
      {
        id: 's1',
        userId: 'u1',
        conversationId: 'c1',
        content: 'scheduled hello',
        scheduledFor: new Date('2025-01-01T11:59:50Z'), // 10s ago — due
        status: 'PENDING',
      },
    ];
    const { prisma, created } = makeFakePrisma(rows);
    const worker = new ScheduledMessageWorker(prisma as never);

    const delivered = await worker.tick(now);

    expect(delivered).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]!.content).toBe('scheduled hello');
    expect(rows[0]!.status).toBe('SENT');
  });

  it('does not deliver messages scheduled in the future', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const rows: Row[] = [
      {
        id: 's1',
        userId: 'u1',
        conversationId: 'c1',
        content: 'future',
        scheduledFor: new Date('2025-01-01T12:05:00Z'),
        status: 'PENDING',
      },
    ];
    const { prisma, created } = makeFakePrisma(rows);
    const worker = new ScheduledMessageWorker(prisma as never);

    const delivered = await worker.tick(now);

    expect(delivered).toBe(0);
    expect(created).toHaveLength(0);
    expect(rows[0]!.status).toBe('PENDING');
  });

  it('is idempotent — a delivered message is not re-sent on the next tick', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const rows: Row[] = [
      {
        id: 's1',
        userId: 'u1',
        conversationId: 'c1',
        content: 'once',
        scheduledFor: new Date('2025-01-01T11:59:00Z'),
        status: 'PENDING',
      },
    ];
    const { prisma, created } = makeFakePrisma(rows);
    const worker = new ScheduledMessageWorker(prisma as never);

    await worker.tick(now);
    await worker.tick(new Date('2025-01-01T12:00:30Z'));

    expect(created).toHaveLength(1);
  });

  it('delivers within the 60s tolerance given a 30s poll cadence', async () => {
    // A message becomes due at T; the worst-case tick lands one interval later.
    const scheduledFor = new Date('2025-01-01T12:00:00Z');
    const worstCaseTick = new Date(scheduledFor.getTime() + SCHEDULED_POLL_INTERVAL_MS);
    const rows: Row[] = [
      {
        id: 's1',
        userId: 'u1',
        conversationId: 'c1',
        content: 'tolerance',
        scheduledFor,
        status: 'PENDING',
      },
    ];
    const { prisma, created } = makeFakePrisma(rows);
    const worker = new ScheduledMessageWorker(prisma as never);

    await worker.tick(worstCaseTick);

    const lateness = worstCaseTick.getTime() - scheduledFor.getTime();
    expect(lateness).toBeLessThanOrEqual(SCHEDULED_DELIVERY_TOLERANCE_MS);
    expect(created).toHaveLength(1);
  });
});
