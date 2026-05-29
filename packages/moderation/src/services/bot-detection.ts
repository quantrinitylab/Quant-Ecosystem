// ============================================================================
// Moderation - Bot Detection Service
// Scores accounts for bot-like behavior using multiple signals
// ============================================================================

import type { BotCheckResult, BotClassification, BotSignal } from '../types';

interface BotDetectionConfig {
  postingFrequencyThreshold: number; // posts per hour
  repetitionThreshold: number; // 0-1
  followerRatioThreshold: number;
  ageActivityThreshold: number;
}

const DEFAULT_CONFIG: BotDetectionConfig = {
  postingFrequencyThreshold: 30,
  repetitionThreshold: 0.7,
  followerRatioThreshold: 10,
  ageActivityThreshold: 50,
};

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Heuristic scoring with fixed thresholds, no ML model
 * Production path: Train ML classifier on labeled bot/human dataset, integrate with feature pipeline
 *
 * BotDetectionService - Account bot scoring
 *
 * Evaluates accounts for bot-like behavior using signals including
 * superhuman posting rates, content repetition, follower ratio anomalies,
 * and activity vs account age patterns.
 */
export class BotDetectionService {
  private config: BotDetectionConfig;

  constructor(config: Partial<BotDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Check an account for bot-like behavior */
  checkAccount(params: {
    userId: string;
    postsPerHour: number;
    uniqueContentRatio: number;
    followerCount: number;
    followingCount: number;
    accountAgeDays: number;
    totalPosts: number;
    likesWithoutReads?: number;
    sessionCount?: number;
  }): BotCheckResult {
    const { userId } = params;
    const signals: BotSignal[] = [];

    // Superhuman posting rate
    const postingSignal = this.checkPostingFrequency(params.postsPerHour);
    if (postingSignal) signals.push(postingSignal);

    // Low unique content ratio (high repetition)
    const repetitionSignal = this.checkRepetition(params.uniqueContentRatio);
    if (repetitionSignal) signals.push(repetitionSignal);

    // Abnormal follower/following ratio
    const ratioSignal = this.checkFollowerRatio(params.followerCount, params.followingCount);
    if (ratioSignal) signals.push(ratioSignal);

    // High activity vs young account
    const ageActivitySignal = this.checkAgeActivity(params.accountAgeDays, params.totalPosts);
    if (ageActivitySignal) signals.push(ageActivitySignal);

    // Likes without reads pattern
    if (params.likesWithoutReads !== undefined) {
      const likesSignal = this.checkLikesWithoutReads(params.likesWithoutReads);
      if (likesSignal) signals.push(likesSignal);
    }

    // Calculate overall score
    const score = this.calculateScore(signals);
    const classification = this.classify(score);

    return {
      userId,
      score,
      classification,
      signals,
      checkedAt: Date.now(),
    };
  }

  // --- Private Methods ---

  private checkPostingFrequency(postsPerHour: number): BotSignal | null {
    if (postsPerHour > this.config.postingFrequencyThreshold) {
      const ratio = postsPerHour / this.config.postingFrequencyThreshold;
      return {
        type: 'superhuman_posting',
        score: Math.min(100, ratio * 30),
        description: `${postsPerHour} posts/hour exceeds threshold of ${this.config.postingFrequencyThreshold}`,
      };
    }
    return null;
  }

  private checkRepetition(uniqueContentRatio: number): BotSignal | null {
    const repetitionRatio = 1 - uniqueContentRatio;
    if (repetitionRatio > this.config.repetitionThreshold) {
      return {
        type: 'content_repetition',
        score: Math.min(100, (repetitionRatio / this.config.repetitionThreshold) * 40),
        description: `Content repetition ratio ${(repetitionRatio * 100).toFixed(0)}% exceeds threshold`,
      };
    }
    return null;
  }

  private checkFollowerRatio(followerCount: number, followingCount: number): BotSignal | null {
    if (followerCount === 0 && followingCount === 0) return null;

    const ratio = followingCount > 0 ? followingCount / Math.max(1, followerCount) : 0;

    if (ratio > this.config.followerRatioThreshold) {
      return {
        type: 'abnormal_follower_ratio',
        score: Math.min(100, (ratio / this.config.followerRatioThreshold) * 25),
        description: `Following/follower ratio ${ratio.toFixed(1)} is abnormally high`,
      };
    }
    return null;
  }

  private checkAgeActivity(accountAgeDays: number, totalPosts: number): BotSignal | null {
    if (accountAgeDays === 0) accountAgeDays = 1;
    const postsPerDay = totalPosts / accountAgeDays;

    if (postsPerDay > this.config.ageActivityThreshold) {
      return {
        type: 'high_activity_young_account',
        score: Math.min(100, (postsPerDay / this.config.ageActivityThreshold) * 30),
        description: `${postsPerDay.toFixed(1)} posts/day for a ${accountAgeDays}-day old account`,
      };
    }
    return null;
  }

  private checkLikesWithoutReads(likesWithoutReads: number): BotSignal | null {
    if (likesWithoutReads > 50) {
      return {
        type: 'likes_without_reads',
        score: Math.min(100, likesWithoutReads),
        description: `${likesWithoutReads} likes on content without reading it`,
      };
    }
    return null;
  }

  private calculateScore(signals: BotSignal[]): number {
    if (signals.length === 0) return 0;
    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    // Normalize to 0-100, with diminishing returns
    return Math.min(100, Math.round(totalScore / signals.length + signals.length * 10));
  }

  private classify(score: number): BotClassification {
    if (score <= 20) return 'human';
    if (score <= 40) return 'likely_human';
    if (score <= 60) return 'suspicious';
    if (score <= 80) return 'likely_bot';
    return 'bot';
  }
}
