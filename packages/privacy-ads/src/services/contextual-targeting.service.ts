// ============================================================================
// Privacy-First Ads - Contextual Targeting Service
// Default targeting mode: targets ads by content the user is currently viewing.
// No user profile data is needed or used.
// ============================================================================

import { z } from 'zod';
import type { CandidateAd } from '../types';

export const ExtractSignalsSchema = z.object({
  pageContent: z.string().min(1),
});

export const MatchAdsByContextSchema = z.object({
  signals: z.array(z.string().min(1)),
  candidates: z.array(
    z.object({
      id: z.string().min(1),
      contextCategories: z.array(z.string()),
    }),
  ),
});

/** Stop words to exclude from keyword extraction */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'because',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
]);

/**
 * ContextualTargetingService - Targets ads based on page content only
 *
 * This is the default targeting mode. It extracts keywords from the current
 * page content and matches ads whose context categories overlap with the signals.
 * No user profile data is required or used.
 */
export class ContextualTargetingService {
  /**
   * Extract content signals (keywords) from page content.
   * Returns unique significant words sorted by frequency.
   */
  extractContentSignals(pageContent: string): string[] {
    ExtractSignalsSchema.parse({ pageContent });

    const words = pageContent
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    // Sort by frequency descending, take top 10
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);

    return sorted.slice(0, 10);
  }

  /**
   * Match ads by context signals. Returns candidates whose contextCategories
   * overlap with at least one signal.
   */
  matchAdsByContext(signals: string[], candidates: CandidateAd[]): CandidateAd[] {
    if (signals.length === 0) {
      return [];
    }

    const signalSet = new Set(signals.map((s) => s.toLowerCase()));

    return candidates.filter((candidate) =>
      candidate.contextCategories.some((cat) => signalSet.has(cat.toLowerCase())),
    );
  }
}
