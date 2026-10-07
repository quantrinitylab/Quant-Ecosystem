import { describe, it, expect } from 'vitest';
import { ZKEmailKeyPairService } from '../zk-email/keypair';

describe('ZKEmailKeyPairService', () => {
  const service = new ZKEmailKeyPairService();

  describe('generateKeyPair', () => {
    it('generates a valid OpenPGP keypair', async () => {
      const { publicKey, privateKey } = await service.generateKeyPair(
        'Alice',
        'alice@example.com',
        'strongPassphrase123',
      );

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();

      // Public key should have user ID
      const userIds = publicKey.getUserIDs();
      expect(userIds).toContain('Alice <alice@example.com>');
    });

    it('generates unique keys each time', async () => {
      const pair1 = await service.generateKeyPair('User1', 'user1@example.com', 'pass1');
      const pair2 = await service.generateKeyPair('User2', 'user2@example.com', 'pass2');

      const armored1 = pair1.publicKey.armor();
      const armored2 = pair2.publicKey.armor();
      expect(armored1).not.toBe(armored2);
    });
  });

  describe('exportPublicKey / importPublicKey roundtrip', () => {
    it('exports and imports a public key successfully', async () => {
      const { publicKey } = await service.generateKeyPair(
        'Bob',
        'bob@example.com',
        'bobsPassphrase',
      );

      const armored = await service.exportPublicKey(publicKey);
      expect(armored).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
      expect(armored).toContain('-----END PGP PUBLIC KEY BLOCK-----');

      const imported = await service.importPublicKey(armored);
      expect(imported.getFingerprint()).toBe(publicKey.getFingerprint());
    });
  });

  describe('exportPrivateKey / importPrivateKey roundtrip', () => {
    it('exports and imports a private key with passphrase', async () => {
      const passphrase = 'mySecretPass';
      const { privateKey } = await service.generateKeyPair(
        'Carol',
        'carol@example.com',
        passphrase,
      );

      const armored = await service.exportPrivateKey(privateKey, passphrase);
      expect(armored).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
      expect(armored).toContain('-----END PGP PRIVATE KEY BLOCK-----');

      const imported = await service.importPrivateKey(armored, passphrase);
      expect(imported.getFingerprint()).toBe(privateKey.getFingerprint());
    });

    it('fails to import private key with wrong passphrase', async () => {
      const { privateKey } = await service.generateKeyPair(
        'Dave',
        'dave@example.com',
        'correctPass',
      );

      const armored = await service.exportPrivateKey(privateKey, 'correctPass');

      await expect(service.importPrivateKey(armored, 'wrongPass')).rejects.toThrow();
    });
  });
});
