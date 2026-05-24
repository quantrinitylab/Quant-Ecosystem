// ============================================================================
// Database Schema - Ads (QuantAds)
// ============================================================================

/** Ad campaign schema */
export interface CampaignSchema {
  id: string;
  advertiserId: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget: Budget;
  schedule: CampaignSchedule;
  targeting: TargetingConfig;
  adSets: string[];
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Campaign objectives */
export type CampaignObjective =
  | 'awareness'
  | 'reach'
  | 'traffic'
  | 'engagement'
  | 'app_install'
  | 'video_views'
  | 'lead_generation'
  | 'conversions'
  | 'catalog_sales';

/** Campaign status */
export type CampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected';

/** Budget configuration */
export interface Budget {
  type: 'daily' | 'lifetime';
  amount: number;
  currency: string;
  bidStrategy: 'lowest_cost' | 'target_cost' | 'bid_cap';
  bidAmount: number | null;
}

/** Campaign schedule */
export interface CampaignSchedule {
  startDate: string;
  endDate: string | null;
  timezone: string;
  dayParting: DayPartSchedule[] | null;
}

/** Day parting schedule */
export interface DayPartSchedule {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  startHour: number;
  endHour: number;
}

/** Targeting configuration */
export interface TargetingConfig {
  ageRange: { min: number; max: number };
  genders: ('male' | 'female' | 'other' | 'all')[];
  locations: LocationTarget[];
  languages: string[];
  interests: string[];
  behaviors: string[];
  devices: ('mobile' | 'desktop' | 'tablet')[];
  platforms: string[];
  customAudiences: string[];
  excludedAudiences: string[];
}

/** Location targeting */
export interface LocationTarget {
  type: 'country' | 'state' | 'city' | 'zip' | 'radius';
  value: string;
  radius: number | null;
  unit: 'km' | 'mi' | null;
}

/** Ad creative schema */
export interface AdCreativeSchema {
  id: string;
  campaignId: string;
  name: string;
  type: AdCreativeType;
  format: AdFormat;
  headline: string;
  description: string;
  callToAction: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  landingUrl: string;
  displayUrl: string;
  trackingPixels: string[];
  status: 'draft' | 'active' | 'paused' | 'rejected';
  rejectionReason: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  createdAt: string;
  updatedAt: string;
}

/** Ad creative types */
export type AdCreativeType = 'image' | 'video' | 'carousel' | 'story' | 'native' | 'text';

/** Ad formats for placement */
export type AdFormat = 'feed' | 'story' | 'sidebar' | 'banner' | 'interstitial' | 'rewarded' | 'native';

/** Ad impression tracking */
export interface AdImpressionSchema {
  id: string;
  adId: string;
  campaignId: string;
  userId: string | null;
  sessionId: string;
  placement: string;
  platform: string;
  device: string;
  cost: number;
  createdAt: string;
}

/** Ad click tracking */
export interface AdClickSchema {
  id: string;
  adId: string;
  campaignId: string;
  impressionId: string;
  userId: string | null;
  sessionId: string;
  landingUrl: string;
  cost: number;
  createdAt: string;
}

/** Advertiser account */
export interface AdvertiserSchema {
  id: string;
  userId: string;
  companyName: string;
  industry: string;
  website: string;
  billingEmail: string;
  paymentMethodId: string | null;
  balance: number;
  totalSpend: number;
  status: 'active' | 'suspended' | 'pending_verification';
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CAMPAIGNS_TABLE = {
  tableName: 'campaigns',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'advertiser_id', type: 'UUID', nullable: false, references: 'advertisers(id)' },
    { name: 'name', type: 'VARCHAR(200)', nullable: false },
    { name: 'objective', type: 'VARCHAR(30)', nullable: false },
    { name: 'status', type: "VARCHAR(20) DEFAULT 'draft'", nullable: false },
    { name: 'budget', type: 'JSONB', nullable: false },
    { name: 'schedule', type: 'JSONB', nullable: false },
    { name: 'targeting', type: 'JSONB', nullable: false },
    { name: 'total_spend', type: 'DECIMAL(12,2) DEFAULT 0', nullable: false },
    { name: 'total_impressions', type: 'BIGINT DEFAULT 0', nullable: false },
    { name: 'total_clicks', type: 'BIGINT DEFAULT 0', nullable: false },
    { name: 'total_conversions', type: 'BIGINT DEFAULT 0', nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: true },
  ],
  indexes: [
    { name: 'idx_campaigns_advertiser', columns: ['advertiser_id'] },
    { name: 'idx_campaigns_status', columns: ['status'] },
    { name: 'idx_campaigns_objective', columns: ['objective'] },
  ],
} as const;
