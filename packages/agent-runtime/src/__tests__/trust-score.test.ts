import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TrustScore,
  scoreToPermissionLevel,
  AUTO_PAUSE_THRESHOLD,
  REVIEW_ZONE_THRESHOLD,
} from '../trust-score.js';
import { PermissionLevel } from '../permissions.js';

describe('scoreToPermissionLevel', () => {
  it('maps 0-20 to OBSERVE', () => {
    expect(scoreToPermissionLevel(0)).toBe(PermissionLevel.OBSERVE);
    expect(scoreToPermissionLevel(10)).toBe(PermissionLevel.OBSERVE);
    expect(scoreToPermissionLevel(20)).toBe(PermissionLevel.OBSERVE);
  });

  it('maps 21-40 to SUGGEST', () => {
    expect(scoreToPermissionLevel(21)).toBe(PermissionLevel.SUGGEST);
    expect(scoreToPermissionLevel(30)).toBe(PermissionLevel.SUGGEST);
    expect(scoreToPermissionLevel(40)).toBe(PermissionLevel.SUGGEST);
  });

  it('maps 41-60 to ACT_LOW', () => {
    expect(scoreToPermissionLevel(41)).toBe(PermissionLevel.ACT_LOW);
    expect(scoreToPermissionLevel(50)).toBe(PermissionLevel.ACT_LOW);
    expect(scoreToPermissionLevel(60)).toBe(PermissionLevel.ACT_LOW);
  });

  it('maps 61-80 to ACT_HIGH', () => {
    expect(scoreToPermissionLevel(61)).toBe(PermissionLevel.ACT_HIGH);
    expect(scoreToPermissionLevel(70)).toBe(PermissionLevel.ACT_HIGH);
    expect(scoreToPermissionLevel(80)).toBe(PermissionLevel.ACT_HIGH);
  });

  it('maps 81-100 to FULL_AUTO', () => {
    expect(scoreToPermissionLevel(81)).toBe(PermissionLevel.FULL_AUTO);
    expect(scoreToPermissionLevel(90)).toBe(PermissionLevel.FULL_AUTO);
    expect(scoreToPermissionLevel(100)).toBe(PermissionLevel.FULL_AUTO);
  });
});

describe('TrustScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts new agent at score 20 (OBSERVE level)', () => {
    const trust = new TrustScore();
    expect(trust.getScore()).toBe(20);
    expect(trust.getPermissionLevel()).toBe(PermissionLevel.OBSERVE);
  });

  it('increments score on success', () => {
    const trust = new TrustScore();
    trust.recordSuccess();
    expect(trust.getScore()).toBe(22); // +2 before graduation
  });

  it('decrements score on failure', () => {
    const trust = new TrustScore();
    trust.recordFailure();
    expect(trust.getScore()).toBe(10); // -10
  });

  it('does not go below 0', () => {
    const trust = new TrustScore(5);
    trust.recordFailure();
    expect(trust.getScore()).toBe(0);
  });

  it('does not go above 100', () => {
    const trust = new TrustScore(99);
    // Advance 30 days to get graduation bonus
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    trust.recordSuccess();
    expect(trust.getScore()).toBe(100);
  });

  it('graduates to FULL_AUTO after 30 days and high score', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const trust = new TrustScore(85, thirtyOneDaysAgo);
    expect(trust.canGraduateToFullAuto()).toBe(true);
    expect(trust.getPermissionLevel()).toBe(PermissionLevel.FULL_AUTO);
  });

  it('cannot graduate before 30 days', () => {
    const trust = new TrustScore(90);
    expect(trust.canGraduateToFullAuto()).toBe(false);
  });

  it('increments more after graduation period', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const trust = new TrustScore(50, thirtyOneDaysAgo);
    trust.recordSuccess();
    expect(trust.getScore()).toBe(55); // +5 after graduation
  });

  it('tracks days active', () => {
    vi.advanceTimersByTime(5 * 24 * 60 * 60 * 1000); // 5 days
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const trust = new TrustScore(20, fiveDaysAgo);
    expect(trust.getDaysActive()).toBe(5);
  });

  it('tracks success and failure counts', () => {
    const trust = new TrustScore();
    trust.recordSuccess();
    trust.recordSuccess();
    trust.recordFailure();
    expect(trust.getSuccessCount()).toBe(2);
    expect(trust.getFailureCount()).toBe(1);
  });

  describe('auto-pause threshold', () => {
    it('exports AUTO_PAUSE_THRESHOLD as 15', () => {
      expect(AUTO_PAUSE_THRESHOLD).toBe(15);
    });

    it('exports REVIEW_ZONE_THRESHOLD as 25', () => {
      expect(REVIEW_ZONE_THRESHOLD).toBe(25);
    });

    it('isPaused returns true when score is at or below threshold', () => {
      const trust = new TrustScore(AUTO_PAUSE_THRESHOLD);
      expect(trust.isPaused()).toBe(true);
    });

    it('isPaused returns true when score is 0', () => {
      const trust = new TrustScore(0);
      expect(trust.isPaused()).toBe(true);
    });

    it('isPaused returns false when score is above threshold', () => {
      const trust = new TrustScore(AUTO_PAUSE_THRESHOLD + 1);
      expect(trust.isPaused()).toBe(false);
    });

    it('isPaused becomes true after enough failures', () => {
      const trust = new TrustScore(20);
      expect(trust.isPaused()).toBe(false);
      trust.recordFailure(); // 10
      expect(trust.isPaused()).toBe(true);
    });
  });

  describe('review zone', () => {
    it('requiresReview returns true when score is between thresholds', () => {
      const trust = new TrustScore(20);
      expect(trust.requiresReview()).toBe(true);
    });

    it('requiresReview returns false when score is at or below pause threshold', () => {
      const trust = new TrustScore(AUTO_PAUSE_THRESHOLD);
      expect(trust.requiresReview()).toBe(false);
    });

    it('requiresReview returns false when score is above review threshold', () => {
      const trust = new TrustScore(REVIEW_ZONE_THRESHOLD + 1);
      expect(trust.requiresReview()).toBe(false);
    });

    it('requiresReview returns true at exactly REVIEW_ZONE_THRESHOLD', () => {
      const trust = new TrustScore(REVIEW_ZONE_THRESHOLD);
      expect(trust.requiresReview()).toBe(true);
    });
  });

  describe('getPauseReason', () => {
    it('returns reason string when paused', () => {
      const trust = new TrustScore(10, undefined, { agentId: 'agent-1' });
      const reason = trust.getPauseReason();
      expect(reason).not.toBeNull();
      expect(reason).toContain('agent-1');
      expect(reason).toContain('auto-paused');
    });

    it('returns null when not paused', () => {
      const trust = new TrustScore(50);
      expect(trust.getPauseReason()).toBeNull();
    });
  });

  describe('onAutoPause callback', () => {
    it('calls onAutoPause when score drops to threshold', () => {
      const onAutoPause = vi.fn();
      // Start at 25, one failure drops to 15 which is at threshold
      const trust = new TrustScore(25, undefined, { agentId: 'my-agent', onAutoPause });
      trust.recordFailure();
      expect(trust.getScore()).toBe(15);
      expect(onAutoPause).toHaveBeenCalledWith('my-agent');
    });

    it('calls onAutoPause when score drops below threshold', () => {
      const onAutoPause = vi.fn();
      const trust = new TrustScore(20, undefined, { agentId: 'agent-x', onAutoPause });
      trust.recordFailure(); // drops to 10
      expect(onAutoPause).toHaveBeenCalledWith('agent-x');
    });

    it('does not call onAutoPause when score stays above threshold', () => {
      const onAutoPause = vi.fn();
      const trust = new TrustScore(50, undefined, { agentId: 'agent-y', onAutoPause });
      trust.recordFailure(); // drops to 40
      expect(onAutoPause).not.toHaveBeenCalled();
    });

    it('works without onAutoPause option', () => {
      const trust = new TrustScore(20);
      // Should not throw
      trust.recordFailure();
      expect(trust.getScore()).toBe(10);
    });
  });
});
