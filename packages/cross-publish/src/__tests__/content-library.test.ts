import { describe, it, expect, beforeEach } from 'vitest';
import { ContentLibraryService } from '../content-library.service.js';

describe('ContentLibraryService', () => {
  let service: ContentLibraryService;

  beforeEach(() => {
    service = new ContentLibraryService();
  });

  describe('storeContent', () => {
    it('should store content and return a library item', () => {
      const item = service.storeContent('user-1', {
        contentType: 'video',
        title: 'My Video',
        description: 'A great video',
        mediaUrl: 'https://storage.example.com/video.mp4',
        thumbnailUrl: 'https://storage.example.com/thumb.jpg',
        metadata: { quality: 'hd' },
      });

      expect(item.id).toBeDefined();
      expect(item.userId).toBe('user-1');
      expect(item.contentType).toBe('video');
      expect(item.title).toBe('My Video');
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
    });

    it('should default metadata to empty object', () => {
      const item = service.storeContent('user-1', {
        contentType: 'image',
        title: 'My Image',
        description: 'A photo',
        mediaUrl: 'https://storage.example.com/image.jpg',
        thumbnailUrl: 'https://storage.example.com/thumb.jpg',
      });

      expect(item.metadata).toEqual({});
    });
  });

  describe('getById', () => {
    it('should retrieve stored content', () => {
      const item = service.storeContent('user-1', {
        contentType: 'video',
        title: 'Test',
        description: 'Test',
        mediaUrl: 'https://example.com/v.mp4',
        thumbnailUrl: 'https://example.com/t.jpg',
      });

      const found = service.getById(item.id);
      expect(found).toEqual(item);
    });

    it('should return undefined for nonexistent id', () => {
      const found = service.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list content for a user', () => {
      service.storeContent('user-1', {
        contentType: 'video',
        title: 'Video 1',
        description: 'V1',
        mediaUrl: 'https://example.com/v1.mp4',
        thumbnailUrl: 'https://example.com/t1.jpg',
      });
      service.storeContent('user-1', {
        contentType: 'image',
        title: 'Image 1',
        description: 'I1',
        mediaUrl: 'https://example.com/i1.jpg',
        thumbnailUrl: 'https://example.com/t2.jpg',
      });
      service.storeContent('user-2', {
        contentType: 'video',
        title: 'Other',
        description: 'Other',
        mediaUrl: 'https://example.com/v2.mp4',
        thumbnailUrl: 'https://example.com/t3.jpg',
      });

      const results = service.list('user-1');
      expect(results).toHaveLength(2);
    });

    it('should filter by content type', () => {
      service.storeContent('user-1', {
        contentType: 'video',
        title: 'Video',
        description: 'V',
        mediaUrl: 'https://example.com/v.mp4',
        thumbnailUrl: 'https://example.com/t.jpg',
      });
      service.storeContent('user-1', {
        contentType: 'image',
        title: 'Image',
        description: 'I',
        mediaUrl: 'https://example.com/i.jpg',
        thumbnailUrl: 'https://example.com/t2.jpg',
      });

      const results = service.list('user-1', { contentType: 'video' });
      expect(results).toHaveLength(1);
      expect(results[0]!.contentType).toBe('video');
    });
  });

  describe('delete', () => {
    it('should delete existing content', () => {
      const item = service.storeContent('user-1', {
        contentType: 'video',
        title: 'Delete Me',
        description: 'D',
        mediaUrl: 'https://example.com/v.mp4',
        thumbnailUrl: 'https://example.com/t.jpg',
      });

      const result = service.delete(item.id);
      expect(result).toBe(true);
      expect(service.getById(item.id)).toBeUndefined();
    });

    it('should return false for nonexistent id', () => {
      const result = service.delete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
