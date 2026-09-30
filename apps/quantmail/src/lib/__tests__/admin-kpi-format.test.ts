import { describe, it, expect } from 'vitest';
import { formatBytes, formatCount, formatPercent } from '../admin-kpi-format';

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

  describe('formatBytes', () => {
    it('scales to the largest binary unit ≥ 1', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(987654321)).toBe('941.9 MB');
      expect(formatBytes(1024 ** 4)).toBe('1.0 TB');
    });

    it('rejects negative and non-finite input with an em dash', () => {
      expect(formatBytes(-1)).toBe('—');
      expect(formatBytes(Number.NaN)).toBe('—');
    });
  });

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
