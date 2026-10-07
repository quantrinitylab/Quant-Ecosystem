import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../core/cost-tracker';
import { BudgetExceededError, RateLimitError } from '../types';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker(
      { dailyBudget: 100.0, perUserBudget: 10.0 },
      { requestsPerMinute: 5, windowMs: 60000 },
    );
  });

  describe('trackUsage', () => {
    it('records usage correctly', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 0.01);
      const log = tracker.getUsageLog();
      expect(log).toHaveLength(1);
      const record = log[0]!;
      expect(record.userId).toBe('user1');
      expect(record.model).toBe('gpt-4o');
      expect(record.promptTokens).toBe(100);
      expect(record.completionTokens).toBe(50);
      expect(record.cost).toBe(0.01);
    });

    it('accumulates spend for a user', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 5.0);
      tracker.trackUsage('user1', 'gpt-4o', 200, 100, 3.0);
      expect(tracker.getUserSpend('user1')).toBe(8.0);
    });
  });

  describe('checkBudget', () => {
    it('passes when under budget', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 1.0);
      expect(() => tracker.checkBudget('user1')).not.toThrow();
    });

    it('throws BudgetExceededError when user budget exceeded', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 10.0);
      expect(() => tracker.checkBudget('user1')).toThrow(BudgetExceededError);
    });

    it('throws BudgetExceededError when daily budget exceeded', () => {
      // Fill daily budget with multiple users
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 9.0);
      tracker.trackUsage('user2', 'gpt-4o', 100, 50, 9.0);
      tracker.trackUsage('user3', 'gpt-4o', 100, 50, 9.0);
      // ... total spend across users
      for (let i = 0; i < 10; i++) {
        tracker.trackUsage(`userX${i}`, 'gpt-4o', 100, 50, 9.5);
      }
      expect(() => tracker.checkBudget('newuser')).toThrow(BudgetExceededError);
    });

    it('includes error details', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 10.0);
      try {
        tracker.checkBudget('user1');
      } catch (error) {
        expect(error).toBeInstanceOf(BudgetExceededError);
        const budgetError = error as BudgetExceededError;
        expect(budgetError.userId).toBe('user1');
        expect(budgetError.currentSpend).toBe(10.0);
        expect(budgetError.budget).toBe(10.0);
      }
    });
  });

  describe('checkRateLimit', () => {
    it('passes when under rate limit', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 0.01);
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 0.01);
      expect(() => tracker.checkRateLimit('user1')).not.toThrow();
    });

    it('throws RateLimitError when rate limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        tracker.trackUsage('user1', 'gpt-4o', 100, 50, 0.01);
      }
      expect(() => tracker.checkRateLimit('user1')).toThrow(RateLimitError);
    });

    it('includes retry-after information', () => {
      for (let i = 0; i < 5; i++) {
        tracker.trackUsage('user1', 'gpt-4o', 100, 50, 0.01);
      }
      try {
        tracker.checkRateLimit('user1');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.userId).toBe('user1');
        expect(rateLimitError.retryAfterMs).toBeGreaterThan(0);
      }
    });
  });

  describe('getDailySpend', () => {
    it('returns total daily spend', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 5.0);
      tracker.trackUsage('user2', 'gpt-4o', 100, 50, 3.0);
      expect(tracker.getDailySpend()).toBe(8.0);
    });
  });

  describe('getUserSpend', () => {
    it('returns zero for unknown users', () => {
      expect(tracker.getUserSpend('unknown')).toBe(0);
    });

    it('isolates spend per user', () => {
      tracker.trackUsage('user1', 'gpt-4o', 100, 50, 5.0);
      tracker.trackUsage('user2', 'gpt-4o', 100, 50, 3.0);
      expect(tracker.getUserSpend('user1')).toBe(5.0);
      expect(tracker.getUserSpend('user2')).toBe(3.0);
    });
  });
});
