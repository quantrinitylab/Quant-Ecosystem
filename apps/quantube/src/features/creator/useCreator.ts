// ============================================================================
// quantube — creator-economy api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantube UI surface to the
// creator-economy engine: typed react-query hooks over the same-origin Next
// proxy paths under `/api/creator/*` (never inline fetch — Requirement 1.4). The
// proxy forwards the bearer + x-request-id to the backend (Layer 4), which
// reaches the decorated `@quant/creator-economy` engine (Layer 2/3, wired AS-IS
// per Req 9.1). These cover the NON-PAYMENT surfaces; payout hooks arrive with
// the payments wiring in Task 13.2.
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  CreditsResponse,
  DashboardOverviewResponse,
  EarnCreditsInput,
  EarnCreditsResponse,
  EarningsResponse,
  RecordTipInput,
  RecordTipResponse,
  TierResponse,
  UpgradeTierInput,
  UpgradeTierResponse,
} from './types';

/** GET /api/creator/dashboard — the caller's creator dashboard overview. */
export function useCreatorDashboard(options?: UseApiQueryOptions) {
  return useApiQuery<DashboardOverviewResponse>('/api/creator/dashboard', options);
}

/** GET /api/creator/earnings — the caller's earnings breakdown. */
export function useCreatorEarnings(options?: UseApiQueryOptions) {
  return useApiQuery<EarningsResponse>('/api/creator/earnings', options);
}

/** GET /api/creator/tier — the caller's current tier + benefits. */
export function useCreatorTier(options?: UseApiQueryOptions) {
  return useApiQuery<TierResponse>('/api/creator/tier', options);
}

/** POST /api/creator/tier/upgrade — upgrade the caller's creator tier. */
export function useUpgradeTier() {
  return useApiMutation<UpgradeTierInput, UpgradeTierResponse>('/api/creator/tier/upgrade');
}

/** POST /api/creator/monetization/tip — record a tip to a creator. */
export function useRecordTip() {
  return useApiMutation<RecordTipInput, RecordTipResponse>('/api/creator/monetization/tip');
}

/** GET /api/creator/credits — the caller's credit balance + history. */
export function useCreatorCredits(options?: UseApiQueryOptions) {
  return useApiQuery<CreditsResponse>('/api/creator/credits', options);
}

/** POST /api/creator/credits/earn — credit the caller's ledger. */
export function useEarnCredits() {
  return useApiMutation<EarnCreditsInput, EarnCreditsResponse>('/api/creator/credits/earn');
}
