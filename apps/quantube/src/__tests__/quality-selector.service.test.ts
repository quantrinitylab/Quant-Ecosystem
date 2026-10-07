import { describe, it, expect, beforeEach } from 'vitest';
import { QualitySelectorService } from '../services/quality-selector.service';

describe('QualitySelectorService', () => {
  let service: QualitySelectorService;

  beforeEach(() => {
    service = new QualitySelectorService();
  });

  describe('getAvailableQualities', () => {
    it('should return default available qualities', () => {
      const qualities = service.getAvailableQualities('video-1');
      expect(qualities).toHaveLength(6);
      const available = qualities.filter((q) => q.available);
      expect(available).toHaveLength(4); // 360p, 480p, 720p, 1080p
    });

    it('should return qualities with bitrate and label', () => {
      const qualities = service.getAvailableQualities('video-1');
      const hd = qualities.find((q) => q.quality === '720p');
      expect(hd?.bitrate).toBe(5000);
      expect(hd?.label).toBe('720p (HD)');
    });

    it('should respect video-specific qualities', () => {
      service.setVideoQualities('video-1', ['360p', '720p', '4k']);
      const qualities = service.getAvailableQualities('video-1');
      const available = qualities.filter((q) => q.available);
      expect(available).toHaveLength(3);
    });
  });

  describe('setQuality / getCurrentQuality', () => {
    it('should default to auto', () => {
      expect(service.getCurrentQuality()).toBe('auto');
    });

    it('should set and get quality', () => {
      service.setQuality('1080p');
      expect(service.getCurrentQuality()).toBe('1080p');
    });

    it('should disable auto when setting a specific quality', () => {
      service.setQuality('720p');
      expect(service.isAutoEnabled()).toBe(false);
    });
  });

  describe('preferred quality', () => {
    it('should default preferred to auto', () => {
      expect(service.getPreferred()).toBe('auto');
    });

    it('should set and get preferred quality', () => {
      service.setPreferred('1080p');
      expect(service.getPreferred()).toBe('1080p');
    });
  });

  describe('auto quality', () => {
    it('should be enabled by default', () => {
      expect(service.isAutoEnabled()).toBe(true);
    });

    it('should set auto quality and reset current to auto', () => {
      service.setQuality('720p');
      service.setAutoQuality(true);
      expect(service.isAutoEnabled()).toBe(true);
      expect(service.getCurrentQuality()).toBe('auto');
    });
  });

  describe('estimateBandwidth', () => {
    it('should return default bandwidth without samples', () => {
      expect(service.estimateBandwidth()).toBe(10000);
    });

    it('should average bandwidth samples', () => {
      service.addBandwidthSample(5000);
      service.addBandwidthSample(15000);
      expect(service.estimateBandwidth()).toBe(10000);
    });

    it('should keep only last 10 samples', () => {
      for (let i = 0; i < 15; i++) {
        service.addBandwidthSample(1000);
      }
      service.addBandwidthSample(11000);
      // 10 samples: 9 * 1000 + 1 * 11000 = 20000 / 10 = 2000
      expect(service.estimateBandwidth()).toBe(2000);
    });
  });

  describe('recommendQuality', () => {
    it('should recommend 4k for high bandwidth', () => {
      expect(service.recommendQuality(50000)).toBe('4k');
    });

    it('should recommend 1080p for moderate bandwidth', () => {
      expect(service.recommendQuality(10000)).toBe('1080p');
    });

    it('should recommend 360p for low bandwidth', () => {
      expect(service.recommendQuality(500)).toBe('360p');
    });

    it('should recommend 720p for 6000+ kbps', () => {
      expect(service.recommendQuality(6500)).toBe('720p');
    });
  });
});
