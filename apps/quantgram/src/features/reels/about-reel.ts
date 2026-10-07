// ============================================================================
// QuantGram (QuantNeon) — About Reel AI Context & Ad Transparency Engine
// Forensic 98-Screen Instagram Parity (Task W39-G03)
// ============================================================================

export interface ReelAiContext {
  reelId: string;
  summary: string;
  topics: string[];
  safetyRating: 'VERIFIED_ORIGINAL' | 'CREATIVE_COMMONS' | 'AI_ASSISTED' | 'UNVERIFIED';
  audioDetails: {
    title: string;
    artist: string;
    isTrending: boolean;
    trendingRank?: number;
    usageCount: number;
    remixAllowed: boolean;
  };
  adTransparency?: {
    isSponsored: boolean;
    sponsorName?: string;
    disclaimer?: string;
    targetCategory?: string;
  };
}

export interface ReelPlaybackPreferences {
  autoScroll: boolean;
  hdQuality: boolean;
  captionsEnabled: boolean;
}

export function generateReelAiSummary(caption: string, username: string): string {
  if (!caption || caption.trim().length === 0) {
    return `Visual showcase by @${username} analyzed by Quanty AI. High aesthetic fidelity with ambient audio score.`;
  }
  return `Quanty AI Analysis: @${username} explores "${caption.slice(0, 80)}${caption.length > 80 ? '...' : ''}" featuring dynamic motion, vibrant grade, and trending sound design.`;
}

export function extractReelTopics(caption: string): string[] {
  const hashtags = caption.match(/#[a-z0-9_]+/gi);
  if (hashtags && hashtags.length > 0) {
    return hashtags.map((tag) => tag.replace('#', ''));
  }
  return ['Creative', 'Trending', 'Reels', 'QuantGram'];
}

export function formatUsageCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M reels`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K reels`;
  }
  return `${count} reels`;
}

export function toggleAutoScrollPreference(
  prefs: ReelPlaybackPreferences,
): ReelPlaybackPreferences {
  return {
    ...prefs,
    autoScroll: !prefs.autoScroll,
  };
}
