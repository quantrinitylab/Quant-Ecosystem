// ============================================================================
// quantube — payments + payout feature barrel (Layer 5, Task 13.2)
// ============================================================================
//
// Single import point for UI surfaces consuming the `@quant/payments` Stripe
// gateway and the `@quant/creator-economy` payout money rails. Every export is
// an `@quant/api-client` hook backed by a same-origin `/api/payments/*` or
// `/api/payouts/*` proxy — the sanctioned, inline-fetch-free call path
// (Requirement 1.4).

export * from './types';
export * from './usePayments';
