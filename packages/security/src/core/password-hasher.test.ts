import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  let hasher: PasswordHasher;

  beforeEach(() => {
    hasher = new PasswordHasher();
  });

  describe('hash', () => {
    it('produces an argon2id result with salt and params', async () => {
      const result = await hasher.hash('s3cret-pass');
      expect(result.algorithm).toBe('argon2id');
      expect(result.version).toBe(19);
      expect(result.salt).toMatch(/^[0-9a-f]+$/);
      expect(result.hash.length).toBe(result.params.hashLength * 2);
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it('uses a random salt so two hashes of the same password differ', async () => {
      const a = await hasher.hash('same-password');
      const b = await hasher.hash('same-password');
      expect(a.salt).not.toBe(b.salt);
      expect(a.hash).not.toBe(b.hash);
    });

    it('honors custom Argon2 params', async () => {
      const custom = new PasswordHasher({ hashLength: 16 });
      const result = await custom.hash('pw');
      expect(result.hash.length).toBe(32);
      expect(result.params.hashLength).toBe(16);
    });
  });

  describe('verify', () => {
    it('verifies the correct password', async () => {
      const stored = await hasher.hash('correct horse');
      expect(await hasher.verify('correct horse', stored)).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const stored = await hasher.hash('correct horse');
      expect(await hasher.verify('wrong horse', stored)).toBe(false);
    });
  });

  describe('assessStrength', () => {
    it('scores a long, diverse password as strong', () => {
      const s = hasher.assessStrength('Tr0ub4dour&3xtr@Long!');
      expect(s.score).toBeGreaterThanOrEqual(4);
      expect(['strong', 'very_strong']).toContain(s.level);
      expect(s.entropy).toBeGreaterThan(0);
    });

    it('penalizes a known common password', () => {
      const s = hasher.assessStrength('password');
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.feedback).toContain('This is a commonly used password');
    });

    it('gives feedback for short, low-diversity passwords', () => {
      const s = hasher.assessStrength('abc');
      expect(s.feedback).toContain('Use at least 8 characters');
      expect(s.level).toBe('very_weak');
    });

    it('flags keyboard patterns', () => {
      const s = hasher.assessStrength('qwerty123456');
      expect(s.feedback).toContain('Avoid keyboard patterns');
    });
  });

  describe('checkBreach', () => {
    it('marks common passwords as breached with a count', async () => {
      const r = await hasher.checkBreach('123456');
      expect(r.breached).toBe(true);
      expect(r.count).toBeGreaterThan(0);
    });

    it('marks very short passwords as breached', async () => {
      const r = await hasher.checkBreach('ab');
      expect(r.breached).toBe(true);
    });

    it('treats a strong unique password as not breached', async () => {
      const r = await hasher.checkBreach('a-very-unique-long-passphrase-7Z');
      expect(r.breached).toBe(false);
      expect(r.count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('counts the number of hashes performed', async () => {
      expect(hasher.getStats().totalHashes).toBe(0);
      await hasher.hash('a');
      await hasher.hash('b');
      expect(hasher.getStats().totalHashes).toBe(2);
    });
  });
});
