// ============================================================================
// Snooze Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SnoozeService } from '../services/snooze-service';
import type { NotificationPayload } from '../types';

function createNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random()}`,
    type: 'message',
    priority: 'normal',
    title: 'Test Notification',
    body: 'Test body',
    recipientId: 'user-1',
    channels: ['push'],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('SnoozeService', () => {
  let service: SnoozeService;

  beforeEach(() => {
    service = new SnoozeService();
  });

  describe('snooze', () => {
    it('should snooze a notification and mark it as snoozed', () => {
      const notif = createNotification();
      const record = service.snooze(notif.id, 'user-1', '15min', notif);

      expect(record.notificationId).toBe(notif.id);
      expect(record.userId).toBe('user-1');
      expect(record.duration).toBe('15min');
      expect(record.resumeAt).toBeGreaterThan(Date.now());
      expect(service.isSnoozed(notif.id, 'user-1')).toBe(true);
    });

    it('should calculate 15min duration correctly', () => {
      const before = Date.now();
      const notif = createNotification();
      const record = service.snooze(notif.id, 'user-1', '15min', notif);

      const expectedMin = before + 15 * 60 * 1000;
      expect(record.resumeAt).toBeGreaterThanOrEqual(expectedMin - 100);
      expect(record.resumeAt).toBeLessThanOrEqual(expectedMin + 100);
    });

    it('should calculate 1hr duration correctly', () => {
      const before = Date.now();
      const notif = createNotification();
      const record = service.snooze(notif.id, 'user-1', '1hr', notif);

      const expectedMin = before + 60 * 60 * 1000;
      expect(record.resumeAt).toBeGreaterThanOrEqual(expectedMin - 100);
      expect(record.resumeAt).toBeLessThanOrEqual(expectedMin + 100);
    });

    it('should calculate tomorrow duration to 9am next day', () => {
      const notif = createNotification();
      const record = service.snooze(notif.id, 'user-1', 'tomorrow', notif);

      const resumeDate = new Date(record.resumeAt);
      expect(resumeDate.getHours()).toBe(9);
      expect(resumeDate.getMinutes()).toBe(0);
    });
  });

  describe('notification reappears after snooze duration', () => {
    it('should not return snoozed notification before duration expires', () => {
      const notif = createNotification();
      service.snooze(notif.id, 'user-1', '15min', notif);

      const expired = service.getExpired(Date.now());
      expect(expired).toHaveLength(0);
    });

    it('should return snoozed notification after duration expires', () => {
      const notif = createNotification();
      service.snooze(notif.id, 'user-1', '15min', notif);

      // Simulate time passing beyond the snooze duration
      const futureTime = Date.now() + 16 * 60 * 1000;
      const expired = service.getExpired(futureTime);
      expect(expired).toHaveLength(1);
      expect(expired[0]!.notificationId).toBe(notif.id);
    });

    it('should re-deliver notification payload when snooze expires', () => {
      const notif = createNotification({ title: 'Important message' });
      service.snooze(notif.id, 'user-1', '15min', notif);

      const futureTime = Date.now() + 16 * 60 * 1000;
      const toRedeliver = service.flushExpired(futureTime);
      expect(toRedeliver).toHaveLength(1);
      expect(toRedeliver[0]!.title).toBe('Important message');

      // Should be removed from snoozed state
      expect(service.isSnoozed(notif.id, 'user-1')).toBe(false);
    });
  });

  describe('remindMe', () => {
    it('should create a snooze with custom duration', () => {
      const notif = createNotification();
      const delayMs = 30 * 60 * 1000; // 30 minutes
      const record = service.remindMe(notif.id, 'user-1', delayMs, notif);

      expect(record.resumeAt).toBeGreaterThan(Date.now());
      expect(service.isSnoozed(notif.id, 'user-1')).toBe(true);
    });
  });

  describe('cancelSnooze', () => {
    it('should cancel a snooze', () => {
      const notif = createNotification();
      service.snooze(notif.id, 'user-1', '1hr', notif);

      expect(service.isSnoozed(notif.id, 'user-1')).toBe(true);
      service.cancelSnooze(notif.id, 'user-1');
      expect(service.isSnoozed(notif.id, 'user-1')).toBe(false);
    });
  });

  describe('getSnoozedForUser', () => {
    it('should return all snoozed notifications for a user', () => {
      const notif1 = createNotification({ id: 'n1' });
      const notif2 = createNotification({ id: 'n2' });

      service.snooze('n1', 'user-1', '15min', notif1);
      service.snooze('n2', 'user-1', '1hr', notif2);

      const snoozed = service.getSnoozedForUser('user-1');
      expect(snoozed).toHaveLength(2);
    });

    it('should not return other users snoozed notifications', () => {
      const notif = createNotification({ id: 'n1' });
      service.snooze('n1', 'user-2', '15min', notif);

      const snoozed = service.getSnoozedForUser('user-1');
      expect(snoozed).toHaveLength(0);
    });
  });

  describe('active hours for next_active', () => {
    it('should use active hours when set', () => {
      service.setActiveHours('user-1', 9, 17);
      const notif = createNotification();
      const record = service.snooze(notif.id, 'user-1', 'next_active', notif);

      const resumeDate = new Date(record.resumeAt);
      expect(resumeDate.getHours()).toBe(9);
    });
  });
});
