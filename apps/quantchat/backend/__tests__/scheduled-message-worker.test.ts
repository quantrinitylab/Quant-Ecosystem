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
function makeFakePrisma(rows: Row[]) {
  const created: Array<{ conversationId: string; senderId: string; content: string }> = [];
  const tx = {
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
    conversation: { update: async () => ({}) },
    scheduledMessage: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: Row['status'] };
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) row.status = data.status;
        return row;
      },
    },
  };
  const prisma = {
    scheduledMessage: {
      findMany: async ({ where }: { where: { status: string; scheduledFor: { lte: Date } } }) =>
        rows.filter((r) => r.status === where.status && r.scheduledFor <= where.scheduledFor.lte),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
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
