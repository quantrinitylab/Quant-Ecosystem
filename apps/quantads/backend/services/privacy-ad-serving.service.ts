import {
  ContextualTargetingService,
  PrivacyEnforcerService,
  AdDisclosureService,
} from '@quant/privacy-ads';
import type { CandidateAd, AdDisclosure, AggregateFeedback } from '@quant/privacy-ads';
import type { PrismaClient } from '../types';

/**
 * PrivacyAdServingService - Serves ad candidates for on-device ranking.
 *
 * CRITICAL: Response payloads NEVER include user profile data, interests,
 * browsing history, or any personally identifiable information.
 * Only contextual signals derived from the current page are used.
 *
 * HONESTY NOTE: candidates used to be synthesized by `generateCandidatePool`,
 * which fabricated a synthetic ad marketplace (fake headlines "Ad Creative N",
 * fake `advertiser-N.example.com` URLs, formula bid amounts) and fed it into
 * the live `/candidates` serving path as if it were real inventory. The pool
 * now comes from the real campaign/ad inventory (active ad -> active adSet ->
 * active, non-deleted campaign, exactly like `AdServingService`), and the
 * endpoint returns an empty list when there is no inventory or no database
 * configured. No fake marketplace is ever generated.
 */
export class PrivacyAdServingService {
  private contextualService: ContextualTargetingService;
  private privacyEnforcer: PrivacyEnforcerService;
  private disclosureService: AdDisclosureService;
  private feedbackStore: AggregateFeedback[] = [];

  /**
   * @param prisma Real Prisma client. When omitted (no database configured),
   * the service fails closed and returns an empty candidate pool — it never
   * fabricates ads.
   */
  constructor(private readonly prisma?: PrismaClient) {
    this.contextualService = new ContextualTargetingService();
    this.privacyEnforcer = new PrivacyEnforcerService();
    this.disclosureService = new AdDisclosureService();
    this.feedbackStore = [];
  }

  /**
   * Get candidate ads for on-device ranking, drawn from real active inventory.
   * Response contains ONLY ad creative data and contextual categories.
   * NO user profile, NO interest model, NO browsing history.
   * Returns [] when there is no inventory or no database configured.
   */
  async getCandidates(params: {
    placement: string;
    pageContent?: string;
    targetingMode: 'contextual' | 'behavioral';
  }): Promise<CandidateAd[]> {
    const candidates = await this.loadCandidatePool(50);

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
   * Uses the real ad + creative rows when a database is configured; falls back
   * to a generic, clearly-labeled disclosure for unknown ids (never fabricated
   * advertiser details).
   */
  async getDisclosure(adId: string): Promise<AdDisclosure> {
    const ad = await this.findCandidateAd(adId);
    if (ad) {
      return this.disclosureService.generateDisclosure(ad, 'contextual', ad.contextCategories);
    }

    const generic: CandidateAd = {
      id: adId,
      campaignId: 'unknown',
      creativeUrl: '',
      headline: 'Sponsored Content',
      description: 'Privacy-first ad placement',
      callToAction: 'Learn More',
      landingUrl: '',
      contextCategories: [],
      brandSafetyCategories: ['safe'],
      bidAmount: 0,
    };
    return this.disclosureService.generateDisclosure(generic, 'contextual', []);
  }

  /**
   * Load the candidate pool from real inventory: active ads whose ad set is
   * ACTIVE and whose campaign is ACTIVE and not deleted. Fail closed to an
   * empty pool when no database is configured or no inventory exists.
   */
  private async loadCandidatePool(count: number): Promise<CandidateAd[]> {
    if (!this.prisma) {
      return [];
    }

    const ads = (await this.prisma.ad.findMany({
      where: { status: 'ACTIVE' },
      take: count,
    })) as Array<{ id: string; adSetId: string; creativeId: string }>;
    if (ads.length === 0) {
      return [];
    }

    const adSetIds = [...new Set(ads.map((a) => a.adSetId))];
    const adSets = (await this.prisma.adSet.findMany({
      where: { id: { in: adSetIds } },
    })) as Array<{ id: string; campaignId: string; status: string }>;
    const adSetById = new Map(adSets.map((s) => [s.id, s]));

    const campaignIds = [...new Set(adSets.map((s) => s.campaignId))];
    const campaigns = (await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds }, status: 'ACTIVE', deletedAt: null },
    })) as Array<{
      id: string;
      budget: Record<string, unknown> | null;
      targeting: Record<string, unknown> | null;
    }>;
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    const candidates: CandidateAd[] = [];
    const seenCampaigns = new Set<string>();

    for (const ad of ads) {
      const adSet = adSetById.get(ad.adSetId);
      if (!adSet || adSet.status !== 'ACTIVE') continue;
      const campaign = campaignById.get(adSet.campaignId);
      if (!campaign || seenCampaigns.has(campaign.id)) continue;
      seenCampaigns.add(campaign.id);

      const creative = (await this.prisma.adCreative.findUnique({
        where: { id: ad.creativeId },
      })) as {
        mediaUrl: string | null;
        headline: string | null;
        description: string | null;
        callToAction: string | null;
        landingUrl: string | null;
      } | null;
      if (!creative) continue;

      const budget = (campaign.budget ?? {}) as Record<string, unknown>;
      const bidCents = Math.round(Number(budget['bidCents'] ?? budget['bid'] ?? 0));
      if (bidCents <= 0) continue;

      const targeting = (campaign.targeting ?? {}) as Record<string, unknown>;
      const interests = Array.isArray(targeting['interests'])
        ? (targeting['interests'] as string[])
        : [];

      candidates.push({
        id: ad.id,
        campaignId: campaign.id,
        creativeUrl: creative.mediaUrl ?? '',
        headline: creative.headline ?? '',
        description: creative.description ?? '',
        callToAction: creative.callToAction ?? 'Learn More',
        landingUrl: creative.landingUrl ?? '',
        contextCategories: interests,
        brandSafetyCategories: ['safe'],
        bidAmount: bidCents / 100,
      });
    }

    return candidates;
  }

  /** Find a single real candidate ad by id (for disclosures). */
  private async findCandidateAd(adId: string): Promise<CandidateAd | null> {
    if (!this.prisma) {
      return null;
    }

    const ad = (await this.prisma.ad.findUnique({ where: { id: adId } })) as {
      id: string;
      adSetId: string;
      creativeId: string;
      status: string;
    } | null;
    if (!ad) {
      return null;
    }

    const adSet = (await this.prisma.adSet.findUnique({ where: { id: ad.adSetId } })) as {
      campaignId: string;
    } | null;
    if (!adSet) {
      return null;
    }

    const creative = (await this.prisma.adCreative.findUnique({
      where: { id: ad.creativeId },
    })) as {
      mediaUrl: string | null;
      headline: string | null;
      description: string | null;
      callToAction: string | null;
      landingUrl: string | null;
    } | null;
    if (!creative) {
      return null;
    }

    const campaign = (await this.prisma.campaign.findUnique({
      where: { id: adSet.campaignId },
    })) as {
      id: string;
      budget: Record<string, unknown> | null;
    } | null;

    const budget = (campaign?.budget ?? {}) as Record<string, unknown>;
    const bidCents = Math.round(Number(budget['bidCents'] ?? budget['bid'] ?? 0));

    return {
      id: ad.id,
      campaignId: adSet.campaignId,
      creativeUrl: creative.mediaUrl ?? '',
      headline: creative.headline ?? '',
      description: creative.description ?? '',
      callToAction: creative.callToAction ?? 'Learn More',
      landingUrl: creative.landingUrl ?? '',
      contextCategories: [],
      brandSafetyCategories: ['safe'],
      bidAmount: bidCents / 100,
    };
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
