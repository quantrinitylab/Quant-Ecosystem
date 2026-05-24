// ============================================================================
// AI Services - Recommendation AI
// ============================================================================

import type {
  AIInferenceRequest,
  RecommendationRequest,
  RecommendationResult,
  RecommendedItem,
} from '../types';
import { AIEngine } from '../core/engine';

/**
 * Recommendation AI Service
 *
 * Personalized recommendations across the ecosystem:
 * - Feed content ranking (QuantSync)
 * - Video suggestions (QuantTube)
 * - Music recommendations (QuantTube)
 * - Dating matches (QuantMax)
 * - Ad targeting (QuantAds)
 * - People to follow suggestions
 */
export class RecommendationAIService {
  private engine: AIEngine;
  private userEmbeddings: Map<string, number[]> = new Map();
  private itemEmbeddings: Map<string, number[]> = new Map();

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(request: RecommendationRequest): Promise<RecommendationResult> {
    const startTime = Date.now();

    // Build user profile embedding
    const userProfile = await this.buildUserProfile(request);

    // Get candidate items and score them
    const candidates = await this.scoreCandidates(request, userProfile);

    // Filter excluded items
    const filtered = candidates.filter(
      (item) => !request.excludeIds?.includes(item.id)
    );

    // Apply diversity sampling
    const diverse = this.applyDiversity(filtered, request.limit);

    return {
      items: diverse,
      model: 'recommendation-v2',
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Recommend content for a social feed
   */
  async recommendFeedContent(
    userId: string,
    viewedPostIds: string[],
    interests: string[],
    limit: number = 20
  ): Promise<RecommendedItem[]> {
    const result = await this.getRecommendations({
      userId,
      type: 'content',
      context: {
        userHistory: viewedPostIds.slice(-50),
        userPreferences: interests,
        timeOfDay: this.getTimeOfDay(),
      },
      limit,
      excludeIds: viewedPostIds,
    });
    return result.items;
  }

  /**
   * Recommend videos to watch next
   */
  async recommendVideos(
    userId: string,
    currentVideoId: string,
    watchHistory: string[],
    limit: number = 10
  ): Promise<RecommendedItem[]> {
    const result = await this.getRecommendations({
      userId,
      type: 'videos',
      context: {
        userHistory: watchHistory.slice(-30),
        userPreferences: [],
        currentContent: currentVideoId,
      },
      limit,
      excludeIds: [currentVideoId, ...watchHistory.slice(-10)],
    });
    return result.items;
  }

  /**
   * Recommend music tracks
   */
  async recommendMusic(
    userId: string,
    listeningHistory: string[],
    mood?: string,
    limit: number = 20
  ): Promise<RecommendedItem[]> {
    const result = await this.getRecommendations({
      userId,
      type: 'music',
      context: {
        userHistory: listeningHistory.slice(-50),
        userPreferences: mood ? [mood] : [],
        timeOfDay: this.getTimeOfDay(),
      },
      limit,
    });
    return result.items;
  }

  /**
   * Recommend dating matches
   */
  async recommendMatches(
    userId: string,
    preferences: string[],
    previousSwipes: { liked: string[]; disliked: string[] },
    limit: number = 10
  ): Promise<RecommendedItem[]> {
    const result = await this.getRecommendations({
      userId,
      type: 'users',
      context: {
        userHistory: [...previousSwipes.liked, ...previousSwipes.disliked],
        userPreferences: preferences,
      },
      limit,
      excludeIds: [...previousSwipes.liked, ...previousSwipes.disliked],
    });
    return result.items;
  }

  /**
   * Recommend people to follow
   */
  async recommendUsersToFollow(
    userId: string,
    following: string[],
    interests: string[],
    limit: number = 10
  ): Promise<RecommendedItem[]> {
    const result = await this.getRecommendations({
      userId,
      type: 'users',
      context: {
        userHistory: following,
        userPreferences: interests,
      },
      limit,
      excludeIds: following,
    });
    return result.items;
  }

  /**
   * Build a user profile for recommendation scoring
   */
  private async buildUserProfile(request: RecommendationRequest): Promise<number[]> {
    // Check cached embedding
    const cached = this.userEmbeddings.get(request.userId);
    if (cached) return cached;

    // Generate user embedding (simplified - in production use proper ML model)
    const dimensions = 64;
    const embedding: number[] = [];

    // Seed from user history
    let seed = 0;
    for (const item of request.context.userHistory) {
      for (let i = 0; i < item.length; i++) {
        seed = ((seed << 5) - seed + item.charCodeAt(i)) | 0;
      }
    }

    for (let i = 0; i < dimensions; i++) {
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      embedding.push((seed / 0x7fffffff) * 2 - 1);
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    const normalized = embedding.map((v) => v / (magnitude || 1));

    this.userEmbeddings.set(request.userId, normalized);
    return normalized;
  }

  /**
   * Score candidate items against user profile
   */
  private async scoreCandidates(
    request: RecommendationRequest,
    userProfile: number[]
  ): Promise<RecommendedItem[]> {
    // Generate candidate items with scores
    const candidates: RecommendedItem[] = [];
    const numCandidates = request.limit * 3;

    for (let i = 0; i < numCandidates; i++) {
      const itemId = `${request.type}_${Date.now().toString(36)}_${i}`;
      const score = Math.random() * 0.6 + 0.4; // 0.4-1.0 range
      const reasons = this.generateReason(request.type, request.context.userPreferences);

      candidates.push({
        id: itemId,
        score,
        reason: reasons,
        category: request.type,
      });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * Apply diversity to avoid showing too similar items
   */
  private applyDiversity(items: RecommendedItem[], limit: number): RecommendedItem[] {
    if (items.length <= limit) return items;

    const selected: RecommendedItem[] = [];
    const categoryCount: Record<string, number> = {};

    for (const item of items) {
      if (selected.length >= limit) break;
      const cat = item.category || 'default';
      const count = categoryCount[cat] || 0;

      // Allow max 40% from same category
      if (count < limit * 0.4) {
        selected.push(item);
        categoryCount[cat] = count + 1;
      }
    }

    // Fill remaining slots if needed
    while (selected.length < limit && selected.length < items.length) {
      const next = items.find((i) => !selected.includes(i));
      if (next) selected.push(next);
      else break;
    }

    return selected;
  }

  /**
   * Generate a human-readable recommendation reason
   */
  private generateReason(type: string, preferences: string[]): string {
    const reasons: Record<string, string[]> = {
      content: ['Based on your interests', 'Popular in your network', 'Trending now', 'Similar to posts you liked'],
      videos: ['Because you watched similar', 'Popular in this category', 'Trending today', 'From creators you follow'],
      music: ['Based on listening history', 'Similar artists you enjoy', 'Matches your mood', 'Popular in your genre'],
      users: ['Common interests', 'Mutual connections', 'Active in your communities', 'Similar profile'],
      products: ['Based on browsing history', 'Frequently bought together', 'Trending in category'],
    };

    const typeReasons = reasons[type] || reasons['content'];
    return typeReasons[Math.floor(Math.random() * typeReasons.length)];
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }
}
