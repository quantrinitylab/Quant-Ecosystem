import { describe, it, expect } from 'vitest';
import { AITitleDescriptionService } from '../ai-title-description.service.js';
import type { ContentInfo } from '../ai-title-description.service.js';
import type { Surface } from '../types.js';

describe('AITitleDescriptionService', () => {
  const service = new AITitleDescriptionService();

  const content: ContentInfo = {
    title: 'How to Build a Modern Web Application',
    description: 'Learn the fundamentals of building web apps with TypeScript and React.',
    contentType: 'video',
    tags: ['typescript', 'react', 'webdev', 'tutorial'],
  };

  describe('generateTitle', () => {
    it('should generate unique titles per platform', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      const titles = surfaces.map((s) => service.generateTitle(content, s));
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(4);
    });

    it('should create SEO-optimized longer titles for quantube', () => {
      const title = service.generateTitle(content, 'quantube');
      expect(title.length).toBeLessThanOrEqual(100);
      // Should include original title content
      expect(title).toContain('How to Build');
    });

    it('should create short catchy titles for quantsync', () => {
      const title = service.generateTitle(content, 'quantsync');
      expect(title.length).toBeLessThanOrEqual(50);
    });

    it('should create hashtag-focused titles for quantneon', () => {
      const title = service.generateTitle(content, 'quantneon');
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('#');
    });

    it('should create newsletter-style titles for quantmail', () => {
      const title = service.generateTitle(content, 'quantmail');
      expect(title).toContain('[New]');
      expect(title.length).toBeLessThanOrEqual(120);
    });
  });

  describe('generateDescription', () => {
    it('should respect platform-specific length limits', () => {
      const quantubeDesc = service.generateDescription(content, 'quantube');
      const quantsyncDesc = service.generateDescription(content, 'quantsync');
      const quantneonDesc = service.generateDescription(content, 'quantneon');
      const quantmailDesc = service.generateDescription(content, 'quantmail');

      expect(quantubeDesc.length).toBeLessThanOrEqual(5000);
      expect(quantsyncDesc.length).toBeLessThanOrEqual(300);
      expect(quantneonDesc.length).toBeLessThanOrEqual(2200);
      expect(quantmailDesc.length).toBeLessThanOrEqual(10000);
    });

    it('should include hashtags in quantube description', () => {
      const desc = service.generateDescription(content, 'quantube');
      expect(desc).toContain('#typescript');
    });

    it('should include newsletter format for quantmail', () => {
      const desc = service.generateDescription(content, 'quantmail');
      expect(desc).toContain('Dear subscriber');
    });
  });

  describe('generateBatch', () => {
    it('should generate entries for all requested surfaces', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      const results = service.generateBatch(content, surfaces);
      expect(results.size).toBe(4);
      for (const surface of surfaces) {
        expect(results.has(surface)).toBe(true);
        const entry = results.get(surface)!;
        expect(entry.title).toBeTruthy();
        expect(entry.description).toBeTruthy();
      }
    });

    it('should produce consistent results with individual calls', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync'];
      const batch = service.generateBatch(content, surfaces);
      for (const surface of surfaces) {
        const batchTitle = batch.get(surface)!.title;
        const individualTitle = service.generateTitle(content, surface);
        expect(batchTitle).toBe(individualTitle);
      }
    });
  });
});
