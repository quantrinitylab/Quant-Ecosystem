import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PublisherPayoutSchedulerService,
  type AdClickEventRow,
  type PublisherPayoutRunRow,
  type PublisherWalletPort,
} from '../services/publisher-payout-scheduler.service';

function createFakePrisma(clicks: AdClickEventRow[]) {
  const runs = new Map<string, PublisherPayoutRunRow>();
  let seq = 0;
  return {
    clicks,
    runs,
    adClickEvent: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const w = args.where ?? {};
        return clicks.filter(
          (c) =>
            (w['billable'] === undefined || c.billable === w['billable']) &&
            (w['paidOut'] === undefined || c.paidOut === w['paidOut']) &&
            (w['publisherId'] === undefined || c.publisherId !== null),
        );
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const c of clicks) {
          if (
            c.publisherId === args.where['publisherId'] &&
            c.billable === args.where['billable'] &&
            c.paidOut === args.where['paidOut']
          ) {
            c.paidOut = Boolean(args.data['paidOut']);
            count += 1;
          }
        }
        return { count };
      },
    },
    publisherPayoutRun: {
      findUnique: async (args: { where: { utcDay: string } }) =>
        runs.get(args.where.utcDay) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        seq += 1;
        const row: PublisherPayoutRunRow = {
          id: String(args.data['id'] ?? `run-${seq}`),
          utcDay: String(args.data['utcDay']),
          status: String(args.data['status'] ?? 'running'),
          publishersConsidered: 0,
          paid: 0,
          skipped: 0,
          failed: 0,
          totalCreditsPaid: 0,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        };
        runs.set(row.utcDay, row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...runs.values()].find((r) => r.id === args.where.id)!;
        const updated = { ...row, ...args.data } as PublisherPayoutRunRow;
        runs.set(updated.utcDay, updated);
        return updated;
      },
    },
  };
}

function click(over: Partial<AdClickEventRow>): AdClickEventRow {
  return {
    id: over.id ?? `c-${Math.random()}`,
    publisherId: over.publisherId ?? 'pub-1',
    billable: over.billable ?? true,
    paidOut: over.paidOut ?? false,
  };
}

describe('PublisherPayoutSchedulerService', () => {
  let walletCredits: Array<{ publisherId: string; amount: number; key: string }>;
  let wallet: PublisherWalletPort;

  beforeEach(() => {
    walletCredits = [];
    wallet = {
      credit: (publisherId, amount, key) => {
        walletCredits.push({ publisherId, amount, key });
      },
    };
  });

  it('rejects a malformed utcDay', async () => {
    const prisma = createFakePrisma([]);
    const svc = new PublisherPayoutSchedulerService(prisma as never, wallet);
    await expect(svc.runDaily('2026/06/30')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('pays publishers from billable clicks and marks them paid', async () => {
    const prisma = createFakePrisma([
      click({ id: 'a', publisherId: 'pub-1' }),
      click({ id: 'b', publisherId: 'pub-1' }),
      click({ id: 'c', publisherId: 'pub-2' }),
    ]);
    const svc = new PublisherPayoutSchedulerService(prisma as never, wallet, {
      creditsPerClick: 5,
    });

    const summary = await svc.runDaily('2026-06-30');
    expect(summary).toMatchObject({ publishersConsidered: 2, paid: 2, failed: 0 });
    expect(summary.totalCreditsPaid).toBe(15); // pub-1: 2*5, pub-2: 1*5
    expect(walletCredits.find((c) => c.publisherId === 'pub-1')?.amount).toBe(10);
    // All paid clicks are now marked paidOut.
    expect(prisma.clicks.every((c) => c.paidOut)).toBe(true);
  });

  it('excludes fraud-flagged (non-billable) clicks from earnings', async () => {
    const prisma = createFakePrisma([
      click({ id: 'a', publisherId: 'pub-1', billable: true }),
      click({ id: 'b', publisherId: 'pub-1', billable: false }), // fraud-flagged
    ]);
    const svc = new PublisherPayoutSchedulerService(prisma as never, wallet, {
      creditsPerClick: 10,
    });
    const summary = await svc.runDaily('2026-06-30');
    expect(summary.totalCreditsPaid).toBe(10); // only the 1 billable click
  });

  it('skips publishers below the minimum payout (dust)', async () => {
    const prisma = createFakePrisma([click({ id: 'a', publisherId: 'pub-1' })]);
    const svc = new PublisherPayoutSchedulerService(prisma as never, wallet, {
      creditsPerClick: 1,
      minPayoutCredits: 5,
    });
    const summary = await svc.runDaily('2026-06-30');
    expect(summary).toMatchObject({ paid: 0, skipped: 1 });
    expect(walletCredits).toHaveLength(0);
  });

  it('is idempotent: a completed run for the day is not reprocessed', async () => {
    const prisma = createFakePrisma([click({ id: 'a', publisherId: 'pub-1' })]);
    const svc = new PublisherPayoutSchedulerService(prisma as never, wallet, {
      creditsPerClick: 5,
    });
    await svc.runDaily('2026-06-30');
    expect(walletCredits).toHaveLength(1);
    const again = await svc.runDaily('2026-06-30');
    expect(walletCredits).toHaveLength(1); // no second credit
    expect(again.paid).toBe(1);
  });

  it('is fail-soft: one publisher failure does not abort the batch', async () => {
    const prisma = createFakePrisma([
      click({ id: 'a', publisherId: 'pub-1' }),
      click({ id: 'b', publisherId: 'pub-2' }),
    ]);
    const failingWallet: PublisherWalletPort = {
      credit: vi.fn((publisherId: string) => {
        if (publisherId === 'pub-1') throw new Error('wallet missing');
      }),
    };
    const svc = new PublisherPayoutSchedulerService(prisma as never, failingWallet, {
      creditsPerClick: 5,
    });
    const summary = await svc.runDaily('2026-06-30');
    expect(summary).toMatchObject({ paid: 1, failed: 1 });
    // The failed publisher's clicks remain unpaid for the next run.
    expect(prisma.clicks.find((c) => c.publisherId === 'pub-1')?.paidOut).toBe(false);
    expect(prisma.clicks.find((c) => c.publisherId === 'pub-2')?.paidOut).toBe(true);
  });
});
