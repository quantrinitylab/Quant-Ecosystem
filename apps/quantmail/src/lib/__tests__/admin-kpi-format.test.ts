import { describe, it, expect } from 'vitest';
import { formatCount, formatPercent } from '../admin-kpi-format';

describe('admin KPI formatters', () => {
  describe('formatCount', () => {
    it('groups thousands with locale separators', () => {
      expect(formatCount(1234567)).toBe('1,234,567');
      expect(formatCount(0)).toBe('0');
      expect(formatCount(56)).toBe('56');
    });

    it('rounds and rejects non-finite input with an em dash', () => {
      expect(formatCount(41.6)).toBe('42');
      expect(formatCount(Number.NaN)).toBe('—');
      expect(formatCount(Number.POSITIVE_INFINITY)).toBe('—');
    });
  });

  // Byte formatting lives in `../format-bytes` (one formatter for the whole app);
  // its behaviour is pinned by `__tests__/format-bytes.test.ts`, not here.

  describe('formatPercent', () => {
    it('renders a fraction as an integer percent', () => {
      expect(formatPercent(0.9)).toBe('90%');
      expect(formatPercent(1)).toBe('100%');
      expect(formatPercent(0)).toBe('0%');
    });

    it('clamps out-of-range values into [0,100]%', () => {
      expect(formatPercent(1.2)).toBe('100%');
      expect(formatPercent(-0.5)).toBe('0%');
    });

    it('returns an em dash when no attempts have resolved', () => {
      expect(formatPercent(null)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
      expect(formatPercent(Number.NaN)).toBe('—');
    });
  });
});
