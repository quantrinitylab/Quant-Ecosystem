import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogService } from '../catalog/catalog-service.js';
import { AppListing } from '../types.js';

describe('CatalogService', () => {
  let service: CatalogService;

  const createListing = (overrides: Partial<AppListing> = {}): AppListing => ({
    id: `app-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test App',
    creatorId: 'creator-1',
    description: 'A test application',
    version: '1.0.0',
    category: 'productivity',
    subcategory: 'tools',
    rating: 4.5,
    reviewCount: 10,
    trustScore: 85,
    qualityScore: 90,
    price: 0,
    downloads: 1000,
    screenshots: ['screenshot1.png'],
    status: 'draft',
    ...overrides,
  });

  beforeEach(() => {
    service = new CatalogService();
  });

  describe('publish', () => {
    it('should publish a listing and set status to published', () => {
      const listing = createListing({ id: 'app-1' });
      const result = service.publish(listing);

      expect(result.id).toBe('app-1');
      expect(result.status).toBe('published');
    });

    it('should make listing retrievable after publish', () => {
      const listing = createListing({ id: 'app-2' });
      service.publish(listing);

      const retrieved = service.get('app-2');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Test App');
    });

    it('should make listing searchable after publish', () => {
      const listing = createListing({ name: 'Unique Search App' });
      service.publish(listing);

      const results = service.search('Unique');
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Unique Search App');
    });
  });

  describe('unpublish', () => {
    it('should unpublish a listing', () => {
      service.publish(createListing({ id: 'app-3' }));
      const result = service.unpublish('app-3');

      expect(result).toBe(true);
      const listing = service.get('app-3');
      expect(listing!.status).toBe('unpublished');
    });

    it('should return false for non-existent app', () => {
      expect(service.unpublish('non-existent')).toBe(false);
    });
  });

  describe('search', () => {
    it('should find apps by name', () => {
      service.publish(createListing({ id: 'app-4', name: 'Photo Editor Pro' }));
      service.publish(createListing({ id: 'app-5', name: 'Video Player' }));

      const results = service.search('Photo');
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Photo Editor Pro');
    });

    it('should filter by category', () => {
      service.publish(
        createListing({ id: 'app-6', name: 'Task Manager', category: 'productivity' }),
      );
      service.publish(createListing({ id: 'app-7', name: 'Task Game', category: 'games' }));

      const results = service.search('Task', { category: 'productivity' });
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Task Manager');
    });

    it('should filter by minimum rating', () => {
      service.publish(createListing({ id: 'app-8', name: 'Good App', rating: 4.5 }));
      service.publish(createListing({ id: 'app-9', name: 'Bad App', rating: 2.0 }));

      const results = service.search('App', { minRating: 4.0 });
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('Good App');
    });
  });

  describe('listByCategory', () => {
    it('should list published apps by category', () => {
      service.publish(createListing({ id: 'app-10', category: 'games', name: 'Game A' }));
      service.publish(createListing({ id: 'app-11', category: 'games', name: 'Game B' }));
      service.publish(createListing({ id: 'app-12', category: 'productivity', name: 'Tool A' }));

      const results = service.listByCategory('games');
      expect(results.length).toBe(2);
      expect(results.every((r) => r.category === 'games')).toBe(true);
    });

    it('should sort results', () => {
      service.publish(createListing({ id: 'app-13', category: 'games', rating: 3.0 }));
      service.publish(createListing({ id: 'app-14', category: 'games', rating: 5.0 }));
      service.publish(createListing({ id: 'app-15', category: 'games', rating: 4.0 }));

      const results = service.listByCategory('games', { field: 'rating', direction: 'desc' });
      expect(results[0]!.rating).toBe(5.0);
      expect(results[2]!.rating).toBe(3.0);
    });

    it('should paginate results', () => {
      for (let i = 0; i < 5; i++) {
        service.publish(createListing({ id: `app-page-${i}`, category: 'social' }));
      }

      const page1 = service.listByCategory('social', undefined, { offset: 0, limit: 2 });
      const page2 = service.listByCategory('social', undefined, { offset: 2, limit: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });
  });

  describe('getCreatorApps', () => {
    it('should return all apps by a creator', () => {
      service.publish(createListing({ id: 'app-c1', creatorId: 'creator-A' }));
      service.publish(createListing({ id: 'app-c2', creatorId: 'creator-A' }));
      service.publish(createListing({ id: 'app-c3', creatorId: 'creator-B' }));

      const results = service.getCreatorApps('creator-A');
      expect(results.length).toBe(2);
      expect(results.every((r) => r.creatorId === 'creator-A')).toBe(true);
    });

    it('should return empty for unknown creator', () => {
      expect(service.getCreatorApps('unknown')).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update a listing', () => {
      service.publish(createListing({ id: 'app-u1', name: 'Old Name' }));
      const updated = service.update('app-u1', { name: 'New Name' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
    });

    it('should return null for non-existent app', () => {
      expect(service.update('non-existent', { name: 'X' })).toBeNull();
    });
  });
});
