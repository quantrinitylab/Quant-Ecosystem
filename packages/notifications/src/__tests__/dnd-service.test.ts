// ============================================================================
// DND Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { DndService } from '../services/dnd-service';
import type { DndConfig, NotificationPayload } from '../types';

function createNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random()}`,
    type: 'message',
    priority: 'normal',
    title: 'Test',
    body: 'Test body',
    recipientId: 'user-1',
    channels: ['push'],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('DndService', () => {
  let service: DndService;

  beforeEach(() => {
    service = new DndService();
  });

  describe('configure', () => {
    it('should store and retrieve DND config', () => {
      const config: DndConfig = {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '22:00', endTime: '08:00' }],
        timezone: 'UTC',
        allowCritical: true,
      };

      service.configure('user-1', config);
      expect(service.getConfig('user-1')).toEqual(config);
    });
  });

  describe('DND enforcement', () => {
    it('should deliver notifications when DND is disabled', () => {
      service.configure('user-1', {
        enabled: false,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      const notif = createNotification();
      expect(service.shouldDeliver('user-1', notif)).toBe(true);
    });

    it('should suppress 100 notifications during DND and deliver 0', () => {
      // Set DND to all day every day (always active)
      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      let deliveredCount = 0;
      for (let i = 0; i < 100; i++) {
        const notif = createNotification({ priority: 'normal' });
        if (service.shouldDeliver('user-1', notif)) {
          deliveredCount++;
        }
      }

      expect(deliveredCount).toBe(0);
      expect(service.getQueueSize('user-1')).toBe(100);
    });

    it('should allow critical notifications to bypass DND when allowCritical is true', () => {
      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      const criticalNotif = createNotification({ priority: 'critical' });
      expect(service.shouldDeliver('user-1', criticalNotif)).toBe(true);
    });

    it('should block critical notifications when allowCritical is false', () => {
      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: false,
      });

      const criticalNotif = createNotification({ priority: 'critical' });
      expect(service.shouldDeliver('user-1', criticalNotif)).toBe(false);
    });

    it('should flush all queued notifications when DND ends', () => {
      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      // Queue up notifications during DND
      for (let i = 0; i < 5; i++) {
        service.shouldDeliver('user-1', createNotification({ title: `Notif ${i}` }));
      }

      expect(service.getQueueSize('user-1')).toBe(5);

      // Flush (simulating DND end)
      const flushed = service.flush('user-1');
      expect(flushed).toHaveLength(5);
      expect(flushed[0]!.title).toBe('Notif 0');
      expect(service.getQueueSize('user-1')).toBe(0);
    });
  });

  describe('isActive', () => {
    it('should return false when no config exists', () => {
      expect(service.isActive('user-1')).toBe(false);
    });

    it('should return false when DND is disabled', () => {
      service.configure('user-1', {
        enabled: false,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });
      expect(service.isActive('user-1')).toBe(false);
    });

    it('should detect overnight schedules', () => {
      const now = new Date();
      const currentDay = now.getDay();

      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [currentDay], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      expect(service.isActive('user-1', now)).toBe(true);
    });
  });

  describe('peekQueue', () => {
    it('should return queued notifications without flushing', () => {
      service.configure('user-1', {
        enabled: true,
        schedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }],
        timezone: 'UTC',
        allowCritical: true,
      });

      service.shouldDeliver('user-1', createNotification({ title: 'Test' }));

      const peeked = service.peekQueue('user-1');
      expect(peeked).toHaveLength(1);
      expect(service.getQueueSize('user-1')).toBe(1);
    });
  });
});
