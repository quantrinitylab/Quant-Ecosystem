/**
 * Simple in-memory recommendation engine.
 *
 * Adopted from `@quant/recommendation`
 * (consolidated into `@quant/recommendations` under K8). This is the
 * lightweight, self-contained hybrid recommender (collaborative +
 * content-based + popularity fallback) with a singleton `recommendationEngine`
 * for apps that need recommendations without wiring the full retrieval →
 * ranking → diversification pipeline (`RecommendationPipeline`, `HybridEngine`,
 * MMoE, ...). State is in-memory; suitable for app-local personalization and
 * as the default backend behind optional-dependency call sites.
 *
 * The model types below are intentionally NOT re-exported from the package
 * barrel: `@quant/recommendations` already owns `UserProfile`, `ContentItem`
 * and `Interaction` names in its canonical `types` / `anti-rage` / retrieval
 * modules. The engine keeps its own simple shapes internally.
 */

/** Simple user profile (engine-local shape). */
export interface SimpleUserProfile {
  userId: string;
  interests: string[];
  preferredCategories: string[];
  demographics?: {
    age?: number;
    location?: string;
    language?: string;
  };
  behavior?: {
    activeHours?: number[];
    deviceType?: string;
    averageSessionDuration?: number;
  };
  lastUpdated: Date;
}

/** Simple content item (engine-local shape). */
export interface SimpleContentItem {
  id: string;
  type: 'post' | 'video' | 'article' | 'product' | 'event';
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  creatorId: string;
  createdAt: Date;
  metadata?: Record<string, any>;
  score?: number;
}

/** Simple interaction record (engine-local shape). */
export interface SimpleInteraction {
  userId: string;
  contentId: string;
  type: 'view' | 'like' | 'share' | 'comment' | 'click' | 'purchase' | 'save';
  value?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

type InteractionType = SimpleInteraction['type'];

export class RecommendationEngine {
  private userProfiles: Map<string, SimpleUserProfile> = new Map();
  private contentItems: Map<string, SimpleContentItem> = new Map();
  private interactions: SimpleInteraction[] = [];

  async recommendForUser(userId: string, limit: number = 10): Promise<SimpleContentItem[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      return this.getPopularContent(limit);
    }

    // Hybrid recommendation: Collaborative + Content-based
    const collaborative = await this.collaborativeFiltering(userId, limit);
    const contentBased = await this.contentBasedFiltering(userId, limit);

    // Combine and rank
    const combined = this.combineRecommendations(collaborative, contentBased);
    return combined.slice(0, limit);
  }

  private combineRecommendations(
    collaborative: SimpleContentItem[],
    contentBased: SimpleContentItem[],
  ): SimpleContentItem[] {
    const scored = new Map<string, SimpleContentItem>();

    for (const item of collaborative) {
      scored.set(item.id, { ...item, score: (item.score || 0) + 1 });
    }

    for (const item of contentBased) {
      const existing = scored.get(item.id);
      if (existing) {
        existing.score = (existing.score || 0) + (item.score || 0);
      } else {
        scored.set(item.id, { ...item, score: item.score || 0.5 });
      }
    }

    return Array.from(scored.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  private async collaborativeFiltering(
    userId: string,
    limit: number,
  ): Promise<SimpleContentItem[]> {
    // Find similar users based on interactions
    const similarUsers = this.findSimilarUsers(userId);
    const recommendations: SimpleContentItem[] = [];

    for (const similarUser of similarUsers) {
      const userInteractions = this.interactions.filter((i) => i.userId === similarUser);
      for (const interaction of userInteractions) {
        if (!this.hasInteracted(userId, interaction.contentId)) {
          const content = this.contentItems.get(interaction.contentId);
          if (content) recommendations.push(content);
        }
      }
    }

    return recommendations.slice(0, limit);
  }

  private async contentBasedFiltering(
    userId: string,
    limit: number,
  ): Promise<SimpleContentItem[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    const recommendations: SimpleContentItem[] = [];

    for (const content of this.contentItems.values()) {
      const score = this.calculateContentScore(profile, content);
      if (score > 0.5) {
        recommendations.push({ ...content, score });
      }
    }

    return recommendations.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
  }

  private calculateContentScore(profile: SimpleUserProfile, content: SimpleContentItem): number {
    // Simple content matching (can be replaced with ML)
    let score = 0;

    if (profile.interests) {
      const matchingInterests = profile.interests.filter((interest) =>
        content.tags?.includes(interest),
      );
      score += (matchingInterests.length / profile.interests.length) * 0.6;
    }

    if (profile.preferredCategories && content.category) {
      if (profile.preferredCategories.includes(content.category)) {
        score += 0.4;
      }
    }

    return Math.min(score, 1);
  }

  private findSimilarUsers(userId: string): string[] {
    // Simple similarity based on interaction patterns
    const userInteractions = this.interactions.filter((i) => i.userId === userId);
    const similarUsers: string[] = [];

    const otherUsers = new Set(
      this.interactions.map((i) => i.userId).filter((id) => id !== userId),
    );

    for (const otherUser of otherUsers) {
      const otherInteractions = this.interactions.filter((i) => i.userId === otherUser);
      const commonContent = userInteractions.filter((ui) =>
        otherInteractions.some((oi) => oi.contentId === ui.contentId),
      );

      if (commonContent.length > 2) {
        similarUsers.push(otherUser);
      }
    }

    return similarUsers.slice(0, 10);
  }

  private hasInteracted(userId: string, contentId: string): boolean {
    return this.interactions.some((i) => i.userId === userId && i.contentId === contentId);
  }

  private getPopularContent(limit: number): SimpleContentItem[] {
    const contentScores = new Map<string, number>();

    for (const interaction of this.interactions) {
      const score = contentScores.get(interaction.contentId) || 0;
      contentScores.set(interaction.contentId, score + 1);
    }

    return Array.from(contentScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => this.contentItems.get(id)!)
      .filter(Boolean);
  }

  async recordInteraction(
    userId: string,
    contentId: string,
    type: InteractionType,
    value?: number,
  ) {
    this.interactions.push({
      userId,
      contentId,
      type,
      value: value || 1,
      timestamp: new Date(),
    });

    // Update user profile
    await this.updateUserProfile(userId, contentId, type);
  }

  private async updateUserProfile(userId: string, contentId: string, _type: InteractionType) {
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      profile = { userId, interests: [], preferredCategories: [], lastUpdated: new Date() };
      this.userProfiles.set(userId, profile);
    }

    const content = this.contentItems.get(contentId);
    if (content?.tags) {
      profile.interests = [...new Set([...profile.interests, ...content.tags])];
    }
  }

  async addContent(content: SimpleContentItem) {
    this.contentItems.set(content.id, content);
  }

  async getUserProfile(userId: string): Promise<SimpleUserProfile | undefined> {
    return this.userProfiles.get(userId);
  }
}

/** Shared singleton, mirroring the `@quant/recommendation` export contract. */
export const recommendationEngine = new RecommendationEngine();
