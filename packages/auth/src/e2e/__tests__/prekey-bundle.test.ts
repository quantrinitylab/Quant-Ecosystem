import { describe, it, expect } from 'vitest';
import { PreKeyBundleService } from '../prekey-bundle';
import { IdentityKeyService } from '../identity-key';

describe('PreKeyBundleService', () => {
  const identityService = new IdentityKeyService();
  const preKeyService = new PreKeyBundleService();

  describe('generateSignedPreKey', () => {
    it('should generate a signed prekey with X25519 keypair', () => {
      const identity = identityService.generateIdentityKeyPair();
      const signedPreKey = preKeyService.generateSignedPreKey(identity);

      expect(signedPreKey.keyPair.publicKey.asymmetricKeyType).toBe('x25519');
      expect(signedPreKey.keyPair.privateKey.asymmetricKeyType).toBe('x25519');
      expect(signedPreKey.signature).toBeInstanceOf(Buffer);
      expect(signedPreKey.keyId).toBe(1);
    });

    it('should produce a valid signature verifiable against identity key', () => {
      const identity = identityService.generateIdentityKeyPair();
      const signedPreKey = preKeyService.generateSignedPreKey(identity);
      const isValid = preKeyService.verifySignedPreKey(identity.publicKey, signedPreKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong identity key', () => {
      const identity1 = identityService.generateIdentityKeyPair();
      const identity2 = identityService.generateIdentityKeyPair();
      const signedPreKey = preKeyService.generateSignedPreKey(identity1);
      const isValid = preKeyService.verifySignedPreKey(identity2.publicKey, signedPreKey);
      expect(isValid).toBe(false);
    });
  });

  describe('generateOneTimePreKeys', () => {
    it('should generate the requested number of prekeys', () => {
      const preKeys = preKeyService.generateOneTimePreKeys(5);
      expect(preKeys).toHaveLength(5);
    });

    it('should generate X25519 keypairs', () => {
      const preKeys = preKeyService.generateOneTimePreKeys(3);
      for (const pk of preKeys) {
        expect(pk.keyPair.publicKey.asymmetricKeyType).toBe('x25519');
        expect(pk.keyPair.privateKey.asymmetricKeyType).toBe('x25519');
      }
    });

    it('should assign sequential keyIds', () => {
      const preKeys = preKeyService.generateOneTimePreKeys(3, 10);
      expect(preKeys[0]!.keyId).toBe(10);
      expect(preKeys[1]!.keyId).toBe(11);
      expect(preKeys[2]!.keyId).toBe(12);
    });
  });

  describe('createBundle', () => {
    it('should create a valid prekey bundle', () => {
      const identity = identityService.generateIdentityKeyPair();
      const signedPreKey = preKeyService.generateSignedPreKey(identity);
      const oneTimePreKeys = preKeyService.generateOneTimePreKeys(5);
      const bundle = preKeyService.createBundle(identity, signedPreKey, oneTimePreKeys);

      expect(bundle.identityPublicKey).toBe(identity.publicKey);
      expect(bundle.signedPreKey).toBe(signedPreKey);
      expect(bundle.oneTimePreKeys).toHaveLength(5);
    });
  });
});
