import { describe, it, expect } from 'vitest';
import { generateSecureToken, generateSecureCode, generateId } from '../crypto/secure-random';

describe('Secure Random Utilities', () => {
  describe('generateSecureToken', () => {
    it('should return a hex string of correct length', () => {
      const token = generateSecureToken(16);
      expect(token).toMatch(/^[0-9a-f]+$/);
      // 16 bytes = 32 hex chars
      expect(token.length).toBe(32);
    });

    it('should default to 32 bytes (64 hex chars)', () => {
      const token = generateSecureToken();
      expect(token.length).toBe(64);
    });

    it('should generate unique values', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()));
      expect(tokens.size).toBe(100);
    });
  });

  describe('generateSecureCode', () => {
    it('should return a numeric string of correct length', () => {
      const code = generateSecureCode(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should default to 6 digits', () => {
      const code = generateSecureCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate unique values across multiple calls', () => {
      const codes = new Set(Array.from({ length: 50 }, () => generateSecureCode(8)));
      // With 8-digit codes, collisions are extremely unlikely
      expect(codes.size).toBe(50);
    });
  });

  describe('generateId', () => {
    it('should return a string with the correct prefix', () => {
      const id = generateId('tok');
      expect(id).toMatch(/^tok_[0-9a-f]{32}$/);
    });

    it('should work with different prefixes', () => {
      const sessId = generateId('sess');
      expect(sessId.startsWith('sess_')).toBe(true);

      const userId = generateId('usr');
      expect(userId.startsWith('usr_')).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId('test')));
      expect(ids.size).toBe(100);
    });
  });
});
