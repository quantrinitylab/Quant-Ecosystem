import { describe, it, expect } from 'vitest';
import { computeAge, assertMinAge, MIN_DATING_AGE } from '../lib/age-gate';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('age-gate', () => {
  describe('computeAge', () => {
    it('computes whole years, accounting for the birthday not yet reached', () => {
      expect(computeAge(new Date('2000-01-01T00:00:00Z'), NOW)).toBe(26);
      // Birthday later this year — not yet 26.
      expect(computeAge(new Date('2000-12-31T00:00:00Z'), NOW)).toBe(25);
    });
  });

  describe('assertMinAge', () => {
    it('returns the age for an adult', () => {
      expect(assertMinAge(new Date('2000-01-01T00:00:00Z'), MIN_DATING_AGE, NOW)).toBe(26);
    });

    it('throws UNDERAGE below the minimum', () => {
      const dob = new Date('2015-01-01T00:00:00Z'); // 11 in 2026
      expect(() => assertMinAge(dob, MIN_DATING_AGE, NOW)).toThrowError();
      try {
        assertMinAge(dob, MIN_DATING_AGE, NOW);
      } catch (e) {
        expect((e as { code: string }).code).toBe('UNDERAGE');
      }
    });

    it('throws AGE_VERIFICATION_REQUIRED when DOB is missing or invalid', () => {
      for (const bad of [null, undefined, 'not-a-date']) {
        try {
          assertMinAge(bad as never, MIN_DATING_AGE, NOW);
          throw new Error('should have thrown');
        } catch (e) {
          expect((e as { code: string }).code).toBe('AGE_VERIFICATION_REQUIRED');
        }
      }
    });

    it('treats exactly 18 as allowed', () => {
      const dob = new Date('2008-06-01T00:00:00Z'); // exactly 18 on NOW
      expect(assertMinAge(dob, 18, NOW)).toBe(18);
    });
  });
});
