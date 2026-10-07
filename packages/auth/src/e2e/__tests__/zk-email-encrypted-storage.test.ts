import { describe, it, expect } from 'vitest';
import { EncryptedEmailStorage } from '../zk-email/encrypted-storage';
import { ZKEmailKeyPairService } from '../zk-email/keypair';

describe('EncryptedEmailStorage', () => {
  const storage = new EncryptedEmailStorage();
  const keyService = new ZKEmailKeyPairService();

  describe('encryptEmail / decryptEmail roundtrip', () => {
    it('encrypts and decrypts an email successfully', async () => {
      const { publicKey, privateKey } = await keyService.generateKeyPair(
        'Alice',
        'alice@example.com',
        'pass123',
      );

      const originalEmail = {
        subject: 'Test Subject',
        sender: 'bob@example.com',
        body: 'This is a confidential message.',
      };

      const encrypted = await storage.encryptEmail(originalEmail, publicKey);

      // Verify encrypted content is not plaintext
      expect(encrypted.encryptedContent).not.toContain(originalEmail.body);
      expect(encrypted.encryptedSubject).not.toContain(originalEmail.subject);
      expect(encrypted.encryptedSender).not.toContain(originalEmail.sender);
      expect(encrypted.timestamp).toBeGreaterThan(0);

      // Encrypted content should be PGP armored
      expect(encrypted.encryptedContent).toContain('-----BEGIN PGP MESSAGE-----');

      // Decrypt and verify
      const decrypted = await storage.decryptEmail(encrypted, privateKey);
      expect(decrypted.body).toBe(originalEmail.body);
      expect(decrypted.subject).toBe(originalEmail.subject);
      expect(decrypted.sender).toBe(originalEmail.sender);
    });

    it('server-stored ciphertext does not contain plaintext', async () => {
      const { publicKey } = await keyService.generateKeyPair(
        'Charlie',
        'charlie@example.com',
        'pass456',
      );

      const secretBody = 'TOP SECRET INFORMATION THAT MUST REMAIN HIDDEN';
      const encrypted = await storage.encryptEmail(
        { subject: 'Secret', sender: 'agent@spy.org', body: secretBody },
        publicKey,
      );

      // The server only sees ciphertext - verify no plaintext leaks
      const allStoredData = JSON.stringify(encrypted);
      expect(allStoredData).not.toContain(secretBody);
      expect(allStoredData).not.toContain('TOP SECRET');
    });
  });

  describe('encryptAttachment / decryptAttachment roundtrip', () => {
    it('encrypts and decrypts binary attachment data', async () => {
      const { publicKey, privateKey } = await keyService.generateKeyPair(
        'Dave',
        'dave@example.com',
        'attachPass',
      );

      const originalData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);

      const encrypted = await storage.encryptAttachment(originalData, publicKey);
      expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');

      const decrypted = await storage.decryptAttachment(encrypted, privateKey);
      expect(decrypted).toEqual(originalData);
    });
  });
});
