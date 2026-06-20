// ============================================================================
// Billing module — credit metering hook (PricingEngine + CreditMeter/UsageGate)
// quantmail-superhub · Task 13.1 (Requirements 18.1, 18.5)
// ============================================================================
//
// PURPOSE
//   The ecosystem-wide credit-metering CHOKE POINT, introduced early (alongside
//   the Phase-4 agent layer) per the design's metering-placement note. It packs
//   two cohesive pieces:
//
//     • PricingEngine   — maps a cost driver (AI tokens, message, query, CI
//       minute, storage, agent-org run) to a credit cost, deriving the
//       AI-inference rate from the `@quant/ai` cost tracker (tokens -> $ ->
//       credits).
//     • CreditMeter / UsageGate — the single point every metered action passes
//       through: estimate -> checkAndReserve (fail closed, idempotent by
//       actionKey) -> settle (idempotent). Backed by injectable seams
//       (BalanceProviderPort, ReservationStore, EntitlementPort) whose in-memory
//       defaults stand in until Phase 7 lands the real CreditWallet + ledger,
//       plans, and payments.
//
//   It also exposes a UsageGate-backed BudgetPort adapter so the Agent Runtime
//   (Pillar 3) reserves/checks credits before an agent session runs AI
//   inference.
//
// MODULE BOUNDARY
//   This is an infrastructure module (like `modules/code`). It does NOT import
//   the mail domain or QuantChat. Consumers (e.g. the agent module) import it
//   only via this barrel.

export {
  PricingEngine,
  createModelRouterCostEstimator,
  fallbackAiCostEstimator,
  DEFAULT_CREDITS_PER_USD,
} from './services/pricing-engine.service';
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
} from './services/pricing-engine.service';

export {
  UsageGate,
  InMemoryBalanceProvider,
  InMemoryReservationStore,
  permitAllEntitlements,
} from './services/usage-gate.service';
export type {
  Reservation,
  BalanceProviderPort,
  ReservationStore,
  EntitlementPort,
  InMemoryBalanceProviderOptions,
  UsageGateOptions,
} from './services/usage-gate.service';

export { createUsageGateBudgetPort } from './services/agent-budget-adapter';
export type {
  SessionBudget,
  BudgetCheckPort,
  UsageGateBudgetPortOptions,
} from './services/agent-budget-adapter';

// ----------------------------------------------------------------------------
// CreditWallet + append-only ledger (Phase 7) — Task 25.1 (Requirements 16.1-16.5)
// The authoritative, owner-scoped wallet whose balance is DERIVED as the sum of
// an immutable CreditLedgerEntry ledger. This is the real backing the early
// metering hook's BalanceProviderPort is swapped for in later Phase-7 tasks.
// ----------------------------------------------------------------------------
export { CreditWallet } from './services/credit-wallet.service';
export { DEFAULT_DAILY_ALLOWANCE } from './services/credit-wallet.service';
export { EARN_CREDIT_KINDS } from './services/credit-wallet.service';
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
} from './services/credit-wallet.service';

// ----------------------------------------------------------------------------
// Wallet-backed balance provider (Phase 7) — Task 27.1 (Requirements 18.1, 18.2,
// 18.6, 18.7). Wires the UsageGate's BalanceProviderPort to the real
// CreditWallet: reads sum(ledger) and settles via wallet.debit keyed by the
// reservation actionKey (idempotent, fixed consumption order, fail closed).
// ----------------------------------------------------------------------------
export { createWalletBalanceProvider } from './services/wallet-balance-adapter';
export type { WalletBalanceProviderOptions } from './services/wallet-balance-adapter';

// ----------------------------------------------------------------------------
// PlanService — plan tiers, entitlements, and rate limits (Phase 7) —
// Task 28.1 (Requirements 19.1, 19.2, 19.3, 19.4). Resolves the active
// Plan_Tier's entitlements (daily allowance, monthly included credits, rate
// limits, unlocked models/features), rejects rate-limit/feature-locked actions
// with upgrade-required, applies plan changes at the effective boundary, and
// enforces at most one active/trialing subscription per owner. The adapter
// factories feed it into the UsageGate (EntitlementPort) and CreditWallet
// (DailyAllowanceProvider) seams.
// ----------------------------------------------------------------------------
export {
  PlanService,
  PLAN_CATALOG,
  DEFAULT_PLAN_TIER,
  InMemoryRateCounter,
  createPlanEntitlementPort,
  createPlanDailyAllowanceProvider,
} from './services/plan-service';
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
} from './services/plan-service';

// ----------------------------------------------------------------------------
// PaymentProvider port + BillingService (Phase 7) — Task 29.1 (Requirements
// 20.1, 20.2, 20.3, 20.4, 20.5). The vendor-neutral payment port (with a
// deterministic fake provider for tests) and the BillingService that wraps it:
// provider-hosted checkout (no card data), signature-verified + at-most-once
// webhook application, idempotent credit grants / subscription activation, and
// subscription upgrade/downgrade/cancel/resume applied via PlanService at the
// effective boundary.
// ----------------------------------------------------------------------------
export { FakePaymentProvider } from './services/payment-provider.port';
export type {
  PaymentProvider,
  PaymentKind,
  CheckoutSessionInput,
  CheckoutHandle,
  PaymentEvent,
  PaymentEventType,
  SubscriptionAction,
  FakePaymentProviderOptions,
} from './services/payment-provider.port';

export { BillingService } from './services/billing-service';
export type {
  BillingOwnerRef,
  CreateCheckoutInput,
  CreateCheckoutResult,
  WebhookResult,
  BillingServiceOptions,
} from './services/billing-service';
