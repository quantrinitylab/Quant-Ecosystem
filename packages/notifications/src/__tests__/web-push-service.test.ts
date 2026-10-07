// ============================================================================
// Web Push Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebPushService } from '../services/web-push-service';
import type { VapidConfig, WebPushPayload } from '../services/web-push-service';
import type { WebPushSubscription } from '../types';

const TEST_VAPID: VapidConfig = {
  subject: 'mailto:test@example.com',
  publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkOs-J0O0JnH_Q-kCDhqC_Ga6I-3O_D5v18b',
  privateKey: 'Oc8RQHM-wDF6kp2axY5FiXBP-Jz3mKvLHn_rDYHpNJ0',
};

function createSubscription(overrides: Partial<WebPushSubscription> = {}): WebPushSubscription {
  return {
    userId: 'user-1',
    endpoint: 'https://push.example.com/subscription/abc123',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
    deviceId: 'device-1',
    registeredAt: Date.now(),
    isActive: true,
    ...overrides,
  };
}

describe('WebPushService', () => {
  let service: WebPushService;

  beforeEach(() => {
    service = new WebPushService(TEST_VAPID);
  });

  describe('VAPID configuration', () => {
    it('should return the public key', () => {
      expect(service.getPublicKey()).toBe(TEST_VAPID.publicKey);
    });

    it('should return null if VAPID is not configured', () => {
      const unconfigured = new WebPushService();
      expect(unconfigured.getPublicKey()).toBeNull();
    });

    it('should allow setting VAPID config after construction', () => {
      const svc = new WebPushService();
      svc.setVapidConfig(TEST_VAPID);
      expect(svc.getPublicKey()).toBe(TEST_VAPID.publicKey);
    });
  });

  describe('subscription management', () => {
    it('should register a subscription', () => {
      const sub = createSubscription();
      service.subscribe(sub);

      const subs = service.getSubscriptions('user-1');
      expect(subs).toHaveLength(1);
      expect(subs[0]!.endpoint).toBe(sub.endpoint);
    });

    it('should replace subscription with same endpoint', () => {
      const sub1 = createSubscription({ endpoint: 'https://push.example.com/a' });
      const sub2 = createSubscription({
        endpoint: 'https://push.example.com/a',
        deviceId: 'device-2',
      });

      service.subscribe(sub1);
      service.subscribe(sub2);

      const subs = service.getSubscriptions('user-1');
      expect(subs).toHaveLength(1);
      expect(subs[0]!.deviceId).toBe('device-2');
    });

    it('should support multiple subscriptions per user', () => {
      service.subscribe(
        createSubscription({ endpoint: 'https://push.example.com/a', deviceId: 'device-1' }),
      );
      service.subscribe(
        createSubscription({ endpoint: 'https://push.example.com/b', deviceId: 'device-2' }),
      );

      const subs = service.getSubscriptions('user-1');
      expect(subs).toHaveLength(2);
    });

    it('should unsubscribe by endpoint', () => {
      service.subscribe(createSubscription({ endpoint: 'https://push.example.com/a' }));
      service.subscribe(createSubscription({ endpoint: 'https://push.example.com/b' }));

      const result = service.unsubscribe('user-1', 'https://push.example.com/a');
      expect(result).toBe(true);
      expect(service.getSubscriptions('user-1')).toHaveLength(1);
    });

    it('should return false when unsubscribing non-existent endpoint', () => {
      const result = service.unsubscribe('user-1', 'https://push.example.com/nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    it('should send to all active subscriptions', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, endpoint: '', statusCode: 201 });
      service.setSendHandler(handler);

      service.subscribe(createSubscription({ endpoint: 'https://push.example.com/a' }));
      service.subscribe(createSubscription({ endpoint: 'https://push.example.com/b' }));

      const payload: WebPushPayload = { title: 'Test', body: 'Hello' };
      const results = await service.send('user-1', payload);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return error when VAPID is not configured', async () => {
      const svc = new WebPushService();
      const results = await svc.send('user-1', { title: 'Test', body: 'Hello' });

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('VAPID not configured');
    });

    it('should return error when no subscriptions exist', async () => {
      const results = await service.send('user-1', { title: 'Test', body: 'Hello' });

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('No subscriptions found');
    });

    it('should skip inactive subscriptions', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, endpoint: '', statusCode: 201 });
      service.setSendHandler(handler);

      service.subscribe(createSubscription({ endpoint: 'https://a.com', isActive: true }));
      service.subscribe(createSubscription({ endpoint: 'https://b.com', isActive: false }));

      const results = await service.send('user-1', { title: 'Test', body: 'Hello' });
      expect(results).toHaveLength(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle send failures gracefully', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Network timeout'));
      service.setSendHandler(handler);

      service.subscribe(createSubscription());

      const results = await service.send('user-1', { title: 'Test', body: 'Hello' });
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('Network timeout');
    });

    it('should mark subscription as inactive on 410 error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('410 Gone'));
      service.setSendHandler(handler);

      service.subscribe(createSubscription({ endpoint: 'https://push.example.com/expired' }));

      await service.send('user-1', { title: 'Test', body: 'Hello' });

      const subs = service.getSubscriptions('user-1');
      expect(subs[0]!.isActive).toBe(false);
    });

    it('should serialize payload as JSON', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, endpoint: '', statusCode: 201 });
      service.setSendHandler(handler);
      service.subscribe(createSubscription());

      const payload: WebPushPayload = { title: 'Test', body: 'Hello', data: { key: 'value' } };
      await service.send('user-1', payload);

      const sentPayload = handler.mock.calls[0]![1];
      expect(JSON.parse(sentPayload as string)).toEqual(payload);
    });
  });

  describe('cleanupInactive', () => {
    it('should remove inactive subscriptions', () => {
      service.subscribe(createSubscription({ endpoint: 'https://a.com', isActive: true }));
      service.subscribe(createSubscription({ endpoint: 'https://b.com', isActive: false }));

      const removed = service.cleanupInactive();
      expect(removed).toBe(1);
      expect(service.getSubscriptions('user-1')).toHaveLength(1);
    });
  });

  describe('getSubscriptionCount', () => {
    it('should return total subscriptions across all users', () => {
      service.subscribe(createSubscription({ userId: 'user-1', endpoint: 'https://a.com' }));
      service.subscribe(createSubscription({ userId: 'user-2', endpoint: 'https://b.com' }));

      expect(service.getSubscriptionCount()).toBe(2);
    });
  });
});
