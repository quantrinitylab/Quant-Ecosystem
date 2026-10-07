import { describe, it, expect, beforeEach } from 'vitest';
import { ExportPresetsService } from '../services/export-presets.service';

describe('ExportPresetsService', () => {
  let service: ExportPresetsService;

  beforeEach(() => {
    service = new ExportPresetsService();
  });

  describe('getPresets', () => {
    it('should return built-in presets', () => {
      const presets = service.getPresets();
      expect(presets.length).toBeGreaterThanOrEqual(6);
    });

    it('should include Instagram Reels preset', () => {
      const presets = service.getPresets();
      const reels = presets.find((p) => p.name === 'Instagram Reels');
      expect(reels?.settings.width).toBe(1080);
      expect(reels?.settings.height).toBe(1920);
      expect(reels?.platform).toBe('instagram');
    });

    it('should include 4K Cinema preset', () => {
      const presets = service.getPresets();
      const cinema = presets.find((p) => p.name === '4K Cinema');
      expect(cinema?.settings.width).toBe(3840);
      expect(cinema?.settings.height).toBe(2160);
      expect(cinema?.settings.fps).toBe(24);
    });

    it('should include custom presets', () => {
      service.createCustom('My Preset', {
        width: 800,
        height: 600,
        fps: 25,
        bitrate: 4000,
        codec: 'h264',
        format: 'mp4',
      });
      const presets = service.getPresets();
      const custom = presets.find((p) => p.name === 'My Preset');
      expect(custom?.isCustom).toBe(true);
    });
  });

  describe('getPreset', () => {
    it('should return a built-in preset by ID', () => {
      const preset = service.getPreset('preset-youtube');
      expect(preset?.name).toBe('YouTube (1080p)');
    });

    it('should return a custom preset by ID', () => {
      const created = service.createCustom('Custom', {
        width: 1280,
        height: 720,
        fps: 30,
        bitrate: 5000,
        codec: 'h264',
        format: 'mp4',
      });
      const preset = service.getPreset(created.id);
      expect(preset?.name).toBe('Custom');
    });

    it('should return null for non-existent ID', () => {
      expect(service.getPreset('non-existent')).toBeNull();
    });
  });

  describe('createCustom', () => {
    it('should create a custom preset', () => {
      const preset = service.createCustom('My Export', {
        width: 1920,
        height: 1080,
        fps: 60,
        bitrate: 20000,
        codec: 'h265',
        format: 'mp4',
      });
      expect(preset.name).toBe('My Export');
      expect(preset.isCustom).toBe(true);
      expect(preset.platform).toBe('custom');
      expect(preset.settings.fps).toBe(60);
    });
  });

  describe('deleteCustom', () => {
    it('should delete a custom preset', () => {
      const preset = service.createCustom('Temp', {
        width: 640,
        height: 480,
        fps: 30,
        bitrate: 2000,
        codec: 'h264',
        format: 'mp4',
      });
      expect(service.deleteCustom(preset.id)).toBe(true);
      expect(service.getPreset(preset.id)).toBeNull();
    });

    it('should return false for non-existent preset', () => {
      expect(service.deleteCustom('non-existent')).toBe(false);
    });

    it('should not delete built-in presets', () => {
      expect(service.deleteCustom('preset-youtube')).toBe(false);
    });
  });

  describe('getForPlatform', () => {
    it('should return presets for YouTube', () => {
      const youtube = service.getForPlatform('youtube');
      expect(youtube.length).toBe(2); // YouTube 1080p + YouTube Shorts
    });

    it('should return presets for Instagram', () => {
      const instagram = service.getForPlatform('instagram');
      expect(instagram.length).toBe(1);
    });

    it('should return empty array for unknown platform', () => {
      expect(service.getForPlatform('unknown')).toHaveLength(0);
    });
  });

  describe('estimateFileSize', () => {
    it('should estimate file size based on bitrate and duration', () => {
      const size = service.estimateFileSize(60, {
        width: 1920,
        height: 1080,
        fps: 30,
        bitrate: 8000,
        codec: 'h264',
        format: 'mp4',
      });
      // 8000 kbps * 60 seconds * 1024 / 8 = 61,440,000 bytes
      expect(size).toBe(61440000);
    });

    it('should return 0 for 0 duration', () => {
      const size = service.estimateFileSize(0, {
        width: 1920,
        height: 1080,
        fps: 30,
        bitrate: 8000,
        codec: 'h264',
        format: 'mp4',
      });
      expect(size).toBe(0);
    });

    it('should scale linearly with duration', () => {
      const settings = {
        width: 1920,
        height: 1080,
        fps: 30,
        bitrate: 8000,
        codec: 'h264',
        format: 'mp4',
      };
      const size30 = service.estimateFileSize(30, settings);
      const size60 = service.estimateFileSize(60, settings);
      expect(size60).toBe(size30 * 2);
    });
  });
});
