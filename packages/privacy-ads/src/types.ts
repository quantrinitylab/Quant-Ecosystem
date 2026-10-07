// ============================================================================
// Privacy-First Ad Targeting - Type Definitions
// On-device interest model, contextual ads, behavioral opt-in, ad disclosure
// ============================================================================

/** Targeting mode for ad selection */
export type TargetingMode = 'contextual' | 'behavioral';

/** Brand safety content categories */
export type BrandSafetyCategory =
  | 'safe'
  | 'adult'
  | 'violence'
  | 'hate_speech'
  | 'gambling'
  | 'drugs'
  | 'weapons'
  | 'political'
  | 'controversial'
  | 'misinformation';

/** Content classification result */
export interface ContentClassification {
  content: string;
  categories: BrandSafetyCategory[];
  confidence: number;
  classifiedAt: number;
}

/** Individual interest signal tracked on-device only */
export interface InterestSignal {
  category: string;
  weight: number;
  lastSeen: number;
  decayRate: number;
}

/** On-device interest model (never leaves the device) */
export interface OnDeviceInterestModel {
  userId: string;
  interests: InterestSignal[];
  lastDecay: number;
}

/** Candidate ad for ranking */
export interface CandidateAd {
  id: string;
  campaignId: string;
  creativeUrl: string;
  headline: string;
  description: string;
  callToAction: string;
  landingUrl: string;
  contextCategories: string[];
  brandSafetyCategories: BrandSafetyCategory[];
  bidAmount: number;
}

/** Ranked ad with score and position */
export interface RankedAd extends CandidateAd {
  score: number;
  rank: number;
}

/** Disclosure signal explaining why an ad was shown */
export interface DisclosureSignal {
  type: string;
  explanation: string;
}

/** Ad disclosure for transparency */
export interface AdDisclosure {
  adId: string;
  targetingMode: TargetingMode;
  signals: DisclosureSignal[];
}

/** Aggregate feedback signal (no user features, only action) */
export interface AggregateFeedback {
  adId: string;
  action: 'clicked' | 'dismissed';
  timestamp: number;
  /** Categories of the ad that was interacted with, used to update only matched interests */
  contextCategories?: string[];
}

/** Privacy configuration for ad serving */
export interface PrivacyConfig {
  blockThirdPartyCookies: boolean;
  blockTrackingPixels: boolean;
  strictCSP: boolean;
}

/** Brand safety configuration */
export interface BrandSafetyConfig {
  blockedCategories: BrandSafetyCategory[];
  minimumConfidence: number;
  strictMode: boolean;
}
