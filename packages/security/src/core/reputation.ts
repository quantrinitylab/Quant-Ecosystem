// ============================================================================
// Security Package - Reputation Service
// ============================================================================

import { z } from 'zod';

export const ReputationFactorsSchema = z.object({
  accountAgeDays: z.number().min(0),
  reportsReceived: z.number().min(0),
  reportsSubmitted: z.number().min(0),
  verificationLevel: z.enum(['none', 'email', 'phone', 'id']),
  activityScore: z.number().min(0).max(100),
  contentQualityRatio: z.number().min(0).max(1),
});

export type ReputationFactors = z.infer<typeof ReputationFactorsSchema>;

export const ReputationScoreSchema = z.object({
  userId: z.string(),
  score: z.number().min(0).max(100),
  level: z.enum(['untrusted', 'low', 'medium', 'high', 'trusted']),
  factors: ReputationFactorsSchema,
  calculatedAt: z.number(),
});

export type ReputationScore = z.infer<typeof ReputationScoreSchema>;

/** Weights for reputation calculation */
const WEIGHTS = {
  accountAge: 15,
  reportsReceived: -25,
  reportsSubmitted: -5,
  verification: 25,
  activity: 15,
  contentQuality: 20,
} as const;

/** Verification level score mapping */
const VERIFICATION_SCORES: Record<string, number> = {
  none: 0,
  email: 0.3,
  phone: 0.6,
  id: 1.0,
};

function getLevel(score: number): 'untrusted' | 'low' | 'medium' | 'high' | 'trusted' {
  if (score < 20) return 'untrusted';
  if (score < 40) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'trusted';
}

/**
 * ReputationService - Manages user reputation scores based on multiple factors.
 * Higher scores indicate more trustworthy users.
 */
export class ReputationService {
  private scores: Map<string, ReputationScore>;

  constructor() {
    this.scores = new Map();
  }

  /** Calculate reputation score for a user based on their factors */
  calculateReputation(userId: string, factors: ReputationFactors): ReputationScore {
    const parsed = ReputationFactorsSchema.parse(factors);

    // Base score starts at 50
    let score = 50;

    // Account age contribution (capped at 1 year = 365 days for max benefit)
    const ageNormalized = Math.min(1, parsed.accountAgeDays / 365);
    score += WEIGHTS.accountAge * ageNormalized;

    // Reports received penalty (exponential decay)
    const reportPenalty = Math.min(1, parsed.reportsReceived / 10);
    score += WEIGHTS.reportsReceived * reportPenalty;

    // Excessive report submission penalty (reporting too much is suspicious)
    const submittedPenalty = Math.min(1, Math.max(0, parsed.reportsSubmitted - 5) / 20);
    score += WEIGHTS.reportsSubmitted * submittedPenalty;

    // Verification bonus
    const verificationScore = VERIFICATION_SCORES[parsed.verificationLevel] ?? 0;
    score += WEIGHTS.verification * verificationScore;

    // Activity score contribution
    const activityNormalized = parsed.activityScore / 100;
    score += WEIGHTS.activity * activityNormalized;

    // Content quality contribution
    score += WEIGHTS.contentQuality * parsed.contentQualityRatio;

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    const result: ReputationScore = {
      userId,
      score,
      level: getLevel(score),
      factors: parsed,
      calculatedAt: Date.now(),
    };

    this.scores.set(userId, result);
    return result;
  }

  /** Update reputation when a report is received or submitted */
  updateOnReport(userId: string, reportType: 'received' | 'submitted'): void {
    const existing = this.scores.get(userId);
    if (!existing) return;

    const updatedFactors = { ...existing.factors };
    if (reportType === 'received') {
      updatedFactors.reportsReceived += 1;
    } else {
      updatedFactors.reportsSubmitted += 1;
    }

    this.calculateReputation(userId, updatedFactors);
  }

  /** Update reputation when user completes verification */
  updateOnVerification(userId: string, level: string): void {
    const existing = this.scores.get(userId);
    if (!existing) return;

    const validLevels = ['none', 'email', 'phone', 'id'] as const;
    const validLevel = validLevels.find((l) => l === level);
    if (!validLevel) return;

    const updatedFactors = { ...existing.factors, verificationLevel: validLevel };
    this.calculateReputation(userId, updatedFactors);
  }

  /** Get current reputation for a user */
  getReputation(userId: string): ReputationScore | null {
    return this.scores.get(userId) ?? null;
  }

  /** Calculate reputation for multiple users at once */
  bulkCalculate(users: { userId: string; factors: ReputationFactors }[]): ReputationScore[] {
    return users.map((u) => this.calculateReputation(u.userId, u.factors));
  }
}
