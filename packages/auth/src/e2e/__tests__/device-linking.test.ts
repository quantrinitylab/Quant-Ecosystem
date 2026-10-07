import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { DeviceLinkingService } from '../device-linking';

describe('DeviceLinkingService', () => {
  const linkingService = new DeviceLinkingService();

  describe('generateLinkingCode', () => {
    it('should generate a valid linking code', () => {
      const linkingCode = linkingService.generateLinkingCode();

      expect(linkingCode.code).toBeDefined();
      expect(linkingCode.code.length).toBeGreaterThan(0);
      expect(linkingCode.challenge).toBeDefined();
      expect(linkingCode.expiresAt).toBeGreaterThan(Date.now());
      expect(linkingCode.ephemeralKeyPair.publicKey.asymmetricKeyType).toBe('x25519');
    });

    it('should generate unique codes each time', () => {
      const code1 = linkingService.generateLinkingCode();
      const code2 = linkingService.generateLinkingCode();
      expect(code1.code).not.toBe(code2.code);
      expect(code1.challenge).not.toBe(code2.challenge);
    });
  });

  describe('verifyLinkingCode', () => {
    it('should verify a valid linking code and establish secure channel', () => {
      const linkingCode = linkingService.generateLinkingCode();
      const newDevice = crypto.generateKeyPairSync('x25519');

      const session = linkingService.verifyLinkingCode(linkingCode, newDevice.publicKey);

      expect(session.verified).toBe(true);
      expect(session.sharedSecret).toBeInstanceOf(Buffer);
      expect(session.sharedSecret.length).toBe(32);
      expect(session.devicePublicKey).toBe(newDevice.publicKey);
    });

    it('should reject expired linking code', () => {
      const linkingCode = linkingService.generateLinkingCode();
      // Manually expire the code
      linkingCode.expiresAt = Date.now() - 1000;

      const newDevice = crypto.generateKeyPairSync('x25519');
      expect(() => {
        linkingService.verifyLinkingCode(linkingCode, newDevice.publicKey);
      }).toThrow('Linking code expired');
    });
  });

  describe('transferKeys', () => {
    it('should transfer keys over the secure channel', () => {
      const linkingCode = linkingService.generateLinkingCode();
      const newDevice = crypto.generateKeyPairSync('x25519');

      const session = linkingService.verifyLinkingCode(linkingCode, newDevice.publicKey);
      const keysToTransfer = Buffer.from('serialized-identity-keys-data');

      const encrypted = linkingService.transferKeys(session, keysToTransfer);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.salt).toBeDefined();

      // New device computes same shared secret and decrypts
      const deviceSharedSecret = crypto.diffieHellman({
        privateKey: newDevice.privateKey,
        publicKey: linkingCode.ephemeralKeyPair.publicKey,
      });

      const received = linkingService.receiveKeys(
        deviceSharedSecret,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authTag,
        encrypted.salt,
      );

      expect(received.toString()).toBe('serialized-identity-keys-data');
    });

    it('should reject transfer on unverified session', () => {
      const session = {
        sharedSecret: Buffer.alloc(32),
        verified: false,
        devicePublicKey: null,
      };

      expect(() => {
        linkingService.transferKeys(session, Buffer.from('keys'));
      }).toThrow('Linking session not verified');
    });
  });
});
