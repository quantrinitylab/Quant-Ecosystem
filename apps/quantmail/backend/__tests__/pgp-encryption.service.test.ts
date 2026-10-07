import { describe, it, expect, beforeEach } from 'vitest';
import { PgpCrypto, InMemoryKeyVault, isKeyRef } from '@quant/encryption';
import { PGPEncryptionService } from '../services/pgp-encryption.service';

// The service now performs REAL RSA crypto (Task 2.2 de-simulation). RSA-4096
// keygen is intentionally slow, so tests inject a smaller (still real) modulus
// for speed; production defaults to RSA-4096.
function makeService(): PGPEncryptionService {
  return new PGPEncryptionService({
    crypto: new PgpCrypto(2048),
    vault: new InMemoryKeyVault(),
  });
}

describe('PGPEncryptionService', () => {
  let service: PGPEncryptionService;

  beforeEach(() => {
    service = makeService();
  });

  describe('generateKeyPair', () => {
    it('generates a key pair and persists only a KMS reference for the private key', async () => {
      const result = await service.generateKeyPair('user-1', 'my-passphrase');

      expect(result.userId).toBe('user-1');
      expect(result.publicKey).toContain('-----BEGIN PGP PUBLIC KEY-----');
      expect(result.publicKey).toContain('-----END PGP PUBLIC KEY-----');

      // Requirement 2.4: the persisted private-key field is a KMS-resolvable
      // reference (kms://...), NEVER plaintext private-key material.
      expect(isKeyRef(result.privateKeyRef)).toBe(true);
      expect(result.privateKeyRef).not.toContain('PRIVATE KEY');
      expect(result.privateKeyRef).not.toContain('-----BEGIN');

      expect(result.fingerprint).toMatch(/^[A-F0-9]{40}$/);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.algorithm).toBe('RSA-2048');
    });

    it('generates different key pairs each time', async () => {
      const first = await service.generateKeyPair('user-1', 'pass1');
      const second = await service.generateKeyPair('user-2', 'pass2');

      expect(first.fingerprint).not.toBe(second.fingerprint);
      expect(first.publicKey).not.toBe(second.publicKey);
      expect(first.privateKeyRef).not.toBe(second.privateKeyRef);
    });
  });

  describe('encrypt/decrypt round trip', () => {
    it('encrypts to the recipient public key and decrypts via the KMS reference', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'my-passphrase');
      const message = 'Hello, this is a secret message!';

      const encrypted = await service.encrypt(message, keyPair.publicKey);
      expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');
      expect(encrypted).not.toContain(message);

      const decrypted = await service.decrypt(encrypted, keyPair.privateKeyRef, 'my-passphrase');
      expect(decrypted).toBe(message);
    });

    it('handles unicode messages', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'pass');
      const message = 'Unicode test: Hello World';

      const encrypted = await service.encrypt(message, keyPair.publicKey);
      const decrypted = await service.decrypt(encrypted, keyPair.privateKeyRef, 'pass');
      expect(decrypted).toBe(message);
    });

    it('handles empty messages', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'pass');
      const message = '';

      const encrypted = await service.encrypt(message, keyPair.publicKey);
      const decrypted = await service.decrypt(encrypted, keyPair.privateKeyRef, 'pass');
      expect(decrypted).toBe(message);
    });

    it('fails when an unresolvable KMS reference is used', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'pass');
      const encrypted = await service.encrypt('secret', keyPair.publicKey);

      await expect(
        service.decrypt(encrypted, 'kms://does-not-exist', 'pass'),
      ).rejects.toThrow();
    });
  });

  describe('signMessage', () => {
    it('produces a PGP signature', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'my-passphrase');
      const message = 'Sign this message';

      const signature = await service.signMessage(
        message,
        keyPair.privateKeyRef,
        'my-passphrase',
      );

      expect(signature).toContain('-----BEGIN PGP SIGNATURE-----');
      expect(signature).toContain('-----END PGP SIGNATURE-----');
    });

    it('produces different signatures for different messages', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'my-passphrase');

      const sig1 = await service.signMessage('Message A', keyPair.privateKeyRef, 'my-passphrase');
      const sig2 = await service.signMessage('Message B', keyPair.privateKeyRef, 'my-passphrase');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('verifies a valid signature against the signer public key', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'my-passphrase');
      const message = 'Verified message';

      const signature = await service.signMessage(
        message,
        keyPair.privateKeyRef,
        'my-passphrase',
      );

      const isValid = await service.verifySignature(message, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('rejects a signature when the message was tampered with', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'my-passphrase');
      const signature = await service.signMessage(
        'original message',
        keyPair.privateKeyRef,
        'my-passphrase',
      );

      const isValid = await service.verifySignature(
        'tampered message',
        signature,
        keyPair.publicKey,
      );
      expect(isValid).toBe(false);
    });

    it('returns false for empty signature content', async () => {
      const keyPair = await service.generateKeyPair('user-1', 'pass');
      const emptySignature = '-----BEGIN PGP SIGNATURE-----\n\n-----END PGP SIGNATURE-----';

      const isValid = await service.verifySignature('test', emptySignature, keyPair.publicKey);
      expect(isValid).toBe(false);
    });
  });
});
