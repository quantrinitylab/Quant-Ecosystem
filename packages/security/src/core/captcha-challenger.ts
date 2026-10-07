// ============================================================================
// Security Package - Captcha Challenger Service
// ============================================================================

import crypto from 'crypto';
import { z } from 'zod';

export const ChallengeDecisionSchema = z.object({
  shouldChallenge: z.boolean(),
  reason: z.string(),
  challengeType: z.enum(['recaptcha', 'hcaptcha', 'turnstile']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export type ChallengeDecision = z.infer<typeof ChallengeDecisionSchema>;

interface PendingChallenge {
  token: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  solved: boolean;
}

/**
 * CaptchaChallengerService - Determines when to issue captcha challenges
 * based on user reputation and activity risk scores.
 */
export class CaptchaChallengerService {
  private reputationThreshold: number;
  private suspiciousActivityThreshold: number;
  private pendingChallenges: Map<string, PendingChallenge>;
  private challengeExpiry: number;

  constructor(reputationThreshold: number = 30, suspiciousActivityThreshold: number = 0.7) {
    this.reputationThreshold = reputationThreshold;
    this.suspiciousActivityThreshold = suspiciousActivityThreshold;
    this.pendingChallenges = new Map();
    this.challengeExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /** Determine if a user should be challenged with a captcha */
  shouldChallenge(
    _userId: string,
    activity: {
      type: string;
      riskScore: number;
      ipReputation?: number;
      reputationScore: number;
    },
  ): ChallengeDecision {
    const lowReputation = activity.reputationScore < this.reputationThreshold;
    const highRisk = activity.riskScore > this.suspiciousActivityThreshold;
    const badIp = activity.ipReputation !== undefined && activity.ipReputation < 0.3;

    const shouldTrigger = lowReputation && (highRisk || badIp);

    if (!shouldTrigger) {
      return {
        shouldChallenge: false,
        reason: 'User activity within acceptable parameters',
        challengeType: 'turnstile',
        difficulty: 'easy',
      };
    }

    // Determine difficulty based on risk level
    let difficulty: 'easy' | 'medium' | 'hard' = 'easy';
    let reason = 'Low reputation score';

    if (activity.riskScore > 0.9 || (badIp && highRisk)) {
      difficulty = 'hard';
      reason = 'Very high risk activity with low reputation';
    } else if (activity.riskScore > 0.7 || badIp) {
      difficulty = 'medium';
      reason =
        lowReputation && highRisk
          ? 'Low reputation combined with suspicious activity'
          : 'Suspicious IP reputation';
    }

    // Choose challenge type based on difficulty
    let challengeType: 'recaptcha' | 'hcaptcha' | 'turnstile' = 'turnstile';
    if (difficulty === 'hard') {
      challengeType = 'recaptcha';
    } else if (difficulty === 'medium') {
      challengeType = 'hcaptcha';
    }

    return {
      shouldChallenge: true,
      reason,
      challengeType,
      difficulty,
    };
  }

  /** Verify a captcha response token */
  verifyCaptcha(token: string, expectedAnswer?: string): boolean {
    // Find pending challenge with this token
    for (const [, challenge] of this.pendingChallenges) {
      if (challenge.token === token) {
        const now = Date.now();
        if (now > challenge.expiresAt) {
          return false; // Expired
        }
        if (expectedAnswer !== undefined) {
          // In testing, verify against expected answer
          challenge.solved = token === expectedAnswer;
          return challenge.solved;
        }
        // Mark as solved
        challenge.solved = true;
        return true;
      }
    }
    return false;
  }

  /** Check if a user has a pending challenge */
  getChallengePending(userId: string): { pending: boolean; issuedAt?: number; expiresAt?: number } {
    const challenge = this.pendingChallenges.get(userId);
    if (!challenge) {
      return { pending: false };
    }

    const now = Date.now();
    if (now > challenge.expiresAt) {
      this.pendingChallenges.delete(userId);
      return { pending: false };
    }

    if (challenge.solved) {
      return { pending: false };
    }

    return {
      pending: true,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    };
  }

  /** Issue a new captcha challenge for a user */
  issueChallenge(userId: string): { token: string; expiresAt: number } {
    const now = Date.now();
    const token = this.generateToken();
    const expiresAt = now + this.challengeExpiry;

    this.pendingChallenges.set(userId, {
      token,
      userId,
      issuedAt: now,
      expiresAt,
      solved: false,
    });

    return { token, expiresAt };
  }

  private generateToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars[crypto.randomInt(chars.length)];
    }
    return token;
  }
}
