// ============================================================================
// QuantMax - Feed Service
// Short video recommendation algorithm, trending content
// ============================================================================

import type { ShortVideo, UserProfile, Sound, Challenge } from '../../src/types';

interface UserEngagement {
  userId: string;
  videoId: string;
  watchTime: number;
  watchPercentage: number;
  liked: boolean;
  shared: boolean;
  commented: boolean;
  skippedAt?: number;
}

interface ContentScore {
  videoId: string;
  score: number;
  factors: { engagement: number; recency: number; creator: number; diversity: number; interest: number };
}

export class FeedService {
  private videos: Map<string, ShortVideo> = new Map();
  private engagements: Map<string, UserEngagement[]> = new Map();
  private sounds: Map<string, Sound> = new Map();
  private challenges: Map<string, Challenge> = new Map();
  private userInterestWeights: Map<string, Map<string, number>> = new Map();

  addVideo(video: ShortVideo): void {
    this.videos.set(video.id, video);
  }

  recordEngagement(engagement: UserEngagement): void {
    const userEngagements = this.engagements.get(engagement.userId) || [];
    userEngagements.push(engagement);
    this.engagements.set(engagement.userId, userEngagements);

    // Update interest weights
    const video = this.videos.get(engagement.videoId);
    if (video && engagement.watchPercentage > 0.5) {
      this.updateInterestWeights(engagement.userId, video.hashtags, engagement);
    }
  }

  private updateInterestWeights(userId: string, hashtags: string[], engagement: UserEngagement): void {
    const weights = this.userInterestWeights.get(userId) || new Map();
    const boost = engagement.liked ? 3 : engagement.shared ? 5 : engagement.watchPercentage > 0.8 ? 2 : 1;
    for (const tag of hashtags) {
      weights.set(tag, (weights.get(tag) || 0) + boost);
    }
    this.userInterestWeights.set(userId, weights);
  }

  getForYouFeed(userId: string, limit: number = 20, offset: number = 0): ShortVideo[] {
    const allVideos = Array.from(this.videos.values());
    const userEngagements = this.engagements.get(userId) || [];
    const watchedIds = new Set(userEngagements.map(e => e.videoId));
    const unwatched = allVideos.filter(v => !watchedIds.has(v.id) && v.visibility === 'public');

    // Score each video
    const scored: ContentScore[] = unwatched.map(video => this.scoreVideo(userId, video, userEngagements));
    scored.sort((a, b) => b.score - a.score);

    // Add diversity - mix in some exploration content
    const ranked = scored.slice(offset, offset + limit);
    const diversified = this.addDiversity(ranked, allVideos, watchedIds, limit);

    return diversified.map(s => this.videos.get(s.videoId)!).filter(Boolean);
  }

  private scoreVideo(userId: string, video: ShortVideo, userEngagements: UserEngagement[]): ContentScore {
    const interests = this.userInterestWeights.get(userId) || new Map();

    // Engagement score (0-30): based on video overall engagement rate
    const engagementRate = video.views > 0 ? ((video.likes + video.comments * 2 + video.shares * 3) / video.views) * 100 : 0;
    const engagement = Math.min(engagementRate * 3, 30);

    // Recency score (0-20): newer content scored higher
    const ageHours = (Date.now() - new Date(video.createdAt).getTime()) / 3600000;
    const recency = Math.max(0, 20 - (ageHours / 12));

    // Creator score (0-15): based on creator follower count and verification
    const creatorFollowers = video.creator?.followers || 0;
    const creator = Math.min(Math.log10(Math.max(creatorFollowers, 1)) * 5, 15);

    // Interest alignment (0-25): how well video matches user interests
    let interest = 0;
    for (const tag of video.hashtags) {
      interest += interests.get(tag) || 0;
    }
    interest = Math.min(interest, 25);

    // Diversity bonus (0-10): penalize repetitive content
    const recentCreators = userEngagements.slice(-20).map(e => this.videos.get(e.videoId)?.creatorId);
    const diversity = recentCreators.includes(video.creatorId) ? 0 : 10;

    const score = engagement + recency + creator + interest + diversity;
    return { videoId: video.id, score, factors: { engagement, recency, creator, diversity, interest } };
  }

  private addDiversity(ranked: ContentScore[], allVideos: ShortVideo[], watchedIds: Set<string>, limit: number): ContentScore[] {
    // Insert exploration content at every 5th position
    const result = [...ranked];
    const explorationCount = Math.floor(limit / 5);
    const exploration = allVideos
      .filter(v => !watchedIds.has(v.id) && !result.find(r => r.videoId === v.id))
      .slice(0, explorationCount)
      .map(v => ({ videoId: v.id, score: 0, factors: { engagement: 0, recency: 0, creator: 0, diversity: 10, interest: 0 } }));

    for (let i = 0; i < exploration.length; i++) {
      const insertPos = Math.min((i + 1) * 5, result.length);
      result.splice(insertPos, 0, exploration[i]);
    }
    return result.slice(0, limit);
  }

  getFollowingFeed(userId: string, following: string[], limit: number = 20): ShortVideo[] {
    return Array.from(this.videos.values())
      .filter(v => following.includes(v.creatorId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getTrending(limit: number = 20): ShortVideo[] {
    const now = Date.now();
    const dayAgo = now - 86400000;
    return Array.from(this.videos.values())
      .filter(v => new Date(v.createdAt).getTime() > dayAgo)
      .sort((a, b) => (b.likes + b.shares * 2 + b.views) - (a.likes + a.shares * 2 + a.views))
      .slice(0, limit);
  }

  searchVideos(query: string, limit: number = 20): ShortVideo[] {
    const q = query.toLowerCase();
    return Array.from(this.videos.values())
      .filter(v => v.caption.toLowerCase().includes(q) || v.hashtags.some(h => h.includes(q)))
      .slice(0, limit);
  }

  getTrendingSounds(limit: number = 10): Sound[] {
    return Array.from(this.sounds.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  getActiveChallenges(limit: number = 10): Challenge[] {
    return Array.from(this.challenges.values())
      .filter(c => new Date(c.expiresAt).getTime() > Date.now())
      .sort((a, b) => b.participantCount - a.participantCount)
      .slice(0, limit);
  }
}

export const feedService = new FeedService();
