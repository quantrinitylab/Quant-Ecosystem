// ============================================================================
// @quant/creator-economy — DEPRECATION NOTICE (K11 economy single-ownership)
// ============================================================================
//
// DECISION (docs/quant-architecture/decisions/economy-single-ownership.md):
// the economy domain has TWO canonical owners — `@quant/credits` (the Quant
// Credit ledger: wallet, reserve/settle flow, pricing, plans, marketplace,
// transfers, payouts, creator earnings, QuantTrinity policy config) and
// `@quant/payments` (money movement: rails, billing, tax, fraud, invoices).
// This package is deprecated and will be folded into those two owners phase by
// phase. New code must import from `@quant/credits` or `@quant/payments`
// directly. Existing exports keep working (deprecated shims) until Phase 4.
//
// Phase 1 (done): `TaxReportingService` moved to `@quant/payments`; this
// barrel re-exports it as a deprecated shim.
// ============================================================================

export * from './types.js';
export { MonetizationEngine } from './monetization/monetization-engine.js';
export { RemixRoyaltyTracker } from './monetization/remix-royalty-tracker.js';
export { CreatorDashboardService } from './dashboard/dashboard-service.js';
export { PayoutService } from './payouts/payout-service.js';
export { TaxReportingService } from './payouts/tax-reporting.js';
export type { Tax1099, WithholdingStatus } from './payouts/tax-reporting.js';
export { TierService } from './tiers/tier-service.js';
export { BrandPartnershipService } from './brand-partnerships/partnership-service.js';
export { QuantCreditsService } from './credits/quant-credits.js';
