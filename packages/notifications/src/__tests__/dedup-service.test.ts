// ============================================================================
// Dedup Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { DedupService } from '../services/dedup-service';

describe('DedupService', () => {
  let service: DedupService;

  beforeEach(() => {
    service = new DedupService();
  });

  describe('cross-device deduplication', () => {
    it('should allow first delivery of a notification', () => {
      expect(service.shouldDeliver('notif-1', 'user-1', 'device-A')).toBe(true);
    });

    it('should prevent delivery to a second device after first delivery', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');

      expect(service.shouldDeliver('notif-1', 'user-1', 'device-B')).toBe(false);
      expect(service.shouldDeliver('notif-1', 'user-1', 'device-C')).toBe(false);
    });

    it('should deliver same notification to different users independently', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');

      expect(service.shouldDeliver('notif-1', 'user-2', 'device-A')).toBe(true);
    });

    it('should deliver different notifications to the same user', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');

      expect(service.shouldDeliver('notif-2', 'user-1', 'device-A')).toBe(true);
    });

    it('should track all devices that received a notification', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');
      service.markDelivered('notif-1', 'user-1', 'device-B');

      const record = service.getRecord('notif-1', 'user-1');
      expect(record).toBeDefined();
      expect(record!.deliveredToDevices).toContain('device-A');
      expect(record!.deliveredToDevices).toContain('device-B');
    });

    it('should not duplicate device entries when marked multiple times', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');
      service.markDelivered('notif-1', 'user-1', 'device-A');

      const record = service.getRecord('notif-1', 'user-1');
      expect(record!.deliveredToDevices).toHaveLength(1);
    });
  });

  describe('isDelivered', () => {
    it('should return false for undelivered notifications', () => {
      expect(service.isDelivered('notif-1', 'user-1')).toBe(false);
    });

    it('should return true after delivery', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');
      expect(service.isDelivered('notif-1', 'user-1')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired records', async () => {
      // Use a very short TTL
      const shortTtlService = new DedupService(1); // 1ms TTL
      shortTtlService.markDelivered('notif-1', 'user-1', 'device-A');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleaned = shortTtlService.cleanup();
      expect(cleaned).toBe(1);
      expect(shortTtlService.getRecordCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all records', () => {
      service.markDelivered('notif-1', 'user-1', 'device-A');
      service.markDelivered('notif-2', 'user-2', 'device-B');

      service.clear();
      expect(service.getRecordCount()).toBe(0);
    });
  });
});
