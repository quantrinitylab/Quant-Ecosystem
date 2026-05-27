import {
  ContextualTargetingService,
  PrivacyEnforcerService,
  AdDisclosureService,
} from '@quant/privacy-ads';
import type { CandidateAd, AdDisclosure, AggregateFeedback } from '@quant/privacy-ads';

const CATEGORY_POOL = [
  'technology',
  'finance',
  'health',
  'sports',
  'entertainment',
  'travel',
  'food',
  'fashion',
  'automotive',
  'education',
  'gaming',
  'music',
  'news',
  'science',
  'business',
];

/**
 * PrivacyAdServingService - Serves ad candidates for on-device ranking.
 *
 * CRITICAL: Response payloads NEVER include user profile data, interests,
 * browsing history, or any personally identifiable information.
 * Only contextual signals derived from the current page are used.
 */
export class PrivacyAdServingService {
  private contextualService: ContextualTargetingService;
  private privacyEnforcer: PrivacyEnforcerService;
  private disclosureService: AdDisclosureService;
  private feedbackStore: AggregateFeedback[] = [];

  constructor() {
    this.contextualService = new ContextualTargetingService();
    this.privacyEnforcer = new PrivacyEnforcerService();
    this.disclosureService = new AdDisclosureService();
  }

  /**
   * Get ~50 candidate ads for on-device ranking.
   * Response contains ONLY ad creative data and contextual categories.
   * NO user profile, NO interest model, NO browsing history.
   */
  getCandidates(params: {
    placement: string;
    pageContent?: string;
    targetingMode: 'contextual' | 'behavioral';
  }): CandidateAd[] {
    const candidates = this.generateCandidatePool(50);

    // If page content is provided and mode is contextual, apply contextual matching
    if (params.pageContent && params.targetingMode === 'contextual') {
      const signals = this.contextualService.extractContentSignals(params.pageContent);
      const matched = this.contextualService.matchAdsByContext(signals, candidates);

      // If we have contextual matches, prioritize them but fill to ~50
      if (matched.length > 0) {
        const remaining = candidates.filter((c) => !matched.some((m) => m.id === c.id));
        const result = [...matched, ...remaining].slice(0, 50);
        this.validateResponse(result);
        return result;
      }
    }

    this.validateResponse(candidates);
    return candidates;
  }

  /**
   * Record aggregate feedback signal.
   * Accepts ONLY { adId, action } - never user features or profile data.
   */
  recordFeedback(feedback: { adId: string; action: 'clicked' | 'dismissed' }): void {
    this.feedbackStore.push({
      adId: feedback.adId,
      action: feedback.action,
      timestamp: Date.now(),
    });
  }

  /**
   * Get ad disclosure ("why this ad") for a specific ad.
   * Always returns 1-2 signals explaining why the ad was shown.
   */
  getDisclosure(adId: string): AdDisclosure {
    const ad: CandidateAd = {
      id: adId,
      campaignId: `campaign-${adId}`,
      creativeUrl: `https://cdn.quantads.io/creatives/${adId}.webp`,
      headline: 'Sponsored Content',
      description: 'Privacy-first ad placement',
      callToAction: 'Learn More',
      landingUrl: `https://advertiser.example.com/${adId}`,
      contextCategories: ['technology', 'business'],
      brandSafetyCategories: ['safe'],
      bidAmount: 1.5,
    };

    return this.disclosureService.generateDisclosure(ad, 'contextual', ['technology', 'business']);
  }

  /**
   * Generate a pool of candidate ads (mock data for the ad marketplace).
   */
  private generateCandidatePool(count: number): CandidateAd[] {
    const candidates: CandidateAd[] = [];

    for (let i = 0; i < count; i++) {
      const categoryIndex = i % CATEGORY_POOL.length;
      const secondaryIndex = (i + 3) % CATEGORY_POOL.length;
      const primaryCategory = CATEGORY_POOL[categoryIndex] ?? 'general';
      const secondaryCategory = CATEGORY_POOL[secondaryIndex] ?? 'general';

      candidates.push({
        id: `ad-${i.toString().padStart(4, '0')}`,
        campaignId: `campaign-${Math.floor(i / 5)}`,
        creativeUrl: `https://cdn.quantads.io/creatives/ad-${i}.webp`,
        headline: `Ad Creative ${i}`,
        description: `Privacy-first ad for ${primaryCategory}`,
        callToAction: 'Learn More',
        landingUrl: `https://advertiser-${Math.floor(i / 5)}.example.com`,
        contextCategories: [primaryCategory, secondaryCategory],
        brandSafetyCategories: ['safe'],
        bidAmount: 0.5 + (i % 10) * 0.25,
      });
    }

    return candidates;
  }

  /**
   * Validate outgoing response via PrivacyEnforcerService.
   * Ensures no tracking payloads are included in the response.
   */
  private validateResponse(candidates: CandidateAd[]): void {
    const audit = this.privacyEnforcer.auditAdResponse(candidates);
    if (!audit.clean) {
      throw new Error(`Privacy violation in ad response: ${audit.issues.join(', ')}`);
    }
  }
}
