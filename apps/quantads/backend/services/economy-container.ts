import type { FastifyInstance } from 'fastify';
import {
  VirtualGoodsCatalog,
  CrossAppInventory,
  BoostPackRegistry,
  SubscriptionManager,
  EntitlementService,
} from '@quant/quant-economy';

// ============================================================================
// Economy container — shared, non-money economy helpers for QuantAds.
// ============================================================================
//
// MONEY IS ON THE LEDGER
//   All coin movement (buy / earn / store / gift / tip / boost) now runs on the
//   durable `@quant/credits` ledger via `QuantAdsCreditsWallet` + the
//   credits-backed services in `coin-services.ts`, constructed per route plugin
//   from `fastify.prisma` (see the economy/store/boost/gifting routes). The
//   ephemeral in-memory `CoinWallet` is no longer used anywhere in QuantAds, so
//   there is a single source of truth for money (no dual-ledger).
//
//   This container therefore holds only the NON-money helpers that carry no
//   ledger concern and are shared across route files:
//     • catalog + inventory   — shared by the store and gifting flows.
//     • packRegistry          — boost-pack lookup.
//     • subscriptionManager + entitlementService — subscription tiers.
//
//   (Creator listings + marketplace purchases + payouts are now durable/ledger
//   -backed and built per route from `fastify.prisma`, not held here.)
//
//   Built once per Fastify instance (via `app.decorate('economy', ...)`), so
//   their in-memory state is shared across requests exactly as before.

/** The shared, non-money economy helpers for a QuantAds instance. */
export interface EconomyContainer {
  catalog: VirtualGoodsCatalog;
  inventory: CrossAppInventory;
  packRegistry: BoostPackRegistry;
  subscriptionManager: SubscriptionManager;
  entitlementService: EntitlementService;
}

/** Build a fresh set of shared, non-money economy helpers. */
export function createEconomyContainer(): EconomyContainer {
  const catalog = new VirtualGoodsCatalog();
  const inventory = new CrossAppInventory();
  const packRegistry = new BoostPackRegistry();
  const subscriptionManager = new SubscriptionManager();
  const entitlementService = new EntitlementService(subscriptionManager);

  return {
    catalog,
    inventory,
    packRegistry,
    subscriptionManager,
    entitlementService,
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The per-instance economy helpers (see {@link EconomyContainer}). */
    economy: EconomyContainer;
  }
}

/**
 * Decorate a Fastify instance with a single shared {@link EconomyContainer}.
 * Idempotent — safe to call more than once on the same instance. Must run
 * before the economy routes are registered so the child plugins inherit it.
 */
export function registerEconomyContainer(app: FastifyInstance): void {
  if (!app.hasDecorator('economy')) {
    app.decorate('economy', createEconomyContainer());
  }
}
