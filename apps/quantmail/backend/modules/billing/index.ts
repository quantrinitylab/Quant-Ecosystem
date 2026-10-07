// ============================================================================
// Billing module — compat shim over the extracted @quant/credits package.
// quantmail-superhub
// ============================================================================
//
// The credit subsystem (PricingEngine, UsageGate, CreditWallet, OverageService,
// PlanService, BillingService, the PaymentProvider port, and adapters) was
// extracted into the app-agnostic `@quant/credits` package so every app in the
// ecosystem reads/writes the same durable wallet. This barrel re-exports that
// package unchanged so quantmail's existing imports (`../modules/billing`) keep
// working. New code should import from `@quant/credits` directly.

export * from '@quant/credits';
