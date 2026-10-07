// ============================================================================
// Privacy-First Ads - Behavioral Opt-In Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BehavioralOptInService,
  InMemoryConsentStore,
} from '../services/behavioral-opt-in.service';
import type { ConsentStore } from '../services/behavioral-opt-in.service';

describe('BehavioralOptInService', () => {
  let service: BehavioralOptInService;

  beforeEach(() => {
    service = new BehavioralOptInService();
  });

  describe('getConsent', () => {
    it('should return false by default for any user', () => {
      expect(service.getConsent('user_1')).toBe(false);
      expect(service.getConsent('user_2')).toBe(false);
      expect(service.getConsent('user_unknown')).toBe(false);
    });

    it('should reject empty userId', () => {
      expect(() => service.getConsent('')).toThrow();
    });
  });

  describe('setConsent', () => {
    it('should set consent to true (opt in)', () => {
      service.setConsent('user_1', true);
      expect(service.getConsent('user_1')).toBe(true);
    });

    it('should set consent to false (opt out)', () => {
      service.setConsent('user_1', true);
      service.setConsent('user_1', false);
      expect(service.getConsent('user_1')).toBe(false);
    });

    it('should track consent per user independently', () => {
      service.setConsent('user_1', true);
      service.setConsent('user_2', false);

      expect(service.getConsent('user_1')).toBe(true);
      expect(service.getConsent('user_2')).toBe(false);
    });

    it('should reject empty userId', () => {
      expect(() => service.setConsent('', true)).toThrow();
    });
  });

  describe('isOptedIn', () => {
    it('should return false by default', () => {
      expect(service.isOptedIn('new_user')).toBe(false);
    });

    it('should return true after opt-in', () => {
      service.setConsent('user_1', true);
      expect(service.isOptedIn('user_1')).toBe(true);
    });

    it('should return false after opt-out', () => {
      service.setConsent('user_1', true);
      service.setConsent('user_1', false);
      expect(service.isOptedIn('user_1')).toBe(false);
    });

    it('should reject empty userId', () => {
      expect(() => service.isOptedIn('')).toThrow();
    });
  });

  describe('ConsentStore injection', () => {
    it('should accept a custom ConsentStore implementation', () => {
      const customStore: ConsentStore = {
        get: (userId: string) => (userId === 'pre_opted' ? true : undefined),
        set: () => {},
      };

      const customService = new BehavioralOptInService(customStore);
      expect(customService.getConsent('pre_opted')).toBe(true);
      expect(customService.getConsent('other_user')).toBe(false);
    });

    it('should persist consent via custom store', () => {
      const store = new Map<string, boolean>();
      const customStore: ConsentStore = {
        get: (userId: string) => store.get(userId),
        set: (userId: string, consented: boolean) => {
          store.set(userId, consented);
        },
      };

      const customService = new BehavioralOptInService(customStore);
      customService.setConsent('user_x', true);
      expect(store.get('user_x')).toBe(true);
      expect(customService.getConsent('user_x')).toBe(true);
    });

    it('should default to InMemoryConsentStore when no store is provided', () => {
      const defaultService = new BehavioralOptInService();
      defaultService.setConsent('user_1', true);
      expect(defaultService.getConsent('user_1')).toBe(true);
    });

    it('InMemoryConsentStore should work as expected', () => {
      const store = new InMemoryConsentStore();
      expect(store.get('user_1')).toBeUndefined();
      store.set('user_1', true);
      expect(store.get('user_1')).toBe(true);
      store.set('user_1', false);
      expect(store.get('user_1')).toBe(false);
    });
  });
});
