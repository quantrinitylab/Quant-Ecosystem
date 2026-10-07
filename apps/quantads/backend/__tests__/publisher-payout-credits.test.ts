// @vitest-environment node
// ============================================================================
// Publisher payout → durable credits ledger (Batch-13 PR-A)
// ============================================================================
//   Proves ad-revenue now lands durably: the credits-backed PublisherWalletPort
//   credits a WITHDRAWABLE earn-kind (creator_payout), idempotent by key; and
//   the scheduler wired to it makes publisher earnings ledger-visible without
//   double-paying on a duplicate cron fire.

import { describe, it, expect, beforeEach } from 'vitest';
import { QuantAdsCreditsWallet } from '../services/credits-wallet';
import { createPublisherWalletPort } from '../services/coin-services';
import { PublisherPayoutSchedulerService } from '../services/publisher-payout-scheduler.service';

interface LedgerRow {
  id: string;
  ownerRef: string;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  sourceRef: string | null;
  createdAt: Date;
}

interface ClickRow {
  id: string;
  publisherId: string | null;
  billable: boolean;
  paidOut: boolean;
}

interface RunRow {
  id: string;
  utcDay: string;
  status: string;
  publishersConsidered: number;
  paid: number;
  skipped: number;
  failed: number;
  totalCreditsPaid: number;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

function createPrisma(clicks: ClickRow[] = []) {
  const ledger: LedgerRow[] = [];
  const clickRows = clicks.map((c) => ({ ...c }));
  const runs: RunRow[] = [];
  let n = 0;
  const api = {
    _ledger: ledger,
    _clicks: clickRows,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snap = ledger.map((r) => ({ ...r }));
      try {
        return await fn(api);
      } catch (err) {
        ledger.length = 0;
        ledger.push(...snap);
        throw err;
      }
    },
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && ledger.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `l-${++n}`,
          ownerRef: data.ownerRef as string,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey,
          sourceRef: (data.sourceRef as string | null) ?? null,
          createdAt: new Date(),
        };
        ledger.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return ledger.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: { where?: { actionKey?: string } } = {}): Promise<LedgerRow | null> {
        const m = ledger.find((r) => where?.actionKey == null || r.actionKey === where.actionKey);
        return m ? { ...m } : null;
      },
    },
    adClickEvent: {
      async findMany({ where }: { where?: Record<string, unknown> } = {}): Promise<ClickRow[]> {
        return clickRows.filter((c) => {
          if (where?.['billable'] != null && c.billable !== where['billable']) return false;
          if (where?.['paidOut'] != null && c.paidOut !== where['paidOut']) return false;
          if (where?.['publisherId'] != null && typeof where['publisherId'] === 'object') {
            // { not: null }
            if (c.publisherId == null) return false;
          }
          return true;
        });
      },
      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }> {
        let count = 0;
        for (const c of clickRows) {
          if (where['publisherId'] != null && c.publisherId !== where['publisherId']) continue;
          if (where['billable'] != null && c.billable !== where['billable']) continue;
          if (where['paidOut'] != null && c.paidOut !== where['paidOut']) continue;
          if (data['paidOut'] != null) c.paidOut = data['paidOut'] as boolean;
          count += 1;
        }
        return { count };
      },
    },
    publisherPayoutRun: {
      async findUnique({ where }: { where: { utcDay: string } }): Promise<RunRow | null> {
        return runs.find((r) => r.utcDay === where.utcDay) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }): Promise<RunRow> {
        const row: RunRow = {
          id: data['id'] as string,
          utcDay: data['utcDay'] as string,
          status: (data['status'] as string) ?? 'running',
          publishersConsidered: 0,
          paid: 0,
          skipped: 0,
          failed: 0,
          totalCreditsPaid: 0,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        };
        runs.push(row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<RunRow> {
        const row = runs.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  return api;
}

const day = '2026-06-30';
function click(id: string, publisherId: string, billable = true): ClickRow {
  return { id, publisherId, billable, paidOut: false };
}

describe('createPublisherWalletPort', () => {
  it('credits a withdrawable earn-kind, idempotent by key', async () => {
    const prisma = createPrisma();
    const port = createPublisherWalletPort(new QuantAdsCreditsWallet(prisma as never));

    await port.credit('pub-1', 5, `pub-payout:pub-1:${day}`);
    await port.credit('pub-1', 5, `pub-payout:pub-1:${day}`); // replay

    const entries = prisma._ledger.filter((r) => r.ownerRef === 'pub-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entryType).toBe('creator_payout');
    expect(entries[0]!.amount).toBe(5);
  });
});

describe('PublisherPayoutSchedulerService wired to the credits ledger', () => {
  let prisma: ReturnType<typeof createPrisma>;
  beforeEach(() => {
    prisma = createPrisma([
      click('a', 'pub-1'),
      click('b', 'pub-1'),
      click('c', 'pub-2'),
      click('d', 'pub-2', false), // fraud-flagged: excluded
    ]);
  });

  it('makes publisher earnings ledger-visible from non-fraud billable clicks', async () => {
    const port = createPublisherWalletPort(new QuantAdsCreditsWallet(prisma as never));
    const svc = new PublisherPayoutSchedulerService(prisma as never, port, { creditsPerClick: 5 });

    const summary = await svc.runDaily(day);
    expect(summary.paid).toBe(2);
    // pub-1: 2 billable clicks * 5 = 10; pub-2: 1 billable * 5 = 5.
    expect(prisma._ledger.find((r) => r.ownerRef === 'pub-1')?.amount).toBe(10);
    expect(prisma._ledger.find((r) => r.ownerRef === 'pub-2')?.amount).toBe(5);
  });

  it('does not double-pay on a duplicate cron fire (idempotent per day)', async () => {
    const port = createPublisherWalletPort(new QuantAdsCreditsWallet(prisma as never));
    const svc = new PublisherPayoutSchedulerService(prisma as never, port, { creditsPerClick: 5 });

    await svc.runDaily(day);
    await svc.runDaily(day); // duplicate cron

    const pub1 = prisma._ledger.filter((r) => r.ownerRef === 'pub-1');
    expect(pub1).toHaveLength(1);
    expect(pub1[0]!.amount).toBe(10);
  });
});
