import { AppReview } from '../types.js';

export interface TrustBreakdown {
  verificationScore: number;
  reviewAuthenticityScore: number;
  contentSafetyScore: number;
  overallScore: number;
}

export class TrustScorer {
  private verificationStatus: Map<string, boolean> = new Map();
  private safetyScores: Map<string, number> = new Map();
  private breakdowns: Map<string, TrustBreakdown> = new Map();

  calculate(creatorId: string, appId: string): number {
    const verification = this.factorVerification(creatorId);
    const safety = this.factorContentSafety(appId);

    const overall = verification * 0.4 + safety * 0.6;
    const score = Math.min(100, Math.max(0, overall));

    this.breakdowns.set(appId, {
      verificationScore: verification,
      reviewAuthenticityScore: 100,
      contentSafetyScore: safety,
      overallScore: score,
    });

    return score;
  }

  factorVerification(creatorId: string): number {
    const verified = this.verificationStatus.get(creatorId);
    return verified ? 100 : 40;
  }

  factorReviewAuthenticity(reviews: AppReview[]): number {
    if (reviews.length === 0) return 50;

    const verifiedCount = reviews.filter((r) => r.verifiedPurchase).length;
    const verifiedRatio = verifiedCount / reviews.length;

    // Check for suspicious patterns (all 5-star, no text, etc.)
    const uniqueUsers = new Set(reviews.map((r) => r.userId)).size;
    const diversityRatio = uniqueUsers / reviews.length;

    const ratingVariance = this.calculateRatingVariance(reviews);
    const varianceScore = Math.min(1, ratingVariance / 2);

    const score = (verifiedRatio * 40 + diversityRatio * 30 + varianceScore * 30) * 100;
    return Math.min(100, Math.max(0, score));
  }

  factorContentSafety(appId: string): number {
    return this.safetyScores.get(appId) ?? 80;
  }

  getBreakdown(appId: string): TrustBreakdown | null {
    return this.breakdowns.get(appId) ?? null;
  }

  setVerificationStatus(creatorId: string, verified: boolean): void {
    this.verificationStatus.set(creatorId, verified);
  }

  setSafetyScore(appId: string, score: number): void {
    this.safetyScores.set(appId, score);
  }

  private calculateRatingVariance(reviews: AppReview[]): number {
    if (reviews.length < 2) return 0;
    const ratings = reviews.map((r) => r.rating);
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const variance = ratings.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratings.length;
    return variance;
  }
}
