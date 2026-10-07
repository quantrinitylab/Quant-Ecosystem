import { describe, it, expect, beforeEach } from 'vitest';
import { SoundLibraryService } from '../services/sound-library.service';

describe('SoundLibraryService', () => {
  let service: SoundLibraryService;

  beforeEach(() => {
    service = new SoundLibraryService();
  });

  describe('addSound', () => {
    it('should add a sound to the library', () => {
      const sound = service.addSound(
        'Beat Drop',
        'DJ Mix',
        120,
        'music',
        'https://example.com/beat.mp3',
      );
      expect(sound.id).toBeDefined();
      expect(sound.name).toBe('Beat Drop');
      expect(sound.artist).toBe('DJ Mix');
      expect(sound.duration).toBe(120);
      expect(sound.category).toBe('music');
    });
  });

  describe('search', () => {
    it('should find sounds by name', () => {
      service.addSound('Summer Vibes', 'Artist A', 60, 'music', 'url1');
      service.addSound('Winter Blues', 'Artist B', 90, 'music', 'url2');
      const results = service.search('summer');
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('Summer Vibes');
    });

    it('should find sounds by artist', () => {
      service.addSound('Track 1', 'DJ Snake', 120, 'music', 'url1');
      const results = service.search('snake');
      expect(results).toHaveLength(1);
    });

    it('should return empty for no matches', () => {
      expect(service.search('nonexistent')).toHaveLength(0);
    });
  });

  describe('getTrending', () => {
    it('should return sounds sorted by usage count', () => {
      const s1 = service.addSound('A', 'X', 60, 'music', 'url');
      const s2 = service.addSound('B', 'Y', 60, 'music', 'url');
      service.incrementUsage(s2.id);
      service.incrementUsage(s2.id);
      service.incrementUsage(s1.id);

      const trending = service.getTrending(2);
      expect(trending[0]?.id).toBe(s2.id);
    });

    it('should respect limit', () => {
      service.addSound('A', 'X', 60, 'music', 'url');
      service.addSound('B', 'Y', 60, 'music', 'url');
      service.addSound('C', 'Z', 60, 'music', 'url');
      expect(service.getTrending(2)).toHaveLength(2);
    });
  });

  describe('getByCategory', () => {
    it('should filter by category', () => {
      service.addSound('Click', 'X', 1, 'effects', 'url');
      service.addSound('Song', 'Y', 120, 'music', 'url');
      const effects = service.getByCategory('effects', 10);
      expect(effects).toHaveLength(1);
      expect(effects[0]?.category).toBe('effects');
    });
  });

  describe('favorites', () => {
    it('should add and retrieve favorites', () => {
      const sound = service.addSound('Fav', 'X', 60, 'music', 'url');
      expect(service.addToFavorites(sound.id)).toBe(true);
      const favs = service.getFavorites();
      expect(favs).toHaveLength(1);
      expect(favs[0]?.id).toBe(sound.id);
    });

    it('should remove from favorites', () => {
      const sound = service.addSound('Fav', 'X', 60, 'music', 'url');
      service.addToFavorites(sound.id);
      expect(service.removeFromFavorites(sound.id)).toBe(true);
      expect(service.getFavorites()).toHaveLength(0);
    });

    it('should return false for non-existent sound', () => {
      expect(service.addToFavorites('fake-id')).toBe(false);
    });
  });

  describe('usage', () => {
    it('should track usage count', () => {
      const sound = service.addSound('S', 'A', 30, 'effects', 'url');
      expect(service.getUsageCount(sound.id)).toBe(0);
      service.incrementUsage(sound.id);
      service.incrementUsage(sound.id);
      expect(service.getUsageCount(sound.id)).toBe(2);
    });

    it('should return 0 for unknown sound', () => {
      expect(service.getUsageCount('unknown')).toBe(0);
    });
  });
});
