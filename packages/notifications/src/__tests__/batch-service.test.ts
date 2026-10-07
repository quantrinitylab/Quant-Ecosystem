// ============================================================================
// Batch Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BatchService } from '../services/batch-service';
import type { NotificationPayload } from '../types';

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
    threadId: 'thread-1',
    ...overrides,
  };
}

describe('BatchService', () => {
  let service: BatchService;

  beforeEach(() => {
    // Use a very short window for testing (100ms)
    service = new BatchService({ windowMs: 100, maxBatchSize: 50 });
  });

  describe('add', () => {
    it('should not batch a single notification', () => {
      const result = service.add(createNotification());
      expect(result).toBeNull();
    });

    it('should accumulate similar notifications within the same window', () => {
      service.add(createNotification({ title: 'First' }));
      const result = service.add(createNotification({ title: 'Second' }));
      expect(result).toBeNull();
      expect(service.getOpenWindowCount()).toBe(1);
    });

    it('should not batch notifications of different types', () => {
      service.add(createNotification({ type: 'message', threadId: 'thread-1' }));
      service.add(createNotification({ type: 'mention', threadId: 'thread-1' }));
      expect(service.getOpenWindowCount()).toBe(2);
    });

    it('should flush expired window when new notification arrives', async () => {
      service.add(createNotification({ title: 'First' }));
      service.add(createNotification({ title: 'Second' }));

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = service.add(createNotification({ title: 'Third' }));
      expect(result).not.toBeNull();
      expect(result!.count).toBe(2);
      expect(result!.notifications).toHaveLength(2);
    });

    it('should flush when max batch size is reached', () => {
      const svc = new BatchService({ windowMs: 60000, maxBatchSize: 3 });
      svc.add(createNotification({ title: 'First' }));
      svc.add(createNotification({ title: 'Second' }));
      const result = svc.add(createNotification({ title: 'Third' }));
      expect(result).not.toBeNull();
      expect(result!.count).toBe(3);
    });
  });

  describe('smart batching collapse: 5 similar within 5 min -> 1', () => {
    it('should collapse 5 similar notifications into 1 batched notification', () => {
      const svc = new BatchService({ windowMs: 5 * 60 * 1000, maxBatchSize: 5 });

      for (let i = 0; i < 4; i++) {
        const result = svc.add(createNotification({ title: `Msg ${i}` }));
        expect(result).toBeNull();
      }

      // 5th notification triggers max batch size
      const batched = svc.add(createNotification({ title: 'Msg 4' }));
      expect(batched).not.toBeNull();
      expect(batched!.count).toBe(5);
      expect(batched!.type).toBe('message');
      expect(batched!.title).toContain('5');
    });
  });

  describe('flushAll', () => {
    it('should flush all open windows', () => {
      service.add(createNotification({ title: 'A', threadId: 'thread-1' }));
      service.add(createNotification({ title: 'B', threadId: 'thread-1' }));
      service.add(createNotification({ title: 'C', type: 'mention', threadId: 'thread-2' }));
      service.add(createNotification({ title: 'D', type: 'mention', threadId: 'thread-2' }));

      const results = service.flushAll();
      // Only batches with 2+ notifications
      expect(results.length).toBe(2);
      expect(results[0]!.count).toBe(2);
      expect(results[1]!.count).toBe(2);
    });

    it('should not return single-notification windows as batches', () => {
      service.add(createNotification({ title: 'Only one', threadId: 'unique' }));

      const results = service.flushAll();
      expect(results).toHaveLength(0);
    });
  });

  describe('flushExpired', () => {
    it('should only flush windows past their expiry', async () => {
      service.add(createNotification({ title: 'First' }));
      service.add(createNotification({ title: 'Second' }));

      // Before expiry
      const before = service.flushExpired();
      expect(before).toHaveLength(0);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      const after = service.flushExpired();
      expect(after).toHaveLength(1);
      expect(after[0]!.count).toBe(2);
    });
  });
});
