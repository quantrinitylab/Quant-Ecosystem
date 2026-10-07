import { describe, it, expect } from 'vitest';
import { AISchedulingService } from '../ai-scheduling.service.js';
import type { Surface } from '../types.js';

describe('AISchedulingService', () => {
  const service = new AISchedulingService();

  describe('suggestOptimalTime', () => {
    it('should return a valid schedule suggestion', () => {
      const suggestion = service.suggestOptimalTime('quantube', 'America/New_York', 'video');
      expect(suggestion.surface).toBe('quantube');
      expect(suggestion.suggestedTime).toBeInstanceOf(Date);
      expect(suggestion.reason).toBeTruthy();
      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
    });

    it('should suggest times for different surfaces', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      for (const surface of surfaces) {
        const suggestion = service.suggestOptimalTime(surface, 'UTC', 'video');
        expect(suggestion.surface).toBe(surface);
        expect(suggestion.suggestedTime).toBeInstanceOf(Date);
      }
    });

    it('should handle different timezones', () => {
      const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
      for (const tz of timezones) {
        const suggestion = service.suggestOptimalTime('quantube', tz, 'video');
        expect(suggestion.suggestedTime).toBeInstanceOf(Date);
        expect(suggestion.reason).toContain(tz);
      }
    });

    it('should handle different content types', () => {
      const contentTypes = ['video', 'image', 'text', 'audio'] as const;
      for (const ct of contentTypes) {
        const suggestion = service.suggestOptimalTime('quantube', 'UTC', ct);
        expect(suggestion.confidence).toBeGreaterThan(0);
      }
    });

    it('should suggest a future time', () => {
      const suggestion = service.suggestOptimalTime('quantube', 'UTC', 'video');
      expect(suggestion.suggestedTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('suggestBatch', () => {
    it('should return one suggestion per surface', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      const suggestions = service.suggestBatch(surfaces, 'UTC', 'video');
      expect(suggestions).toHaveLength(4);
      const returnedSurfaces = suggestions.map((s) => s.surface);
      expect(returnedSurfaces).toEqual(surfaces);
    });

    it('should produce same results as individual calls', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync'];
      const batch = service.suggestBatch(surfaces, 'UTC', 'image');
      for (let i = 0; i < surfaces.length; i++) {
        const surface = surfaces[i]!;
        const individual = service.suggestOptimalTime(surface, 'UTC', 'image');
        expect(batch[i]!.surface).toBe(individual.surface);
        expect(batch[i]!.reason).toBe(individual.reason);
      }
    });
  });
});
