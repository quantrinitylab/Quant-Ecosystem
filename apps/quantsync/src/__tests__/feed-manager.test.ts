import { describe, it, expect, beforeEach } from 'vitest';
import { FeedManagerService } from '../services/feed-manager.service';
import type { FeedItem } from '../services/feed-manager.service';

describe('FeedManagerService', () => {
  let service: FeedManagerService;

  const createItem = (id: string, score: number, createdAt?: number): FeedItem => ({
    id,
    type: 'post',
    content: `Content for ${id}`,
    author: { id: 'user-1', name: 'Test User' },
    createdAt: createdAt ?? Date.now(),
    engagementScore: score,
  });

  beforeEach(() => {
    service = new FeedManagerService();
  });

  describe('addToFeed', () => {
    it('should add items to the feed', () => {
      service.addToFeed(createItem('post-1', 50));
      service.addToFeed(createItem('post-2', 80));

      const page = service.loadPage(null, 10);
      expect(page.items).toHaveLength(2);
    });

    it('should not add duplicate items', () => {
      service.addToFeed(createItem('post-1', 50));
      service.addToFeed(createItem('post-1', 50));

      const page = service.loadPage(null, 10);
      expect(page.items).toHaveLength(1);
    });

    it('should sort items by engagement score descending', () => {
      service.addToFeed(createItem('post-low', 10));
      service.addToFeed(createItem('post-high', 90));
      service.addToFeed(createItem('post-mid', 50));

      const page = service.loadPage(null, 10);
      expect(page.items[0]?.id).toBe('post-high');
      expect(page.items[1]?.id).toBe('post-mid');
      expect(page.items[2]?.id).toBe('post-low');
    });
  });

  describe('loadPage', () => {
    it('should return first page when cursor is null', () => {
      for (let i = 0; i < 10; i++) {
        service.addToFeed(createItem(`post-${i}`, 100 - i));
      }

      const page = service.loadPage(null, 5);
      expect(page.items).toHaveLength(5);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).toBeDefined();
    });

    it('should return next page using cursor', () => {
      for (let i = 0; i < 10; i++) {
        service.addToFeed(createItem(`post-${i}`, 100 - i));
      }

      const firstPage = service.loadPage(null, 5);
      const secondPage = service.loadPage(firstPage.nextCursor, 5);

      expect(secondPage.items).toHaveLength(5);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.nextCursor).toBeNull();
    });

    it('should return empty page when no items', () => {
      const page = service.loadPage(null, 10);
      expect(page.items).toHaveLength(0);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('should handle invalid cursor gracefully', () => {
      service.addToFeed(createItem('post-1', 50));

      const page = service.loadPage('invalid-cursor', 10);
      // Starts from beginning when cursor not found
      expect(page.items).toHaveLength(1);
    });
  });

  describe('refresh', () => {
    it('should return the first page of 20 items', () => {
      for (let i = 0; i < 25; i++) {
        service.addToFeed(createItem(`post-${i}`, 100 - i));
      }

      const page = service.refresh();
      expect(page.items).toHaveLength(20);
      expect(page.hasMore).toBe(true);
    });
  });

  describe('markSeen', () => {
    it('should mark items as seen', () => {
      service.markSeen(['post-1', 'post-2', 'post-3']);
      expect(service.getSeenCount()).toBe(3);
    });

    it('should not double count seen items', () => {
      service.markSeen(['post-1', 'post-2']);
      service.markSeen(['post-2', 'post-3']);
      expect(service.getSeenCount()).toBe(3);
    });
  });

  describe('getSeenCount', () => {
    it('should return 0 initially', () => {
      expect(service.getSeenCount()).toBe(0);
    });
  });

  describe('deduplicateItems', () => {
    it('should remove duplicate items', () => {
      const items: FeedItem[] = [
        createItem('post-1', 50),
        createItem('post-2', 60),
        createItem('post-1', 50),
        createItem('post-3', 70),
        createItem('post-2', 60),
      ];

      const deduplicated = service.deduplicateItems(items);
      expect(deduplicated).toHaveLength(3);
    });

    it('should preserve order of first occurrences', () => {
      const items: FeedItem[] = [
        createItem('post-b', 50),
        createItem('post-a', 60),
        createItem('post-b', 50),
      ];

      const deduplicated = service.deduplicateItems(items);
      expect(deduplicated[0]?.id).toBe('post-b');
      expect(deduplicated[1]?.id).toBe('post-a');
    });

    it('should return empty array for empty input', () => {
      expect(service.deduplicateItems([])).toHaveLength(0);
    });
  });
});
