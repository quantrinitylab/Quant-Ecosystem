import { z } from 'zod';

export const CreatorTierSchema = z.enum(['free', 'starter', 'pro', 'enterprise']);
export type CreatorTier = z.infer<typeof CreatorTierSchema>;

export const PayoutMethodSchema = z.enum(['bank_transfer', 'paypal', 'crypto', 'quant_credits']);
export type PayoutMethod = z.infer<typeof PayoutMethodSchema>;

export const PayoutStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const PartnershipStatusSchema = z.enum([
  'proposed',
  'negotiating',
  'active',
  'completed',
  'cancelled',
]);
export type PartnershipStatus = z.infer<typeof PartnershipStatusSchema>;

export const MonetizationEventTypeSchema = z.enum([
  'tip',
  'iap',
  'ad_revenue',
  'subscription',
  'remix_royalty',
]);
export type MonetizationEventType = z.infer<typeof MonetizationEventTypeSchema>;

export const CreatorProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tier: CreatorTierSchema,
  earnings: z.number().min(0),
  payoutInfo: z.record(z.string()),
  verified: z.boolean(),
  createdAt: z.date(),
});
export type CreatorProfile = z.infer<typeof CreatorProfileSchema>;

export const MonetizationEventSchema = z.object({
  id: z.string(),
  type: MonetizationEventTypeSchema,
  amount: z.number().min(0),
  currency: z.string(),
  creatorId: z.string(),
  sourceId: z.string(),
  timestamp: z.date(),
});
export type MonetizationEvent = z.infer<typeof MonetizationEventSchema>;

export const PayoutRequestSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  amount: z.number().positive(),
  method: PayoutMethodSchema,
  status: PayoutStatusSchema,
  requestedAt: z.date(),
});
export type PayoutRequest = z.infer<typeof PayoutRequestSchema>;

export const BrandPartnershipSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  brandId: z.string(),
  terms: z.string(),
  status: PartnershipStatusSchema,
  dealValue: z.number().min(0),
  startDate: z.date(),
  endDate: z.date(),
});
export type BrandPartnership = z.infer<typeof BrandPartnershipSchema>;

export const AdRevenueShareSchema = z.object({
  creatorShare: z.number().min(0).max(1),
  platformShare: z.number().min(0).max(1),
  adId: z.string(),
  impressions: z.number().int().min(0),
  earnings: z.number().min(0),
});
export type AdRevenueShare = z.infer<typeof AdRevenueShareSchema>;

export const RemixRoyaltySchema = z.object({
  originalCreatorId: z.string(),
  remixerId: z.string(),
  originalContentId: z.string(),
  remixContentId: z.string(),
  royaltyPercent: z.number().min(0).max(100),
  earned: z.number().min(0),
});
export type RemixRoyalty = z.infer<typeof RemixRoyaltySchema>;

export interface EarningsBreakdown {
  tips: number;
  iap: number;
  adRevenue: number;
  subscriptions: number;
  remixRoyalties: number;
  total: number;
}

export interface DashboardOverview {
  creatorId: string;
  tier: CreatorTier;
  totalEarnings: number;
  availableBalance: number;
  pendingPayouts: number;
  activePartnerships: number;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'earn' | 'spend' | 'transfer_in' | 'transfer_out';
  source: string;
  timestamp: Date;
}

export interface TierBenefits {
  tier: CreatorTier;
  revenueShare: number;
  maxPayoutPerMonth: number;
  brandPartnerships: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}
