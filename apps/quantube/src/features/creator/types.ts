// ============================================================================
// quantube — creator-economy surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing shapes for the creator-economy api-client hooks. Mirror the
// JSON the quantube backend routes return (apps/quantube/backend/routes/creator
// .ts), wrapping the NON-PAYMENT subset of `@quant/creator-economy`
// (dashboard/earnings/tiers/monetization-recording/credits). Payment-dependent
// payout surfaces are deferred to Task 13.2. Typed against the
// `{ success, data }` envelope via `APIResponse<T>`.

export type CreatorTierName = 'free' | 'starter' | 'pro' | 'enterprise';

export interface DashboardOverviewResponse {
  overview: {
    creatorId: string;
    tier: string;
    totalEarnings: number;
    availableBalance: number;
    pendingPayouts: number;
    activePartnerships: number;
  };
}

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

export interface TierBenefits {
  tier: CreatorTierName;
  revenueShare: number;
  maxPayoutPerMonth: number;
  brandPartnerships: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}

export interface TierResponse {
  tier: CreatorTierName;
  benefits: TierBenefits;
}

export interface UpgradeTierInput {
  tier: CreatorTierName;
}

export interface UpgradeTierResponse {
  tier: CreatorTierName;
}

export interface RecordTipInput {
  toCreator: string;
  amount: number;
}

export interface MonetizationEventDTO {
  id: string;
  type: string;
  amount: number;
  currency: string;
  creatorId: string;
  sourceId: string;
  timestamp: string;
}

export interface RecordTipResponse {
  event: MonetizationEventDTO;
}

export interface CreditTransactionDTO {
  id: string;
  userId: string;
  amount: number;
  type: string;
  source: string;
  timestamp: string;
}

export interface CreditsResponse {
  balance: number;
  transactions: CreditTransactionDTO[];
}

export interface EarnCreditsInput {
  amount: number;
  source: string;
}

export interface EarnCreditsResponse {
  transaction: CreditTransactionDTO;
}
