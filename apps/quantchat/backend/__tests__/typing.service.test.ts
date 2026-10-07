import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TypingService } from '../services/typing.service';

describe('TypingService', () => {
  let service: TypingService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TypingService();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('startTyping', () => {
    it('adds user to typing users for the conversation', () => {
      service.startTyping('conv-1', 'user-1');

      const typingUsers = service.getTypingUsers('conv-1');
      expect(typingUsers).toContain('user-1');
    });

    it('supports multiple users typing in the same conversation', () => {
      service.startTyping('conv-1', 'user-1');
      service.startTyping('conv-1', 'user-2');

      const typingUsers = service.getTypingUsers('conv-1');
      expect(typingUsers).toContain('user-1');
      expect(typingUsers).toContain('user-2');
      expect(typingUsers).toHaveLength(2);
    });

    it('auto-clears typing after timeout', () => {
      service.startTyping('conv-1', 'user-1');

      expect(service.getTypingUsers('conv-1')).toHaveLength(1);

      // Advance past the timeout (5000ms)
      vi.advanceTimersByTime(5001);

      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });

    it('resets timeout when called again for same user', () => {
      service.startTyping('conv-1', 'user-1');

      // Advance 3 seconds
      vi.advanceTimersByTime(3000);

      // Call again to reset
      service.startTyping('conv-1', 'user-1');

      // Advance another 3 seconds (total 6 from first call, 3 from second)
      vi.advanceTimersByTime(3000);

      // Should still be typing since we reset
      expect(service.getTypingUsers('conv-1')).toContain('user-1');

      // Advance past the new timeout
      vi.advanceTimersByTime(2001);

      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });
  });

  describe('stopTyping', () => {
    it('removes user from typing users', () => {
      service.startTyping('conv-1', 'user-1');
      service.startTyping('conv-1', 'user-2');

      service.stopTyping('conv-1', 'user-1');

      const typingUsers = service.getTypingUsers('conv-1');
      expect(typingUsers).not.toContain('user-1');
      expect(typingUsers).toContain('user-2');
    });

    it('handles stopping when user was not typing', () => {
      service.stopTyping('conv-1', 'user-1');

      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });

    it('cleans up conversation map when last user stops', () => {
      service.startTyping('conv-1', 'user-1');
      service.stopTyping('conv-1', 'user-1');

      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });
  });

  describe('getTypingUsers', () => {
    it('returns empty array for unknown conversation', () => {
      expect(service.getTypingUsers('unknown-conv')).toEqual([]);
    });

    it('returns only users currently typing', () => {
      service.startTyping('conv-1', 'user-1');
      service.startTyping('conv-1', 'user-2');
      service.stopTyping('conv-1', 'user-1');

      expect(service.getTypingUsers('conv-1')).toEqual(['user-2']);
    });

    it('isolates typing state across conversations', () => {
      service.startTyping('conv-1', 'user-1');
      service.startTyping('conv-2', 'user-2');

      expect(service.getTypingUsers('conv-1')).toEqual(['user-1']);
      expect(service.getTypingUsers('conv-2')).toEqual(['user-2']);
    });
  });
});
