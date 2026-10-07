// ============================================================================
// AI Ranker - Feature-based relevance scoring with personalization
// ============================================================================

import type { RankingAlgorithm } from './algorithm-registry.js';
import type { FeedItem, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export interface UserEngagementProfile {
  preferredAuthors: string[];
  topicAffinities: Record<string, number>;
  avgSessionLength: number;
  engagementRate: number;
}

export class AIRanker implements RankingAlgorithm {
  name = AlgorithmType.AI as const;

  private userProfiles: Map<string, UserEngagementProfile> = new Map();

  setUserProfile(userId: string, profile: UserEngagementProfile): void {
    this.userProfiles.set(userId, profile);
  }

  rank(items: FeedItem[], userId: string): RankedItem[] {
    const profile = this.userProfiles.get(userId);

    const scored = items.map((item) => {
      const score = this.computeScore(item, profile);
      return {
        ...item,
        score,
        algorithmUsed: AlgorithmType.AI as const,
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  private computeScore(item: FeedItem, profile?: UserEngagementProfile): number {
    let score = 0;

    // Recency factor (decays over time)
    const ageHours = (Date.now() - item.timestamp) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - ageHours / 168); // decays over 1 week
    score += recencyScore * 0.3;

    // Engagement factor
    const engagementScore = Math.min(
      (item.upvotes * 0.4 + item.shares * 0.4 + item.replies * 0.2) / 100,
      1,
    );
    score += engagementScore * 0.25;

    // Content quality factor
    const qualityScore = item.replyQuality * 0.5 + item.authorReputation * 0.5;
    score += qualityScore * 0.2;

    // Diversity factor (content length variation as a proxy)
    const diversityScore = Math.min(item.content.length / 500, 1);
    score += diversityScore * 0.05;

    // Personalization if profile exists
    if (profile) {
      // Author preference boost
      if (profile.preferredAuthors.includes(item.authorId)) {
        score += 0.15;
      }

      // Topic affinity boost
      const topics = Object.keys(profile.topicAffinities);
      for (const topic of topics) {
        if (item.content.toLowerCase().includes(topic.toLowerCase())) {
          score += (profile.topicAffinities[topic] ?? 0) * 0.05;
        }
      }
    }

    return Math.min(score, 1);
  }
}
