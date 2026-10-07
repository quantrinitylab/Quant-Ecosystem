import { describe, it, expect } from 'vitest';
import { DeviceKeyService } from '../device-keys';
import { IdentityKeyService } from '../identity-key';

describe('DeviceKeyService', () => {
  const deviceService = new DeviceKeyService();
  const identityService = new IdentityKeyService();

  describe('generateDeviceKeyPair', () => {
    it('should generate a valid X25519 keypair', () => {
      const deviceKey = deviceService.generateDeviceKeyPair();
      expect(deviceKey.publicKey.asymmetricKeyType).toBe('x25519');
      expect(deviceKey.privateKey.asymmetricKeyType).toBe('x25519');
      expect(deviceKey.deviceId).toBeDefined();
      expect(deviceKey.deviceId.length).toBe(32); // 16 bytes hex
    });

    it('should generate unique device IDs', () => {
      const dk1 = deviceService.generateDeviceKeyPair();
      const dk2 = deviceService.generateDeviceKeyPair();
      expect(dk1.deviceId).not.toBe(dk2.deviceId);
    });
  });

  describe('computeSharedSecret', () => {
    it('should compute a DH shared secret between two devices', () => {
      const device1 = deviceService.generateDeviceKeyPair();
      const device2 = deviceService.generateDeviceKeyPair();

      const secret1 = deviceService.computeSharedSecret(device1.privateKey, device2.publicKey);
      const secret2 = deviceService.computeSharedSecret(device2.privateKey, device1.publicKey);

      expect(secret1).toBeInstanceOf(Buffer);
      expect(secret1.length).toBe(32);
      expect(secret1.equals(secret2)).toBe(true);
    });
  });

  describe('linkDevice and verifyDeviceLink', () => {
    it('should link a device and verify the link', () => {
      const identity = identityService.generateIdentityKeyPair();
      const deviceKey = deviceService.generateDeviceKeyPair();

      const link = deviceService.linkDevice(identity, deviceKey);
      expect(link.deviceId).toBe(deviceKey.deviceId);
      expect(link.signature).toBeInstanceOf(Buffer);
      expect(link.timestamp).toBeGreaterThan(0);

      const isValid = deviceService.verifyDeviceLink(identity.publicKey, link);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong identity key', () => {
      const identity1 = identityService.generateIdentityKeyPair();
      const identity2 = identityService.generateIdentityKeyPair();
      const deviceKey = deviceService.generateDeviceKeyPair();

      const link = deviceService.linkDevice(identity1, deviceKey);
      const isValid = deviceService.verifyDeviceLink(identity2.publicKey, link);
      expect(isValid).toBe(false);
    });
  });
});
