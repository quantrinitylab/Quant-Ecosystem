import { describe, it, expect, beforeEach } from 'vitest';
import { BookmarksService } from '../services/bookmarks.service';

describe('BookmarksService', () => {
  let service: BookmarksService;

  beforeEach(() => {
    service = new BookmarksService();
  });

  describe('createCollection', () => {
    it('should create a collection with name', () => {
      const collection = service.createCollection('Read Later');

      expect(collection.id).toBeDefined();
      expect(collection.name).toBe('Read Later');
      expect(collection.description).toBe('');
      expect(collection.isPrivate).toBe(false);
      expect(collection.postIds).toHaveLength(0);
    });

    it('should create a private collection with description', () => {
      const collection = service.createCollection('Secret', 'My private stuff', true);

      expect(collection.isPrivate).toBe(true);
      expect(collection.description).toBe('My private stuff');
    });

    it('should assign unique ids', () => {
      const first = service.createCollection('First');
      const second = service.createCollection('Second');

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('addToCollection', () => {
    it('should add a post to a collection', () => {
      const collection = service.createCollection('Favorites');
      const result = service.addToCollection('post-1', collection.id);

      expect(result).toBe(true);
    });

    it('should return false for non-existent collection', () => {
      const result = service.addToCollection('post-1', 'non-existent');
      expect(result).toBe(false);
    });

    it('should not add duplicate posts', () => {
      const collection = service.createCollection('Test');
      service.addToCollection('post-1', collection.id);
      const result = service.addToCollection('post-1', collection.id);

      expect(result).toBe(false);
    });
  });

  describe('removeFromCollection', () => {
    it('should remove a post from a collection', () => {
      const collection = service.createCollection('Test');
      service.addToCollection('post-1', collection.id);

      const result = service.removeFromCollection('post-1', collection.id);
      expect(result).toBe(true);
    });

    it('should return false if post not in collection', () => {
      const collection = service.createCollection('Test');
      const result = service.removeFromCollection('post-1', collection.id);
      expect(result).toBe(false);
    });

    it('should return false for non-existent collection', () => {
      const result = service.removeFromCollection('post-1', 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('deleteCollection', () => {
    it('should delete an existing collection', () => {
      const collection = service.createCollection('ToDelete');
      const result = service.deleteCollection(collection.id);

      expect(result).toBe(true);
      expect(service.getCollection(collection.id)).toBeNull();
    });

    it('should return false for non-existent collection', () => {
      expect(service.deleteCollection('non-existent')).toBe(false);
    });
  });

  describe('getCollection', () => {
    it('should return the collection with its posts', () => {
      const collection = service.createCollection('My Collection');
      service.addToCollection('post-1', collection.id);
      service.addToCollection('post-2', collection.id);

      const retrieved = service.getCollection(collection.id);
      expect(retrieved?.postIds).toHaveLength(2);
      expect(retrieved?.postIds).toContain('post-1');
      expect(retrieved?.postIds).toContain('post-2');
    });

    it('should return null for non-existent collection', () => {
      expect(service.getCollection('non-existent')).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should return collections for a user', () => {
      const c1 = service.createCollection('A');
      const c2 = service.createCollection('B');
      service.assignToUser('user-1', c1.id);
      service.assignToUser('user-1', c2.id);

      const collections = service.listCollections('user-1');
      expect(collections).toHaveLength(2);
    });

    it('should return empty array for user with no collections', () => {
      expect(service.listCollections('no-user')).toHaveLength(0);
    });
  });

  describe('isBookmarked', () => {
    it('should return true if post is in any collection', () => {
      const collection = service.createCollection('Test');
      service.addToCollection('post-1', collection.id);

      expect(service.isBookmarked('post-1')).toBe(true);
    });

    it('should return false if post is not bookmarked', () => {
      expect(service.isBookmarked('unbookmarked-post')).toBe(false);
    });

    it('should return false after removal', () => {
      const collection = service.createCollection('Test');
      service.addToCollection('post-1', collection.id);
      service.removeFromCollection('post-1', collection.id);

      expect(service.isBookmarked('post-1')).toBe(false);
    });
  });
});
