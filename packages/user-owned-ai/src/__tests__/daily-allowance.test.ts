import { describe, expect, it } from 'vitest';
import { DailyAllowanceService } from '../daily-allowance.service.js';

describe('DailyAllowanceService', () => {
  it('allocates free plan credits by default', () => {
    const service = new DailyAllowanceService();
    const state = service.getAllowance('user-1');

    expect(state.userId).toBe('user-1');
    expect(state.plan).toBe('free');
    expect(state.creditsRemaining).toBe(100);
    expect(state.totalUsedToday).toBe(0);
  });

  it('allocates pro plan credits when specified', () => {
    const service = new DailyAllowanceService();
    const state = service.getAllowance('user-1', 'pro');

    expect(state.plan).toBe('pro');
    expect(state.creditsRemaining).toBe(500);
  });

  it('allocates enterprise plan credits when specified', () => {
    const service = new DailyAllowanceService();
    const state = service.getAllowance('user-1', 'enterprise');

    expect(state.plan).toBe('enterprise');
    expect(state.creditsRemaining).toBe(2000);
  });

  it('consuming credits decrements the balance', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1', 'pro');

    const result = service.consumeAllowance('user-1', 50);

    expect(result.creditsRemaining).toBe(450);
    expect(result.totalUsedToday).toBe(50);
  });

  it('consuming beyond balance throws an error', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1');

    expect(() => service.consumeAllowance('user-1', 150)).toThrow('Insufficient daily allowance');
  });

  it('manual reset restores full allowance', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1', 'pro');
    service.consumeAllowance('user-1', 200);

    const reset = service.resetAllowance('user-1');

    expect(reset.creditsRemaining).toBe(500);
    expect(reset.totalUsedToday).toBe(0);
  });

  it('isAllowanceExhausted returns true when credits are gone', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1');
    service.consumeAllowance('user-1', 100);

    expect(service.isAllowanceExhausted('user-1')).toBe(true);
  });

  it('isAllowanceExhausted returns false when credits remain', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1');
    service.consumeAllowance('user-1', 50);

    expect(service.isAllowanceExhausted('user-1')).toBe(false);
  });

  it('getRemainingCredits returns correct value after consumption', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1', 'pro');
    service.consumeAllowance('user-1', 123);

    expect(service.getRemainingCredits('user-1')).toBe(377);
  });

  it('throws on manual reset for unknown user', () => {
    const service = new DailyAllowanceService();

    expect(() => service.resetAllowance('unknown-user')).toThrow(
      'No allowance state found for user',
    );
  });

  it('multiple consumptions accumulate correctly', () => {
    const service = new DailyAllowanceService();
    service.getAllowance('user-1', 'pro');

    service.consumeAllowance('user-1', 100);
    service.consumeAllowance('user-1', 150);
    service.consumeAllowance('user-1', 75);

    expect(service.getRemainingCredits('user-1')).toBe(175);
  });
});
