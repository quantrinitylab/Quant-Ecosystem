// ============================================================================
// Privacy-First Ads - Ad Disclosure Service
// Generates "why this ad" explanations. Always returns exactly 1-2 signals.
// ============================================================================

import { z } from 'zod';
import type { CandidateAd, TargetingMode, AdDisclosure, DisclosureSignal } from '../types';

export const GenerateDisclosureSchema = z.object({
  ad: z.object({
    id: z.string().min(1),
    campaignId: z.string().min(1),
    contextCategories: z.array(z.string()),
  }),
  mode: z.enum(['contextual', 'behavioral']),
  signals: z.array(z.string()),
});

/**
 * AdDisclosureService - Generates transparency disclosures for served ads
 *
 * Every ad served MUST have a disclosure with exactly 1-2 signals explaining
 * why it was shown. This ensures user transparency and regulatory compliance.
 */
export class AdDisclosureService {
  /**
   * Generate a disclosure for an ad. Must ALWAYS return exactly 1-2 signals.
   * Never returns 0 signals and never more than 2.
   */
  generateDisclosure(ad: CandidateAd, mode: TargetingMode, signals: string[]): AdDisclosure {
    GenerateDisclosureSchema.parse({ ad, mode, signals });

    const disclosureSignals: DisclosureSignal[] = [];

    // First signal: targeting mode explanation (always present)
    if (mode === 'contextual') {
      disclosureSignals.push({
        type: 'targeting_mode',
        explanation: 'Shown based on the content of the page you are viewing.',
      });
    } else {
      disclosureSignals.push({
        type: 'targeting_mode',
        explanation: 'Shown based on your on-device interest preferences (you opted in).',
      });
    }

    // Second signal: context or signal match (if available)
    if (signals.length > 0) {
      const matchedSignals = signals.slice(0, 3).join(', ');
      disclosureSignals.push({
        type: 'content_match',
        explanation: `Matched content signals: ${matchedSignals}.`,
      });
    } else if (ad.contextCategories.length > 0) {
      disclosureSignals.push({
        type: 'category_match',
        explanation: `Ad category: ${ad.contextCategories[0]}.`,
      });
    }

    // Ensure exactly 1-2 signals (trim if somehow more, guaranteed at least 1)
    const finalSignals = disclosureSignals.slice(0, 2);

    return {
      adId: ad.id,
      targetingMode: mode,
      signals: finalSignals,
    };
  }
}
