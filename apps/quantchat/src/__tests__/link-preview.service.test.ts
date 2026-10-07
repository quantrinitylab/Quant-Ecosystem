import { describe, it, expect, beforeEach } from 'vitest';
import { LinkPreviewService } from '../services/link-preview.service';

describe('LinkPreviewService', () => {
  let service: LinkPreviewService;

  beforeEach(() => {
    service = new LinkPreviewService();
  });

  describe('extractUrls', () => {
    it('should extract URLs from text', () => {
      const text = 'Check out https://example.com and http://test.org/page';
      const urls = service.extractUrls(text);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://example.com');
      expect(urls).toContain('http://test.org/page');
    });

    it('should return empty array for text without URLs', () => {
      const urls = service.extractUrls('Just some plain text here');
      expect(urls).toHaveLength(0);
    });

    it('should deduplicate URLs', () => {
      const text = 'Visit https://example.com twice: https://example.com';
      const urls = service.extractUrls(text);
      expect(urls).toHaveLength(1);
    });

    it('should handle URLs with paths and query params', () => {
      const text = 'Link: https://example.com/path?q=test&page=1#section';
      const urls = service.extractUrls(text);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('example.com/path');
    });

    it('should handle YouTube URLs', () => {
      const text = 'Watch https://www.youtube.com/watch?v=abc123';
      const urls = service.extractUrls(text);
      expect(urls).toHaveLength(1);
    });
  });

  describe('generatePreview', () => {
    it('should generate preview from URL', () => {
      const preview = service.generatePreview('https://example.com/article-title');
      expect(preview.url).toBe('https://example.com/article-title');
      expect(preview.siteName).toBe('Example');
      expect(preview.title).toBeDefined();
      expect(preview.favicon).toContain('favicon.ico');
    });

    it('should detect video type for YouTube', () => {
      const preview = service.generatePreview('https://youtube.com/watch?v=123');
      expect(preview.type).toBe('video');
    });

    it('should detect image type for image URLs', () => {
      const preview = service.generatePreview('https://imgur.com/image.png');
      expect(preview.type).toBe('image');
    });

    it('should detect article type for blog URLs', () => {
      const preview = service.generatePreview('https://medium.com/some-article');
      expect(preview.type).toBe('article');
    });

    it('should default to website type', () => {
      const preview = service.generatePreview('https://example.com');
      expect(preview.type).toBe('website');
    });

    it('should cache generated previews', () => {
      const url = 'https://example.com/test';
      service.generatePreview(url);
      const cached = service.getCachedPreview(url);
      expect(cached).not.toBeNull();
      expect(cached?.url).toBe(url);
    });
  });

  describe('getCachedPreview', () => {
    it('should return null for uncached URL', () => {
      const result = service.getCachedPreview('https://uncached.com');
      expect(result).toBeNull();
    });

    it('should return cached preview', () => {
      const preview = {
        url: 'https://test.com',
        title: 'Test',
        description: 'Test desc',
        siteName: 'Test',
        type: 'website' as const,
      };
      service.setCachedPreview('https://test.com', preview);

      const cached = service.getCachedPreview('https://test.com');
      expect(cached).toEqual(preview);
    });
  });

  describe('isValidUrl', () => {
    it('should validate HTTP URLs', () => {
      expect(service.isValidUrl('http://example.com')).toBe(true);
    });

    it('should validate HTTPS URLs', () => {
      expect(service.isValidUrl('https://example.com')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(service.isValidUrl('ftp://example.com')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(service.isValidUrl('not-a-url')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(service.isValidUrl('')).toBe(false);
    });
  });
});
