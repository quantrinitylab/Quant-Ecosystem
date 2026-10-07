import { describe, it, expect, beforeEach } from 'vitest';
import { MessageSearchService } from '../services/message-search.service';
import type { SearchableMessage } from '../services/message-search.service';

describe('MessageSearchService', () => {
  let service: MessageSearchService;

  const makeMessage = (overrides: Partial<SearchableMessage> = {}): SearchableMessage => ({
    id: `msg-${Math.random().toString(36).substring(2, 9)}`,
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: 'Hello world',
    timestamp: Date.now(),
    type: 'text',
    isPinned: false,
    ...overrides,
  });

  beforeEach(() => {
    service = new MessageSearchService();
  });

  describe('indexMessage', () => {
    it('should index a message', () => {
      const msg = makeMessage({ id: 'msg-1' });
      service.indexMessage(msg);
      expect(service.getMessageCount()).toBe(1);
    });

    it('should index multiple messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1' }));
      service.indexMessage(makeMessage({ id: 'msg-2' }));
      expect(service.getMessageCount()).toBe(2);
    });

    it('should track per-conversation count', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', conversationId: 'conv-1' }));
      service.indexMessage(makeMessage({ id: 'msg-2', conversationId: 'conv-1' }));
      service.indexMessage(makeMessage({ id: 'msg-3', conversationId: 'conv-2' }));

      expect(service.getMessageCount('conv-1')).toBe(2);
      expect(service.getMessageCount('conv-2')).toBe(1);
    });
  });

  describe('removeMessage', () => {
    it('should remove an indexed message', () => {
      service.indexMessage(makeMessage({ id: 'msg-1' }));
      const result = service.removeMessage('msg-1');
      expect(result).toBe(true);
      expect(service.getMessageCount()).toBe(0);
    });

    it('should return false for non-existent message', () => {
      expect(service.removeMessage('non-existent')).toBe(false);
    });
  });

  describe('search', () => {
    it('should find messages matching query', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello world' }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Goodbye world' }));
      service.indexMessage(makeMessage({ id: 'msg-3', content: 'Hello there' }));

      const results = service.search('Hello');
      expect(results.length).toBe(2);
    });

    it('should return empty for no matches', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello world' }));
      const results = service.search('xyz');
      expect(results).toHaveLength(0);
    });

    it('should return empty for empty query', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello' }));
      expect(service.search('')).toHaveLength(0);
      expect(service.search('   ')).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello World' }));
      const results = service.search('hello');
      expect(results).toHaveLength(1);
    });

    it('should support multi-term search', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello beautiful world' }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello there' }));

      const results = service.search('Hello world');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.message.id).toBe('msg-1');
    });

    it('should include highlights', () => {
      service.indexMessage(
        makeMessage({
          id: 'msg-1',
          content: 'The quick brown fox jumps over the lazy dog',
        }),
      );

      const results = service.search('fox');
      expect(results[0]?.highlights.length).toBeGreaterThan(0);
    });

    it('should boost pinned messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello', isPinned: false }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello', isPinned: true }));

      const results = service.search('Hello');
      expect(results[0]?.message.id).toBe('msg-2');
    });

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) {
        service.indexMessage(makeMessage({ id: `msg-${i}`, content: 'Hello world' }));
      }

      const results = service.search('Hello', undefined, 3);
      expect(results).toHaveLength(3);
    });
  });

  describe('search with filters', () => {
    it('should filter by conversation', () => {
      service.indexMessage(
        makeMessage({ id: 'msg-1', conversationId: 'conv-1', content: 'Hello' }),
      );
      service.indexMessage(
        makeMessage({ id: 'msg-2', conversationId: 'conv-2', content: 'Hello' }),
      );

      const results = service.search('Hello', { conversationId: 'conv-1' });
      expect(results).toHaveLength(1);
      expect(results[0]?.message.conversationId).toBe('conv-1');
    });

    it('should filter by sender', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', senderId: 'user-1', content: 'Hello' }));
      service.indexMessage(makeMessage({ id: 'msg-2', senderId: 'user-2', content: 'Hello' }));

      const results = service.search('Hello', { senderId: 'user-1' });
      expect(results).toHaveLength(1);
    });

    it('should filter by type', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello', type: 'text' }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello', type: 'image' }));

      const results = service.search('Hello', { type: 'text' });
      expect(results).toHaveLength(1);
    });

    it('should filter by timestamp range', () => {
      const now = Date.now();
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello', timestamp: now - 10000 }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello', timestamp: now }));

      const results = service.search('Hello', { fromTimestamp: now - 5000 });
      expect(results).toHaveLength(1);
    });

    it('should filter pinned messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello', isPinned: true }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello', isPinned: false }));

      const results = service.search('Hello', { isPinned: true });
      expect(results).toHaveLength(1);
      expect(results[0]?.message.id).toBe('msg-1');
    });
  });

  describe('searchByDate', () => {
    it('should sort results by date', () => {
      const now = Date.now();
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Hello', timestamp: now - 2000 }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Hello', timestamp: now }));
      service.indexMessage(makeMessage({ id: 'msg-3', content: 'Hello', timestamp: now - 1000 }));

      const results = service.searchByDate('Hello');
      expect(results[0]?.message.id).toBe('msg-2');
    });
  });

  describe('searchPinned', () => {
    it('should return pinned messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Pinned msg', isPinned: true }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Normal msg', isPinned: false }));

      const results = service.searchPinned('conv-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.message.isPinned).toBe(true);
    });

    it('should search within pinned messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1', content: 'Important note', isPinned: true }));
      service.indexMessage(makeMessage({ id: 'msg-2', content: 'Other pinned', isPinned: true }));

      const results = service.searchPinned('conv-1', 'Important');
      expect(results).toHaveLength(1);
    });
  });

  describe('getRecentMessages', () => {
    it('should return recent messages sorted by timestamp', () => {
      const now = Date.now();
      service.indexMessage(makeMessage({ id: 'msg-1', timestamp: now - 3000 }));
      service.indexMessage(makeMessage({ id: 'msg-2', timestamp: now - 1000 }));
      service.indexMessage(makeMessage({ id: 'msg-3', timestamp: now - 2000 }));

      const recent = service.getRecentMessages('conv-1', 2);
      expect(recent).toHaveLength(2);
      expect(recent[0]?.id).toBe('msg-2');
    });

    it('should return empty for unknown conversation', () => {
      expect(service.getRecentMessages('unknown')).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all indexed messages', () => {
      service.indexMessage(makeMessage({ id: 'msg-1' }));
      service.indexMessage(makeMessage({ id: 'msg-2' }));
      service.clear();
      expect(service.getMessageCount()).toBe(0);
    });
  });
});
