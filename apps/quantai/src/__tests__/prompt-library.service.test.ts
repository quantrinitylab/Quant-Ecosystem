import { describe, it, expect, beforeEach } from 'vitest';
import { PromptLibraryService } from '../services/prompt-library.service';

describe('PromptLibraryService', () => {
  let service: PromptLibraryService;

  beforeEach(() => {
    service = new PromptLibraryService();
  });

  describe('save', () => {
    it('should save a prompt', () => {
      const prompt = service.save({
        title: 'Code Review',
        content: 'Review this code...',
        category: 'coding',
        tags: ['review'],
      });
      expect(prompt.id).toBeDefined();
      expect(prompt.title).toBe('Code Review');
      expect(prompt.usageCount).toBe(0);
      expect(prompt.isFavorite).toBe(false);
    });
  });

  describe('update', () => {
    it('should update prompt fields', () => {
      const prompt = service.save({
        title: 'Original',
        content: 'Content',
        category: 'general',
        tags: [],
      });
      const updated = service.update(prompt.id, { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
    });

    it('should return null for non-existent id', () => {
      expect(service.update('fake', { title: 'X' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a prompt', () => {
      const prompt = service.save({ title: 'Del', content: 'C', category: 'g', tags: [] });
      expect(service.delete(prompt.id)).toBe(true);
      expect(service.search('Del')).toHaveLength(0);
    });

    it('should return false for non-existent id', () => {
      expect(service.delete('fake')).toBe(false);
    });
  });

  describe('search', () => {
    it('should find prompts by title', () => {
      service.save({
        title: 'Email Writer',
        content: 'Write emails',
        category: 'writing',
        tags: ['email'],
      });
      service.save({
        title: 'Code Helper',
        content: 'Help with code',
        category: 'coding',
        tags: ['code'],
      });
      const results = service.search('email');
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Email Writer');
    });

    it('should find prompts by content', () => {
      service.save({ title: 'A', content: 'machine learning basics', category: 'ai', tags: [] });
      const results = service.search('machine learning');
      expect(results).toHaveLength(1);
    });

    it('should find prompts by tag', () => {
      service.save({ title: 'B', content: 'text', category: 'general', tags: ['python', 'data'] });
      const results = service.search('python');
      expect(results).toHaveLength(1);
    });
  });

  describe('getByCategory', () => {
    it('should filter prompts by category', () => {
      service.save({ title: 'A', content: 'C', category: 'coding', tags: [] });
      service.save({ title: 'B', content: 'C', category: 'writing', tags: [] });
      service.save({ title: 'C', content: 'C', category: 'coding', tags: [] });
      expect(service.getByCategory('coding')).toHaveLength(2);
    });
  });

  describe('favorites', () => {
    it('should toggle favorite status', () => {
      const prompt = service.save({ title: 'Fav', content: 'C', category: 'g', tags: [] });
      service.toggleFavorite(prompt.id);
      expect(service.getFavorites()).toHaveLength(1);
      service.toggleFavorite(prompt.id);
      expect(service.getFavorites()).toHaveLength(0);
    });

    it('should return false for non-existent id', () => {
      expect(service.toggleFavorite('fake')).toBe(false);
    });
  });

  describe('getPopular', () => {
    it('should return prompts sorted by usage', () => {
      const p1 = service.save({ title: 'A', content: 'C', category: 'g', tags: [] });
      const p2 = service.save({ title: 'B', content: 'C', category: 'g', tags: [] });
      service.incrementUsage(p2.id);
      service.incrementUsage(p2.id);
      service.incrementUsage(p1.id);

      const popular = service.getPopular(2);
      expect(popular[0]?.id).toBe(p2.id);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage count', () => {
      const prompt = service.save({ title: 'A', content: 'C', category: 'g', tags: [] });
      service.incrementUsage(prompt.id);
      service.incrementUsage(prompt.id);
      const found = service.search('A');
      expect(found[0]?.usageCount).toBe(2);
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', () => {
      service.save({ title: 'A', content: 'C', category: 'coding', tags: [] });
      service.save({ title: 'B', content: 'C', category: 'writing', tags: [] });
      service.save({ title: 'C', content: 'C', category: 'coding', tags: [] });
      const cats = service.getCategories();
      expect(cats).toHaveLength(2);
      expect(cats).toContain('coding');
      expect(cats).toContain('writing');
    });
  });
});
