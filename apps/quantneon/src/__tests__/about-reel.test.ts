import { describe, expect, it } from 'vitest';
import {
  extractReelTopics,
  formatUsageCount,
  generateReelAiSummary,
  toggleAutoScrollPreference,
  type ReelAiContext,
  type ReelPlaybackPreferences,
} from '../features/reels/about-reel';

describe('QuantGram About This Reel AI Context & Ad Transparency (Task W39-G03)', () => {
  it('generates rich Quanty AI video summary for creative reels', () => {
    const summary = generateReelAiSummary(
      'Building the next-gen sovereign operating system for creators and builders! #quant #ecosystem',
      'alex_founder',
    );
    expect(summary).toContain('Quanty AI Analysis: @alex_founder');
    expect(summary).toContain('Building the next-gen sovereign operating system');
  });

  it('provides sensible fallback AI summary when caption is empty', () => {
    const summary = generateReelAiSummary('', 'art_creator');
    expect(summary).toContain('Visual showcase by @art_creator analyzed by Quanty AI');
    expect(summary).toContain('High aesthetic fidelity with ambient audio score');
  });

  it('extracts hashtags as categorized topic pills', () => {
    const caption = 'Sunset vibes over the hills #sunset #nature #chillvibes #4k';
    const topics = extractReelTopics(caption);
    expect(topics).toEqual(['sunset', 'nature', 'chillvibes', '4k']);
  });

  it('provides default curated topics when no hashtags exist in caption', () => {
    const caption = 'Just a regular day in the studio';
    const topics = extractReelTopics(caption);
    expect(topics).toEqual(['Creative', 'Trending', 'Reels', 'QuantGram']);
  });

  it('formats audio usage counts into human readable short strings', () => {
    expect(formatUsageCount(2_450_000)).toBe('2.5M reels');
    expect(formatUsageCount(148_200)).toBe('148K reels');
    expect(formatUsageCount(350)).toBe('350 reels');
  });

  it('toggles auto-scroll preference cleanly without mutating other flags', () => {
    const initialPrefs: ReelPlaybackPreferences = {
      autoScroll: false,
      hdQuality: true,
      captionsEnabled: true,
    };

    const toggledOn = toggleAutoScrollPreference(initialPrefs);
    expect(toggledOn.autoScroll).toBe(true);
    expect(toggledOn.hdQuality).toBe(true);
    expect(toggledOn.captionsEnabled).toBe(true);

    const toggledOff = toggleAutoScrollPreference(toggledOn);
    expect(toggledOff.autoScroll).toBe(false);
  });

  it('supports full AI context contract with ad transparency and remix rights', () => {
    const context: ReelAiContext = {
      reelId: 'reel-99',
      summary: 'Verified visual breakdown',
      topics: ['tech', 'ai'],
      safetyRating: 'VERIFIED_ORIGINAL',
      audioDetails: {
        title: 'Original Audio - quant_beats',
        artist: 'quant_beats',
        isTrending: true,
        trendingRank: 3,
        usageCount: 52_000,
        remixAllowed: true,
      },
      adTransparency: {
        isSponsored: true,
        sponsorName: 'Quant Studio',
        disclaimer: 'Paid promotion by Quant Studio',
        targetCategory: 'Creator Tools',
      },
    };

    expect(context.safetyRating).toBe('VERIFIED_ORIGINAL');
    expect(context.audioDetails.remixAllowed).toBe(true);
    expect(context.adTransparency?.isSponsored).toBe(true);
    expect(context.adTransparency?.sponsorName).toBe('Quant Studio');
  });
});
