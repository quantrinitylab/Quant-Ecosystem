'use client';
// ============================================================================
// quantube — monetization data hooks (Layer-5 read seam)
// ============================================================================
//
// The monetization dashboard used to render five hardcoded constants
// (MOCK_EARNINGS, MOCK_TIERS, MOCK_PAYOUT_HISTORY, MOCK_REVENUE_DATA,
// MOCK_SETTINGS) behind a `setTimeout` that imitated a network call, so it showed
// every creator the same invented figures — `adsRevenue: 4523.67`, a payout
// history of bank transfers that never happened. The backend it needed was
// already shipped and already proxied; nothing called it.
//
// These hooks bind the page to those existing endpoints, via `useApiQuery` like
// every other wired quantube surface (never an inline `fetch`):
//
//   GET /api/creator/earnings  -> { breakdown }  (MonetizationEngine.getEarnings)
//   GET /api/creator/tier      -> { tier, benefits }  (TierService)
//   GET /api/payouts           -> { payouts }    (PayoutService.getPayoutHistory)
//   GET /api/payouts/balance   -> { available }  (calculateAvailableBalance)
//
// The field names below are the ENGINE's (`@quant/creator-economy`
// `EarningsBreakdown`), not the page's old invented ones. The page previously
// displayed `memberships`/`superChats`/`merchShelf` and silently omitted
// `remixRoyalties` — a real revenue stream the engine tracks. Renaming the UI to
// the engine's vocabulary is what makes the total add up.
import { useApiQuery } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';

/** Mirrors `@quant/creator-economy` `EarningsBreakdown` exactly. */
export interface EarningsBreakdown {
  tips: number;
  iap: number;
  adRevenue: number;
  subscriptions: number;
  remixRoyalties: number;
  total: number;
}

export interface EarningsResponse {
  breakdown: EarningsBreakdown;
}

export interface TierResponse {
  tier: string;
  benefits: unknown;
}

/**
 * Mirrors `@quant/creator-economy` `PayoutRequest` as it crosses JSON:
 * `requestedAt` is a `Date` server-side and an ISO string on the wire.
 */
export interface PayoutRecord {
  id: string;
  creatorId: string;
  amount: number;
  method: string;
  status: string;
  requestedAt: string;
}

export interface PayoutsResponse {
  payouts: PayoutRecord[];
}

export interface BalanceResponse {
  available: number;
}

/** GET /api/creator/earnings — the caller's real earnings breakdown. */
export function useEarnings(options?: UseApiQueryOptions) {
  return useApiQuery<EarningsResponse>('/api/creator/earnings', options);
}

/** GET /api/creator/tier — the caller's current creator tier + benefits. */
export function useCreatorTier(options?: UseApiQueryOptions) {
  return useApiQuery<TierResponse>('/api/creator/tier', options);
}

/** GET /api/payouts — the caller's payout history. */
export function usePayoutHistory(options?: UseApiQueryOptions) {
  return useApiQuery<PayoutsResponse>('/api/payouts', options);
}

/** GET /api/payouts/balance — the caller's withdrawable balance. */
export function usePayoutBalance(options?: UseApiQueryOptions) {
  return useApiQuery<BalanceResponse>('/api/payouts/balance', options);
}

/** An all-zero breakdown, for first render and for a creator with no events. */
export const EMPTY_EARNINGS: EarningsBreakdown = {
  tips: 0,
  iap: 0,
  adRevenue: 0,
  subscriptions: 0,
  remixRoyalties: 0,
  total: 0,
};
