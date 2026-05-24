// ============================================================================
// QuantTube API - Shorts Service
// Short video creation, sound library, trending, feed algorithm
// ============================================================================

interface ShortVideo {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  soundId: string | null;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  tags: string[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Sound {
  id: string;
  name: string;
  artist: string;
  duration: number;
  usageCount: number;
  isOriginal: boolean;
  sourceVideoId: string | null;
  category: string;
}

interface ShortsFilter {
  category?: string;
  trending?: boolean;
  followed?: boolean;
  soundId?: string;
  limit?: number;
  cursor?: string;
}

interface TrendingMetrics {
  shortId: string;
  score: number;
  velocity: number;
  engagementRate: number;
  shareRate: number;
}

class ShortsService {
  private shorts: Map<string, ShortVideo> = new Map();
  private sounds: Map<string, Sound> = new Map();
  private trendingCache: TrendingMetrics[] = [];

  async createShort(data: {
    creatorId: string;
    videoUrl: string;
    thumbnailUrl: string;
    title: string;
    description: string;
    soundId?: string;
    duration: number;
    tags: string[];
  }): Promise<ShortVideo> {
    const short: ShortVideo = {
      id: `short_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      creatorId: data.creatorId,
      videoUrl: data.videoUrl,
      thumbnailUrl: data.thumbnailUrl,
      title: data.title,
      description: data.description,
      soundId: data.soundId || null,
      duration: data.duration,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      tags: data.tags,
      isPublished: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.shorts.set(short.id, short);
    return short;
  }

  async getFeed(userId: string, filter: ShortsFilter = {}): Promise<ShortVideo[]> {
    const limit = filter.limit || 20;
    let results = Array.from(this.shorts.values()).filter(s => s.isPublished);

    if (filter.category) {
      results = results.filter(s => s.tags.includes(filter.category!));
    }
    if (filter.soundId) {
      results = results.filter(s => s.soundId === filter.soundId);
    }
    if (filter.trending) {
      results.sort((a, b) => this.calculateTrendingScore(b) - this.calculateTrendingScore(a));
    } else {
      results.sort((a, b) => this.calculateRelevanceScore(b, userId) - this.calculateRelevanceScore(a, userId));
    }

    return results.slice(0, limit);
  }

  async getTrending(limit: number = 50): Promise<TrendingMetrics[]> {
    const allShorts = Array.from(this.shorts.values());
    const metrics = allShorts.map(short => ({
      shortId: short.id,
      score: this.calculateTrendingScore(short),
      velocity: (short.likeCount + short.shareCount * 3) / Math.max(1, this.getAgeInHours(short.createdAt)),
      engagementRate: short.viewCount > 0 ? (short.likeCount + short.commentCount + short.shareCount) / short.viewCount : 0,
      shareRate: short.viewCount > 0 ? short.shareCount / short.viewCount : 0,
    }));
    metrics.sort((a, b) => b.score - a.score);
    this.trendingCache = metrics.slice(0, limit);
    return this.trendingCache;
  }

  async getSoundLibrary(category?: string, limit: number = 50): Promise<Sound[]> {
    let sounds = Array.from(this.sounds.values());
    if (category) {
      sounds = sounds.filter(s => s.category === category);
    }
    sounds.sort((a, b) => b.usageCount - a.usageCount);
    return sounds.slice(0, limit);
  }

  async recordView(shortId: string, userId: string): Promise<void> {
    const short = this.shorts.get(shortId);
    if (short) {
      short.viewCount++;
      short.updatedAt = new Date().toISOString();
    }
  }

  async toggleLike(shortId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const short = this.shorts.get(shortId);
    if (!short) throw new Error('Short not found');
    short.likeCount++;
    return { liked: true, likeCount: short.likeCount };
  }

  async addComment(shortId: string, userId: string, text: string): Promise<{ commentId: string }> {
    const short = this.shorts.get(shortId);
    if (!short) throw new Error('Short not found');
    short.commentCount++;
    return { commentId: `comment_${Date.now()}` };
  }

  async share(shortId: string, userId: string, platform: string): Promise<{ shareUrl: string }> {
    const short = this.shorts.get(shortId);
    if (short) short.shareCount++;
    return { shareUrl: `https://quantube.app/shorts/${shortId}` };
  }

  async deleteShort(shortId: string, userId: string): Promise<void> {
    const short = this.shorts.get(shortId);
    if (!short) throw new Error('Short not found');
    if (short.creatorId !== userId) throw new Error('Unauthorized');
    this.shorts.delete(shortId);
  }

  private calculateTrendingScore(short: ShortVideo): number {
    const ageHours = this.getAgeInHours(short.createdAt);
    const engagement = short.likeCount + short.commentCount * 2 + short.shareCount * 5;
    const decay = Math.pow(0.95, ageHours);
    return engagement * decay * (short.viewCount > 0 ? engagement / short.viewCount : 0);
  }

  private calculateRelevanceScore(short: ShortVideo, userId: string): number {
    return this.calculateTrendingScore(short) + Math.random() * 10;
  }

  private getAgeInHours(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  }
}

export const shortsService = new ShortsService();
export default ShortsService;
