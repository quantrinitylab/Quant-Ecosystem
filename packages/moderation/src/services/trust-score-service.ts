// ============================================================================
// Moderation - Trust Score Service
// User trust scoring with multi-factor calculation and history tracking
// ============================================================================

import type { TrustScore, TrustFactor, TrustLevel } from '../types';

interface TrustScoreConfig {
  baseScore: number;
  maxScore: number;
  minScore: number;
  decayRatePerDay: number;
  levelThresholds: Record<TrustLevel, number>;
  factorWeights: Record<string, number>;
}

const DEFAULT_CONFIG: TrustScoreConfig = {
  baseScore: 50,
  maxScore: 100,
  minScore: 0,
  decayRatePerDay: 0.1,
  levelThresholds: {
    new: 0,
    low: 20,
    medium: 40,
    high: 60,
    verified: 75,
    trusted_creator: 90,
  },
  factorWeights: {
    account_age: 0.15,
    report_history: 0.25,
    content_quality: 0.2,
    community_standing: 0.15,
    verification_status: 0.1,
    engagement_quality: 0.15,
  },
};

interface ScoreUpdate {
  userId: string;
  previousScore: number;
  newScore: number;
  reason: string;
  timestamp: number;
}

/**
 * TrustScoreService - User reputation and trust management
 *
 * Calculates trust scores based on multiple factors including account age,
 * report history, content quality, community standing, and verification.
 * Supports penalties, rewards, percentile ranking, and score decay.
 */
export class TrustScoreService {
  private config: TrustScoreConfig;
  private scores: Map<string, TrustScore>;
  private updateHistory: Map<string, ScoreUpdate[]>;
  private globalScores: number[];

  constructor(config: Partial<TrustScoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scores = new Map();
    this.updateHistory = new Map();
    this.globalScores = [];
  }

  /** Calculate trust score for a user based on all factors */
  async calculateScore(
    userId: string,
    factors: {
      accountAgeDays: number;
      reportsReceived: number;
      reportsSubmitted: number;
      falseReports: number;
      contentCount: number;
      positiveRatings: number;
      negativeRatings: number;
      followers: number;
      following: number;
      isVerified: boolean;
      violationCount: number;
      appealSuccessRate: number;
    },
  ): Promise<TrustScore> {
    const factorScores = this.computeFactors(factors);
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of factorScores) {
      totalScore += (factor.value / factor.maxValue) * factor.weight;
      totalWeight += factor.weight;
    }

    const normalizedScore =
      totalWeight > 0
        ? Math.round((totalScore / totalWeight) * this.config.maxScore * 100) / 100
        : this.config.baseScore;

    const score = Math.max(this.config.minScore, Math.min(this.config.maxScore, normalizedScore));
    const level = this.getLevel(score);

    const existing = this.scores.get(userId);
    const history = existing?.history || [];
    history.push({ score, timestamp: Date.now(), reason: 'Full recalculation' });
    if (history.length > 100) history.splice(0, history.length - 100);

    const trustScore: TrustScore = {
      userId,
      score,
      level,
      factors: factorScores,
      lastCalculated: Date.now(),
      history,
    };

    this.scores.set(userId, trustScore);
    this.updateGlobalScores(score);
    return trustScore;
  }

  /** Update score with a delta (positive or negative) */
  async updateScore(userId: string, delta: number, reason: string): Promise<TrustScore> {
    const trustScore = this.getScoreOrCreate(userId);
    const previousScore = trustScore.score;
    trustScore.score = Math.max(
      this.config.minScore,
      Math.min(this.config.maxScore, trustScore.score + delta),
    );
    trustScore.level = this.getLevel(trustScore.score);
    trustScore.lastCalculated = Date.now();
    trustScore.history.push({ score: trustScore.score, timestamp: Date.now(), reason });

    // Record update
    const updates = this.updateHistory.get(userId) || [];
    updates.push({
      userId,
      previousScore,
      newScore: trustScore.score,
      reason,
      timestamp: Date.now(),
    });
    this.updateHistory.set(userId, updates);

    this.updateGlobalScores(trustScore.score);
    return trustScore;
  }

  /** Get detailed factor breakdown */
  async getFactors(userId: string): Promise<TrustFactor[]> {
    const trustScore = this.scores.get(userId);
    if (!trustScore) throw new Error(`Trust score not found for user: ${userId}`);
    return trustScore.factors;
  }

  /** Penalize a user (reduce trust score) */
  async penalize(userId: string, amount: number, reason: string): Promise<TrustScore> {
    if (amount <= 0) throw new Error('Penalty amount must be positive');
    return this.updateScore(userId, -amount, `Penalty: ${reason}`);
  }

  /** Reward a user (increase trust score) */
  async reward(userId: string, amount: number, reason: string): Promise<TrustScore> {
    if (amount <= 0) throw new Error('Reward amount must be positive');
    return this.updateScore(userId, amount, `Reward: ${reason}`);
  }

  /** Get score history for a user */
  async getHistory(
    userId: string,
    limit: number = 50,
  ): Promise<{ score: number; timestamp: number; reason: string }[]> {
    const trustScore = this.scores.get(userId);
    if (!trustScore) return [];
    return trustScore.history.slice(-limit).reverse();
  }

  /** Get percentile ranking of a user's trust score */
  async getPercentile(
    userId: string,
  ): Promise<{ score: number; percentile: number; rank: number; totalUsers: number }> {
    const trustScore = this.scores.get(userId);
    if (!trustScore) throw new Error(`Trust score not found for user: ${userId}`);

    if (this.globalScores.length === 0) {
      return { score: trustScore.score, percentile: 50, rank: 1, totalUsers: 1 };
    }

    const sorted = [...this.globalScores].sort((a, b) => a - b);
    const belowCount = sorted.filter((s) => s < trustScore.score).length;
    const percentile = Math.round((belowCount / sorted.length) * 100);
    const rank = sorted.length - belowCount;

    return {
      score: trustScore.score,
      percentile,
      rank,
      totalUsers: sorted.length,
    };
  }

  /** Recalculate all scores with decay applied */
  async recalculate(): Promise<{ updated: number; decayed: number }> {
    const now = Date.now();
    let updated = 0;
    let decayed = 0;

    for (const [_userId, trustScore] of this.scores) {
      const daysSinceCalculation = (now - trustScore.lastCalculated) / 86400000;

      if (daysSinceCalculation > 1) {
        // Apply decay
        const decayAmount = daysSinceCalculation * this.config.decayRatePerDay;
        if (decayAmount > 0.01) {
          const previousScore = trustScore.score;
          trustScore.score = Math.max(this.config.minScore, trustScore.score - decayAmount);
          trustScore.level = this.getLevel(trustScore.score);
          trustScore.lastCalculated = now;

          if (trustScore.score !== previousScore) {
            trustScore.history.push({
              score: trustScore.score,
              timestamp: now,
              reason: `Decay: ${decayAmount.toFixed(2)} points over ${daysSinceCalculation.toFixed(1)} days`,
            });
            decayed++;
          }
          updated++;
        }
      }
    }

    return { updated, decayed };
  }

  /** Get score for a user (read-only) */
  async getScore(userId: string): Promise<TrustScore | null> {
    return this.scores.get(userId) || null;
  }

  /** Bulk get scores */
  async getScores(userIds: string[]): Promise<Map<string, TrustScore>> {
    const result = new Map<string, TrustScore>();
    for (const userId of userIds) {
      const score = this.scores.get(userId);
      if (score) result.set(userId, score);
    }
    return result;
  }

  // --- Private Methods ---

  private computeFactors(data: {
    accountAgeDays: number;
    reportsReceived: number;
    reportsSubmitted: number;
    falseReports: number;
    contentCount: number;
    positiveRatings: number;
    negativeRatings: number;
    followers: number;
    following: number;
    isVerified: boolean;
    violationCount: number;
    appealSuccessRate: number;
  }): TrustFactor[] {
    const factors: TrustFactor[] = [];

    // Account age factor (max 365 days for full score)
    const ageFactor = Math.min(1, data.accountAgeDays / 365);
    factors.push({
      name: 'account_age',
      weight: this.config.factorWeights['account_age'] || 0.15,
      value: Math.round(ageFactor * 100),
      maxValue: 100,
      description: 'Account age contribution',
    });

    // Report history (fewer reports = higher score)
    const reportPenalty = Math.max(0, 1 - data.reportsReceived * 0.05 - data.violationCount * 0.15);
    factors.push({
      name: 'report_history',
      weight: this.config.factorWeights['report_history'] || 0.25,
      value: Math.round(reportPenalty * 100),
      maxValue: 100,
      description: 'Report and violation history',
    });

    // Content quality (positive vs negative ratings)
    const totalRatings = data.positiveRatings + data.negativeRatings;
    const qualityRatio = totalRatings > 0 ? data.positiveRatings / totalRatings : 0.5;
    const contentVolumeFactor = Math.min(1, data.contentCount / 50);
    const contentQuality = qualityRatio * 0.7 + contentVolumeFactor * 0.3;
    factors.push({
      name: 'content_quality',
      weight: this.config.factorWeights['content_quality'] || 0.2,
      value: Math.round(contentQuality * 100),
      maxValue: 100,
      description: 'Content quality based on ratings',
    });

    // Community standing (followers/engagement)
    const communityScore = Math.min(
      1,
      (data.followers / 1000) * 0.5 + data.appealSuccessRate * 0.5,
    );
    factors.push({
      name: 'community_standing',
      weight: this.config.factorWeights['community_standing'] || 0.15,
      value: Math.round(communityScore * 100),
      maxValue: 100,
      description: 'Community engagement and standing',
    });

    // Verification status
    factors.push({
      name: 'verification_status',
      weight: this.config.factorWeights['verification_status'] || 0.1,
      value: data.isVerified ? 100 : 0,
      maxValue: 100,
      description: 'Account verification status',
    });

    // Engagement quality (good reports vs false reports)
    const reportQuality =
      data.reportsSubmitted > 0 ? Math.max(0, 1 - data.falseReports / data.reportsSubmitted) : 0.5;
    factors.push({
      name: 'engagement_quality',
      weight: this.config.factorWeights['engagement_quality'] || 0.15,
      value: Math.round(reportQuality * 100),
      maxValue: 100,
      description: 'Quality of community engagement',
    });

    return factors;
  }

  private getLevel(score: number): TrustLevel {
    const levels: TrustLevel[] = ['trusted_creator', 'verified', 'high', 'medium', 'low', 'new'];
    for (const level of levels) {
      if (score >= this.config.levelThresholds[level]) {
        return level;
      }
    }
    return 'new';
  }

  private getScoreOrCreate(userId: string): TrustScore {
    let trustScore = this.scores.get(userId);
    if (!trustScore) {
      trustScore = {
        userId,
        score: this.config.baseScore,
        level: this.getLevel(this.config.baseScore),
        factors: [],
        lastCalculated: Date.now(),
        history: [{ score: this.config.baseScore, timestamp: Date.now(), reason: 'Initial score' }],
      };
      this.scores.set(userId, trustScore);
    }
    return trustScore;
  }

  private updateGlobalScores(newScore: number): void {
    this.globalScores.push(newScore);
    if (this.globalScores.length > 10000) {
      this.globalScores = this.globalScores.slice(-5000);
    }
  }
}
