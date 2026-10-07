import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { TOTPService } from '../crypto/totp';

describe('TOTPService', () => {
  const service = new TOTPService();

  describe('generateSecret', () => {
    it('should generate a base32 encoded secret', () => {
      const secret = service.generateSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThan(0);
      // base32 characters
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    it('should generate unique secrets', () => {
      const s1 = service.generateSecret();
      const s2 = service.generateSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('generateQRCodeUri', () => {
    it('should generate a valid otpauth:// URI', () => {
      const secret = service.generateSecret();
      const uri = service.generateQRCodeUri(secret, 'user@quant.app', 'Quant');

      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('secret=');
      expect(uri).toContain('issuer=Quant');
      expect(uri).toContain(encodeURIComponent('user@quant.app'));
    });
  });

  describe('verify', () => {
    it('should verify a valid token generated from the secret', () => {
      const secret = service.generateSecret();
      // Generate a valid token for the current time
      const token = authenticator.generate(secret);

      const result = service.verify(token, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid token', () => {
      const secret = service.generateSecret();
      const invalidResult = service.verify('invalid', secret);
      expect(invalidResult).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 8 backup codes by default', () => {
      const codes = service.generateBackupCodes();
      expect(codes).toHaveLength(8);
    });

    it('should generate codes of 8 hex characters each', () => {
      const codes = service.generateBackupCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it('should generate the requested number of codes', () => {
      const codes = service.generateBackupCodes(5);
      expect(codes).toHaveLength(5);
    });

    it('should generate unique codes', () => {
      const codes = service.generateBackupCodes(8);
      const unique = new Set(codes);
      expect(unique.size).toBe(8);
    });
  });
});
