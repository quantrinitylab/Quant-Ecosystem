// ============================================================================
// Search History Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SearchHistoryService } from './search-history';

describe('SearchHistoryService', () => {
  let service: SearchHistoryService;

  beforeEach(() => {
    service = new SearchHistoryService();
  });

  describe('addQuery', () => {
    it('should add a query to user history', () => {
      const entry = service.addQuery('user-1', 'test query');
      expect(entry).toBeDefined();
      expect(entry!.query).toBe('test query');
      expect(entry!.userId).toBe('user-1');
      expect(entry!.id).toMatch(/^sh-/);
    });

    it('should assign unique ids', () => {
      const entry1 = service.addQuery('user-1', 'query 1');
      const entry2 = service.addQuery('user-1', 'query 2');
      expect(entry1!.id).not.toBe(entry2!.id);
    });

    it('should not store incognito queries', () => {
      const entry = service.addQuery('user-1', 'secret query', true);
      expect(entry).toBeUndefined();
      const history = service.getHistory('user-1');
      expect(history).toHaveLength(0);
    });

    it('should not store empty queries', () => {
      const entry = service.addQuery('user-1', '   ');
      expect(entry).toBeUndefined();
    });

    it('should trim queries', () => {
      const entry = service.addQuery('user-1', '  hello world  ');
      expect(entry!.query).toBe('hello world');
    });
  });

  describe('getHistory', () => {
    it('should return empty array for user with no history', () => {
      const history = service.getHistory('user-1');
      expect(history).toEqual([]);
    });

    it('should return entries ordered by most recent first', () => {
      service.addQuery('user-1', 'first');
      service.addQuery('user-1', 'second');
      service.addQuery('user-1', 'third');

      const history = service.getHistory('user-1');
      expect(history[0]!.query).toBe('third');
      expect(history[1]!.query).toBe('second');
      expect(history[2]!.query).toBe('first');
    });

    it('should respect limit parameter', () => {
      service.addQuery('user-1', 'first');
      service.addQuery('user-1', 'second');
      service.addQuery('user-1', 'third');

      const history = service.getHistory('user-1', 2);
      expect(history).toHaveLength(2);
      expect(history[0]!.query).toBe('third');
    });

    it('should isolate different users', () => {
      service.addQuery('user-1', 'user1 query');
      service.addQuery('user-2', 'user2 query');

      expect(service.getHistory('user-1')).toHaveLength(1);
      expect(service.getHistory('user-2')).toHaveLength(1);
      expect(service.getHistory('user-1')[0]!.query).toBe('user1 query');
    });
  });

  describe('clearHistory', () => {
    it('should clear all entries for a user', () => {
      service.addQuery('user-1', 'query 1');
      service.addQuery('user-1', 'query 2');
      service.clearHistory('user-1');
      expect(service.getHistory('user-1')).toHaveLength(0);
    });

    it('should not affect other users', () => {
      service.addQuery('user-1', 'query 1');
      service.addQuery('user-2', 'query 2');
      service.clearHistory('user-1');
      expect(service.getHistory('user-2')).toHaveLength(1);
    });
  });

  describe('deleteQuery', () => {
    it('should delete a specific query by id', () => {
      const entry = service.addQuery('user-1', 'query to delete');
      const result = service.deleteQuery('user-1', entry!.id);
      expect(result).toBe(true);
      expect(service.getHistory('user-1')).toHaveLength(0);
    });

    it('should return false for non-existent query id', () => {
      const result = service.deleteQuery('user-1', 'non-existent');
      expect(result).toBe(false);
    });

    it('should return false for non-existent user', () => {
      const result = service.deleteQuery('non-existent-user', 'some-id');
      expect(result).toBe(false);
    });
  });

  describe('max history cap', () => {
    it('should cap history at 100 entries', () => {
      const svc = new SearchHistoryService({ maxEntries: 100 });
      for (let i = 0; i < 110; i++) {
        svc.addQuery('user-1', `query ${i}`);
      }
      expect(svc.getHistory('user-1')).toHaveLength(100);
    });

    it('should evict oldest entries when cap is reached', () => {
      const svc = new SearchHistoryService({ maxEntries: 3 });
      svc.addQuery('user-1', 'first');
      svc.addQuery('user-1', 'second');
      svc.addQuery('user-1', 'third');
      svc.addQuery('user-1', 'fourth');

      const history = svc.getHistory('user-1');
      expect(history).toHaveLength(3);
      expect(history[0]!.query).toBe('fourth');
      expect(history[2]!.query).toBe('second');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate queries (case-insensitive)', () => {
      service.addQuery('user-1', 'Hello World');
      service.addQuery('user-1', 'hello world');

      const history = service.getHistory('user-1');
      expect(history).toHaveLength(1);
      expect(history[0]!.query).toBe('hello world');
    });

    it('should move duplicate to front of history', () => {
      service.addQuery('user-1', 'first');
      service.addQuery('user-1', 'second');
      service.addQuery('user-1', 'first');

      const history = service.getHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history[0]!.query).toBe('first');
      expect(history[1]!.query).toBe('second');
    });
  });
});
