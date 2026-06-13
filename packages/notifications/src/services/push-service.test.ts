// ============================================================================
// Notifications - Push Service Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushService } from './push-service';

// Mock firebase-admin
const mockSend = vi.fn();
const mockSendEachForMulticast = vi.fn();
const mockMessaging = vi.fn(function () {
  return {
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
  };
});
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockInitializeApp = vi.fn((_config?: unknown) => ({
  messaging: mockMessaging,
  delete: mockDelete,
}));
const mockCert = vi.fn((_cred?: unknown) => ({}));

vi.mock('firebase-admin', () => ({
  initializeApp: (config: unknown) => mockInitializeApp(config),
  credential: {
    cert: (cred: unknown) => mockCert(cred),
  },
}));

// Mock @quant/notifications apns-client
const mockApnSend = vi.fn();
const mockApnShutdown = vi.fn();

vi.mock('./apns-client', () => {
  class MockProvider {
    send = mockApnSend;
    shutdown = mockApnShutdown;
  }
  class MockNotificationBuilder {
    alert: unknown;
    badge?: number;
    sound?: string;
    topic?: string;
    payload?: unknown;
  }
  return {
    ApnsProvider: MockProvider,
    ApnsNotificationBuilder: MockNotificationBuilder,
  };
});

describe('PushService', () => {
  let service: PushService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PushService();
    service.initialize({
      firebaseCredential: {
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-private-key',
      },
      apnOptions: {
        token: {
          key: 'fake-key',
          keyId: 'KEY123',
          teamId: 'TEAM456',
        },
      },
    });
  });

  describe('sendPush', () => {
    it('should route android to FCM', async () => {
      mockSend.mockResolvedValue('message_id_123');

      const result = await service.sendPush('fcm_token_abc', 'android', {
        title: 'Hello',
        body: 'World',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('message_id_123');
      expect(mockSend).toHaveBeenCalled();
    });

    it('should route web to FCM', async () => {
      mockSend.mockResolvedValue('message_id_456');

      const result = await service.sendPush('fcm_token_web', 'web', {
        title: 'Web Push',
        body: 'Content',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('message_id_456');
    });

    it('should route ios to APNs', async () => {
      mockApnSend.mockResolvedValue({ sent: [{}], failed: [] });

      const result = await service.sendPush('apns_device_token', 'ios', {
        title: 'iOS Push',
        body: 'From APNs',
        badge: 5,
        sound: 'notification.caf',
      });

      expect(result.success).toBe(true);
      expect(mockApnSend).toHaveBeenCalled();
    });

    it('should return error result when FCM fails', async () => {
      mockSend.mockRejectedValue(new Error('FCM token expired'));

      const result = await service.sendPush('bad_token', 'android', {
        title: 'Test',
        body: 'Message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('FCM token expired');
    });

    it('should return error result when APNs fails', async () => {
      mockApnSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'BadDeviceToken' } }],
      });

      const result = await service.sendPush('invalid_token', 'ios', {
        title: 'Test',
        body: 'Message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('BadDeviceToken');
    });

    it('should return error for invalid payload (empty title)', async () => {
      const result = await service.sendPush('token', 'android', {
        title: '',
        body: 'Message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid payload (empty body)', async () => {
      const result = await service.sendPush('token', 'android', {
        title: 'Title',
        body: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include data and imageUrl in FCM payload', async () => {
      mockSend.mockResolvedValue('msg_with_data');

      await service.sendPush('token', 'android', {
        title: 'Alert',
        body: 'Details',
        data: { action: 'open_chat', chatId: '123' },
        imageUrl: 'https://example.com/image.png',
      });

      const sentMessage = mockSend.mock.calls[0]![0];
      expect(sentMessage.data).toEqual({ action: 'open_chat', chatId: '123' });
      expect(sentMessage.notification.imageUrl).toBe('https://example.com/image.png');
    });
  });

  describe('sendMulticast', () => {
    it('should send to multiple tokens via FCM', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        responses: [
          { success: true, messageId: 'msg_1' },
          { success: true, messageId: 'msg_2' },
          { success: false, error: { message: 'Invalid token' } },
        ],
        successCount: 2,
        failureCount: 1,
      });

      const results = await service.sendMulticast(['token_1', 'token_2', 'token_3'], {
        title: 'Broadcast',
        body: 'Hello all',
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.messageId).toBe('msg_1');
      expect(results[1]!.success).toBe(true);
      expect(results[2]!.success).toBe(false);
      expect(results[2]!.error).toBe('Invalid token');
    });

    it('should return error results on exception', async () => {
      mockSendEachForMulticast.mockRejectedValue(new Error('Network error'));

      const results = await service.sendMulticast(['token_1', 'token_2'], {
        title: 'Test',
        body: 'Error',
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('Network error');
    });
  });

  describe('shutdown', () => {
    it('should shut down APNs provider and Firebase app', async () => {
      await service.shutdown();

      expect(mockApnShutdown).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('error handling - no throwing', () => {
    it('should not throw on any platform send failure', async () => {
      mockSend.mockRejectedValue(new Error('Network timeout'));

      const result = await service.sendPush('token', 'android', {
        title: 'Test',
        body: 'Body',
      });

      // Should return gracefully, not throw
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });
});
