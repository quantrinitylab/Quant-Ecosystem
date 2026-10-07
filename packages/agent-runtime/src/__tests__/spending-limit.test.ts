import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpendingLimit, SpendingCapBreachedError } from '../spending-limit.js';

describe('SpendingLimit', () => {
  const defaultConfig = {
    dailyCap: 100,
    weeklyCap: 500,
    monthlyCap: 1500,
    perTaskCap: 50,
    tokensPerHourCap: 10000,
  };

  it('allows spending within limits', () => {
    const limit = new SpendingLimit(defaultConfig);
    expect(limit.canSpend(50)).toBe(true);
    limit.recordSpend(50);
    expect(limit.canSpend(50)).toBe(true);
  });

  it('blocks spending over daily cap', () => {
    const limit = new SpendingLimit(defaultConfig);
    limit.recordSpend(90);
    expect(limit.canSpend(20)).toBe(false);
  });

  it('blocks spending over weekly cap', () => {
    const limit = new SpendingLimit({
      dailyCap: 500,
      weeklyCap: 300,
      monthlyCap: 1500,
      perTaskCap: 500,
      tokensPerHourCap: 10000,
    });
    limit.recordSpend(150);
    limit.recordSpend(100);
    expect(limit.canSpend(60)).toBe(false);
  });

  it('blocks spending over monthly cap', () => {
    const limit = new SpendingLimit({
      dailyCap: 2000,
      weeklyCap: 5000,
      monthlyCap: 100,
      perTaskCap: 100,
      tokensPerHourCap: 10000,
    });
    limit.recordSpend(80);
    expect(limit.canSpend(30)).toBe(false);
  });

  it('throws SpendingCapBreachedError when attempting to spend over cap', () => {
    const limit = new SpendingLimit(defaultConfig);
    limit.recordSpend(95);
    expect(() => limit.recordSpend(10)).toThrow(SpendingCapBreachedError);
  });

  it('throws on negative spend amounts', () => {
    const limit = new SpendingLimit(defaultConfig);
    expect(() => limit.recordSpend(-5)).toThrow(/positive/);
  });

  it('reports remaining budget', () => {
    const limit = new SpendingLimit(defaultConfig);
    limit.recordSpend(30);
    expect(limit.getRemainingBudget('daily')).toBe(70);
    expect(limit.getRemainingBudget('weekly')).toBe(470);
    expect(limit.getRemainingBudget('monthly')).toBe(1470);
  });

  it('resets period spending', () => {
    const limit = new SpendingLimit(defaultConfig);
    limit.recordSpend(50);
    limit.reset('daily');
    expect(limit.getRemainingBudget('daily')).toBe(100);
    // Weekly and monthly still tracked
    expect(limit.getRemainingBudget('weekly')).toBe(450);
  });

  it('validates config with Zod', () => {
    expect(
      () =>
        new SpendingLimit({
          dailyCap: -1,
          weeklyCap: 500,
          monthlyCap: 1500,
          perTaskCap: 50,
          tokensPerHourCap: 10000,
        }),
    ).toThrow();
  });

  it('returns a copy of config', () => {
    const limit = new SpendingLimit(defaultConfig);
    const config = limit.getConfig();
    expect(config.dailyCap).toBe(100);
  });

  describe('perTaskCap', () => {
    it('allows task spend within per-task cap', () => {
      const limit = new SpendingLimit(defaultConfig);
      expect(limit.canSpendOnTask(30)).toBe(true);
      limit.recordTaskSpend(30);
      expect(limit.canSpendOnTask(20)).toBe(true);
    });

    it('blocks task spend over per-task cap', () => {
      const limit = new SpendingLimit(defaultConfig);
      expect(limit.canSpendOnTask(60)).toBe(false);
    });

    it('throws SpendingCapBreachedError when per-task cap is exceeded', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTaskSpend(40);
      try {
        limit.recordTaskSpend(20);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SpendingCapBreachedError);
        expect((e as SpendingCapBreachedError).capType).toBe('perTask');
        expect((e as SpendingCapBreachedError).current).toBe(60);
        expect((e as SpendingCapBreachedError).limit).toBe(50);
      }
    });

    it('resets task spend for new task', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTaskSpend(40);
      limit.resetTaskSpend();
      expect(limit.canSpendOnTask(40)).toBe(true);
    });

    it('recordTaskSpend also records to daily/weekly/monthly', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTaskSpend(30);
      expect(limit.getRemainingBudget('daily')).toBe(70);
    });
  });

  describe('tokensPerHourCap', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows token usage within limit', () => {
      const limit = new SpendingLimit(defaultConfig);
      expect(limit.canSpendTokens(5000)).toBe(true);
      limit.recordTokenUsage(5000);
      expect(limit.canSpendTokens(5000)).toBe(true);
    });

    it('blocks token usage over hourly limit', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTokenUsage(8000);
      expect(limit.canSpendTokens(3000)).toBe(false);
    });

    it('throws SpendingCapBreachedError when tokens-per-hour cap is exceeded', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTokenUsage(8000);
      try {
        limit.recordTokenUsage(3000);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SpendingCapBreachedError);
        expect((e as SpendingCapBreachedError).capType).toBe('tokensPerHour');
        expect((e as SpendingCapBreachedError).limit).toBe(10000);
      }
    });

    it('resets token usage after one hour', () => {
      const limit = new SpendingLimit(defaultConfig);
      limit.recordTokenUsage(9000);
      expect(limit.canSpendTokens(2000)).toBe(false);

      // Advance past one hour
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      expect(limit.canSpendTokens(9000)).toBe(true);
    });
  });

  describe('hard kill callback', () => {
    it('calls onBreach callback when daily cap is breached', () => {
      const onBreach = vi.fn();
      const limit = new SpendingLimit(defaultConfig, { onBreach });
      limit.recordSpend(95);
      try {
        limit.recordSpend(10);
      } catch {
        // expected
      }
      expect(onBreach).toHaveBeenCalledOnce();
      expect(onBreach.mock.calls[0]![0]).toBeInstanceOf(SpendingCapBreachedError);
      expect(onBreach.mock.calls[0]![0].capType).toBe('daily');
    });

    it('calls onBreach callback when per-task cap is breached', () => {
      const onBreach = vi.fn();
      const limit = new SpendingLimit(defaultConfig, { onBreach });
      try {
        limit.recordTaskSpend(60);
      } catch {
        // expected
      }
      expect(onBreach).toHaveBeenCalledOnce();
      expect(onBreach.mock.calls[0]![0].capType).toBe('perTask');
    });

    it('calls onBreach callback when tokens-per-hour cap is breached', () => {
      const onBreach = vi.fn();
      const limit = new SpendingLimit(defaultConfig, { onBreach });
      limit.recordTokenUsage(8000);
      try {
        limit.recordTokenUsage(3000);
      } catch {
        // expected
      }
      expect(onBreach).toHaveBeenCalledOnce();
      expect(onBreach.mock.calls[0]![0].capType).toBe('tokensPerHour');
    });
  });

  describe('SpendingCapBreachedError', () => {
    it('has correct properties', () => {
      const error = new SpendingCapBreachedError('daily', 110, 100);
      expect(error.name).toBe('SpendingCapBreachedError');
      expect(error.capType).toBe('daily');
      expect(error.current).toBe(110);
      expect(error.limit).toBe(100);
      expect(error.message).toContain('daily');
    });

    it('is an instance of Error', () => {
      const error = new SpendingCapBreachedError('weekly', 600, 500);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
