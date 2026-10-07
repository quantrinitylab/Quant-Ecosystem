import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, validateCodeChallenge } from '../crypto/pkce';

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a verifier of the requested length', () => {
      const verifier = generateCodeVerifier(64);
      expect(verifier.length).toBe(64);
    });

    it('should generate a verifier of at least 43 characters', () => {
      const verifier = generateCodeVerifier(10); // min clamped to 43
      expect(verifier.length).toBe(43);
    });

    it('should generate a verifier of at most 128 characters', () => {
      const verifier = generateCodeVerifier(200); // max clamped to 128
      expect(verifier.length).toBe(128);
    });

    it('should generate unique verifiers', () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a base64url encoded challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      expect(challenge).toBeDefined();
      expect(challenge.length).toBeGreaterThan(0);
      // base64url should not contain +, /, or =
      expect(challenge).not.toMatch(/[+/=]/);
    });

    it('should produce consistent output for the same input', async () => {
      const verifier = 'test-verifier-string-for-consistency-check-abc123';
      const c1 = await generateCodeChallenge(verifier);
      const c2 = await generateCodeChallenge(verifier);
      expect(c1).toBe(c2);
    });
  });

  describe('validateCodeChallenge', () => {
    it('should validate correct verifier against S256 challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      const valid = await validateCodeChallenge(verifier, challenge, 'S256');
      expect(valid).toBe(true);
    });

    it('should reject wrong verifier against S256 challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      const wrongVerifier = generateCodeVerifier();
      const valid = await validateCodeChallenge(wrongVerifier, challenge, 'S256');
      expect(valid).toBe(false);
    });

    it('should validate plain method as simple equality', async () => {
      const verifier = 'plain-text-verifier';
      const valid = await validateCodeChallenge(verifier, verifier, 'plain');
      expect(valid).toBe(true);
    });

    it('should reject wrong plain verifier', async () => {
      const valid = await validateCodeChallenge('wrong', 'correct', 'plain');
      expect(valid).toBe(false);
    });
  });
});
