// ============================================================================
// Privacy-First Ads - On-Device Ranker Service
// Ranks candidate ads using local interest model. Model never leaves the device.
// Only aggregate feedback signals (clicked/dismissed) are emitted.
// ============================================================================

import { z } from 'zod';
import type {
  CandidateAd,
  OnDeviceInterestModel,
  RankedAd,
  TargetingMode,
  AggregateFeedback,
  AdDisclosure,
  DisclosureSignal,
} from '../types';

export const RankCandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      id: z.string().min(1),
      campaignId: z.string().min(1),
      creativeUrl: z.string().min(1),
      headline: z.string().min(1),
      description: z.string(),
      callToAction: z.string(),
      landingUrl: z.string().min(1),
      contextCategories: z.array(z.string()),
      brandSafetyCategories: z.array(z.string()),
      bidAmount: z.number().nonnegative(),
    }),
  ),
  mode: z.enum(['contextual', 'behavioral']),
});

const DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOP_N = 3;

/**
 * OnDeviceRankerService - Ranks ads locally using on-device interest model
 *
 * The interest model never leaves the device. Only aggregate feedback
 * (clicked/dismissed boolean) is emitted for reporting.
 */
export class OnDeviceRankerService {
  /**
   * Rank candidate ads using the local interest model and return top 3.
   * In contextual mode, only bid amount and context match are used.
   * In behavioral mode, interest weights also contribute.
   */
  rankCandidates(
    candidates: CandidateAd[],
    model: OnDeviceInterestModel,
    mode: TargetingMode,
  ): RankedAd[] {
    RankCandidatesSchema.parse({ candidates, mode });

    const decayedModel = this.applyDecay(model);

    const scored = candidates.map((candidate) => {
      let score = candidate.bidAmount;

      if (mode === 'behavioral') {
        for (const interest of decayedModel.interests) {
          if (candidate.contextCategories.includes(interest.category)) {
            score += interest.weight;
          }
        }
      }

      // Context relevance boost (always applied)
      const contextMatch = candidate.contextCategories.length > 0 ? 0.1 : 0;
      score += contextMatch;

      return { ...candidate, score, rank: 0 };
    });

    scored.sort((a, b) => b.score - a.score);

    const topN = scored.slice(0, TOP_N).map((ad, index) => ({
      ...ad,
      rank: index + 1,
    }));

    return topN;
  }

  /**
   * Update local interests based on aggregate feedback.
   * Only updates interest categories that match the interacted ad's contextCategories.
   * Only uses the action type (clicked/dismissed), never user profile data.
   */
  updateLocalInterests(
    model: OnDeviceInterestModel,
    feedback: AggregateFeedback,
  ): OnDeviceInterestModel {
    const matchedCategories = new Set(feedback.contextCategories ?? []);

    const updatedInterests = model.interests.map((interest) => {
      // Only update interests whose category appears in the ad's contextCategories
      const isMatched = matchedCategories.size === 0 || matchedCategories.has(interest.category);
      if (!isMatched) {
        return interest;
      }

      if (feedback.action === 'clicked') {
        return { ...interest, weight: interest.weight + 0.1, lastSeen: feedback.timestamp };
      }
      if (feedback.action === 'dismissed') {
        return { ...interest, weight: Math.max(0, interest.weight - 0.05) };
      }
      return interest;
    });

    return {
      ...model,
      interests: updatedInterests,
      lastDecay: model.lastDecay,
    };
  }

  /**
   * Generate disclosure for why an ad was shown.
   * Always returns 1-2 signals.
   */
  getDisclosure(ad: RankedAd, mode: TargetingMode): AdDisclosure {
    const signals: DisclosureSignal[] = [];

    if (mode === 'contextual') {
      signals.push({
        type: 'context',
        explanation: 'This ad matches the content you are currently viewing.',
      });
    } else {
      signals.push({
        type: 'interest',
        explanation: 'This ad matches your on-device interest profile.',
      });
    }

    if (ad.bidAmount > 0) {
      signals.push({
        type: 'bid',
        explanation: 'This advertiser placed a competitive bid for this placement.',
      });
    }

    // Ensure exactly 1-2 signals
    return {
      adId: ad.id,
      targetingMode: mode,
      signals: signals.slice(0, 2),
    };
  }

  private applyDecay(model: OnDeviceInterestModel): OnDeviceInterestModel {
    const now = Date.now();
    const elapsed = now - model.lastDecay;

    if (elapsed < DECAY_INTERVAL_MS) {
      return model;
    }

    const periods = Math.floor(elapsed / DECAY_INTERVAL_MS);
    const decayedInterests = model.interests.map((interest) => ({
      ...interest,
      weight: interest.weight * Math.pow(1 - interest.decayRate, periods),
    }));

    return {
      ...model,
      interests: decayedInterests,
      lastDecay: now,
    };
  }
}
