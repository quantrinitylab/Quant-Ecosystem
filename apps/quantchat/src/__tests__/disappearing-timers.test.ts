import { describe, it, expect } from 'vitest';
import {
  DISAPPEAR_TIMER_OPTIONS,
  TIMER_OFF_SECONDS,
  formatTimerLabel,
  getTimerOption,
  isValidDisappearTimer,
} from '../lib/disappearing-timers';

// Unit tests for the disappear-timer presets (Task 14.8).

describe('disappear timer presets', () => {
  it('includes exactly the required durations plus an off option (Requirement 18.1)', () => {
    const seconds = DISAPPEAR_TIMER_OPTIONS.map((o) => o.seconds);
    expect(seconds).toEqual([0, 5, 10, 30, 60, 300, 86400]);
  });

  it('validates supported durations and rejects unsupported ones', () => {
    expect(isValidDisappearTimer(TIMER_OFF_SECONDS)).toBe(true);
    expect(isValidDisappearTimer(5)).toBe(true);
    expect(isValidDisappearTimer(86400)).toBe(true);
    expect(isValidDisappearTimer(7)).toBe(false);
    expect(isValidDisappearTimer(-1)).toBe(false);
  });

  it('resolves and labels durations', () => {
    expect(getTimerOption(60)?.label).toBe('1 min');
    expect(formatTimerLabel(86400)).toBe('24h');
    expect(formatTimerLabel(7)).toBe('7s');
  });
});
