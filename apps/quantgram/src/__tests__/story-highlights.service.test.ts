import { describe, it, expect, beforeEach } from 'vitest';
import { StoryHighlightsService } from '../services/story-highlights.service';

describe('StoryHighlightsService', () => {
  let service: StoryHighlightsService;

  beforeEach(() => {
    service = new StoryHighlightsService();
  });

  describe('createHighlight', () => {
    it('should create a new highlight', () => {
      const highlight = service.createHighlight('Summer 2024', 'https://example.com/cover.jpg');
      expect(highlight.name).toBe('Summer 2024');
      expect(highlight.coverUrl).toBe('https://example.com/cover.jpg');
      expect(highlight.storyIds).toHaveLength(0);
      expect(highlight.id).toBeDefined();
      expect(highlight.createdAt).toBeGreaterThan(0);
    });
  });

  describe('deleteHighlight', () => {
    it('should delete an existing highlight', () => {
      const highlight = service.createHighlight('Test', 'url');
      expect(service.deleteHighlight(highlight.id)).toBe(true);
    });

    it('should return false for non-existent highlight', () => {
      expect(service.deleteHighlight('non-existent')).toBe(false);
    });
  });

  describe('addStory', () => {
    it('should add a story to a highlight', () => {
      const highlight = service.createHighlight('Test', 'url');
      const updated = service.addStory(highlight.id, 'story-1');
      expect(updated?.storyIds).toContain('story-1');
    });

    it('should not duplicate stories', () => {
      const highlight = service.createHighlight('Test', 'url');
      service.addStory(highlight.id, 'story-1');
      service.addStory(highlight.id, 'story-1');
      const updated = service.addStory(highlight.id, 'story-1');
      expect(updated?.storyIds.filter((id) => id === 'story-1')).toHaveLength(1);
    });

    it('should return null for non-existent highlight', () => {
      expect(service.addStory('non-existent', 'story-1')).toBeNull();
    });
  });

  describe('removeStory', () => {
    it('should remove a story from a highlight', () => {
      const highlight = service.createHighlight('Test', 'url');
      service.addStory(highlight.id, 'story-1');
      expect(service.removeStory(highlight.id, 'story-1')).toBe(true);
    });

    it('should return false for non-existent story', () => {
      const highlight = service.createHighlight('Test', 'url');
      expect(service.removeStory(highlight.id, 'non-existent')).toBe(false);
    });

    it('should return false for non-existent highlight', () => {
      expect(service.removeStory('non-existent', 'story-1')).toBe(false);
    });
  });

  describe('reorder', () => {
    it('should reorder stories within a highlight', () => {
      const highlight = service.createHighlight('Test', 'url');
      service.addStory(highlight.id, 'story-1');
      service.addStory(highlight.id, 'story-2');
      service.addStory(highlight.id, 'story-3');

      const updated = service.reorder(highlight.id, ['story-3', 'story-1', 'story-2']);
      expect(updated?.storyIds).toEqual(['story-3', 'story-1', 'story-2']);
    });

    it('should only keep valid story IDs', () => {
      const highlight = service.createHighlight('Test', 'url');
      service.addStory(highlight.id, 'story-1');
      service.addStory(highlight.id, 'story-2');

      const updated = service.reorder(highlight.id, ['story-2', 'invalid', 'story-1']);
      expect(updated?.storyIds).toEqual(['story-2', 'story-1']);
    });

    it('should return null for non-existent highlight', () => {
      expect(service.reorder('non-existent', [])).toBeNull();
    });
  });

  describe('getHighlights', () => {
    it('should return highlights for a user', () => {
      const h1 = service.createHighlight('Trip', 'url1');
      const h2 = service.createHighlight('Food', 'url2');
      service.assignToUser('user-1', h1.id);
      service.assignToUser('user-1', h2.id);

      const highlights = service.getHighlights('user-1');
      expect(highlights).toHaveLength(2);
    });

    it('should return empty array for user with no highlights', () => {
      expect(service.getHighlights('user-1')).toHaveLength(0);
    });
  });

  describe('updateCover', () => {
    it('should update the cover URL', () => {
      const highlight = service.createHighlight('Test', 'old-url');
      const updated = service.updateCover(highlight.id, 'new-url');
      expect(updated?.coverUrl).toBe('new-url');
    });

    it('should return null for non-existent highlight', () => {
      expect(service.updateCover('non-existent', 'url')).toBeNull();
    });
  });
});
