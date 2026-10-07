import { PermissionLevel } from './permissions.js';

const GRADUATION_DAYS = 30;
const MAX_SCORE = 100;
const MIN_SCORE = 0;
const INITIAL_SCORE = 20;

export const AUTO_PAUSE_THRESHOLD = 15;
export const REVIEW_ZONE_THRESHOLD = 25;

export function scoreToPermissionLevel(score: number): PermissionLevel {
  if (score <= 20) return PermissionLevel.OBSERVE;
  if (score <= 40) return PermissionLevel.SUGGEST;
  if (score <= 60) return PermissionLevel.ACT_LOW;
  if (score <= 80) return PermissionLevel.ACT_HIGH;
  return PermissionLevel.FULL_AUTO;
}

export function permissionLevelToScore(level: PermissionLevel): number {
  switch (level) {
    case PermissionLevel.OBSERVE:
      return 20;
    case PermissionLevel.SUGGEST:
      return 21;
    case PermissionLevel.ACT_LOW:
      return 41;
    case PermissionLevel.ACT_HIGH:
      return 61;
    case PermissionLevel.FULL_AUTO:
      return 81;
  }
}

export interface TrustScoreOptions {
  agentId?: string;
  onAutoPause?: (agentId: string) => void;
}

export class TrustScore {
  private score: number;
  private readonly createdAt: number;
  private successCount: number = 0;
  private failureCount: number = 0;
  private readonly agentId: string;
  private readonly onAutoPause?: (agentId: string) => void;

  constructor(
    initialScore: number = INITIAL_SCORE,
    createdAt?: number,
    options?: TrustScoreOptions,
  ) {
    this.score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, initialScore));
    this.createdAt = createdAt ?? Date.now();
    this.agentId = options?.agentId ?? 'unknown';
    this.onAutoPause = options?.onAutoPause;
  }

  getScore(): number {
    return this.score;
  }

  getPermissionLevel(): PermissionLevel {
    return scoreToPermissionLevel(this.score);
  }

  getDaysActive(): number {
    return Math.floor((Date.now() - this.createdAt) / (24 * 60 * 60 * 1000));
  }

  recordSuccess(): void {
    this.successCount++;
    const daysActive = this.getDaysActive();
    const increment = daysActive >= GRADUATION_DAYS ? 5 : 2;
    this.score = Math.min(MAX_SCORE, this.score + increment);
  }

  recordFailure(): void {
    this.failureCount++;
    this.score = Math.max(MIN_SCORE, this.score - 10);
    if (this.score <= AUTO_PAUSE_THRESHOLD) {
      this.onAutoPause?.(this.agentId);
    }
  }

  isPaused(): boolean {
    return this.score <= AUTO_PAUSE_THRESHOLD;
  }

  requiresReview(): boolean {
    return this.score > AUTO_PAUSE_THRESHOLD && this.score <= REVIEW_ZONE_THRESHOLD;
  }

  getPauseReason(): string | null {
    if (this.score <= AUTO_PAUSE_THRESHOLD) {
      return `Agent ${this.agentId} auto-paused: trust score ${this.score} is at or below threshold ${AUTO_PAUSE_THRESHOLD}`;
    }
    return null;
  }

  getSuccessCount(): number {
    return this.successCount;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  canGraduateToFullAuto(): boolean {
    return this.getDaysActive() >= GRADUATION_DAYS && this.score >= 81;
  }
}
