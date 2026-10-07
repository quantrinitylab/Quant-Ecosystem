// ============================================================================
// Deep Linking Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { DeepLinkingService } from '../deep-linking';

describe('DeepLinkingService', () => {
  let service: DeepLinkingService;

  beforeEach(() => {
    service = new DeepLinkingService();
  });

  describe('generateLink', () => {
    it('should generate a basic deep link', () => {
      const link = service.generateLink('quantchat', '/conversation/123');
      expect(link).toBe('quant://quantchat/conversation/123');
    });

    it('should generate a deep link with params', () => {
      const link = service.generateLink('quantmail', '/inbox', { filter: 'unread', page: '1' });
      expect(link).toContain('quant://quantmail/inbox?');
      expect(link).toContain('filter=unread');
      expect(link).toContain('page=1');
    });

    it('should strip leading slash from path', () => {
      const link = service.generateLink('quantsync', 'feed');
      expect(link).toBe('quant://quantsync/feed');
    });
  });

  describe('parseLink', () => {
    it('should parse a valid deep link', () => {
      const parsed = service.parseLink('quant://quantchat/conversation/123');
      expect(parsed).not.toBeNull();
      expect(parsed!.app).toBe('quantchat');
      expect(parsed!.path).toBe('/conversation/123');
    });

    it('should parse query parameters', () => {
      const parsed = service.parseLink('quant://quantmail/inbox?filter=unread&page=2');
      expect(parsed).not.toBeNull();
      expect(parsed!.params.filter).toBe('unread');
      expect(parsed!.params.page).toBe('2');
    });

    it('should return null for invalid protocol', () => {
      const parsed = service.parseLink('https://quantchat.com/path');
      expect(parsed).toBeNull();
    });

    it('should return null for empty app', () => {
      const parsed = service.parseLink('quant://');
      expect(parsed).toBeNull();
    });
  });

  describe('registerHandler', () => {
    it('should register a handler', () => {
      service.registerHandler(
        'quantchat',
        '/chat/.*',
        (params) => `/conversations/${params['id'] ?? ''}`,
      );
      const handlers = service.getHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0]!.app).toBe('quantchat');
    });
  });

  describe('isValidLink', () => {
    it('should return true for valid deep links', () => {
      expect(service.isValidLink('quant://quantchat/messages')).toBe(true);
    });

    it('should return false for invalid links', () => {
      expect(service.isValidLink('https://example.com')).toBe(false);
    });

    it('should return false for empty links', () => {
      expect(service.isValidLink('')).toBe(false);
    });
  });

  describe('getAppFromLink', () => {
    it('should extract app name from link', () => {
      const app = service.getAppFromLink('quant://quantube/video/abc');
      expect(app).toBe('quantube');
    });

    it('should return null for invalid link', () => {
      const app = service.getAppFromLink('invalid://link');
      expect(app).toBeNull();
    });
  });

  describe('buildWebFallback', () => {
    it('should build a web fallback URL', () => {
      const fallback = service.buildWebFallback({
        app: 'quantchat',
        path: '/conversation/123',
        params: { ref: 'notification' },
        fullUrl: 'quant://quantchat/conversation/123?ref=notification',
      });

      expect(fallback).toBe('https://quantchat.quant.app/conversation/123?ref=notification');
    });

    it('should build web fallback without params', () => {
      const fallback = service.buildWebFallback({
        app: 'quantmail',
        path: '/inbox',
        params: {},
        fullUrl: 'quant://quantmail/inbox',
      });

      expect(fallback).toBe('https://quantmail.quant.app/inbox');
    });
  });
});
