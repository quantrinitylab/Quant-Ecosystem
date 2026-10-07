import { describe, it, expect, beforeEach } from 'vitest';
import { PhotoMapsService } from '../services/photo-maps.service';

describe('PhotoMapsService', () => {
  let service: PhotoMapsService;

  beforeEach(() => {
    service = new PhotoMapsService();
  });

  describe('addLocation', () => {
    it('should add a photo location', () => {
      const photo = service.addLocation('photo-1', 40.7128, -74.006, 1700000000);
      expect(photo.photoId).toBe('photo-1');
      expect(photo.lat).toBe(40.7128);
      expect(photo.lng).toBe(-74.006);
      expect(photo.takenAt).toBe(1700000000);
    });

    it('should overwrite existing location for same photo', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1700000000);
      service.addLocation('photo-1', 41.0, -75.0, 1700000001);
      const history = service.getLocationHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.lat).toBe(41.0);
    });
  });

  describe('removeLocation', () => {
    it('should remove a photo location', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1700000000);
      expect(service.removeLocation('photo-1')).toBe(true);
      expect(service.getLocationHistory()).toHaveLength(0);
    });

    it('should return false for non-existent photo', () => {
      expect(service.removeLocation('non-existent')).toBe(false);
    });
  });

  describe('getPhotosInArea', () => {
    it('should return photos within bounds', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1700000000);
      service.addLocation('photo-2', 41.0, -73.0, 1700000001);
      service.addLocation('photo-3', 50.0, -60.0, 1700000002);

      const results = service.getPhotosInArea({
        north: 42.0,
        south: 39.0,
        east: -72.0,
        west: -75.0,
      });

      expect(results).toHaveLength(2);
    });

    it('should return empty array when no photos in area', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1700000000);
      const results = service.getPhotosInArea({
        north: 10.0,
        south: 5.0,
        east: 10.0,
        west: 5.0,
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('clusterPhotos', () => {
    it('should cluster nearby photos', () => {
      const photos = [
        { photoId: 'p1', lat: 40.0, lng: -74.0, takenAt: 1 },
        { photoId: 'p2', lat: 40.001, lng: -74.001, takenAt: 2 },
        { photoId: 'p3', lat: 50.0, lng: -60.0, takenAt: 3 },
      ];

      const clusters = service.clusterPhotos(photos, 5);
      // At zoom level 5, photos close together should cluster
      expect(clusters.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for empty photos', () => {
      expect(service.clusterPhotos([], 5)).toHaveLength(0);
    });

    it('should have correct count in clusters', () => {
      const photos = [
        { photoId: 'p1', lat: 40.0, lng: -74.0, takenAt: 1 },
        { photoId: 'p2', lat: 40.0001, lng: -74.0001, takenAt: 2 },
      ];

      const clusters = service.clusterPhotos(photos, 3);
      const totalPhotos = clusters.reduce((sum, c) => sum + c.count, 0);
      expect(totalPhotos).toBe(2);
    });
  });

  describe('getLocationHistory', () => {
    it('should return photos sorted by takenAt descending', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1000);
      service.addLocation('photo-2', 41.0, -73.0, 3000);
      service.addLocation('photo-3', 42.0, -72.0, 2000);

      const history = service.getLocationHistory();
      expect(history[0]?.photoId).toBe('photo-2');
      expect(history[1]?.photoId).toBe('photo-3');
      expect(history[2]?.photoId).toBe('photo-1');
    });
  });

  describe('getNearbyPhotos', () => {
    it('should return photos within radius', () => {
      // NYC area
      service.addLocation('photo-1', 40.7128, -74.006, 1700000000);
      // Also NYC area (very close)
      service.addLocation('photo-2', 40.7138, -74.005, 1700000001);
      // Los Angeles (far away)
      service.addLocation('photo-3', 34.0522, -118.2437, 1700000002);

      const nearby = service.getNearbyPhotos(40.7128, -74.006, 5);
      expect(nearby).toHaveLength(2);
    });

    it('should return empty array when no photos nearby', () => {
      service.addLocation('photo-1', 40.0, -74.0, 1700000000);
      const nearby = service.getNearbyPhotos(0, 0, 1);
      expect(nearby).toHaveLength(0);
    });
  });
});
