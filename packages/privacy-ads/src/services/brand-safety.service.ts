// ============================================================================
// Privacy-First Ads - Brand Safety Service
// Content classification for advertiser safety.
// ============================================================================

import { z } from 'zod';
import type { BrandSafetyCategory, CandidateAd } from '../types';

export const ClassifyContentSchema = z.object({
  content: z.string().min(1),
});

export const IsAdSafeSchema = z.object({
  ad: z.object({
    id: z.string().min(1),
    brandSafetyCategories: z.array(z.string()),
  }),
  contentCategories: z.array(z.string()),
});

/** Keywords associated with unsafe content categories */
const CATEGORY_KEYWORDS: Record<BrandSafetyCategory, string[]> = {
  safe: [],
  adult: ['porn', 'xxx', 'nude', 'explicit', 'nsfw', 'adult content', 'sexual'],
  violence: ['kill', 'murder', 'gore', 'violent', 'attack', 'shooting', 'assault'],
  hate_speech: ['hate', 'racist', 'slur', 'supremacist', 'bigot', 'discriminat'],
  gambling: ['casino', 'betting', 'gamble', 'poker', 'slots', 'wager', 'lottery'],
  drugs: ['cocaine', 'heroin', 'meth', 'fentanyl', 'illegal drug', 'narcotic'],
  weapons: ['firearm', 'assault rifle', 'ammunition', 'explosive', 'bomb'],
  political: ['election', 'partisan', 'propaganda', 'political campaign'],
  controversial: ['conspiracy', 'extremist', 'radical', 'misinformation'],
  misinformation: ['fake news', 'hoax', 'debunked', 'disinformation', 'false claim'],
};

/** Default blocked categories for advertisers */
const DEFAULT_BLOCKED: BrandSafetyCategory[] = [
  'adult',
  'violence',
  'hate_speech',
  'gambling',
  'drugs',
  'weapons',
];

/**
 * BrandSafetyService - Content classification for advertiser safety
 *
 * Classifies content into safety categories and determines whether
 * an ad is safe to display alongside given content.
 */
export class BrandSafetyService {
  /**
   * Classify content into brand safety categories.
   * Returns all matching categories (empty array means content is safe).
   * Uses word-boundary matching to avoid false positives (e.g. "skill" matching "kill").
   */
  classifyContent(content: string): BrandSafetyCategory[] {
    ClassifyContentSchema.parse({ content });

    const lowerContent = content.toLowerCase();
    const matchedCategories: BrandSafetyCategory[] = [];

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (category === 'safe') continue;

      const hasMatch = keywords.some((keyword) => {
        // Use word-boundary matching for single-word keywords
        // Multi-word keywords (containing spaces) use includes since they are
        // already specific enough to avoid false positives
        if (keyword.includes(' ')) {
          return lowerContent.includes(keyword);
        }
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(lowerContent);
      });
      if (hasMatch) {
        matchedCategories.push(category as BrandSafetyCategory);
      }
    }

    if (matchedCategories.length === 0) {
      matchedCategories.push('safe');
    }

    return matchedCategories;
  }

  /**
   * Check if an ad is safe to display alongside content with given categories.
   * An ad is unsafe if the content categories overlap with the ad's excluded
   * brand safety categories or with default blocked categories.
   */
  isAdSafe(ad: CandidateAd, contentCategories: BrandSafetyCategory[]): boolean {
    // Content is safe if only 'safe' category
    if (contentCategories.length === 1 && contentCategories[0] === 'safe') {
      return true;
    }

    // Check if any content category is in the ad's brand safety exclusions
    const adExclusions = new Set(ad.brandSafetyCategories);
    for (const category of contentCategories) {
      if (category !== 'safe' && adExclusions.has(category)) {
        return false;
      }
    }

    // Check against default blocked categories
    for (const category of contentCategories) {
      if (DEFAULT_BLOCKED.includes(category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the default list of blocked brand safety categories.
   */
  getBlockedCategories(): BrandSafetyCategory[] {
    return [...DEFAULT_BLOCKED];
  }
}
