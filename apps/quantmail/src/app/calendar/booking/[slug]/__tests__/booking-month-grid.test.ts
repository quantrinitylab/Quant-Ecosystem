// ============================================================================
// Booking month-grid day counts — regression for the CODEX-REVIEW finding
// (comment 6150916925 on PR #1109).
//
// The booking page month grid carries months as 1-based GuestDayKey values
// (1 = January), but the grid once computed the month length with
// Date.UTC(year, month + 1, 0), which reads the NEXT month's length:
// January rendered 28 days and February offered invalid keys (Feb 29–31).
// These tests pin daysIn1BasedMonth, the helper both grid call sites use.
//
// renderToStaticMarkup-free pure-function tests (no @testing-library/react —
// CI runs pnpm install --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { daysIn1BasedMonth } from '../booking-utils';

describe('daysIn1BasedMonth', () => {
  it('returns every month length of a non-leap year (2026)', () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let month = 1; month <= 12; month++) {
      expect(daysIn1BasedMonth(2026, month)).toBe(expected[month - 1]);
    }
  });

  it('renders January with 31 days (bug gave February\'s 28)', () => {
    expect(daysIn1BasedMonth(2026, 1)).toBe(31);
  });

  it('renders February with 28 days (bug offered March\'s 31, invalid keys Feb 29–31)', () => {
    expect(daysIn1BasedMonth(2026, 2)).toBe(28);
  });

  it('handles leap years', () => {
    expect(daysIn1BasedMonth(2024, 2)).toBe(29);
    expect(daysIn1BasedMonth(2000, 2)).toBe(29);
    expect(daysIn1BasedMonth(1900, 2)).toBe(28);
  });

  it('stays correct at the year boundary', () => {
    expect(daysIn1BasedMonth(2025, 12)).toBe(31);
    expect(daysIn1BasedMonth(2026, 1)).toBe(31);
  });
});
