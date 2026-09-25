import { describe, it, expect, beforeEach } from 'vitest';
import { BiometricAuthService } from '../plugins/biometric-auth.js';
import type { BiometricType, BiometricConfig } from '../plugins/biometric-auth.js';

describe('BiometricAuthService', () => {
  let service: BiometricAuthService;

  beforeEach(() => {
    service = new BiometricAuthService();
  });

  describe('initialization and config', () => {
    it('should initialize with default config', () => {
      const config = service.getConfig();
      expect(config.allowFallback).toBe(true);
      expect(config.fallbackTitle).toBeUndefined();
      expect(config.invalidateOnBiometryChange).toBe(false);
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<BiometricConfig> = {
        allowFallback: false,
        fallbackTitle: 'Use PIN',
        invalidateOnBiometryChange: true,
      };
      const customService = new BiometricAuthService(customConfig);
      const config = customService.getConfig();
      expect(config.allowFallback).toBe(false);
      expect(config.fallbackTitle).toBe('Use PIN');
      expect(config.invalidateOnBiometryChange).toBe(true);
    });
  });

  describe('availability and type', () => {
    it('should report available by default', async () => {
      const available = await service.isAvailable();
      expect(available).toBe(true);
    });

    it('should report correct biometric type', async () => {
      const type = await service.getType();
      expect(type).toBe('faceId');
    });

    it('should allow toggling availability', async () => {
      service._setAvailable(false);
      expect(await service.isAvailable()).toBe(false);
      service._setAvailable(true);
      expect(await service.isAvailable()).toBe(true);
    });

    it('should allow changing biometric type', async () => {
      const types: BiometricType[] = ['touchId', 'fingerprint', 'iris', 'none'];
      for (const t of types) {
        service._setBiometricType(t);
        expect(await service.getType()).toBe(t);
      }
    });
  });

  describe('authenticate', () => {
    it('should throw if reason is empty', async () => {
      await expect(service.authenticate('')).rejects.toThrow('Authentication reason is required');
    });

    it('should succeed when biometrics are available', async () => {
      const result = await service.authenticate('Unlock Quant Ecosystem');
      expect(result.success).toBe(true);
      expect(result.biometricType).toBe('faceId');
      expect(result.error).toBeUndefined();
    });

    it('should return failure when biometrics are unavailable', async () => {
      service._setAvailable(false);
      const result = await service.authenticate('Unlock Quant Ecosystem');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Biometric not available');
      expect(result.biometricType).toBe('none');
    });
  });

  describe('secure credential storage', () => {
    it('should store and retrieve credentials', async () => {
      await service.setCredentials('authToken', 'secret-jwt-token-12345');
      const token = await service.getCredentials('authToken');
      expect(token).toBe('secret-jwt-token-12345');
    });

    it('should return null for non-existent credential key', async () => {
      const token = await service.getCredentials('nonExistentKey');
      expect(token).toBeNull();
    });

    it('should throw on setCredentials if biometrics are unavailable', async () => {
      service._setAvailable(false);
      await expect(service.setCredentials('k', 'v')).rejects.toThrow('Biometric not available');
    });

    it('should throw on getCredentials if biometrics are unavailable', async () => {
      service._setAvailable(false);
      await expect(service.getCredentials('k')).rejects.toThrow('Biometric not available');
    });
  });
});
