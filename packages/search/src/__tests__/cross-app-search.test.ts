// ============================================================================
// Cross-App Search Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CrossAppSearchService } from '../cross-app-search';

describe('CrossAppSearchService', () => {
  let service: CrossAppSearchService;

  beforeEach(() => {
    service = new CrossAppSearchService();
  });

  describe('indexDocument', () => {
    it('should index a document', () => {
      const result = service.indexDocument('quantchat', {
        id: 'doc1',
        type: 'message',
        title: 'Hello World',
        content: 'This is a test message',
        url: '/chat/messages/doc1',
      });

      expect(result).toBe(true);
    });
  });

  describe('search', () => {
    it('should find documents by title', () => {
      service.indexDocument('quantchat', {
        id: 'doc1',
        type: 'message',
        title: 'Hello World',
        content: 'Test content',
        url: '/chat/doc1',
      });

      const response = service.search('Hello');
      expect(response.results).toHaveLength(1);
      expect(response.results[0]!.title).toBe('Hello World');
      expect(response.total).toBe(1);
    });

    it('should find documents by content', () => {
      service.indexDocument('quantmail', {
        id: 'doc2',
        type: 'email',
        title: 'Meeting',
        content: 'Lets discuss the project budget tomorrow',
        url: '/mail/doc2',
      });

      const response = service.search('budget');
      expect(response.results).toHaveLength(1);
      expect(response.results[0]!.app).toBe('quantmail');
    });

    it('should filter by apps', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'msg',
        title: 'Hello',
        content: 'hi',
        url: '/1',
      });
      service.indexDocument('quantmail', {
        id: 'd2',
        type: 'email',
        title: 'Hello',
        content: 'hi',
        url: '/2',
      });

      const response = service.search('Hello', { apps: ['quantchat'] });
      expect(response.results).toHaveLength(1);
      expect(response.results[0]!.app).toBe('quantchat');
    });

    it('should filter by types', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'message',
        title: 'Hello',
        content: 'hi',
        url: '/1',
      });
      service.indexDocument('quantmail', {
        id: 'd2',
        type: 'email',
        title: 'Hello',
        content: 'hi',
        url: '/2',
      });

      const response = service.search('Hello', { types: ['email'] });
      expect(response.results).toHaveLength(1);
      expect(response.results[0]!.type).toBe('email');
    });

    it('should respect limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        service.indexDocument('quantchat', {
          id: `d${i}`,
          type: 'msg',
          title: `Test ${i}`,
          content: 'test content',
          url: `/${i}`,
        });
      }

      const response = service.search('test', { limit: 2, offset: 1 });
      expect(response.results).toHaveLength(2);
      expect(response.total).toBe(5);
    });

    it('should return took time', () => {
      const response = service.search('anything');
      expect(response.took).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSuggestions', () => {
    it('should return suggestions from document titles', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'msg',
        title: 'Project Planning',
        content: 'plan',
        url: '/1',
      });
      service.indexDocument('quantmail', {
        id: 'd2',
        type: 'email',
        title: 'Project Review',
        content: 'review',
        url: '/2',
      });

      const suggestions = service.getSuggestions('proj');
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]!.type).toBe('autocomplete');
    });

    it('should respect limit', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'msg',
        title: 'Test A',
        content: 'a',
        url: '/1',
      });
      service.indexDocument('quantmail', {
        id: 'd2',
        type: 'msg',
        title: 'Test B',
        content: 'b',
        url: '/2',
      });

      const suggestions = service.getSuggestions('test', 1);
      expect(suggestions).toHaveLength(1);
    });
  });

  describe('recentSearches', () => {
    it('should track recent searches per user', () => {
      service.addToRecentSearches('user1', 'hello');
      service.addToRecentSearches('user1', 'world');

      const recent = service.getRecentSearches('user1');
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('world'); // Most recent first
    });

    it('should deduplicate repeated searches', () => {
      service.addToRecentSearches('user1', 'hello');
      service.addToRecentSearches('user1', 'world');
      service.addToRecentSearches('user1', 'hello');

      const recent = service.getRecentSearches('user1');
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('hello'); // Most recent first
    });

    it('should clear recent searches', () => {
      service.addToRecentSearches('user1', 'hello');
      service.clearRecentSearches('user1');

      const recent = service.getRecentSearches('user1');
      expect(recent).toHaveLength(0);
    });

    it('should respect limit on getRecentSearches', () => {
      service.addToRecentSearches('user1', 'a');
      service.addToRecentSearches('user1', 'b');
      service.addToRecentSearches('user1', 'c');

      const recent = service.getRecentSearches('user1', 2);
      expect(recent).toHaveLength(2);
    });
  });

  describe('removeDocument', () => {
    it('should remove a document from the index', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'msg',
        title: 'Hello',
        content: 'hi',
        url: '/1',
      });
      const result = service.removeDocument('quantchat', 'd1');
      expect(result).toBe(true);

      const response = service.search('Hello');
      expect(response.results).toHaveLength(0);
    });

    it('should return false for non-existent document', () => {
      const result = service.removeDocument('quantchat', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getIndexStats', () => {
    it('should return stats per app', () => {
      service.indexDocument('quantchat', {
        id: 'd1',
        type: 'msg',
        title: 'A',
        content: 'a',
        url: '/1',
      });
      service.indexDocument('quantchat', {
        id: 'd2',
        type: 'msg',
        title: 'B',
        content: 'b',
        url: '/2',
      });
      service.indexDocument('quantmail', {
        id: 'd3',
        type: 'email',
        title: 'C',
        content: 'c',
        url: '/3',
      });

      const stats = service.getIndexStats();
      expect(stats['quantchat']!.documents).toBe(2);
      expect(stats['quantmail']!.documents).toBe(1);
    });
  });
});
