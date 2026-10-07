import { describe, it, expect, beforeEach } from 'vitest';
import { ReputationService } from './reputation';
import type { ReputationFactors } from './reputation';

describe('ReputationService', () => {
  let service: ReputationService;

  const defaultFactors: ReputationFactors = {
    accountAgeDays: 30,
    reportsReceived: 0,
    reportsSubmitted: 0,
    verificationLevel: 'none',
    activityScore: 40,
    contentQualityRatio: 0.5,
  };

  beforeEach(() => {
    service = new ReputationService();
  });

  describe('calculateReputation', () => {
    it('should give new user a medium or high reputation', () => {
      const result = service.calculateReputation('user1', defaultFactors);
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThanOrEqual(80);
      expect(['medium', 'high']).toContain(result.level);
      expect(result.userId).toBe('user1');
    });

    it('should give higher score to verified users', () => {
      const unverified = service.calculateReputation('u1', {
        ...defaultFactors,
        verificationLevel: 'none',
      });
      const idVerified = service.calculateReputation('u2', {
        ...defaultFactors,
        verificationLevel: 'id',
      });
      expect(idVerified.score).toBeGreaterThan(unverified.score);
    });

    it('should give higher score to older accounts', () => {
      const newAccount = service.calculateReputation('new', {
        ...defaultFactors,
        accountAgeDays: 1,
      });
      const oldAccount = service.calculateReputation('old', {
        ...defaultFactors,
        accountAgeDays: 365,
      });
      expect(oldAccount.score).toBeGreaterThan(newAccount.score);
    });

    it('should penalize users with many reports received', () => {
      const clean = service.calculateReputation('clean', {
        ...defaultFactors,
        reportsReceived: 0,
      });
      const reported = service.calculateReputation('reported', {
        ...defaultFactors,
        reportsReceived: 10,
      });
      expect(reported.score).toBeLessThan(clean.score);
    });

    it('should clamp score between 0 and 100', () => {
      const extremeGood = service.calculateReputation('good', {
        accountAgeDays: 9999,
        reportsReceived: 0,
        reportsSubmitted: 0,
        verificationLevel: 'id',
        activityScore: 100,
        contentQualityRatio: 1,
      });
      expect(extremeGood.score).toBeLessThanOrEqual(100);

      const extremeBad = service.calculateReputation('bad', {
        accountAgeDays: 0,
        reportsReceived: 100,
        reportsSubmitted: 100,
        verificationLevel: 'none',
        activityScore: 0,
        contentQualityRatio: 0,
      });
      expect(extremeBad.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateOnReport', () => {
    it('should decrease score when user receives reports', () => {
      service.calculateReputation('spammer', defaultFactors);
      const initialScore = service.getReputation('spammer')!.score;

      service.updateOnReport('spammer', 'received');
      service.updateOnReport('spammer', 'received');
      service.updateOnReport('spammer', 'received');

      const updatedScore = service.getReputation('spammer')!.score;
      expect(updatedScore).toBeLessThan(initialScore);
    });

    it('should handle report for non-existent user gracefully', () => {
      // Should not throw
      service.updateOnReport('unknown', 'received');
      expect(service.getReputation('unknown')).toBeNull();
    });
  });

  describe('updateOnVerification', () => {
    it('should increase score when user verifies', () => {
      service.calculateReputation('user1', {
        ...defaultFactors,
        verificationLevel: 'none',
      });
      const before = service.getReputation('user1')!.score;

      service.updateOnVerification('user1', 'id');
      const after = service.getReputation('user1')!.score;

      expect(after).toBeGreaterThan(before);
    });
  });

  describe('getReputation', () => {
    it('should return null for unknown user', () => {
      expect(service.getReputation('nonexistent')).toBeNull();
    });

    it('should return stored reputation', () => {
      service.calculateReputation('user1', defaultFactors);
      const result = service.getReputation('user1');
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user1');
    });
  });

  describe('bulkCalculate', () => {
    it('should calculate reputation for multiple users', () => {
      const users = [
        { userId: 'a', factors: defaultFactors },
        { userId: 'b', factors: { ...defaultFactors, reportsReceived: 5 } },
        { userId: 'c', factors: { ...defaultFactors, verificationLevel: 'id' as const } },
      ];

      const results = service.bulkCalculate(users);
      expect(results).toHaveLength(3);
      expect(results[0]!.userId).toBe('a');
      expect(results[1]!.userId).toBe('b');
      expect(results[2]!.userId).toBe('c');
    });
  });

  describe('spammer scenario', () => {
    it('should show decreasing score as reports accumulate', () => {
      service.calculateReputation('spammer', {
        ...defaultFactors,
        verificationLevel: 'none',
      });

      const scores: number[] = [];
      scores.push(service.getReputation('spammer')!.score);

      for (let i = 0; i < 5; i++) {
        service.updateOnReport('spammer', 'received');
        scores.push(service.getReputation('spammer')!.score);
      }

      // Each subsequent score should be less than or equal to the previous
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]!);
      }
    });
  });
});
