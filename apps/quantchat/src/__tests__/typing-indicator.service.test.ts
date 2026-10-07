import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TypingIndicatorService } from '../services/typing-indicator.service';

describe('TypingIndicatorService', () => {
  let service: TypingIndicatorService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TypingIndicatorService({ timeoutMs: 3000 });
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
  });

  describe('startTyping', () => {
    it('should add user to typing list', () => {
      service.startTyping('user-1', 'conv-1');
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
    });

    it('should track multiple users typing', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');

      const users = service.getTypingUsers('conv-1');
      expect(users).toContain('user-1');
      expect(users).toContain('user-2');
      expect(users).toHaveLength(2);
    });

    it('should not duplicate same user', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-1', 'conv-1');

      expect(service.getTypingUsers('conv-1')).toHaveLength(1);
    });

    it('should auto-stop after timeout', () => {
      service.startTyping('user-1', 'conv-1');
      expect(service.isTyping('user-1', 'conv-1')).toBe(true);

      vi.advanceTimersByTime(3000);
      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
    });

    it('should reset timeout on repeated typing', () => {
      service.startTyping('user-1', 'conv-1');
      vi.advanceTimersByTime(2000);
      service.startTyping('user-1', 'conv-1');
      vi.advanceTimersByTime(2000);

      expect(service.isTyping('user-1', 'conv-1')).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
    });
  });

  describe('stopTyping', () => {
    it('should remove user from typing list', () => {
      service.startTyping('user-1', 'conv-1');
      service.stopTyping('user-1', 'conv-1');

      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
    });

    it('should not affect other users', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');
      service.stopTyping('user-1', 'conv-1');

      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
      expect(service.isTyping('user-2', 'conv-1')).toBe(true);
    });
  });

  describe('getTypingUsers', () => {
    it('should return empty array for conversation with no typing', () => {
      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });

    it('should return all typing users', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');

      expect(service.getTypingUsers('conv-1')).toHaveLength(2);
    });
  });

  describe('isTyping', () => {
    it('should return true when user is typing', () => {
      service.startTyping('user-1', 'conv-1');
      expect(service.isTyping('user-1', 'conv-1')).toBe(true);
    });

    it('should return false when user is not typing', () => {
      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
    });

    it('should be conversation-specific', () => {
      service.startTyping('user-1', 'conv-1');
      expect(service.isTyping('user-1', 'conv-2')).toBe(false);
    });
  });

  describe('getTypingCount', () => {
    it('should return 0 for empty conversation', () => {
      expect(service.getTypingCount('conv-1')).toBe(0);
    });

    it('should return correct count', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');
      expect(service.getTypingCount('conv-1')).toBe(2);
    });
  });

  describe('getTypingText', () => {
    it('should return empty for no typing users', () => {
      expect(service.getTypingText('conv-1')).toBe('');
    });

    it('should format single user', () => {
      service.startTyping('user-1', 'conv-1');
      expect(service.getTypingText('conv-1')).toBe('user-1 is typing...');
    });

    it('should format two users', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');
      expect(service.getTypingText('conv-1')).toBe('user-1 and user-2 are typing...');
    });

    it('should format three or more users', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');
      service.startTyping('user-3', 'conv-1');
      expect(service.getTypingText('conv-1')).toBe('user-1 and 2 others are typing...');
    });

    it('should exclude current user', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');
      expect(service.getTypingText('conv-1', 'user-1')).toBe('user-2 is typing...');
    });
  });

  describe('stopAllForUser', () => {
    it('should stop typing in all conversations', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-1', 'conv-2');

      service.stopAllForUser('user-1');

      expect(service.isTyping('user-1', 'conv-1')).toBe(false);
      expect(service.isTyping('user-1', 'conv-2')).toBe(false);
    });
  });

  describe('stopAllForConversation', () => {
    it('should stop all typing in a conversation', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-1');

      service.stopAllForConversation('conv-1');

      expect(service.getTypingCount('conv-1')).toBe(0);
    });
  });

  describe('onChange', () => {
    it('should notify on typing changes', () => {
      const changes: { conv: string; users: string[] }[] = [];
      service.onChange((conv, users) => changes.push({ conv, users }));

      service.startTyping('user-1', 'conv-1');
      expect(changes).toHaveLength(1);
      expect(changes[0]?.conv).toBe('conv-1');
      expect(changes[0]?.users).toContain('user-1');
    });

    it('should notify on stop typing', () => {
      const changes: { conv: string; users: string[] }[] = [];
      service.startTyping('user-1', 'conv-1');

      service.onChange((conv, users) => changes.push({ conv, users }));
      service.stopTyping('user-1', 'conv-1');

      expect(changes).toHaveLength(1);
      expect(changes[0]?.users).toHaveLength(0);
    });

    it('should allow unsubscribing', () => {
      const changes: string[] = [];
      const unsub = service.onChange((conv) => changes.push(conv));

      service.startTyping('user-1', 'conv-1');
      unsub();
      service.startTyping('user-2', 'conv-1');

      expect(changes).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear all typing state', () => {
      service.startTyping('user-1', 'conv-1');
      service.startTyping('user-2', 'conv-2');

      service.clear();

      expect(service.getTypingCount('conv-1')).toBe(0);
      expect(service.getTypingCount('conv-2')).toBe(0);
    });
  });
});
