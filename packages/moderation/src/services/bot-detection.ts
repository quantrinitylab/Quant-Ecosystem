// ============================================================================
// Moderation - Bot Detection Service
// Feature-based classifier with timing, pattern, entropy, and behavioral analysis
// ============================================================================

import type { BotCheckResult, BotClassification, BotSignal } from '../types';

interface BotDetectionConfig {
  postingFrequencyThreshold: number;
  repetitionThreshold: number;
  followerRatioThreshold: number;
  ageActivityThreshold: number;
}

const DEFAULT_CONFIG: BotDetectionConfig = {
  postingFrequencyThreshold: 30,
  repetitionThreshold: 0.7,
  followerRatioThreshold: 10,
  ageActivityThreshold: 50,
};

interface FeatureWeights {
  postingFrequency: number;
  contentRepetition: number;
  followerRatio: number;
  ageActivity: number;
  likesWithoutReads: number;
  timingRegularity: number;
  entropyAnomaly: number;
  behavioralAnomaly: number;
}

const DEFAULT_WEIGHTS: FeatureWeights = {
  postingFrequency: 0.2,
  contentRepetition: 0.15,
  followerRatio: 0.1,
  ageActivity: 0.15,
  likesWithoutReads: 0.1,
  timingRegularity: 0.1,
  entropyAnomaly: 0.1,
  behavioralAnomaly: 0.1,
};

/**
 * BotDetectionService - Feature-based bot classifier
 *
 * Evaluates accounts using weighted feature analysis including timing patterns,
 * content repetition entropy, follower ratio anomalies, and behavioral signals.
 */
export class BotDetectionService {
  private config: BotDetectionConfig;
  private weights: FeatureWeights;

  constructor(config: Partial<BotDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.weights = { ...DEFAULT_WEIGHTS };
  }

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

    const postingFeature = this.scorePostingFrequency(params.postsPerHour);
    if (postingFeature) signals.push(postingFeature);

    const repetitionFeature = this.scoreContentRepetition(params.uniqueContentRatio);
    if (repetitionFeature) signals.push(repetitionFeature);

    const ratioFeature = this.scoreFollowerRatio(params.followerCount, params.followingCount);
    if (ratioFeature) signals.push(ratioFeature);

    const ageFeature = this.scoreAgeActivity(params.accountAgeDays, params.totalPosts);
    if (ageFeature) signals.push(ageFeature);

    if (params.likesWithoutReads !== undefined) {
      const likesFeature = this.scoreLikesWithoutReads(params.likesWithoutReads);
      if (likesFeature) signals.push(likesFeature);
    }

    const timingFeature = this.scoreTimingRegularity(
      params.postsPerHour,
      params.totalPosts,
      params.accountAgeDays,
    );
    if (timingFeature) signals.push(timingFeature);

    const entropyFeature = this.scoreEntropyAnomaly(params.uniqueContentRatio, params.totalPosts);
    if (entropyFeature) signals.push(entropyFeature);

    if (params.sessionCount !== undefined) {
      const behavioralFeature = this.scoreBehavioralAnomaly(
        params.sessionCount,
        params.accountAgeDays,
        params.totalPosts,
      );
      if (behavioralFeature) signals.push(behavioralFeature);
    }

    const score = this.calculateWeightedScore(signals);
    const classification = this.classify(score);

    return {
      userId,
      score,
      classification,
      signals,
      checkedAt: Date.now(),
    };
  }

  private scorePostingFrequency(postsPerHour: number): BotSignal | null {
    if (postsPerHour <= this.config.postingFrequencyThreshold) return null;

    const ratio = postsPerHour / this.config.postingFrequencyThreshold;
    const sigmoidScore = 100 / (1 + Math.exp(-1.5 * (ratio - 1)));

    return {
      type: 'superhuman_posting',
      score: Math.min(100, Math.round(sigmoidScore)),
      description: `${postsPerHour} posts/hour exceeds threshold of ${this.config.postingFrequencyThreshold}`,
    };
  }

  private scoreContentRepetition(uniqueContentRatio: number): BotSignal | null {
    const repetitionRatio = 1 - uniqueContentRatio;
    if (repetitionRatio <= this.config.repetitionThreshold) return null;

    const normalizedScore =
      Math.pow(
        (repetitionRatio - this.config.repetitionThreshold) / (1 - this.config.repetitionThreshold),
        0.7,
      ) * 100;

    return {
      type: 'content_repetition',
      score: Math.min(100, Math.round(normalizedScore)),
      description: `Content repetition ratio ${(repetitionRatio * 100).toFixed(0)}% exceeds threshold`,
    };
  }

  private scoreFollowerRatio(followerCount: number, followingCount: number): BotSignal | null {
    if (followerCount === 0 && followingCount === 0) return null;

    const ratio = followingCount > 0 ? followingCount / Math.max(1, followerCount) : 0;
    if (ratio <= this.config.followerRatioThreshold) return null;

    const logScore = (Math.log2(ratio / this.config.followerRatioThreshold) / Math.log2(10)) * 50;

    return {
      type: 'abnormal_follower_ratio',
      score: Math.min(100, Math.round(logScore)),
      description: `Following/follower ratio ${ratio.toFixed(1)} is abnormally high`,
    };
  }

  private scoreAgeActivity(accountAgeDays: number, totalPosts: number): BotSignal | null {
    const effectiveAge = Math.max(1, accountAgeDays);
    const postsPerDay = totalPosts / effectiveAge;

    if (postsPerDay <= this.config.ageActivityThreshold) return null;

    const excessRatio = postsPerDay / this.config.ageActivityThreshold;
    const ageFactor = Math.max(0.3, 1 - Math.log10(effectiveAge + 1) / 4);
    const score = Math.min(100, excessRatio * 25 * ageFactor);

    return {
      type: 'high_activity_young_account',
      score: Math.round(score),
      description: `${postsPerDay.toFixed(1)} posts/day for a ${accountAgeDays}-day old account`,
    };
  }

  private scoreLikesWithoutReads(likesWithoutReads: number): BotSignal | null {
    if (likesWithoutReads <= 50) return null;

    const normalized = Math.min(1, (likesWithoutReads - 50) / 100);
    const score = 30 + normalized * 70;

    return {
      type: 'likes_without_reads',
      score: Math.min(100, Math.round(score)),
      description: `${likesWithoutReads} likes on content without reading it`,
    };
  }

  private scoreTimingRegularity(
    postsPerHour: number,
    totalPosts: number,
    accountAgeDays: number,
  ): BotSignal | null {
    const effectiveAge = Math.max(1, accountAgeDays);
    const expectedHours = effectiveAge * 24;
    if (expectedHours < 24) return null;

    const avgIntervalHours = expectedHours / Math.max(1, totalPosts);
    const superhumanRate = postsPerHour > this.config.postingFrequencyThreshold * 0.5;
    const highVolume = totalPosts > effectiveAge * this.config.ageActivityThreshold;

    if (!superhumanRate && !highVolume) return null;

    const rateScore = superhumanRate
      ? Math.min(1, postsPerHour / (this.config.postingFrequencyThreshold * 2))
      : 0;
    const volumeScore = highVolume
      ? Math.min(1, totalPosts / effectiveAge / (this.config.ageActivityThreshold * 2))
      : 0;
    const combinedScore = (rateScore + volumeScore) / 2;

    if (combinedScore < 0.2) return null;

    return {
      type: 'timing_regularity',
      score: Math.min(100, Math.round(combinedScore * 80)),
      description: `Suspicious posting cadence: avg ${avgIntervalHours.toFixed(2)}h between posts over ${effectiveAge} days`,
    };
  }

  private scoreEntropyAnomaly(uniqueContentRatio: number, totalPosts: number): BotSignal | null {
    if (totalPosts < 10) return null;
    if (uniqueContentRatio > 0.5) return null;

    const uniqueCount = Math.max(1, Math.round(totalPosts * uniqueContentRatio));
    const shannonEntropy = Math.log2(uniqueCount);
    const expectedEntropy = Math.log2(Math.max(2, totalPosts * 0.5));
    const entropyRatio = shannonEntropy / Math.max(0.01, expectedEntropy);

    if (entropyRatio > 0.5) return null;

    const repetitionFactor = 1 - uniqueContentRatio;
    const score = Math.round((1 - entropyRatio) * 50 * repetitionFactor);
    if (score < 20) return null;

    return {
      type: 'entropy_anomaly',
      score: Math.min(100, score),
      description: `Low content entropy (${shannonEntropy.toFixed(2)} bits vs expected ${expectedEntropy.toFixed(2)})`,
    };
  }

  private scoreBehavioralAnomaly(
    sessionCount: number,
    accountAgeDays: number,
    totalPosts: number,
  ): BotSignal | null {
    const effectiveAge = Math.max(1, accountAgeDays);
    const sessionsPerDay = sessionCount / effectiveAge;
    const postsPerSession = sessionCount > 0 ? totalPosts / sessionCount : totalPosts;

    const highPostsPerSession = postsPerSession > 50;
    const lowSessionDiversity = sessionsPerDay < 0.5 && totalPosts > 100;

    if (!highPostsPerSession && !lowSessionDiversity) return null;

    let score = 0;
    if (highPostsPerSession) {
      score += Math.min(50, (postsPerSession / 50) * 30);
    }
    if (lowSessionDiversity) {
      score += Math.min(50, (totalPosts / effectiveAge / 100) * 30);
    }

    if (score < 20) return null;

    return {
      type: 'behavioral_anomaly',
      score: Math.min(100, Math.round(score)),
      description: `Behavioral anomaly: ${postsPerSession.toFixed(1)} posts/session, ${sessionsPerDay.toFixed(2)} sessions/day`,
    };
  }

  private calculateWeightedScore(signals: BotSignal[]): number {
    if (signals.length === 0) return 0;

    const signalTypeWeights: Record<string, number> = {
      superhuman_posting: this.weights.postingFrequency,
      content_repetition: this.weights.contentRepetition,
      abnormal_follower_ratio: this.weights.followerRatio,
      high_activity_young_account: this.weights.ageActivity,
      likes_without_reads: this.weights.likesWithoutReads,
      timing_regularity: this.weights.timingRegularity,
      entropy_anomaly: this.weights.entropyAnomaly,
      behavioral_anomaly: this.weights.behavioralAnomaly,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = signalTypeWeights[signal.type] ?? 0.1;
      weightedSum += signal.score * weight;
      totalWeight += weight;
    }

    const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    const signalCountBonus = Math.min(20, signals.length * 4);
    const finalScore = normalizedScore * 0.8 + signalCountBonus;

    return Math.min(100, Math.round(finalScore));
  }

  private classify(score: number): BotClassification {
    if (score <= 20) return 'human';
    if (score <= 40) return 'likely_human';
    if (score <= 60) return 'suspicious';
    if (score <= 80) return 'likely_bot';
    return 'bot';
  }
}
