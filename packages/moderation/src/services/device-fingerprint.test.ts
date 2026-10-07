import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceFingerprintService } from './device-fingerprint';
import type { DeviceSignals } from '../types';

describe('DeviceFingerprintService', () => {
  let service: DeviceFingerprintService;

  const sampleSignals: DeviceSignals = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    screenResolution: '2560x1440',
    timezone: 'America/New_York',
    language: 'en-US',
    canvasHash: 'abc123def456',
    webglHash: 'gl_hash_789',
    installedFontsHash: 'fonts_aaa111',
  };

  beforeEach(() => {
    service = new DeviceFingerprintService({ sybilThreshold: 3 });
  });

  describe('fingerprint consistency', () => {
    it('should produce the same fingerprint for the same signals', () => {
      const fp1 = service.computeFingerprint(sampleSignals);
      const fp2 = service.computeFingerprint(sampleSignals);
      expect(fp1.deviceId).toBe(fp2.deviceId);
    });

    it('should produce different fingerprints for different signals', () => {
      const fp1 = service.computeFingerprint(sampleSignals);
      const fp2 = service.computeFingerprint({
        ...sampleSignals,
        screenResolution: '1920x1080',
      });
      expect(fp1.deviceId).not.toBe(fp2.deviceId);
    });

    it('should produce a hex string device ID', () => {
      const fp = service.computeFingerprint(sampleSignals);
      expect(fp.deviceId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should include creation timestamp', () => {
      const before = Date.now();
      const fp = service.computeFingerprint(sampleSignals);
      expect(fp.createdAt).toBeGreaterThanOrEqual(before);
    });

    it('should handle missing optional signals consistently', () => {
      const minimalSignals: DeviceSignals = {
        userAgent: 'Mozilla/5.0',
        screenResolution: '1920x1080',
        timezone: 'UTC',
        language: 'en',
      };
      const fp1 = service.computeFingerprint(minimalSignals);
      const fp2 = service.computeFingerprint(minimalSignals);
      expect(fp1.deviceId).toBe(fp2.deviceId);
    });

    it('should differentiate based on timezone', () => {
      const fp1 = service.computeFingerprint(sampleSignals);
      const fp2 = service.computeFingerprint({
        ...sampleSignals,
        timezone: 'Europe/London',
      });
      expect(fp1.deviceId).not.toBe(fp2.deviceId);
    });
  });

  describe('sybil detection', () => {
    it('should not flag a single user per device', () => {
      const fp = service.computeFingerprint(sampleSignals);
      const result = service.checkSybil(fp.deviceId, 'user-1');
      expect(result.isSybil).toBe(false);
      expect(result.linkedAccounts).toHaveLength(0);
    });

    it('should not flag two users on same device', () => {
      const fp = service.computeFingerprint(sampleSignals);
      service.registerDevice(fp.deviceId, 'user-1');
      const result = service.checkSybil(fp.deviceId, 'user-2');
      expect(result.isSybil).toBe(false);
      expect(result.linkedAccounts).toContain('user-1');
    });

    it('should flag when same device used by many accounts', () => {
      const fp = service.computeFingerprint(sampleSignals);
      service.registerDevice(fp.deviceId, 'user-1');
      service.registerDevice(fp.deviceId, 'user-2');
      service.registerDevice(fp.deviceId, 'user-3');
      const result = service.checkSybil(fp.deviceId, 'user-4');
      expect(result.isSybil).toBe(true);
      expect(result.linkedAccounts.length).toBeGreaterThanOrEqual(3);
    });

    it('should increase confidence with more linked accounts', () => {
      const fp = service.computeFingerprint(sampleSignals);
      service.registerDevice(fp.deviceId, 'user-1');
      const result1 = service.checkSybil(fp.deviceId, 'user-2');

      service.registerDevice(fp.deviceId, 'user-3');
      service.registerDevice(fp.deviceId, 'user-4');
      const result2 = service.checkSybil(fp.deviceId, 'user-5');

      expect(result2.confidence).toBeGreaterThan(result1.confidence);
    });

    it('should track devices per user', () => {
      service.registerDevice('device-a', 'user-1');
      service.registerDevice('device-b', 'user-1');
      const devices = service.getDevicesForUser('user-1');
      expect(devices).toContain('device-a');
      expect(devices).toContain('device-b');
    });

    it('should track users per device', () => {
      service.registerDevice('device-x', 'user-1');
      service.registerDevice('device-x', 'user-2');
      const users = service.getUsersForDevice('device-x');
      expect(users).toContain('user-1');
      expect(users).toContain('user-2');
    });
  });
});
