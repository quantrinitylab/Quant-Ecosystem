import { describe, it, expect } from 'vitest';
import { IdentityKeyService } from '../identity-key';

describe('IdentityKeyService', () => {
  const service = new IdentityKeyService();

  describe('generateIdentityKeyPair', () => {
    it('should generate a valid Ed25519 keypair', () => {
      const keyPair = service.generateIdentityKeyPair();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.asymmetricKeyType).toBe('ed25519');
      expect(keyPair.privateKey.asymmetricKeyType).toBe('ed25519');
    });

    it('should generate unique keys each time', () => {
      const keyPair1 = service.generateIdentityKeyPair();
      const keyPair2 = service.generateIdentityKeyPair();
      const pub1 = service.serializePublicKey(keyPair1.publicKey);
      const pub2 = service.serializePublicKey(keyPair2.publicKey);
      expect(pub1).not.toBe(pub2);
    });
  });

  describe('serialization roundtrip', () => {
    it('should serialize and deserialize public key correctly', () => {
      const keyPair = service.generateIdentityKeyPair();
      const serialized = service.serializePublicKey(keyPair.publicKey);
      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);

      const deserialized = service.deserializePublicKey(serialized);
      expect(deserialized.asymmetricKeyType).toBe('ed25519');

      // Verify the deserialized key is the same
      const reSerialized = service.serializePublicKey(deserialized);
      expect(reSerialized).toBe(serialized);
    });

    it('should serialize as base64-encoded DER', () => {
      const keyPair = service.generateIdentityKeyPair();
      const serialized = service.serializePublicKey(keyPair.publicKey);
      // Valid base64 pattern
      expect(serialized).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should serialize and deserialize the full keypair', () => {
      const keyPair = service.generateIdentityKeyPair();
      const serialized = service.serializeKeyPair(keyPair);
      expect(serialized.publicKey).toBeDefined();
      expect(serialized.privateKey).toBeDefined();

      const pubDeserialized = service.deserializePublicKey(serialized.publicKey);
      const privDeserialized = service.deserializePrivateKey(serialized.privateKey);
      expect(pubDeserialized.asymmetricKeyType).toBe('ed25519');
      expect(privDeserialized.asymmetricKeyType).toBe('ed25519');
    });
  });
});
