// ============================================================================
// Security Package - DDoS Protection
// ============================================================================

import crypto from 'node:crypto';
import type { DDoSConfig, IPReputation, ChallengeResult } from '../types';

/** Default DDoS protection configuration */
const DEFAULT_CONFIG: DDoSConfig = {
  thresholdRps: 1000,
  blockDurationMs: 600000,
  reputationDecay: 0.95,
  challengeThreshold: 50,
  maxTrackedIPs: 100000,
  patternWindowMs: 30000,
  geoBlockEnabled: false,
  blockedCountries: [],
};

/**
 * DDoSProtector - Advanced DDoS protection with IP reputation scoring,
 * challenge-response system, traffic pattern detection, and automatic blocking.
 */
export class DDoSProtector {
  private config: DDoSConfig;
  private reputations: Map<string, IPReputation>;
  private challenges: Map<string, ChallengeResult>;
  private trafficPatterns: Map<string, number[]>;
  private allowlist: Set<string>;
  private blocklist: Set<string>;
  private globalRequestCount: number;
  private globalWindowStart: number;
  private attackMode: boolean;

  constructor(config: Partial<DDoSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reputations = new Map();
    this.challenges = new Map();
    this.trafficPatterns = new Map();
    this.allowlist = new Set();
    this.blocklist = new Set();
    this.globalRequestCount = 0;
    this.globalWindowStart = Date.now();
    this.attackMode = false;
  }

  /** Process an incoming request and determine if it should be allowed */
  async processRequest(
    ip: string,
    _endpoint: string,
    headers: Record<string, string> = {},
  ): Promise<{
    allowed: boolean;
    reason: string;
    challenge?: ChallengeResult;
    reputation: number;
  }> {
    const now = Date.now();

    // Always allow allowlisted IPs
    if (this.allowlist.has(ip)) {
      return { allowed: true, reason: 'allowlisted', reputation: 100 };
    }

    // Always block blocklisted IPs
    if (this.blocklist.has(ip)) {
      return { allowed: false, reason: 'blocklisted', reputation: 0 };
    }

    // Update global traffic metrics
    this.updateGlobalMetrics(now);

    // Get or create IP reputation
    const reputation = this.getOrCreateReputation(ip, now);

    // Check if IP is currently blocked
    if (reputation.blocked && reputation.blockExpiry > now) {
      return { allowed: false, reason: 'blocked', reputation: reputation.score };
    } else if (reputation.blocked && reputation.blockExpiry <= now) {
      reputation.blocked = false;
      reputation.score = Math.min(reputation.score + 10, 50);
    }

    // Record traffic pattern
    this.recordTrafficPattern(ip, now);

    // Detect suspicious patterns
    const suspiciousScore = this.detectSuspiciousPatterns(ip, now, headers);
    reputation.score = Math.max(0, reputation.score - suspiciousScore);

    // Check geographic blocking
    if (this.config.geoBlockEnabled && reputation.country) {
      if (this.config.blockedCountries.includes(reputation.country)) {
        return { allowed: false, reason: 'geo_blocked', reputation: reputation.score };
      }
    }

    // If reputation is below challenge threshold, issue challenge
    if (reputation.score < this.config.challengeThreshold) {
      const challenge = this.issueChallenge(ip, now);
      return {
        allowed: false,
        reason: 'challenge_required',
        challenge,
        reputation: reputation.score,
      };
    }

    // If score is very low, block
    if (reputation.score <= 10) {
      this.blockIP(ip, now);
      return { allowed: false, reason: 'reputation_too_low', reputation: reputation.score };
    }

    // Check if under active attack
    if (this.attackMode && reputation.score < 70) {
      const challenge = this.issueChallenge(ip, now);
      return {
        allowed: false,
        reason: 'attack_mode_challenge',
        challenge,
        reputation: reputation.score,
      };
    }

    // Update request count
    reputation.requestCount++;
    reputation.lastSeen = now;

    // Apply decay to gradually restore reputation
    reputation.score = Math.min(100, reputation.score + this.config.reputationDecay * 0.1);

    return { allowed: true, reason: 'allowed', reputation: reputation.score };
  }

  /** Verify a challenge response */
  async verifyChallenge(ip: string, challengeId: string, solution: string): Promise<boolean> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return false;

    const now = Date.now();
    if (now > challenge.expiry) {
      this.challenges.delete(challengeId);
      return false;
    }

    const isCorrect = challenge.expectedAnswer === solution;
    challenge.solved = isCorrect;

    const reputation = this.reputations.get(ip);
    if (reputation) {
      if (isCorrect) {
        reputation.challengesPassed++;
        reputation.score = Math.min(100, reputation.score + 20);
      } else {
        reputation.challengesFailed++;
        reputation.score = Math.max(0, reputation.score - 15);
      }
    }

    this.challenges.delete(challengeId);
    return isCorrect;
  }

  /** Issue a proof-of-work challenge */
  private issueChallenge(ip: string, now: number): ChallengeResult {
    const reputation = this.reputations.get(ip);
    const failureCount = reputation?.challengesFailed || 0;
    const difficulty = Math.min(6, 3 + Math.floor(failureCount / 2));

    const challengeId = this.generateId();
    const nonce = this.generateRandomHex(16);
    const expectedAnswer = this.computeProofOfWork(nonce, difficulty);

    const challenge: ChallengeResult = {
      challengeId,
      type: 'proof-of-work',
      difficulty,
      issued: now,
      expiry: now + 30000,
      solved: false,
      solution: nonce,
      expectedAnswer,
    };

    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  /** Compute proof-of-work answer via iterated SHA-256 (client-reproducible) */
  private computeProofOfWork(nonce: string, difficulty: number): string {
    let hash = nonce;
    for (let i = 0; i < difficulty; i++) {
      hash = crypto
        .createHash('sha256')
        .update(hash + i.toString())
        .digest('hex');
    }
    return hash.substring(0, difficulty * 2);
  }

  /** Detect suspicious traffic patterns */
  private detectSuspiciousPatterns(
    ip: string,
    now: number,
    headers: Record<string, string>,
  ): number {
    let suspicionScore = 0;
    const pattern = this.trafficPatterns.get(ip) || [];

    // Check request rate in pattern window
    const windowStart = now - this.config.patternWindowMs;
    const recentRequests = pattern.filter((t) => t > windowStart);

    // High request rate
    const rps = recentRequests.length / (this.config.patternWindowMs / 1000);
    if (rps > this.config.thresholdRps / 100) {
      suspicionScore += 10;
    }
    if (rps > this.config.thresholdRps / 10) {
      suspicionScore += 30;
    }

    // Check for uniform timing (bot indicator)
    if (recentRequests.length > 5) {
      const intervals: number[] = [];
      for (let i = 1; i < recentRequests.length; i++) {
        intervals.push(recentRequests[i]! - recentRequests[i - 1]!);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance =
        intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // Very low standard deviation means robotic timing
      if (stdDev < 10 && recentRequests.length > 10) {
        suspicionScore += 20;
        const reputation = this.reputations.get(ip);
        if (reputation) {
          reputation.suspiciousPatterns.push('uniform_timing');
        }
      }
    }

    // Check missing or suspicious headers
    if (!headers['user-agent']) {
      suspicionScore += 5;
    }
    if (!headers['accept-language']) {
      suspicionScore += 3;
    }
    if (headers['user-agent'] && headers['user-agent'].length < 10) {
      suspicionScore += 5;
    }

    return suspicionScore;
  }

  /** Record traffic pattern for an IP */
  private recordTrafficPattern(ip: string, now: number): void {
    const pattern = this.trafficPatterns.get(ip) || [];
    pattern.push(now);

    // Keep only recent entries
    const cutoff = now - this.config.patternWindowMs;
    const cleaned = pattern.filter((t) => t > cutoff);
    this.trafficPatterns.set(ip, cleaned);

    // Enforce max tracked IPs
    if (this.trafficPatterns.size > this.config.maxTrackedIPs) {
      const oldestKey = this.trafficPatterns.keys().next().value;
      if (oldestKey) this.trafficPatterns.delete(oldestKey);
    }
  }

  /** Update global traffic metrics and detect attack mode */
  private updateGlobalMetrics(now: number): void {
    if (now - this.globalWindowStart > 1000) {
      const rps = this.globalRequestCount / ((now - this.globalWindowStart) / 1000);
      this.attackMode = rps > this.config.thresholdRps;
      this.globalRequestCount = 0;
      this.globalWindowStart = now;
    }
    this.globalRequestCount++;
  }

  /** Get or create an IP reputation entry */
  private getOrCreateReputation(ip: string, now: number): IPReputation {
    let reputation = this.reputations.get(ip);
    if (!reputation) {
      reputation = {
        ip,
        score: 80,
        requestCount: 0,
        firstSeen: now,
        lastSeen: now,
        blocked: false,
        blockExpiry: 0,
        challengesPassed: 0,
        challengesFailed: 0,
        suspiciousPatterns: [],
      };
      this.reputations.set(ip, reputation);
    }
    return reputation;
  }

  /** Block an IP address */
  private blockIP(ip: string, now: number): void {
    const reputation = this.reputations.get(ip);
    if (reputation) {
      reputation.blocked = true;
      reputation.blockExpiry = now + this.config.blockDurationMs;
    }
  }

  /** Add IP to allowlist */
  addToAllowlist(ip: string): void {
    this.allowlist.add(ip);
    this.blocklist.delete(ip);
  }

  /** Add IP to blocklist */
  addToBlocklist(ip: string): void {
    this.blocklist.add(ip);
    this.allowlist.delete(ip);
  }

  /** Remove IP from allowlist */
  removeFromAllowlist(ip: string): void {
    this.allowlist.delete(ip);
  }

  /** Remove IP from blocklist */
  removeFromBlocklist(ip: string): void {
    this.blocklist.delete(ip);
  }

  /** Get reputation for an IP */
  getReputation(ip: string): IPReputation | undefined {
    return this.reputations.get(ip);
  }

  /** Check if system is in attack mode */
  isUnderAttack(): boolean {
    return this.attackMode;
  }

  /** Get statistics about current state */
  getStats(): {
    trackedIPs: number;
    blockedIPs: number;
    attackMode: boolean;
    pendingChallenges: number;
  } {
    let blockedCount = 0;
    const now = Date.now();
    for (const rep of this.reputations.values()) {
      if (rep.blocked && rep.blockExpiry > now) blockedCount++;
    }

    return {
      trackedIPs: this.reputations.size,
      blockedIPs: blockedCount,
      attackMode: this.attackMode,
      pendingChallenges: this.challenges.size,
    };
  }

  /** Cleanup expired data */
  async cleanup(): Promise<void> {
    const now = Date.now();

    // Remove expired challenges
    for (const [id, challenge] of this.challenges) {
      if (now > challenge.expiry) this.challenges.delete(id);
    }

    // Remove old traffic patterns
    for (const [ip, timestamps] of this.trafficPatterns) {
      const cutoff = now - this.config.patternWindowMs * 2;
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length === 0) {
        this.trafficPatterns.delete(ip);
      } else {
        this.trafficPatterns.set(ip, recent);
      }
    }
  }

  /** Generate a random hex string */
  private generateRandomHex(length: number): string {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /** Generate a unique ID */
  private generateId(): string {
    return `challenge_${Date.now()}_${this.generateRandomHex(8)}`;
  }
}
