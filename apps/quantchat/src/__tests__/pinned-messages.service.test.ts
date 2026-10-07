import { describe, it, expect, beforeEach } from 'vitest';
import { PinnedMessagesService } from '../services/pinned-messages.service';

describe('PinnedMessagesService', () => {
  let service: PinnedMessagesService;

  beforeEach(() => {
    service = new PinnedMessagesService();
  });

  describe('pin', () => {
    it('should pin a message', () => {
      const pinned = service.pin('conv-1', 'msg-1', 'user-1', 'Hello world');

      expect(pinned.messageId).toBe('msg-1');
      expect(pinned.pinnedBy).toBe('user-1');
      expect(pinned.content).toBe('Hello world');
      expect(pinned.pinnedAt).toBeGreaterThan(0);
    });

    it('should not duplicate pin for same message', () => {
      const first = service.pin('conv-1', 'msg-1', 'user-1', 'Hello');
      const second = service.pin('conv-1', 'msg-1', 'user-2', 'Hello');

      expect(first).toBe(second);
      expect(service.getPinCount('conv-1')).toBe(1);
    });

    it('should enforce max 50 pins per conversation', () => {
      for (let i = 0; i < 50; i++) {
        service.pin('conv-1', `msg-${i}`, 'user-1', `Message ${i}`);
      }

      expect(() => {
        service.pin('conv-1', 'msg-51', 'user-1', 'One too many');
      }).toThrow('Maximum of 50 pinned messages per conversation');
    });

    it('should allow pins in different conversations independently', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'Hello');
      service.pin('conv-2', 'msg-2', 'user-1', 'World');

      expect(service.getPinCount('conv-1')).toBe(1);
      expect(service.getPinCount('conv-2')).toBe(1);
    });
  });

  describe('unpin', () => {
    it('should unpin a message', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'Hello');
      const result = service.unpin('conv-1', 'msg-1');

      expect(result).toBe(true);
      expect(service.isPinned('msg-1')).toBe(false);
      expect(service.getPinCount('conv-1')).toBe(0);
    });

    it('should return false for non-pinned message', () => {
      const result = service.unpin('conv-1', 'msg-1');
      expect(result).toBe(false);
    });

    it('should return false for non-existent conversation', () => {
      const result = service.unpin('unknown', 'msg-1');
      expect(result).toBe(false);
    });
  });

  describe('getPinned', () => {
    it('should return pinned messages sorted by most recent first', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'First');
      service.pin('conv-1', 'msg-2', 'user-1', 'Second');
      service.pin('conv-1', 'msg-3', 'user-1', 'Third');

      const pinned = service.getPinned('conv-1');
      expect(pinned).toHaveLength(3);
      // Most recent first
      expect(pinned[0]?.messageId).toBe('msg-3');
    });

    it('should return empty array for conversation with no pins', () => {
      const pinned = service.getPinned('conv-1');
      expect(pinned).toHaveLength(0);
    });
  });

  describe('isPinned', () => {
    it('should return true for pinned message', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'Hello');
      expect(service.isPinned('msg-1')).toBe(true);
    });

    it('should return false for non-pinned message', () => {
      expect(service.isPinned('msg-1')).toBe(false);
    });

    it('should return false after unpin', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'Hello');
      service.unpin('conv-1', 'msg-1');
      expect(service.isPinned('msg-1')).toBe(false);
    });
  });

  describe('getPinCount', () => {
    it('should return 0 for empty conversation', () => {
      expect(service.getPinCount('conv-1')).toBe(0);
    });

    it('should return correct count', () => {
      service.pin('conv-1', 'msg-1', 'user-1', 'First');
      service.pin('conv-1', 'msg-2', 'user-1', 'Second');
      expect(service.getPinCount('conv-1')).toBe(2);
    });
  });

  describe('getMaxPins', () => {
    it('should return 50', () => {
      expect(service.getMaxPins()).toBe(50);
    });
  });
});
