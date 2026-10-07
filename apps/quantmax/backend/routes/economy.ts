import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CoinWallet,
  VirtualGoodsCatalog,
  CrossAppInventory,
  StorePurchaseService,
  SubscriptionManager,
  EntitlementService,
  GiftingService,
} from '@quant/quant-economy';
import type { SubscriptionTier } from '@quant/quant-economy';

// ============================================================================
// quant-economy seam — decorator service + scoped routes (quantmax, Task 14.4)
// ============================================================================
//
// Req 3.2. Wires `@quant/quant-economy` into quantmax AS-SHIPPED (no rewrite —
// Req 9.1). quant-economy `dependsOn @quant/payments` (coin top-ups / cashouts
// ultimately settle through the Stripe rail), so it is decorated AFTER
// `fastify.payments` in `buildApp()`. Composed once at boot into a decorated
// singleton (`fastify.economy`, never per-request) bundling the engine's
// as-shipped exports: the `CoinWallet` ledger, the `VirtualGoodsCatalog` +
// `CrossAppInventory` + `StorePurchaseService` store stack, the
// `SubscriptionManager` + `EntitlementService` tier stack, and the
// `GiftingService`. Construction honours the engines' OWN internal dependsOn
// (wallet/catalog/inventory built first, then store + gifting which take them;
// subscriptions built before entitlements which takes it).
//
// AUTH (Req 7.1): every route sits behind the global `onRequest` auth hook from
// `createApp()` (401 unauthenticated). Mutating routes additionally declare an
// `economy:write` scope via `requireAuth({ scopes })`. The `/economy` prefix
// does NOT collide with any server-core PUBLIC_PATHS entry. Inputs are
// Zod-validated; every response uses the canonical `{ success, data }` envelope.
// Persistence is the engines' own in-memory state (no new schema — Req 9.5).
//
// MONEY-INTEGRITY (verify-first, Batch-17): despite the "top-ups/cashouts settle
// through Stripe" intent above, QuantMax's coin economy is currently NON-money
// as wired — there is NO consumption path that moves real money:
//   • No money-IN: there is no top-up / buy-coins route. Every route here only
//     SPENDS (store/purchase, gifts) or READS. Nothing credits the CoinWallet,
//     so a wallet stays at 0 and spends fail closed (insufficient) — inert.
//   • No money-OUT: there is no withdraw / cashout route anywhere in quantmax.
// Because no real money enters or leaves, the ephemeral in-memory CoinWallet
// carries no money-integrity risk today, and migrating it to the durable
// @quant/credits ledger now would be SPECULATIVE durability (no funded balance
// to preserve). This is intentionally left as-is (mirrors the quantads
// non-money confirmation, PR #476).
//
// DURABILITY-GATE TRIGGER: the moment a REAL money path is wired here — a
// payment-gated coin top-up (Stripe) OR a withdrawal/cashout to a rail — this
// wallet becomes money-touching and MUST be migrated to the @quant/credits
// ledger (append-only, atomic/idempotent/fail-closed), exactly as quantads did
// (PR #474: buy/spend on the ledger; #479: marketplace earnings; PayoutService
// for withdrawals). Until then: no rebuild.

/**
 * The composite economy service decorated onto the instance — the as-shipped
 * `@quant/quant-economy` engines, wired honouring their internal dependencies.
 */
export interface EconomyService {
  wallet: CoinWallet;
  catalog: VirtualGoodsCatalog;
  inventory: CrossAppInventory;
  store: StorePurchaseService;
  subscriptions: SubscriptionManager;
  entitlements: EntitlementService;
  gifting: GiftingService;
}

// Layer 2 type augmentation.
declare module 'fastify' {
  interface FastifyInstance {
    economy: EconomyService;
  }
}

/**
 * Construct the quant-economy service bundle once at boot, honouring the
 * engines' internal construction order. Called from quantmax `buildApp()` via
 * `app.decorate('economy', ...)`.
 */
export function createEconomyService(): EconomyService {
  const wallet = new CoinWallet();
  const catalog = new VirtualGoodsCatalog();
  const inventory = new CrossAppInventory();
  const subscriptions = new SubscriptionManager();
  return {
    wallet,
    catalog,
    inventory,
    store: new StorePurchaseService(wallet, catalog, inventory),
    subscriptions,
    entitlements: new EntitlementService(subscriptions),
    gifting: new GiftingService(wallet, catalog, inventory),
  };
}

const SUBSCRIPTION_TIERS = ['Free', 'Pro', 'ProPlus', 'Family'] as const;

const subscribeSchema = z.object({
  tier: z.enum(SUBSCRIPTION_TIERS),
});

const purchaseSchema = z.object({
  itemId: z.string().min(1),
});

const giftSchema = z.object({
  toUserId: z.string().min(1),
  itemId: z.string().min(1),
});

export default async function economyRoutes(fastify: FastifyInstance) {
  // --- coin wallet (CoinWallet) ---------------------------------------------

  // GET /economy/wallet — the caller's coin wallet + balance (read). The wallet
  // is created lazily on first read (createWallet is idempotent).
  fastify.get('/wallet', async (request, reply) => {
    fastify.economy.wallet.createWallet(request.auth.userId);
    const balance = fastify.economy.wallet.getBalance(request.auth.userId);
    const transactions = fastify.economy.wallet.getTransactionHistory(request.auth.userId);
    return reply.send({ success: true, data: { balance, transactions } });
  });

  // --- store (VirtualGoodsCatalog / StorePurchaseService) -------------------

  // GET /economy/store/catalog — the virtual goods catalog (read).
  fastify.get('/store/catalog', async (_request, reply) => {
    const items = fastify.economy.catalog.getAllItems();
    return reply.send({ success: true, data: { items } });
  });

  // POST /economy/store/purchase — buy a virtual good with coins. Mutating →
  // `economy:write`.
  fastify.post(
    '/store/purchase',
    { preHandler: fastify.requireAuth({ scopes: ['economy:write'] }) },
    async (request, reply) => {
      const parsed = purchaseSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.economy.wallet.createWallet(request.auth.userId);
      const result = fastify.economy.store.purchaseItem(request.auth.userId, parsed.data.itemId);
      return reply.status(result.success ? 201 : 200).send({ success: true, data: { result } });
    },
  );

  // --- subscriptions + entitlements -----------------------------------------

  // GET /economy/subscription — the caller's current tier + entitlements (read).
  fastify.get('/subscription', async (request, reply) => {
    const tier = fastify.economy.subscriptions.getCurrentTier(request.auth.userId);
    const entitlements = fastify.economy.entitlements.getEntitlements(request.auth.userId);
    return reply.send({ success: true, data: { tier, entitlements } });
  });

  // POST /economy/subscription — subscribe the caller to a tier. Mutating →
  // `economy:write`.
  fastify.post(
    '/subscription',
    { preHandler: fastify.requireAuth({ scopes: ['economy:write'] }) },
    async (request, reply) => {
      const parsed = subscribeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const subscription = fastify.economy.subscriptions.subscribe(
        request.auth.userId,
        parsed.data.tier as SubscriptionTier,
      );
      return reply.status(201).send({ success: true, data: { subscription } });
    },
  );

  // --- gifting (GiftingService) ---------------------------------------------

  // POST /economy/gifts — send a virtual good gift to another user. Mutating →
  // `economy:write`.
  fastify.post(
    '/gifts',
    { preHandler: fastify.requireAuth({ scopes: ['economy:write'] }) },
    async (request, reply) => {
      const parsed = giftSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.economy.wallet.createWallet(request.auth.userId);
      const result = fastify.economy.gifting.sendGift(
        request.auth.userId,
        parsed.data.toUserId,
        parsed.data.itemId,
      );
      return reply.status(result.success ? 201 : 200).send({ success: true, data: { result } });
    },
  );
}
