import { describe, it, expect, beforeEach } from 'vitest';
import { ContentSuggestionsService } from '../services/content-suggestions.service';

describe('ContentSuggestionsService', () => {
  let service: ContentSuggestionsService;

  beforeEach(() => {
    service = new ContentSuggestionsService();
  });

  describe('getSuggestions', () => {
    it('should return the requested number of suggestions', () => {
      const suggestions = service.getSuggestions('AI productivity', 5);
      expect(suggestions).toHaveLength(5);
    });

    it('should include topic in each suggestion', () => {
      const suggestions = service.getSuggestions('TypeScript', 3);
      for (const suggestion of suggestions) {
        expect(suggestion.topic).toBe('TypeScript');
      }
    });

    it('should include hooks referencing the topic', () => {
      const suggestions = service.getSuggestions('React', 3);
      for (const suggestion of suggestions) {
        expect(suggestion.hook).toContain('React');
      }
    });

    it('should have valid format types', () => {
      const validFormats = ['text', 'image', 'video', 'poll', 'thread'];
      const suggestions = service.getSuggestions('Testing', 5);

      for (const suggestion of suggestions) {
        expect(validFormats).toContain(suggestion.format);
      }
    });

    it('should assign unique ids', () => {
      const suggestions = service.getSuggestions('Topic', 5);
      const ids = suggestions.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should cap at available hook templates', () => {
      const suggestions = service.getSuggestions('Topic', 100);
      expect(suggestions.length).toBeLessThanOrEqual(8); // max hook templates
    });
  });

  describe('getTrendingTopics', () => {
    it('should return trending topics sorted by growth', () => {
      const topics = service.getTrendingTopics(3);

      expect(topics).toHaveLength(3);
      expect(topics[0]?.growth).toBeGreaterThanOrEqual(topics[1]?.growth ?? 0);
    });

    it('should respect the limit parameter', () => {
      const topics = service.getTrendingTopics(2);
      expect(topics).toHaveLength(2);
    });

    it('should include volume and growth data', () => {
      const topics = service.getTrendingTopics(1);
      expect(topics[0]?.topic).toBeDefined();
      expect(topics[0]?.volume).toBeGreaterThan(0);
      expect(topics[0]?.growth).toBeGreaterThan(0);
    });
  });

  describe('getOptimalPostTime', () => {
    it('should return optimal posting times', () => {
      const times = service.getOptimalPostTime('user-1');

      expect(times.length).toBeGreaterThan(0);
      for (const time of times) {
        expect(time.hour).toBeGreaterThanOrEqual(0);
        expect(time.hour).toBeLessThanOrEqual(23);
        expect(time.day).toBeGreaterThanOrEqual(0);
        expect(time.day).toBeLessThanOrEqual(6);
        expect(time.score).toBeGreaterThan(0);
      }
    });
  });

  describe('generateHooks', () => {
    it('should generate hooks containing the topic', () => {
      const hooks = service.generateHooks('Machine Learning');

      expect(hooks.length).toBeGreaterThan(0);
      for (const hook of hooks) {
        expect(hook).toContain('Machine Learning');
      }
    });

    it('should generate multiple different hooks', () => {
      const hooks = service.generateHooks('DevOps');
      const uniqueHooks = new Set(hooks);
      expect(uniqueHooks.size).toBe(hooks.length);
    });
  });
});
