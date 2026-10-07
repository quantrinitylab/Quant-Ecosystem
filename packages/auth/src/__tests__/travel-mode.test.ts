import { describe, it, expect, beforeEach } from 'vitest';
import { TravelModeService } from '../services/travel-mode-service';

describe('TravelModeService', () => {
  let service: TravelModeService;

  beforeEach(() => {
    service = new TravelModeService();
  });

  describe('enableTravelMode', () => {
    it('should enable travel mode for a user', () => {
      const config = service.enableTravelMode('user-1', {
        restrictedRegions: ['CN', 'RU'],
        allowedDeviceIds: ['device-1', 'device-2'],
      });

      expect(config.enabled).toBe(true);
      expect(config.restrictedRegions).toEqual(['CN', 'RU']);
      expect(config.allowedDeviceIds).toEqual(['device-1', 'device-2']);
    });

    it('should overwrite previous travel mode config', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN'],
        allowedDeviceIds: ['device-1'],
      });

      const config = service.enableTravelMode('user-1', {
        restrictedRegions: ['RU', 'IR'],
        allowedDeviceIds: ['device-3'],
      });

      expect(config.restrictedRegions).toEqual(['RU', 'IR']);
      expect(config.allowedDeviceIds).toEqual(['device-3']);
    });
  });

  describe('disableTravelMode', () => {
    it('should disable travel mode for a user', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN'],
        allowedDeviceIds: ['device-1'],
      });

      const result = service.disableTravelMode('user-1');
      expect(result).toBe(true);

      const status = service.getTravelModeStatus('user-1');
      expect(status).not.toBeNull();
      expect(status!.enabled).toBe(false);
    });

    it('should return false if no config exists', () => {
      const result = service.disableTravelMode('user-none');
      expect(result).toBe(false);
    });
  });

  describe('getTravelModeStatus', () => {
    it('should return null for user with no config', () => {
      expect(service.getTravelModeStatus('user-none')).toBeNull();
    });

    it('should return the current config', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN'],
        allowedDeviceIds: ['device-1'],
      });

      const status = service.getTravelModeStatus('user-1');
      expect(status).not.toBeNull();
      expect(status!.enabled).toBe(true);
    });
  });

  describe('isAccessAllowed', () => {
    it('should allow access when travel mode is not configured', () => {
      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'any-device',
        region: 'US',
      });
      expect(allowed).toBe(true);
    });

    it('should allow access when travel mode is disabled', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN'],
        allowedDeviceIds: ['device-1'],
      });
      service.disableTravelMode('user-1');

      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'unknown-device',
        region: 'CN',
      });
      expect(allowed).toBe(true);
    });

    it('should deny access from untrusted device', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: [],
        allowedDeviceIds: ['device-1', 'device-2'],
      });

      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'unknown-device',
      });
      expect(allowed).toBe(false);
    });

    it('should deny access from restricted region', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN', 'RU'],
        allowedDeviceIds: ['device-1'],
      });

      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'device-1',
        region: 'CN',
      });
      expect(allowed).toBe(false);
    });

    it('should allow access from trusted device in non-restricted region', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN', 'RU'],
        allowedDeviceIds: ['device-1'],
      });

      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'device-1',
        region: 'US',
      });
      expect(allowed).toBe(true);
    });

    it('should allow access from trusted device when no region specified', () => {
      service.enableTravelMode('user-1', {
        restrictedRegions: ['CN'],
        allowedDeviceIds: ['device-1'],
      });

      const allowed = service.isAccessAllowed('user-1', {
        deviceId: 'device-1',
      });
      expect(allowed).toBe(true);
    });
  });
});
