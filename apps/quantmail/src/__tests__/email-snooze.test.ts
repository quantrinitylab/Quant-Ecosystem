import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailSnoozeService } from '../services/email-snooze.service';

describe('EmailSnoozeService', () => {
  let service: EmailSnoozeService;

  beforeEach(() => {
    service = new EmailSnoozeService();
  });

  describe('snooze', () => {
    it('should snooze an email with a specific timestamp', () => {
      const future = Date.now() + 3600000; // 1 hour from now
      const result = service.snooze('email-1', future);

      expect(result.emailId).toBe('email-1');
      expect(result.wakeAt).toBe(future);
      expect(result.status).toBe('snoozed');
      expect(result.id).toBeDefined();
    });

    it('should snooze an email with a preset', () => {
      const result = service.snooze('email-1', 'tomorrow');

      expect(result.emailId).toBe('email-1');
      expect(result.wakeAt).toBeGreaterThan(Date.now());
      expect(result.status).toBe('snoozed');
    });

    it('should throw if wake time is in the past', () => {
      const past = Date.now() - 1000;
      expect(() => service.snooze('email-1', past)).toThrow('Wake time must be in the future');
    });

    it('should generate unique ids for each snoozed email', () => {
      const future = Date.now() + 3600000;
      const first = service.snooze('email-1', future);
      const second = service.snooze('email-2', future);

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('unsnooze', () => {
    it('should cancel a snoozed email', () => {
      const future = Date.now() + 3600000;
      service.snooze('email-1', future);

      const result = service.unsnooze('email-1');
      expect(result).toBe(true);
    });

    it('should return false for non-snoozed email', () => {
      const result = service.unsnooze('email-not-snoozed');
      expect(result).toBe(false);
    });

    it('should not unsnooze already cancelled emails', () => {
      const future = Date.now() + 3600000;
      service.snooze('email-1', future);
      service.unsnooze('email-1');

      const result = service.unsnooze('email-1');
      expect(result).toBe(false);
    });
  });

  describe('getSnoozed', () => {
    it('should return only snoozed emails', () => {
      const future = Date.now() + 3600000;
      service.snooze('email-1', future);
      service.snooze('email-2', future);
      service.snooze('email-3', future);
      service.unsnooze('email-2');

      const snoozed = service.getSnoozed();
      expect(snoozed).toHaveLength(2);
    });

    it('should return empty array when no emails are snoozed', () => {
      const snoozed = service.getSnoozed();
      expect(snoozed).toHaveLength(0);
    });
  });

  describe('getWakeTime', () => {
    it('should return a future time for later_today', () => {
      const time = service.getWakeTime('later_today');
      expect(time).toBeGreaterThan(Date.now());
    });

    it('should return tomorrow morning for tomorrow preset', () => {
      const time = service.getWakeTime('tomorrow');
      const tomorrow = new Date(time);
      const today = new Date();
      expect(tomorrow.getDate()).not.toBe(today.getDate());
    });

    it('should return next week for next_week preset', () => {
      const time = service.getWakeTime('next_week');
      expect(time).toBeGreaterThan(Date.now() + 6 * 24 * 3600000);
    });

    it('should return next month for next_month preset', () => {
      const time = service.getWakeTime('next_month');
      expect(time).toBeGreaterThan(Date.now() + 27 * 24 * 3600000);
    });
  });

  describe('checkAndWake', () => {
    it('should wake emails whose time has come', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      service.snooze('email-1', now + 1000);
      service.snooze('email-2', now + 5000);

      // Advance time past first email's wake time
      vi.setSystemTime(now + 2000);
      const woken = service.checkAndWake();

      expect(woken).toHaveLength(1);
      expect(woken[0]?.emailId).toBe('email-1');
      expect(woken[0]?.status).toBe('woken');

      vi.useRealTimers();
    });

    it('should not wake emails before their time', () => {
      const future = Date.now() + 3600000;
      service.snooze('email-1', future);

      const woken = service.checkAndWake();
      expect(woken).toHaveLength(0);
    });
  });
});
