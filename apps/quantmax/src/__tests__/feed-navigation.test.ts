// ============================================================================
// QuantMax - feed-navigation input mapping tests (QM-UIUX-049)
// Locks the desktop navigation contract: which keys and wheel gestures drive
// the feed. DOM-free module, runs in the default node environment.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  resolveFeedKeyAction,
  resolveWheelDirection,
  WHEEL_DELTA_THRESHOLD,
  WHEEL_COOLDOWN_MS,
} from '../lib/feed-navigation';

describe('resolveFeedKeyAction', () => {
  it('maps ArrowDown / j / J to next', () => {
    expect(resolveFeedKeyAction('ArrowDown')).toBe('next');
    expect(resolveFeedKeyAction('j')).toBe('next');
    expect(resolveFeedKeyAction('J')).toBe('next');
  });

  it('maps ArrowUp / k / K to previous', () => {
    expect(resolveFeedKeyAction('ArrowUp')).toBe('previous');
    expect(resolveFeedKeyAction('k')).toBe('previous');
    expect(resolveFeedKeyAction('K')).toBe('previous');
  });

  it('maps Space to togglePlay and m/M to toggleMute', () => {
    expect(resolveFeedKeyAction(' ')).toBe('togglePlay');
    expect(resolveFeedKeyAction('m')).toBe('toggleMute');
    expect(resolveFeedKeyAction('M')).toBe('toggleMute');
  });

  it('returns null for unrelated keys (no hijacking typing)', () => {
    for (const key of ['a', 'Enter', 'Tab', 'Escape', '1', 'ArrowLeft', 'ArrowRight']) {
      expect(resolveFeedKeyAction(key)).toBeNull();
    }
  });
});

describe('resolveWheelDirection', () => {
  it('ignores sub-threshold jitter', () => {
    expect(resolveWheelDirection(0)).toBeNull();
    expect(resolveWheelDirection(10)).toBeNull();
    expect(resolveWheelDirection(-23)).toBeNull();
    expect(resolveWheelDirection(WHEEL_DELTA_THRESHOLD - 1)).toBeNull();
  });

  it('maps scroll down to next and scroll up to previous', () => {
    expect(resolveWheelDirection(100)).toBe('next');
    expect(resolveWheelDirection(WHEEL_DELTA_THRESHOLD)).toBe('next');
    expect(resolveWheelDirection(-100)).toBe('previous');
    expect(resolveWheelDirection(-WHEEL_DELTA_THRESHOLD)).toBe('previous');
  });

  it('keeps the cooldown at a sane value', () => {
    expect(WHEEL_COOLDOWN_MS).toBeGreaterThanOrEqual(300);
    expect(WHEEL_COOLDOWN_MS).toBeLessThanOrEqual(1000);
  });
});
