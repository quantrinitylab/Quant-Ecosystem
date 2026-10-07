// ============================================================================
// QuantAds Types
// Ecosystem-wide advertising platform
// ============================================================================

// --- Campaigns ---

export type CampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected';
export type CampaignObjective = 'awareness' | 'reach' | 'traffic' | 'engagement' | 'app_installs' | 'video_views' | 'lead_generation' | 'conversions' | 'catalog_sales';

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget: Budget;
  schedule: Schedule;
  targeting: TargetingConfig;
  creatives: Creative[];
  placements: Placement[];
  abTests: ABTest[];
  metrics: CampaignMetrics;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export interface Budget {
  type: 'daily' | 'lifetime';
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  bidStrategy: 'lowest_cost' | 'target_cost' | 'bid_cap' | 'cost_cap';
  bidAmount?: number;
  spendingLimit?: number;
}

export interface Schedule {
  startDate: string;
  endDate?: string;
  timezone: string;
  dayParting?: { days: number[]; hours: { start: number; end: number }[] };
  isEvergreen: boolean;
}

// --- Creatives ---

export type CreativeFormat = 'image' | 'video' | 'carousel' | 'interactive' | 'native' | 'text';

export interface Creative {
  id: string;
  campaignId: string;
  name: string;
  format: CreativeFormat;
  headline: string;
  description: string;
  callToAction: string;
  destinationUrl: string;
  assets: CreativeAsset[];
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  performance: CreativePerformance;
  createdAt: string;
}

export interface CreativeAsset {
  id: string;
  type: 'image' | 'video' | 'html';
  url: string;
  width: number;
  height: number;
  duration?: number;
  fileSize: number;
  mimeType: string;
}

export interface CreativePerformance {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  spend: number;
  qualityScore: number;
}

// --- Targeting ---

export interface TargetingConfig {
  demographics: DemographicTarget;
  interests: string[];
  behaviors: string[];
  locations: LocationTarget[];
  devices: DeviceTarget;
  custom: CustomAudience[];
  lookalike?: LookalikeAudience;
  retargeting?: RetargetingConfig;
  exclusions: string[];
}

export interface DemographicTarget {
  ageMin: number;
  ageMax: number;
  genders: ('male' | 'female' | 'other' | 'all')[];
  languages: string[];
  educationLevels: string[];
  incomeRanges: string[];
}

export interface LocationTarget {
  type: 'country' | 'region' | 'city' | 'radius';
  value: string;
  radius?: number;
  radiusUnit?: 'km' | 'mi';
  latitude?: number;
  longitude?: number;
}

export interface DeviceTarget {
  platforms: ('ios' | 'android' | 'web' | 'desktop')[];
  osVersions: string[];
  deviceTypes: ('mobile' | 'tablet' | 'desktop')[];
  connectionTypes: ('wifi' | 'cellular' | 'all')[];
}

export interface CustomAudience {
  id: string;
  name: string;
  size: number;
  source: 'upload' | 'pixel' | 'engagement' | 'app_activity';
  createdAt: string;
}

export interface LookalikeAudience {
  sourceAudienceId: string;
  size: number; // percentage 1-10
  country: string;
}

export interface RetargetingConfig {
  pixelId: string;
  events: string[];
  lookbackDays: number;
  exclusionDays?: number;
}

// --- Bidding ---

export type BidModel = 'cpm' | 'cpc' | 'cpa' | 'cpv' | 'cpi';

export interface BidRequest {
  id: string;
  impressionId: string;
  userId: string;
  placement: Placement;
  userProfile: UserAdProfile;
  timestamp: number;
  floorPrice: number;
}

export interface BidResponse {
  bidId: string;
  requestId: string;
  campaignId: string;
  creativeId: string;
  bidAmount: number;
  bidModel: BidModel;
  winProbability: number;
}

export interface AuctionResult {
  winnerId: string;
  winningBid: number;
  secondPrice: number;
  clearingPrice: number;
  participants: number;
  latencyMs: number;
}

export interface UserAdProfile {
  userId: string;
  demographics: { age?: number; gender?: string; location?: string };
  interests: string[];
  recentActivity: string[];
  engagementRate: number;
  deviceInfo: { platform: string; deviceType: string };
}

// --- Placements ---

export type AppPlacement = 'quantsync' | 'quantchat' | 'quantube' | 'quantneon' | 'quantmax' | 'quantai' | 'quantmail' | 'quantedits' | 'quantads';

export interface Placement {
  id: string;
  app: AppPlacement;
  position: 'feed' | 'sidebar' | 'header' | 'interstitial' | 'native' | 'stories' | 'pre-roll' | 'mid-roll' | 'post-roll' | 'banner';
  format: CreativeFormat[];
  dimensions: { width: number; height: number };
  floor_cpm: number;
  fillRate: number;
}

// --- Analytics ---

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionRate: number;
  spend: number;
  cpm: number;
  cpc: number;
  cpa: number;
  roas: number;
  reach: number;
  frequency: number;
  videoViews?: number;
  videoCompletionRate?: number;
}

export interface AnalyticsReport {
  id: string;
  campaignId: string;
  dateRange: { start: string; end: string };
  granularity: 'hour' | 'day' | 'week' | 'month';
  metrics: CampaignMetrics;
  breakdowns: AnalyticsBreakdown[];
  attribution: AttributionData;
  generatedAt: string;
}

export interface AnalyticsBreakdown {
  dimension: 'placement' | 'creative' | 'audience' | 'device' | 'location' | 'time';
  data: { key: string; metrics: CampaignMetrics }[];
}

export interface AttributionData {
  model: 'last_click' | 'first_click' | 'linear' | 'time_decay' | 'data_driven';
  touchpoints: { channel: string; conversions: number; revenue: number }[];
  assistedConversions: number;
}

// --- Billing ---

export interface Invoice {
  id: string;
  advertiserId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'overdue' | 'refunded';
  periodStart: string;
  periodEnd: string;
  lineItems: { description: string; amount: number; campaignId?: string }[];
  dueDate: string;
  paidAt?: string;
}

export interface PaymentMethod {
  id: string;
  type: 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal';
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

// --- A/B Testing ---

export interface ABTest {
  id: string;
  campaignId: string;
  name: string;
  variants: ABVariant[];
  status: 'running' | 'completed' | 'paused';
  winnerVariantId?: string;
  confidence: number;
  startedAt: string;
  completedAt?: string;
}

export interface ABVariant {
  id: string;
  name: string;
  creativeId: string;
  weight: number; // percentage of traffic
  metrics: CampaignMetrics;
}

// --- Policies ---

export type PolicyStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface PolicyReview {
  id: string;
  creativeId: string;
  campaignId: string;
  status: PolicyStatus;
  reviewerId?: string;
  violations: PolicyViolation[];
  submittedAt: string;
  reviewedAt?: string;
  notes?: string;
}

export interface PolicyViolation {
  ruleId: string;
  ruleName: string;
  severity: 'warning' | 'minor' | 'major' | 'critical';
  description: string;
}

// --- API Response ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; statusCode: number };
  meta?: { page?: number; limit?: number; total?: number; cursor?: string };
}
