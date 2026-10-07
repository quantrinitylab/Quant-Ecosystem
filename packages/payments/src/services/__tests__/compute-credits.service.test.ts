// ============================================================================
// Payments - Compute Credits Service Tests (ledger-backed)
// ============================================================================
//
// ComputeCreditsService now delegates to the shared @quant/credits CreditWallet
// (durable append-only ledger). These tests drive it through an in-memory
// ledger prisma double, asserting the same purchase/deduct/balance/history
// behaviour without any in-memory Map or Math.random id.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreditWallet } from '@quant/credits';
import { ComputeCreditsService, AI_ACTION_COSTS } from '../compute-credits.service';

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
  let clock = 1_000;
  return {
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
          // Monotonic clock so usage-history ordering is deterministic.
          createdAt: new Date(clock++),
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

describe('ComputeCreditsService (ledger-backed)', () => {
  let service: ComputeCreditsService;
  let ids: number;

  beforeEach(() => {
    ids = 0;
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: () => `id-${++ids}` });
    service = new ComputeCreditsService(wallet);
  });

  describe('purchaseCredits', () => {
    it('should add credits to user balance', async () => {
      const credits = await service.purchaseCredits({ userId: 'user_1', amount: 100 });
      expect(credits.userId).toBe('user_1');
      expect(credits.balance).toBe(100);
      expect(credits.totalPurchased).toBe(100);
      expect(credits.totalUsed).toBe(0);
      expect(credits.lastPurchaseAt).toBeDefined();
    });

    it('should accumulate credits across purchases', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 50 });
      const credits = await service.purchaseCredits({ userId: 'user_1', amount: 75 });
      expect(credits.balance).toBe(125);
      expect(credits.totalPurchased).toBe(125);
    });

    it('should reject zero amount', async () => {
      await expect(service.purchaseCredits({ userId: 'user_1', amount: 0 })).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(service.purchaseCredits({ userId: 'user_1', amount: -10 })).rejects.toThrow();
    });

    it('should reject non-integer amount', async () => {
      await expect(service.purchaseCredits({ userId: 'user_1', amount: 10.5 })).rejects.toThrow();
    });
  });

  describe('deductCredits', () => {
    it('should deduct correct cost for gpt4', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 100 });
      const usage = await service.deductCredits({ userId: 'user_1', actionType: 'gpt4' });
      expect(usage.actionType).toBe('gpt4');
      expect(usage.creditsUsed).toBe(10);
      const balance = await service.getBalance('user_1');
      expect(balance.balance).toBe(90);
    });

    it('should deduct correct cost for gpt35', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 10 });
      const usage = await service.deductCredits({ userId: 'user_1', actionType: 'gpt35' });
      expect(usage.creditsUsed).toBe(2);
    });

    it('should deduct correct cost for claude3', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 20 });
      const usage = await service.deductCredits({ userId: 'user_1', actionType: 'claude3' });
      expect(usage.creditsUsed).toBe(8);
    });

    it('should deduct correct cost for stable_diffusion', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 20 });
      const usage = await service.deductCredits({
        userId: 'user_1',
        actionType: 'stable_diffusion',
      });
      expect(usage.creditsUsed).toBe(15);
    });

    it('should throw when insufficient credits', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 5 });
      await expect(service.deductCredits({ userId: 'user_1', actionType: 'gpt4' })).rejects.toThrow(
        'Insufficient credits',
      );
    });

    it('should throw when user has no balance', async () => {
      await expect(
        service.deductCredits({ userId: 'user_new', actionType: 'gpt35' }),
      ).rejects.toThrow('No credit balance found');
    });

    it('should use custom description when provided', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 50 });
      const usage = await service.deductCredits({
        userId: 'user_1',
        actionType: 'whisper',
        description: 'Transcribe podcast ep 42',
      });
      expect(usage.description).toBe('Transcribe podcast ep 42');
    });
  });

  describe('getBalance', () => {
    it('should return balance for existing user', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 50 });
      await service.deductCredits({ userId: 'user_1', actionType: 'llama3' });
      const balance = await service.getBalance('user_1');
      expect(balance.balance).toBe(49);
      expect(balance.totalPurchased).toBe(50);
      expect(balance.totalUsed).toBe(1);
    });

    it('should return zero balance for unknown user', async () => {
      const balance = await service.getBalance('nonexistent');
      expect(balance.balance).toBe(0);
      expect(balance.totalPurchased).toBe(0);
      expect(balance.totalUsed).toBe(0);
    });
  });

  describe('getUsageHistory', () => {
    it('should return usage history sorted by timestamp descending', async () => {
      await service.purchaseCredits({ userId: 'user_1', amount: 100 });
      await service.deductCredits({ userId: 'user_1', actionType: 'gpt35' });
      await service.deductCredits({ userId: 'user_1', actionType: 'gpt4' });
      await service.deductCredits({ userId: 'user_1', actionType: 'whisper' });

      const history = await service.getUsageHistory('user_1');
      expect(history).toHaveLength(3);
      expect(history[0]!.timestamp).toBeGreaterThanOrEqual(history[1]!.timestamp);
      expect(history[1]!.timestamp).toBeGreaterThanOrEqual(history[2]!.timestamp);
    });

    it('should return empty array for no usage', async () => {
      expect(await service.getUsageHistory('user_1')).toHaveLength(0);
    });
  });

  describe('AI_ACTION_COSTS', () => {
    it('should have correct cost values', () => {
      expect(AI_ACTION_COSTS.gpt4).toBe(10);
      expect(AI_ACTION_COSTS.gpt35).toBe(2);
      expect(AI_ACTION_COSTS.claude3).toBe(8);
      expect(AI_ACTION_COSTS.llama3).toBe(1);
      expect(AI_ACTION_COSTS.stable_diffusion).toBe(15);
      expect(AI_ACTION_COSTS.whisper).toBe(5);
      expect(AI_ACTION_COSTS.custom).toBe(3);
    });
  });
});
