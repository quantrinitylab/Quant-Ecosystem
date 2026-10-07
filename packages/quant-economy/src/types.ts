export type TransactionDirection = 'credit' | 'debit';

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  direction: TransactionDirection;
  reason: string;
  idempotencyKey: string;
  timestamp: Date;
}

export interface Wallet {
  userId: string;
  balance: number;
  createdAt: Date;
}

export type GoodCategory =
  | 'avatar_item'
  | 'outfit'
  | 'skin'
  | 'chat_theme'
  | 'sticker_pack'
  | 'gift_item';

export interface VirtualGood {
  id: string;
  name: string;
  description: string;
  category: GoodCategory;
  priceCoins: number;
  crossApp: boolean;
}

export interface InventoryItem {
  userId: string;
  itemId: string;
  grantedAt: Date;
}

export type ListingType = 'virtual_good' | 'game_pass';

export interface CreatorListing {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: ListingType;
  priceCoins: number;
  active: boolean;
  createdAt: Date;
}

export interface RevenueSplit {
  creatorAmount: number;
  platformAmount: number;
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PayoutRequest {
  id: string;
  creatorId: string;
  amount: number;
  method: string;
  status: PayoutStatus;
  requestedAt: Date;
  processedAt?: Date;
}

export interface BoostPack {
  id: string;
  name: string;
  multiplier: number;
  costCoins: number;
}

export interface BoostRequest {
  id: string;
  userId: string;
  postId: string;
  packId: string;
  multiplier: number;
  sponsored: false;
  createdAt: Date;
}

export interface BoostAnalytics {
  boostId: string;
  impressions: number;
  reachMultiplier: number;
  organicReach: number;
}

export type BillingModel = 'CPM' | 'CPC';

export interface AdCampaign {
  id: string;
  advertiserId: string;
  budget: number;
  spent: number;
  billingModel: BillingModel;
  targetingCriteria: Record<string, string>;
  sponsored: true;
  status: 'active' | 'paused' | 'exhausted';
  createdAt: Date;
}

export interface AdImpression {
  campaignId: string;
  userId: string;
  timestamp: Date;
}

export interface AdClick {
  campaignId: string;
  userId: string;
  timestamp: Date;
}

export interface Gift {
  id: string;
  fromUserId: string;
  toUserId: string;
  itemId: string;
  status: 'pending' | 'accepted';
  createdAt: Date;
}

export interface Tip {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: Date;
}

export type SubscriptionTier = 'Free' | 'Pro' | 'ProPlus' | 'Family';

export interface Subscription {
  userId: string;
  tier: SubscriptionTier;
  startDate: Date;
  familyMembers?: string[];
  active: boolean;
}

export interface Entitlement {
  feature: string;
  requiredTier: SubscriptionTier;
}

export interface PaymentGatewayAdapter {
  createOrder(amount: number, currency: string): Promise<{ orderId: string }>;
  verifyPayment(orderId: string, paymentRef: string): Promise<boolean>;
}

export interface RazorpayAdapter extends PaymentGatewayAdapter {
  provider: 'razorpay';
}

export interface StripeAdapter extends PaymentGatewayAdapter {
  provider: 'stripe';
}

export interface UPIAdapter extends PaymentGatewayAdapter {
  provider: 'upi';
}
