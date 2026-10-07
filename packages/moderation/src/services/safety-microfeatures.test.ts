import { describe, it, expect } from 'vitest';
import { SafetyMicrofeatures } from './safety-microfeatures';
import type { UsageMetrics } from './safety-microfeatures';

describe('SafetyMicrofeatures', () => {
  describe('oneTapAction', () => {
    it('should execute a one-tap action', () => {
      const service = new SafetyMicrofeatures();
      const result = service.oneTapAction('user-1', 'target-1', 'hide');

      expect(result.userId).toBe('user-1');
      expect(result.targetId).toBe('target-1');
      expect(result.action).toBe('hide');
      expect(result.escalatedFrom).toBeUndefined();
    });

    it('should track escalation from hide to mute to block to report', () => {
      const service = new SafetyMicrofeatures();

      const r1 = service.oneTapAction('user-1', 'target-1', 'hide');
      expect(r1.escalatedFrom).toBeUndefined();

      const r2 = service.oneTapAction('user-1', 'target-1', 'mute');
      expect(r2.escalatedFrom).toBe('hide');

      const r3 = service.oneTapAction('user-1', 'target-1', 'block');
      expect(r3.escalatedFrom).toBe('mute');

      const r4 = service.oneTapAction('user-1', 'target-1', 'report');
      expect(r4.escalatedFrom).toBe('block');
    });

    it('should not set escalatedFrom for same or lower action', () => {
      const service = new SafetyMicrofeatures();

      service.oneTapAction('user-1', 'target-1', 'block');
      const r2 = service.oneTapAction('user-1', 'target-1', 'mute');
      expect(r2.escalatedFrom).toBeUndefined();
    });
  });

  describe('detectDistressPatterns', () => {
    it('should detect distress with multiple indicators', () => {
      const service = new SafetyMicrofeatures();
      const metrics: UsageMetrics = {
        sessionDurationMinutes: 180,
        negativeInteractionsCount: 10,
        reportsSentRecently: 5,
        rapidScrolling: true,
        lateNightUsage: true,
      };

      const result = service.detectDistressPatterns(metrics);
      expect(result.showBreakSurface).toBe(true);
      expect(result.reason).toContain('extended session duration');
    });

    it('should not show break surface with only one indicator', () => {
      const service = new SafetyMicrofeatures();
      const metrics: UsageMetrics = {
        sessionDurationMinutes: 180,
        negativeInteractionsCount: 1,
        reportsSentRecently: 0,
        rapidScrolling: false,
        lateNightUsage: false,
      };

      const result = service.detectDistressPatterns(metrics);
      expect(result.showBreakSurface).toBe(false);
    });

    it('should detect late night rapid scrolling as distress', () => {
      const service = new SafetyMicrofeatures();
      const metrics: UsageMetrics = {
        sessionDurationMinutes: 150,
        negativeInteractionsCount: 6,
        reportsSentRecently: 0,
        rapidScrolling: true,
        lateNightUsage: true,
      };

      const result = service.detectDistressPatterns(metrics);
      expect(result.showBreakSurface).toBe(true);
    });
  });

  describe('massUnfollowProtection', () => {
    it('should block mass unfollow above threshold', () => {
      const service = new SafetyMicrofeatures();
      const result = service.massUnfollowProtection('user-1', 25, 5);

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('threshold');
    });

    it('should block high rate unfollows', () => {
      const service = new SafetyMicrofeatures();
      const result = service.massUnfollowProtection('user-1', 15, 2);

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('rate too high');
    });

    it('should allow normal unfollow behavior', () => {
      const service = new SafetyMicrofeatures();
      const result = service.massUnfollowProtection('user-1', 3, 60);

      expect(result.blocked).toBe(false);
      expect(result.reason).toBe('within normal limits');
    });

    it('should enforce threshold of 20 unfollows', () => {
      const service = new SafetyMicrofeatures();
      const belowThreshold = service.massUnfollowProtection('user-1', 19, 60);
      expect(belowThreshold.blocked).toBe(false);

      const atThreshold = service.massUnfollowProtection('user-1', 20, 60);
      expect(atThreshold.blocked).toBe(true);
    });
  });

  describe('selfHarmRedirect', () => {
    it('should redirect for self-harm queries', () => {
      const service = new SafetyMicrofeatures();
      const result = service.selfHarmRedirect('I want to kill myself');

      expect(result.redirect).toBe(true);
      expect(result.hotlineNumber).toBe('988');
      expect(result.hotlineUrl).toBeDefined();
    });

    it('should not redirect for normal queries', () => {
      const service = new SafetyMicrofeatures();
      const result = service.selfHarmRedirect('how to cook pasta');

      expect(result.redirect).toBe(false);
      expect(result.hotlineNumber).toBeUndefined();
    });

    it('should provide country-specific hotline', () => {
      const service = new SafetyMicrofeatures();
      const result = service.selfHarmRedirect('want to die', 'UK');

      expect(result.redirect).toBe(true);
      expect(result.hotlineNumber).toBe('116 123');
    });
  });

  describe('getCrisisHotline', () => {
    it('should return US hotline (988)', () => {
      const service = new SafetyMicrofeatures();
      const hotline = service.getCrisisHotline('US');
      expect(hotline?.number).toBe('988');
    });

    it('should return UK hotline (116 123)', () => {
      const service = new SafetyMicrofeatures();
      const hotline = service.getCrisisHotline('UK');
      expect(hotline?.number).toBe('116 123');
    });

    it('should have at least 20 countries available', () => {
      const service = new SafetyMicrofeatures();
      const countries = service.getAvailableCountries();
      expect(countries.length).toBeGreaterThanOrEqual(20);
    });

    it('should return hotline data for all listed countries', () => {
      const service = new SafetyMicrofeatures();
      const countries = service.getAvailableCountries();

      for (const code of countries) {
        const hotline = service.getCrisisHotline(code);
        expect(hotline).toBeDefined();
        expect(hotline!.number).toBeTruthy();
        expect(hotline!.url).toBeTruthy();
        expect(hotline!.name).toBeTruthy();
      }
    });

    it('should be case-insensitive', () => {
      const service = new SafetyMicrofeatures();
      const upper = service.getCrisisHotline('US');
      const lower = service.getCrisisHotline('us');
      expect(upper).toEqual(lower);
    });

    it('should return undefined for unknown country', () => {
      const service = new SafetyMicrofeatures();
      const result = service.getCrisisHotline('XX');
      expect(result).toBeUndefined();
    });
  });
});
