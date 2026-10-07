// @vitest-environment node
// ============================================================================
// QuantAds coin services — backed by the durable @quant/credits ledger
// ============================================================================
//   Proves the money migration: buys are ledger-visible + idempotent, earns are
//   once-only, store/gift/boost debit and fail closed on insufficient funds,
//   and tips move credits atomically to the recipient.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreditWallet } from '@quant/credits';
import {
  VirtualGoodsCatalog,
  CrossAppInventory,
  BoostPackRegistry,
  type PaymentGatewayAdapter,
} from '@quant/quant-economy';
import { QuantAdsCreditsWallet } from '../services/credits-wallet';
import {
  BuyCoinLedgerService,
  EarnCoinLedgerService,
  StorePurchaseLedgerService,
  GiftingLedgerService,
  TippingLedgerService,
  BoostLedgerService,
} from '../services/coin-services';

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
        where?: { actionKey?: string };
      } = {}): Promise<LedgerRow | null> {
        const match = rows.find((r) => where?.actionKey == null || r.actionKey === where.actionKey);
        return match ? { ...match } : null;
      },
    },
  };
  return api;
}

let idSeq = 0;
const seqIds = () => `id-${++idSeq}`;

type Prisma = ReturnType<typeof createPrisma>;

function balanceOf(prisma: Prisma, userId: string): number {
  return prisma._rows.filter((r) => r.ownerRef === userId).reduce((s, r) => s + r.amount, 0);
}

async function fund(prisma: Prisma, userId: string, amount: number) {
  const w = new CreditWallet(prisma as never, { generateId: seqIds });
  await w.credit({ ownerId: userId, ownerType: 'user' }, { amount, kind: 'purchase' });
}

function verifiedAdapter(verified: boolean): PaymentGatewayAdapter {
  return {
    createOrder: async () => ({ orderId: 'order-1' }),
    verifyPayment: async () => verified,
  };
}

let prisma: Prisma;
let wallet: QuantAdsCreditsWallet;
beforeEach(() => {
  prisma = createPrisma();
  wallet = new QuantAdsCreditsWallet(prisma as never);
});

describe('BuyCoinLedgerService', () => {
  it('credits coins on a verified payment and makes the purchase ledger-visible', async () => {
    const svc = new BuyCoinLedgerService(wallet);
    const res = await svc.buyWithRazorpay('alice', 100, 'pay-1', verifiedAdapter(true));
    expect(res).toEqual({ success: true, coins: 100 });
    expect(balanceOf(prisma, 'alice')).toBe(100);
    const purchase = prisma._rows.find((r) => r.entryType === 'purchase' && r.ownerRef === 'alice');
    expect(purchase?.amount).toBe(100);
    expect(purchase?.actionKey).toBe('buy-pay-1');
  });

  it('grants nothing on an unverified payment (fail closed)', async () => {
    const svc = new BuyCoinLedgerService(wallet);
    const res = await svc.buyWithStripe('alice', 100, 'pay-x', verifiedAdapter(false));
    expect(res).toEqual({ success: false, coins: 0 });
    expect(prisma._rows).toHaveLength(0);
  });

  it('is idempotent per paymentRef (a replayed callback credits once)', async () => {
    const svc = new BuyCoinLedgerService(wallet);
    await svc.buyWithUPI('alice', 100, 'pay-1', verifiedAdapter(true));
    const replay = await svc.buyWithUPI('alice', 100, 'pay-1', verifiedAdapter(true));
    expect(replay).toEqual({ success: false, coins: 0 });
    expect(balanceOf(prisma, 'alice')).toBe(100);
  });
});

describe('EarnCoinLedgerService', () => {
  it('grants the daily login reward at most once per day', async () => {
    const svc = new EarnCoinLedgerService(wallet);
    const first = await svc.claimDailyLogin('alice');
    expect(first).toEqual({ success: true, coins: 10 });
    const second = await svc.claimDailyLogin('alice');
    expect(second).toEqual({ success: false, coins: 0 });
    expect(balanceOf(prisma, 'alice')).toBe(10);
  });

  it('grants a referral bonus once per referral pair (withdrawable earn-kind)', async () => {
    const svc = new EarnCoinLedgerService(wallet);
    const res = await svc.claimReferralBonus('alice', 'bob');
    expect(res).toEqual({ success: true, coins: 50 });
    const entry = prisma._rows.find((r) => r.ownerRef === 'alice');
    expect(entry?.entryType).toBe('referral');
    const dup = await svc.claimReferralBonus('alice', 'bob');
    expect(dup).toEqual({ success: false, coins: 0 });
  });
});

describe('StorePurchaseLedgerService', () => {
  let catalog: VirtualGoodsCatalog;
  let inventory: CrossAppInventory;
  beforeEach(() => {
    catalog = new VirtualGoodsCatalog();
    catalog.addItem({
      id: 'skin-1',
      name: 'Cool Skin',
      description: 'x',
      category: 'skin',
      priceCoins: 30,
      crossApp: false,
    });
    inventory = new CrossAppInventory();
  });

  it('debits the buyer and grants the item on success', async () => {
    await fund(prisma, 'alice', 100);
    const svc = new StorePurchaseLedgerService(wallet, catalog, inventory);
    const res = await svc.purchaseItem('alice', 'skin-1');
    expect(res.success).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(70);
    expect(inventory.hasItem('alice', 'skin-1')).toBe(true);
  });

  it('fails closed when the buyer cannot afford the item (nothing granted)', async () => {
    await fund(prisma, 'alice', 10);
    const svc = new StorePurchaseLedgerService(wallet, catalog, inventory);
    const res = await svc.purchaseItem('alice', 'skin-1');
    expect(res.success).toBe(false);
    expect(balanceOf(prisma, 'alice')).toBe(10);
    expect(inventory.hasItem('alice', 'skin-1')).toBe(false);
  });

  it('rejects an unknown item', async () => {
    const svc = new StorePurchaseLedgerService(wallet, catalog, inventory);
    const res = await svc.purchaseItem('alice', 'nope');
    expect(res).toEqual({ success: false, message: 'Item not found' });
  });
});

describe('GiftingLedgerService', () => {
  it('debits the sender and grants the gifted item to the recipient', async () => {
    const catalog = new VirtualGoodsCatalog();
    catalog.addItem({
      id: 'gift-1',
      name: 'Rose',
      description: 'x',
      category: 'gift_item',
      priceCoins: 40,
      crossApp: false,
    });
    const inventory = new CrossAppInventory();
    await fund(prisma, 'alice', 100);
    const svc = new GiftingLedgerService(wallet, catalog, inventory);
    const res = await svc.sendGift('alice', 'bob', 'gift-1');
    expect(res.success).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(60);
    expect(inventory.hasItem('bob', 'gift-1')).toBe(true);
    expect(svc.getReceivedGifts('bob')).toHaveLength(1);
  });
});

describe('TippingLedgerService', () => {
  it('moves credits from sender to recipient atomically', async () => {
    await fund(prisma, 'alice', 50);
    const svc = new TippingLedgerService(wallet);
    const res = await svc.sendTip('alice', 'bob', 20);
    expect(res.success).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(30);
    expect(balanceOf(prisma, 'bob')).toBe(20);
    expect(svc.getTipsReceived('bob')).toHaveLength(1);
  });

  it('fails closed when the tipper has insufficient balance', async () => {
    await fund(prisma, 'alice', 5);
    const svc = new TippingLedgerService(wallet);
    const res = await svc.sendTip('alice', 'bob', 20);
    expect(res.success).toBe(false);
    expect(balanceOf(prisma, 'alice')).toBe(5);
    expect(balanceOf(prisma, 'bob')).toBe(0);
  });
});

describe('BoostLedgerService', () => {
  it('debits the booster by the pack cost and records the boost', async () => {
    await fund(prisma, 'alice', 200);
    const svc = new BoostLedgerService(wallet, new BoostPackRegistry());
    const res = await svc.boostPost('alice', 'post-1', 'basic'); // basic = 100 coins
    expect(res.success).toBe(true);
    expect(balanceOf(prisma, 'alice')).toBe(100);
    expect(svc.getBoost(res.boost!.id)).toBeDefined();
  });

  it('fails closed when the booster cannot afford the pack', async () => {
    await fund(prisma, 'alice', 10);
    const svc = new BoostLedgerService(wallet, new BoostPackRegistry());
    const res = await svc.boostPost('alice', 'post-1', 'premium'); // premium = 500 coins
    expect(res.success).toBe(false);
    expect(balanceOf(prisma, 'alice')).toBe(10);
  });
});
