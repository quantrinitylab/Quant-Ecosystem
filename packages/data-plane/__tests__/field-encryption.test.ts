import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { FieldEncryption, createFieldEncryption } from '../src/field-encryption.js';

describe('FieldEncryption', () => {
  const masterKey = 'test-master-key-for-encryption-testing';
  const encryption = createFieldEncryption(masterKey);
  const key = crypto.randomBytes(32);

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryption.encrypt(plaintext, key);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = encryption.decrypt(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        key,
      );
      expect(decrypted).toBe(plaintext);
    });

    it('should handle different plaintexts', () => {
      const texts = [
        '',
        'short',
        'A much longer text with special characters: !@#$%^&*()',
        'Unicode: \u00e9\u00e8\u00ea\u00eb \u4f60\u597d \ud83d\ude80',
      ];

      for (const text of texts) {
        const encrypted = encryption.encrypt(text, key);
        const decrypted = encryption.decrypt(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          key,
        );
        expect(decrypted).toBe(text);
      }
    });

    it('should produce unique IVs for same plaintext', () => {
      const plaintext = 'same text';
      const encrypted1 = encryption.encrypt(plaintext, key);
      const encrypted2 = encryption.encrypt(plaintext, key);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
  });

  describe('key rotation', () => {
    it('should rotate keys correctly', () => {
      const oldKey = crypto.randomBytes(32);
      const newKey = crypto.randomBytes(32);
      const plaintext = 'sensitive data';

      const encrypted = encryption.encrypt(plaintext, oldKey);
      const rotated = encryption.rotateKey(encrypted, oldKey, newKey);

      const decrypted = encryption.decrypt(rotated.ciphertext, rotated.iv, rotated.authTag, newKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('invalid key', () => {
    it('should throw error with wrong key', () => {
      const plaintext = 'secret';
      const encrypted = encryption.encrypt(plaintext, key);
      const wrongKey = crypto.randomBytes(32);

      expect(() =>
        encryption.decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag, wrongKey),
      ).toThrow();
    });
  });

  describe('deriveKey', () => {
    it('should derive deterministic keys', () => {
      const key1 = encryption.deriveKey(masterKey, 'context-1');
      const key2 = encryption.deriveKey(masterKey, 'context-1');
      expect(key1).toEqual(key2);
    });

    it('should produce different keys for different contexts', () => {
      const key1 = encryption.deriveKey(masterKey, 'context-1');
      const key2 = encryption.deriveKey(masterKey, 'context-2');
      expect(key1).not.toEqual(key2);
    });
  });

  describe('factory', () => {
    it('should create an instance', () => {
      const instance = createFieldEncryption('my-key');
      expect(instance).toBeInstanceOf(FieldEncryption);
    });
  });
});
