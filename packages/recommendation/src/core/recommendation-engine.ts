import { UserProfile } from '../models/user-profile';
import { ContentItem } from '../models/content-item';
import { Interaction } from '../models/interaction';

export class RecommendationEngine {
  private userProfiles: Map<string, UserProfile> = new Map();
  private contentItems: Map<string, ContentItem> = new Map();
  private interactions: Interaction[] = [];

  async recommendForUser(userId: string, limit: number = 10): Promise<ContentItem[]> {
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

  private async collaborativeFiltering(userId: string, limit: number): Promise<ContentItem[]> {
    // Find similar users based on interactions
    const similarUsers = this.findSimilarUsers(userId);
    const recommendations: ContentItem[] = [];

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

  private async contentBasedFiltering(userId: string, limit: number): Promise<ContentItem[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    const recommendations: ContentItem[] = [];

    for (const [id, content] of this.contentItems) {
      const score = this.calculateContentScore(profile, content);
      if (score > 0.5) {
        recommendations.push({ ...content, score });
      }
    }

    return recommendations.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
  }

  private calculateContentScore(profile: UserProfile, content: ContentItem): number {
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

  private getPopularContent(limit: number): ContentItem[] {
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

  async recordInteraction(userId: string, contentId: string, type: string, value?: number) {
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

  private async updateUserProfile(userId: string, contentId: string, type: string) {
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      profile = { userId, interests: [], preferredCategories: [] };
      this.userProfiles.set(userId, profile);
    }

    const content = this.contentItems.get(contentId);
    if (content?.tags) {
      profile.interests = [...new Set([...profile.interests, ...content.tags])];
    }
  }

  async addContent(content: ContentItem) {
    this.contentItems.set(content.id, content);
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return this.userProfiles.get(userId);
  }
}
