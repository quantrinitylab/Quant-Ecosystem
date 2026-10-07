// ============================================================================
// QuantSync - Analytics Service
// Track and retrieve engagement metrics for posts and profiles
// ============================================================================

export interface PostMetrics {
  postId: string;
  impressions: number;
  clicks: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  engagementRate: number;
}

export interface ProfileMetrics {
  followers: number;
  following: number;
  totalPosts: number;
  avgEngagement: number;
  topPosts: PostMetrics[];
  growthRate: number;
}

export class AnalyticsService {
  private postMetrics: Map<string, PostMetrics> = new Map();
  private userPosts: Map<string, string[]> = new Map();

  trackImpression(postId: string): void {
    const metrics = this.getOrCreateMetrics(postId);
    metrics.impressions += 1;
    metrics.engagementRate = this.calculateEngagementRate(metrics);
    this.postMetrics.set(postId, metrics);
  }

  trackClick(postId: string): void {
    const metrics = this.getOrCreateMetrics(postId);
    metrics.clicks += 1;
    metrics.engagementRate = this.calculateEngagementRate(metrics);
    this.postMetrics.set(postId, metrics);
  }

  getPostMetrics(postId: string): PostMetrics {
    return this.getOrCreateMetrics(postId);
  }

  getEngagementRate(postId: string): number {
    const metrics = this.postMetrics.get(postId);
    if (!metrics) {
      return 0;
    }
    return metrics.engagementRate;
  }

  getTopPosts(userId: string, limit: number): PostMetrics[] {
    const postIds = this.userPosts.get(userId) ?? [];
    const metrics: PostMetrics[] = [];

    for (const postId of postIds) {
      const m = this.postMetrics.get(postId);
      if (m) {
        metrics.push(m);
      }
    }

    return metrics.sort((a, b) => b.engagementRate - a.engagementRate).slice(0, limit);
  }

  getProfileMetrics(userId: string, _timeRange: { start: number; end: number }): ProfileMetrics {
    const postIds = this.userPosts.get(userId) ?? [];
    const allMetrics: PostMetrics[] = [];

    for (const postId of postIds) {
      const m = this.postMetrics.get(postId);
      if (m) {
        allMetrics.push(m);
      }
    }

    const totalEngagement = allMetrics.reduce((sum, m) => sum + m.engagementRate, 0);
    const avgEngagement = allMetrics.length > 0 ? totalEngagement / allMetrics.length : 0;
    const topPosts = allMetrics.sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);

    return {
      followers: 0,
      following: 0,
      totalPosts: postIds.length,
      avgEngagement,
      topPosts,
      growthRate: 0,
    };
  }

  // Helper to register a post for a user (for testing/internal use)
  registerPost(userId: string, postId: string): void {
    const posts = this.userPosts.get(userId) ?? [];
    posts.push(postId);
    this.userPosts.set(userId, posts);
  }

  // Helper to set arbitrary metrics (for testing/internal use)
  setMetrics(postId: string, partial: Partial<PostMetrics>): void {
    const metrics = this.getOrCreateMetrics(postId);
    Object.assign(metrics, partial);
    metrics.engagementRate = this.calculateEngagementRate(metrics);
    this.postMetrics.set(postId, metrics);
  }

  private getOrCreateMetrics(postId: string): PostMetrics {
    const existing = this.postMetrics.get(postId);
    if (existing) {
      return { ...existing };
    }

    const fresh: PostMetrics = {
      postId,
      impressions: 0,
      clicks: 0,
      likes: 0,
      shares: 0,
      comments: 0,
      saves: 0,
      engagementRate: 0,
    };

    this.postMetrics.set(postId, { ...fresh });
    return fresh;
  }

  private calculateEngagementRate(metrics: PostMetrics): number {
    if (metrics.impressions === 0) {
      return 0;
    }
    const interactions =
      metrics.likes + metrics.shares + metrics.comments + metrics.clicks + metrics.saves;
    return Number(((interactions / metrics.impressions) * 100).toFixed(2));
  }
}
