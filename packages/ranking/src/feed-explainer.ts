// ============================================================================
// Feed Explainer - "Why am I seeing this?" transparency feature
// ============================================================================

import type { RankedItem } from './types.js';

export interface RankingSignal {
  signal: string;
  contribution: number;
  humanReadable: string;
}

export interface FeedExplanation {
  itemId: string;
  signals: RankingSignal[];
}

export interface UserContext {
  followingIds: string[];
  topicAffinities: Record<string, number>;
  recentInteractions: string[];
}

export class FeedExplainer {
  explain(item: RankedItem, context: UserContext): FeedExplanation {
    const signals: RankingSignal[] = [];

    // Evaluate followed_author signal
    if (context.followingIds.includes(item.authorId)) {
      signals.push({
        signal: 'followed_author',
        contribution: 0.4,
        humanReadable: 'Posted by someone you follow',
      });
    }

    // Evaluate topic_affinity signal
    const topic = (item.metadata['topic'] as string) ?? '';
    const topicScore = context.topicAffinities[topic] ?? 0;
    if (topicScore > 0) {
      signals.push({
        signal: 'topic_affinity',
        contribution: topicScore * 0.3,
        humanReadable: `Matches your interest in ${topic}`,
      });
    }

    // Evaluate community_trending signal
    const engagement = item.replies + item.shares;
    if (engagement > 10) {
      const contribution = Math.min(engagement / 100, 0.35);
      signals.push({
        signal: 'community_trending',
        contribution,
        humanReadable: 'Trending in your community',
      });
    }

    // Evaluate quality_boost signal
    if (item.replyQuality > 0.7) {
      signals.push({
        signal: 'quality_boost',
        contribution: 0.2,
        humanReadable: 'High quality discussion',
      });
    }

    // Evaluate freshness signal
    const ageMs = Date.now() - item.timestamp;
    const oneHourMs = 60 * 60 * 1000;
    if (ageMs < oneHourMs) {
      signals.push({
        signal: 'freshness',
        contribution: 0.15,
        humanReadable: 'Just posted',
      });
    }

    // Evaluate engagement_history signal
    const itemId = item.id;
    const hasSimilar = context.recentInteractions.some((id) => id === itemId);
    const authorInteracted = context.recentInteractions.some((id) => id.startsWith(item.authorId));
    if (hasSimilar || authorInteracted) {
      signals.push({
        signal: 'engagement_history',
        contribution: 0.25,
        humanReadable: 'Similar to content you engaged with',
      });
    }

    // Sort by contribution descending
    signals.sort((a, b) => b.contribution - a.contribution);

    // Always return exactly 3 signals
    // If fewer than 3, pad with lower-contribution defaults
    while (signals.length < 3) {
      signals.push({
        signal: 'general_relevance',
        contribution: 0.05,
        humanReadable: 'Recommended based on general relevance',
      });
    }

    return {
      itemId: item.id,
      signals: signals.slice(0, 3),
    };
  }
}
