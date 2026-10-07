import { describe, it, expect, beforeEach } from 'vitest';
import { RetargetingService } from '../services/retargeting.service';

describe('RetargetingService', () => {
  let service: RetargetingService;

  beforeEach(() => {
    service = new RetargetingService();
  });

  describe('createPixel', () => {
    it('should create a tracking pixel', () => {
      const pixel = service.createPixel('site-1', 'Main Pixel');
      expect(pixel.id).toBeDefined();
      expect(pixel.siteId).toBe('site-1');
      expect(pixel.name).toBe('Main Pixel');
      expect(pixel.eventsCount).toBe(0);
    });
  });

  describe('deletePixel', () => {
    it('should delete a pixel', () => {
      const pixel = service.createPixel('site-1', 'Test');
      expect(service.deletePixel(pixel.id)).toBe(true);
    });

    it('should return false for non-existent pixel', () => {
      expect(service.deletePixel('fake')).toBe(false);
    });
  });

  describe('trackEvent', () => {
    it('should track an event', () => {
      const pixel = service.createPixel('site-1', 'Main');
      const event = service.trackEvent(pixel.id, 'page_view', 'user-1', { page: '/home' });
      expect(event).not.toBeNull();
      expect(event?.event).toBe('page_view');
      expect(event?.userId).toBe('user-1');
      expect(event?.metadata).toEqual({ page: '/home' });
    });

    it('should increment pixel event count', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'click', 'user-1');
      service.trackEvent(pixel.id, 'click', 'user-2');
      const pixels = service.getPixels('site-1');
      expect(pixels[0]?.eventsCount).toBe(2);
    });

    it('should return null for non-existent pixel', () => {
      expect(service.trackEvent('fake', 'click', 'user-1')).toBeNull();
    });

    it('should handle missing metadata', () => {
      const pixel = service.createPixel('site-1', 'Main');
      const event = service.trackEvent(pixel.id, 'click', 'user-1');
      expect(event?.metadata).toEqual({});
    });
  });

  describe('getAudience', () => {
    it('should build audience from tracked events', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'purchase', 'user-1');
      service.trackEvent(pixel.id, 'purchase', 'user-2');
      service.trackEvent(pixel.id, 'view', 'user-3');

      const audience = service.getAudience(pixel.id, 'purchase');
      expect(audience.size).toBe(2);
      expect(audience.eventFilter).toBe('purchase');
    });

    it('should include all users when no filter', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'click', 'user-1');
      service.trackEvent(pixel.id, 'purchase', 'user-2');

      const audience = service.getAudience(pixel.id);
      expect(audience.size).toBe(2);
    });

    it('should deduplicate users', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'click', 'user-1');
      service.trackEvent(pixel.id, 'click', 'user-1');
      service.trackEvent(pixel.id, 'click', 'user-1');

      const audience = service.getAudience(pixel.id);
      expect(audience.size).toBe(1);
    });
  });

  describe('getPixels', () => {
    it('should return pixels for a site', () => {
      service.createPixel('site-1', 'A');
      service.createPixel('site-1', 'B');
      service.createPixel('site-2', 'C');
      expect(service.getPixels('site-1')).toHaveLength(2);
    });
  });

  describe('getEvents', () => {
    it('should return events for a pixel with limit', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'e1', 'u1');
      service.trackEvent(pixel.id, 'e2', 'u2');
      service.trackEvent(pixel.id, 'e3', 'u3');

      const events = service.getEvents(pixel.id, 2);
      expect(events).toHaveLength(2);
    });
  });

  describe('getPixelStats', () => {
    it('should return stats for a pixel', () => {
      const pixel = service.createPixel('site-1', 'Main');
      service.trackEvent(pixel.id, 'click', 'user-1');
      service.trackEvent(pixel.id, 'click', 'user-2');
      service.trackEvent(pixel.id, 'purchase', 'user-1');

      const stats = service.getPixelStats(pixel.id);
      expect(stats.totalEvents).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.topEvents[0]?.event).toBe('click');
      expect(stats.topEvents[0]?.count).toBe(2);
    });
  });
});
