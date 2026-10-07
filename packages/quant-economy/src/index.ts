// ============================================================================
// @quant/quant-economy — DEPRECATION NOTICE (K11 economy single-ownership)
// ============================================================================
//
// DECISION (docs/quant-architecture/decisions/economy-single-ownership.md):
// the economy domain has TWO canonical owners — `@quant/credits` (the Quant
// Credit ledger: wallet, reserve/settle flow, pricing, plans, marketplace,
// transfers, payouts, creator earnings, QuantTrinity policy config) and
// `@quant/payments` (money movement: rails, billing, tax, fraud, invoices).
// This package is deprecated and will be folded into those two owners phase by
// phase (coins/wallet/ledger → `@quant/credits`; buy/top-up → `@quant/payments`;
// gifting/tips/spends → `@quant/credits` transfers; store/subscriptions/boost →
// `@quant/credits` marketplace/plans). New code must import from `@quant/credits`
// or `@quant/payments` directly. Existing exports keep working until Phase 4.
// ============================================================================

// Types
export type {
  CoinTransaction,
  Wallet,
  TransactionDirection,
  GoodCategory,
  VirtualGood,
  InventoryItem,
  ListingType,
  CreatorListing,
  RevenueSplit,
  PayoutStatus,
  PayoutRequest,
  BoostPack,
  BoostRequest,
  BoostAnalytics,
  BillingModel,
  AdCampaign,
  AdImpression,
  AdClick,
  Gift,
  Tip,
  SubscriptionTier,
  Subscription,
  Entitlement,
  PaymentGatewayAdapter,
  RazorpayAdapter,
  StripeAdapter,
  UPIAdapter,
} from './types.js';

// Coins
export { CoinWallet } from './coins/wallet.js';
export { BuyCoinService } from './coins/buy-coins.js';
export { EarnCoinService } from './coins/earn-coins.js';
export { TransactionLedger } from './coins/transaction-ledger.js';

// Store
export { VirtualGoodsCatalog } from './store/catalog.js';
export { CrossAppInventory } from './store/inventory.js';
export { StorePurchaseService } from './store/purchase.js';

// Creator Economy
export { CreatorListingService } from './creator/listings.js';
export { RevenueSplitEngine } from './creator/revenue-split.js';
export { CreatorPayoutService } from './creator/payouts.js';

// Boost
export { SelfBoostEngine } from './boost/boost-engine.js';
export { BoostPackRegistry } from './boost/boost-packs.js';

// Ads
export { CompanyAdManager } from './ads/campaign-manager.js';
export { ImpressionClickTracker } from './ads/impression-tracker.js';

// Gifting
export { GiftingService } from './gifting/gift-service.js';
export { TippingService, PRESET_TIP_AMOUNTS } from './gifting/tip-service.js';

// Subscriptions
export { SubscriptionManager } from './subscriptions/subscription-manager.js';
export { EntitlementService } from './subscriptions/entitlements.js';
