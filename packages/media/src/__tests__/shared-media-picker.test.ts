// ============================================================================
// Shared Media Picker Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SharedMediaPickerService } from '../shared-media-picker';

describe('SharedMediaPickerService', () => {
  let service: SharedMediaPickerService;

  beforeEach(() => {
    service = new SharedMediaPickerService();
  });

  describe('addMedia', () => {
    it('should add media with generated id and timestamp', () => {
      const result = service.addMedia({
        type: 'image',
        url: 'https://cdn.quant.app/img1.jpg',
        name: 'photo.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });

      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.name).toBe('photo.jpg');
    });
  });

  describe('pick', () => {
    it('should filter by type', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'b.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantube',
      });

      const images = service.pick({ types: ['image'] });
      expect(images).toHaveLength(1);
      expect(images[0]!.type).toBe('image');
    });

    it('should filter by maxSize', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'image',
        url: 'b.jpg',
        name: 'b.jpg',
        size: 5000,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });

      const small = service.pick({ maxSize: 1000 });
      expect(small).toHaveLength(1);
      expect(small[0]!.size).toBe(100);
    });

    it('should filter by sourceApps', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'image',
        url: 'b.jpg',
        name: 'b.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantmail',
      });

      const filtered = service.pick({ sourceApps: ['quantchat'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.sourceApp).toBe('quantchat');
    });

    it('should limit results with maxItems', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'image',
        url: 'b.jpg',
        name: 'b.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'image',
        url: 'c.jpg',
        name: 'c.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });

      const limited = service.pick({ maxItems: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe('getRecent', () => {
    it('should return most recent items', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'b.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantube',
      });

      const recent = service.getRecent(10);
      expect(recent).toHaveLength(2);
      const names = recent.map((r) => r.name);
      expect(names).toContain('a.jpg');
      expect(names).toContain('b.mp4');
    });
  });

  describe('getFromApp', () => {
    it('should return media from a specific app', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'b.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantube',
      });

      const items = service.getFromApp('quantube', 10);
      expect(items).toHaveLength(1);
      expect(items[0]!.sourceApp).toBe('quantube');
    });
  });

  describe('removeMedia', () => {
    it('should remove media by id', () => {
      const item = service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      const result = service.removeMedia(item.id);
      expect(result).toBe(true);

      const all = service.pick({});
      expect(all).toHaveLength(0);
    });

    it('should return false for non-existent media', () => {
      expect(service.removeMedia('nonexistent')).toBe(false);
    });
  });

  describe('search', () => {
    it('should search by name', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'vacation-photo.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'meeting-recording.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantmeet',
      });

      const results = service.search('vacation');
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('vacation-photo.jpg');
    });
  });

  describe('getTotalStorage', () => {
    it('should calculate total used storage', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 1000,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'b.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantube',
      });

      const storage = service.getTotalStorage();
      expect(storage.used).toBe(3000);
      expect(storage.limit).toBeGreaterThan(0);
    });
  });

  describe('getByType', () => {
    it('should return items of a specific type', () => {
      service.addMedia({
        type: 'image',
        url: 'a.jpg',
        name: 'a.jpg',
        size: 100,
        mimeType: 'image/jpeg',
        sourceApp: 'quantchat',
      });
      service.addMedia({
        type: 'video',
        url: 'b.mp4',
        name: 'b.mp4',
        size: 2000,
        mimeType: 'video/mp4',
        sourceApp: 'quantube',
      });
      service.addMedia({
        type: 'image',
        url: 'c.png',
        name: 'c.png',
        size: 500,
        mimeType: 'image/png',
        sourceApp: 'quantsync',
      });

      const images = service.getByType('image', 10);
      expect(images).toHaveLength(2);
      expect(images.every((i) => i.type === 'image')).toBe(true);
    });
  });
});
