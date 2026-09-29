import { describe, it, expect, beforeEach } from 'vitest';
import { VanishModeService } from '../services/vanish-mode.service';

describe('VanishModeService', () => {
  let service: VanishModeService;

  beforeEach(() => {
    service = new VanishModeService();
  });

  describe('enable', () => {
    it('should enable vanish mode for a conversation', () => {
      const session = service.enable('conv-1');
      expect(session.conversationId).toBe('conv-1');
      expect(session.startedAt).toBeGreaterThan(0);
      expect(session.messageCount).toBe(0);
    });

    it('should return existing session if already enabled', () => {
      const first = service.enable('conv-1');
      const second = service.enable('conv-1');
      expect(first.startedAt).toBe(second.startedAt);
    });
  });

  describe('disable', () => {
    it('should disable vanish mode for a conversation', () => {
      service.enable('conv-1');
      service.disable('conv-1');
      expect(service.isEnabled('conv-1')).toBe(false);
    });

    it('should not throw for non-enabled conversation', () => {
      expect(() => service.disable('conv-1')).not.toThrow();
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled conversation', () => {
      service.enable('conv-1');
      expect(service.isEnabled('conv-1')).toBe(true);
    });

    it('should return false for non-enabled conversation', () => {
      expect(service.isEnabled('conv-1')).toBe(false);
    });
  });

  describe('onMessageSeen', () => {
    it('should mark message for deletion and return true', () => {
      service.enable('conv-1');
      const result = service.onMessageSeen('conv-1', 'msg-1');
      expect(result).toBe(true);
    });

    it('should increment message count', () => {
      service.enable('conv-1');
      service.onMessageSeen('conv-1', 'msg-1');
      service.onMessageSeen('conv-1', 'msg-2');

      const sessions = service.getActiveSessions();
      const session = sessions.find((s) => s.conversationId === 'conv-1');
      expect(session?.messageCount).toBe(2);
    });

    it('should return false if message already seen', () => {
      service.enable('conv-1');
      service.onMessageSeen('conv-1', 'msg-1');
      const result = service.onMessageSeen('conv-1', 'msg-1');
      expect(result).toBe(false);
    });

    it('should return false if vanish mode is not enabled', () => {
      const result = service.onMessageSeen('conv-1', 'msg-1');
      expect(result).toBe(false);
    });
  });

  describe('getActiveSessions', () => {
    it('should return all active sessions', () => {
      service.enable('conv-1');
      service.enable('conv-2');
      const sessions = service.getActiveSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should return empty array when no sessions', () => {
      expect(service.getActiveSessions()).toHaveLength(0);
    });

    it('should not include disabled sessions', () => {
      service.enable('conv-1');
      service.enable('conv-2');
      service.disable('conv-1');
      expect(service.getActiveSessions()).toHaveLength(1);
    });
  });

  describe('getMessageTTL / setMessageTTL', () => {
    it('should return default TTL of 5000ms', () => {
      expect(service.getMessageTTL()).toBe(5000);
    });

    it('should update TTL', () => {
      service.setMessageTTL(10000);
      expect(service.getMessageTTL()).toBe(10000);
    });

    it('should not update TTL with non-positive value', () => {
      service.setMessageTTL(0);
      expect(service.getMessageTTL()).toBe(5000);
      service.setMessageTTL(-100);
      expect(service.getMessageTTL()).toBe(5000);
    });
  });
});
