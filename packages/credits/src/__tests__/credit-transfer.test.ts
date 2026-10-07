// @vitest-environment node
// ============================================================================
// CreditTransferService — peer transfers + spends on the credit ledger
// ============================================================================
//   * transfer: atomic debit(from) + credit(to), idempotent by transferId,
//     fail-closed on insufficient funds (nothing moves).
//   * spend: idempotent debit, fail-closed.

import { describe, it, expect } from 'vitest';
import { CreditTransferService, CreditWallet } from '../index';

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

function createPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  const api = {
    _rows: rows,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn(api);
      } catch (err) {
        rows.length = 0;
        rows.push(...snapshot);
        throw err;
      }
    },
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && rows.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
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
      }: {
        where?: { actionKey?: string; ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const match = rows.find((r) => {
          if (where?.actionKey != null && r.actionKey !== where.actionKey) return false;
          if (where?.ownerRef != null && r.ownerRef !== where.ownerRef) return false;
          if (where?.entryType != null && r.entryType !== where.entryType) return false;
          if (where?.utcDay != null && r.utcDay !== where.utcDay) return false;
          return true;
        });
        return match ? { ...match } : null;
      },
    },
  };
  return api;
}

let idSeq = 0;
const seqIds = () => () => `id-${++idSeq}`;
const A = { ownerId: 'alice', ownerType: 'user' as const };
const B = { ownerId: 'bob', ownerType: 'user' as const };

async function fund(prisma: ReturnType<typeof createPrisma>, owner: typeof A, amount: number) {
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
  await wallet.credit(owner, { amount, kind: 'purchase' });
}
function balanceOf(prisma: ReturnType<typeof createPrisma>, ownerId: string): number {
  return prisma._rows.filter((r) => r.ownerRef === ownerId).reduce((s, r) => s + r.amount, 0);
}

describe('CreditTransferService.transfer', () => {
  it('moves credits from sender to recipient', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 100);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });

    const res = await svc.transfer({ transferId: 't1', from: A, to: B, amountCredits: 30 });
    expect(res.replayed).toBe(false);
    expect(balanceOf(prisma, 'alice')).toBe(70);
    expect(balanceOf(prisma, 'bob')).toBe(30);
  });

  it('is idempotent: replaying the same transferId moves nothing more', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 100);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });

    await svc.transfer({ transferId: 't1', from: A, to: B, amountCredits: 30 });
    const replay = await svc.transfer({ transferId: 't1', from: A, to: B, amountCredits: 30 });
    expect(replay.replayed).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(70);
    expect(balanceOf(prisma, 'bob')).toBe(30);
  });

  it('fails closed on insufficient funds (nothing moves)', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 10);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });

    await expect(
      svc.transfer({ transferId: 't1', from: A, to: B, amountCredits: 30 }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'OUT_OF_CREDITS' });
    expect(balanceOf(prisma, 'alice')).toBe(10);
    expect(balanceOf(prisma, 'bob')).toBe(0);
  });

  it('rejects from == to and invalid amounts', async () => {
    const prisma = createPrisma();
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });
    await expect(
      svc.transfer({ transferId: 't1', from: A, to: A, amountCredits: 5 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      svc.transfer({ transferId: 't2', from: A, to: B, amountCredits: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('credits the recipient with an earn-kind when requested (withdrawable tip)', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 50);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });
    await svc.transfer({
      transferId: 'tip1',
      from: A,
      to: B,
      amountCredits: 20,
      creditKind: 'referral',
    });
    const bobEarn = prisma._rows.find((r) => r.ownerRef === 'bob' && r.entryType === 'referral');
    expect(bobEarn?.amount).toBe(20);
  });
});

describe('CreditTransferService.spend', () => {
  it('debits the owner and is idempotent', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 100);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });

    const res = await svc.spend({ spendId: 's1', owner: A, amountCredits: 40, reason: 'boost' });
    expect(res.replayed).toBe(false);
    expect(balanceOf(prisma, 'alice')).toBe(60);

    const replay = await svc.spend({ spendId: 's1', owner: A, amountCredits: 40 });
    expect(replay.replayed).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(60);
  });

  it('fails closed on insufficient funds', async () => {
    const prisma = createPrisma();
    await fund(prisma, A, 10);
    const svc = new CreditTransferService(prisma as never, {
      walletOptions: { generateId: seqIds() },
    });
    await expect(svc.spend({ spendId: 's1', owner: A, amountCredits: 40 })).rejects.toMatchObject({
      statusCode: 402,
      code: 'OUT_OF_CREDITS',
    });
    expect(balanceOf(prisma, 'alice')).toBe(10);
  });
});
