// @vitest-environment node
// ============================================================================
// CreatorEarningsService — apps -> one shared ledger as earned credits
// ============================================================================
//
// Verifies Req 3:
//   * an earning from any app credits the creator's shared wallet as an EARNED
//     kind (counts toward withdrawable balance).
//   * idempotent on earningId (a retried payout job credits at most once).
//   * QuantAds ad-revenue share routes to creator_payout earnings.
//   * validation: positive amount, earningId required, known source.

import { describe, it, expect } from 'vitest';
import { CreatorEarningsService, CreditWallet, EARN_CREDIT_KINDS } from '../index';

interface LedgerRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  sourceRef: string | null;
  utcDay: string | null;
  reason: string | null;
  createdAt: Date;
}

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && rows.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey,
          sourceRef: (data.sourceRef as string | null) ?? null,
          utcDay: (data.utcDay as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          createdAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return rows.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: { where?: { actionKey?: string } } = {}): Promise<LedgerRow | null> {
        const m = rows.find((r) => where?.actionKey == null || r.actionKey === where.actionKey);
        return m ? { ...m } : null;
      },
    },
  };
}

let idSeq = 0;
const seqIds = () => () => `id-${++idSeq}`;
const CREATOR = { ownerId: 'creator-1', ownerType: 'user' as const, tenantId: 't' };
const PRINCIPAL = { principalId: 'creator-1', tenantId: 't' };

function earnedTotal(rows: LedgerRow[]): number {
  const earn = new Set<string>(EARN_CREDIT_KINDS);
  return rows.filter((r) => earn.has(r.entryType)).reduce((s, r) => s + r.amount, 0);
}

describe('CreatorEarningsService.record', () => {
  it('credits the shared wallet as an EARNED kind from any app', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const earnings = new CreatorEarningsService(wallet);

    await earnings.record({
      creator: CREATOR,
      app: 'quanttube',
      source: 'content_monetization',
      amountCredits: 120,
      earningId: 'payout-line-1',
    });

    expect(earnedTotal(prisma._rows)).toBe(120);
    const bal = await wallet.getBalance(PRINCIPAL, CREATOR);
    expect(bal.total).toBe(120);
  });

  it('is idempotent on earningId (retried job credits at most once)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const earnings = new CreatorEarningsService(wallet);

    const args = {
      creator: CREATOR,
      app: 'quantsync' as const,
      source: 'boost' as const,
      amountCredits: 30,
      earningId: 'boost-9',
    };
    await earnings.record(args);
    await earnings.record(args); // replay

    expect(earnedTotal(prisma._rows)).toBe(30);
  });

  it('routes QuantAds revenue share to creator_payout earnings', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const earnings = new CreatorEarningsService(wallet);

    const entry = await earnings.recordAdRevenueShare({
      creator: CREATOR,
      amountCredits: 75,
      settlementId: 'ad-settle-1',
    });
    expect(entry.entryType).toBe('creator_payout');
    expect(earnedTotal(prisma._rows)).toBe(75);
  });

  it('validates amount, earningId, and source', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const earnings = new CreatorEarningsService(wallet);

    await expect(
      earnings.record({
        creator: CREATOR,
        app: 'quanttube',
        source: 'boost',
        amountCredits: 0,
        earningId: 'x',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' });

    await expect(
      earnings.record({
        creator: CREATOR,
        app: 'quanttube',
        source: 'boost',
        amountCredits: 5,
        earningId: '',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'EARNING_ID_REQUIRED' });

    await expect(
      earnings.record({
        creator: CREATOR,
        app: 'quanttube',
        source: 'bogus' as never,
        amountCredits: 5,
        earningId: 'x',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SOURCE' });
  });

  it('enforces an allowed-apps set when configured', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const earnings = new CreatorEarningsService(wallet, { allowedApps: new Set(['quanttube']) });

    await expect(
      earnings.record({
        creator: CREATOR,
        app: 'quantmax',
        source: 'tip',
        amountCredits: 5,
        earningId: 'x',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'APP_NOT_ALLOWED' });
  });
});
