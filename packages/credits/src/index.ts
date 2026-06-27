// ============================================================================
// @quant/credits — the ecosystem-wide credits subsystem (extracted from
// quantmail-superhub's billing module).
// ============================================================================
//
// PURPOSE
//   The single, app-agnostic source of truth for the Quant economy: an
//   append-only credit ledger (CreditWallet), the metering choke point
//   (PricingEngine + UsageGate), opt-in overage (default OFF), plan tiers
//   (PlanService), provider-hosted billing (BillingService + PaymentProvider
//   port), and the neutral ownership/tenant authorization filter every money
//   action is gated by.
//
//   This package depends only on `@prisma/client` (types), `@quant/server-core`
//   (createAppError), `@quant/ai` (ModelRouter type) and `zod`. It must NOT
//   import any application. Apps consume it through this barrel; the
//   ownership-authz concrete rule is injected by the caller.

// ----------------------------------------------------------------------------
// Ownership / tenant authorization filter (injectable port + canonical rule)
// ----------------------------------------------------------------------------
export { ownerOnlyAuthz, createMailDomainOwnershipAuthz, assertOwnership } from './ownership-authz';
export type { OwnershipPrincipal, OwnedResource, OwnershipAuthzPort } from './ownership-authz';

// ----------------------------------------------------------------------------
// PricingEngine — cost driver -> credit cost (tokens -> $ -> credits)
// ----------------------------------------------------------------------------
export {
  PricingEngine,
  createModelRouterCostEstimator,
  fallbackAiCostEstimator,
  DEFAULT_CREDITS_PER_USD,
} from './pricing-engine.service';
export type {
  Credits,
  ActionKind,
  PricingUnit,
  PricingSource,
  TokenUsage,
  MeteredAction,
  PricingRule,
  AiUsage,
  AiCostEstimator,
  ModelRouterCostEstimatorOptions,
  PricingEngineOptions,
} from './pricing-engine.service';

// ----------------------------------------------------------------------------
// CreditMeter / UsageGate — estimate -> reserve (fail closed) -> settle
// ----------------------------------------------------------------------------
export {
  UsageGate,
  InMemoryBalanceProvider,
  InMemoryReservationStore,
  permitAllEntitlements,
} from './usage-gate.service';
export type {
  Reservation,
  BalanceProviderPort,
  ReservationStore,
  EntitlementPort,
  InMemoryBalanceProviderOptions,
  UsageGateOptions,
} from './usage-gate.service';

export { createUsageGateBudgetPort } from './agent-budget-adapter';
export type {
  SessionBudget,
  BudgetCheckPort,
  UsageGateBudgetPortOptions,
} from './agent-budget-adapter';

// ----------------------------------------------------------------------------
// CreditWallet + append-only ledger — the authoritative owner-scoped wallet
// ----------------------------------------------------------------------------
export { CreditWallet } from './credit-wallet.service';
export { DEFAULT_DAILY_ALLOWANCE } from './credit-wallet.service';
export { EARN_CREDIT_KINDS } from './credit-wallet.service';
export {
  OverageService,
  OVERAGE_DISABLED,
  overageDisabledPort,
  createOveragePolicyPort,
} from './overage-service';
export type {
  OveragePolicy,
  OverageServiceOptions,
  SetOverageArgs,
  OveragePolicyPort,
  OveragePolicyPortOptions,
} from './overage-service';
export type {
  CreditBucket,
  CreditKind,
  CreditBalance,
  OwnerRef,
  CreditWalletOptions,
  CreditArgs,
  DebitOptions,
  DebitResult,
  DailyAllowanceProvider,
  GrantDailyOptions,
} from './credit-wallet.service';

// ----------------------------------------------------------------------------
// Wallet-backed balance provider — wires UsageGate's BalanceProviderPort to the
// real CreditWallet (reads sum(ledger), settles via wallet.debit by actionKey).
// ----------------------------------------------------------------------------
export { createWalletBalanceProvider } from './wallet-balance-adapter';
export type { WalletBalanceProviderOptions } from './wallet-balance-adapter';

// ----------------------------------------------------------------------------
// PlanService — plan tiers, entitlements, and rate limits
// ----------------------------------------------------------------------------
export {
  PlanService,
  PLAN_CATALOG,
  DEFAULT_PLAN_TIER,
  InMemoryRateCounter,
  createPlanEntitlementPort,
  createPlanDailyAllowanceProvider,
} from './plan-service';
export type {
  PlanTier,
  SubscriptionStatus,
  RateLimit,
  PlanEntitlements,
  PlanDefinition,
  PlanOwnerRef,
  PlanSubscriptionRecord,
  ResolvedPlan,
  RateCounterStore,
  PlanServiceOptions,
  ChangePlanOptions,
  PlanEntitlementPortOptions,
} from './plan-service';

// ----------------------------------------------------------------------------
// PaymentProvider port + BillingService — provider-hosted checkout (no card
// data), signature-verified + at-most-once webhook application.
// ----------------------------------------------------------------------------
export { FakePaymentProvider } from './payment-provider.port';
export type {
  PaymentProvider,
  PaymentKind,
  CheckoutSessionInput,
  CheckoutHandle,
  PaymentEvent,
  PaymentEventType,
  SubscriptionAction,
  FakePaymentProviderOptions,
} from './payment-provider.port';

export { BillingService } from './billing-service';
export type {
  BillingOwnerRef,
  CreateCheckoutInput,
  CreateCheckoutResult,
  WebhookResult,
  BillingServiceOptions,
} from './billing-service';

// ----------------------------------------------------------------------------
// MarketplaceLedger — atomic in-credits purchase of a digital good with a
// platform commission split (buyer debit + seller earn + treasury commission,
// one transaction, idempotent by purchaseId).
// ----------------------------------------------------------------------------
export { MarketplaceLedger } from './marketplace-ledger';
export type {
  MarketplacePrisma,
  MarketplaceLedgerOptions,
  PurchaseInput,
  PurchaseResult,
} from './marketplace-ledger';
export type { TransactionRunner } from './tx';

// ----------------------------------------------------------------------------
// Payment rails — multi-provider top-up (Stripe / Razorpay-UPI / PayPal / crypto)
// behind the PaymentProvider port, env-configured and fail-closed.
// ----------------------------------------------------------------------------
export {
  ConfigurablePaymentProvider,
  PaymentProviderRegistry,
  createPaymentProvidersFromEnv,
  hmacSha256Verify,
  PAYMENT_RAIL_IDS,
} from './payment-providers';
export type {
  PaymentRailId,
  CheckoutSessionCreator,
  SignatureVerifier,
  ConfigurablePaymentProviderOptions,
  ConfigurableProvider,
  PaymentEnv,
  PaymentRailWiring,
} from './payment-providers';

// ----------------------------------------------------------------------------
// PayoutService — creator/owner withdrawals of EARNED credits to a payout rail
// (UPI / crypto / bank). No overdraw, purchased-only debit, daily limit,
// compliance hold, refund-on-failure.
// ----------------------------------------------------------------------------
export { PayoutService, FakePayoutRail } from './payout-service';
export type {
  PayoutMethod,
  PayoutStatus,
  PayoutRecord,
  PayoutRail,
  PayoutDispatchInput,
  PayoutDispatchResult,
  FakePayoutRailOptions,
  PayoutPrisma,
  PayoutServiceOptions,
} from './payout-service';
