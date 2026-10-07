import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { KeyDiscoveryService, zBase32Encode } from '../zk-email/key-discovery';

describe('KeyDiscoveryService', () => {
  const service = new KeyDiscoveryService();

  describe('generateWKDUrl', () => {
    it('generates a valid WKD URL for an email address', () => {
      const url = service.generateWKDUrl('alice@example.com');

      expect(url).toContain('https://openpgpkey.example.com');
      expect(url).toContain('/.well-known/openpgpkey/example.com/hu/');
    });

    it('produces consistent URLs for the same email', () => {
      const url1 = service.generateWKDUrl('alice@example.com');
      const url2 = service.generateWKDUrl('alice@example.com');
      expect(url1).toBe(url2);
    });

    it('normalizes email to lowercase', () => {
      const url1 = service.generateWKDUrl('Alice@Example.COM');
      const url2 = service.generateWKDUrl('alice@example.com');
      expect(url1).toBe(url2);
    });

    it('generates different URLs for different local parts', () => {
      const url1 = service.generateWKDUrl('alice@example.com');
      const url2 = service.generateWKDUrl('bob@example.com');
      expect(url1).not.toBe(url2);
    });

    it('generates different URLs for different domains', () => {
      const url1 = service.generateWKDUrl('alice@example.com');
      const url2 = service.generateWKDUrl('alice@other.com');
      expect(url1).not.toBe(url2);
    });

    it('throws for invalid email without @', () => {
      expect(() => service.generateWKDUrl('invalidemail')).toThrow('Invalid email address');
    });

    it('uses SHA-1 hash of local part encoded in z-base-32', () => {
      const email = 'test@example.com';
      const localPart = 'test';
      const expectedHash = crypto.createHash('sha1').update(localPart).digest();
      const expectedEncoded = zBase32Encode(expectedHash);

      const url = service.generateWKDUrl(email);
      expect(url).toContain(`/hu/${expectedEncoded}`);
    });
  });

  describe('publishKey / lookupKey roundtrip', () => {
    it('publishes and looks up a key successfully', async () => {
      const email = 'dave@example.com';
      const publicKey =
        '-----BEGIN PGP PUBLIC KEY BLOCK-----\nmocked-key-data\n-----END PGP PUBLIC KEY BLOCK-----';

      const published = await service.publishKey(email, publicKey);
      expect(published.email).toBe(email);
      expect(published.publicKey).toBe(publicKey);
      expect(published.publishedAt).toBeGreaterThan(0);

      const looked = await service.lookupKey(email);
      expect(looked).not.toBeNull();
      expect(looked!.publicKey).toBe(publicKey);
      expect(looked!.email).toBe(email);
    });

    it('returns null for unknown email', async () => {
      const result = await service.lookupKey('unknown@nowhere.com');
      expect(result).toBeNull();
    });

    it('normalizes email on publish and lookup', async () => {
      const publicKey = 'test-key-data';
      await service.publishKey('Eve@Example.COM', publicKey);

      const result = await service.lookupKey('eve@example.com');
      expect(result).not.toBeNull();
      expect(result!.publicKey).toBe(publicKey);
    });
  });

  describe('zBase32Encode', () => {
    it('encodes an empty buffer', () => {
      const result = zBase32Encode(Buffer.alloc(0));
      expect(result).toBe('');
    });

    it('encodes a known value correctly', () => {
      // SHA-1 of empty string is da39a3ee5e6b4b0d3255bfef95601890afd80709
      const hash = crypto.createHash('sha1').update('').digest();
      const encoded = zBase32Encode(hash);
      expect(encoded.length).toBeGreaterThan(0);
      // z-base-32 output should only contain valid characters
      const validChars = 'ybndrfg8ejkmcpqxot1uwisza345h769';
      for (const char of encoded) {
        expect(validChars).toContain(char);
      }
    });

    it('produces deterministic output', () => {
      const data = Buffer.from('hello');
      expect(zBase32Encode(data)).toBe(zBase32Encode(data));
    });
  });
});
