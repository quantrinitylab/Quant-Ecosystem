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
      expect(result.hash).toMatch(/^\$argon2id\$/);
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
      expect(result.hash).toMatch(/^\$argon2id\$/);
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

// ============================================================================
// Bug A — fix-check: real Argon2id hash/verify round-trip (P1)
// PBT over seeded random passwords via inline mulberry32. Uses reduced Argon2
// params so the intentionally-slow KDF stays fast across many cases.
// ============================================================================
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPassword(rng: () => number): string {
  const len = 1 + Math.floor(rng() * 24);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(33 + Math.floor(rng() * 94));
  }
  return s;
}

describe('Bug A — fix-check: Argon2id hash/verify round-trip is sound (P1)', () => {
  const fast = new PasswordHasher({ memoryCost: 256, timeCost: 1, parallelism: 1 });

  it('hash(p) is a real Argon2id PHC string and verify round-trips for >=12 random passwords', async () => {
    const rng = mulberry32(0xa2107);
    for (let i = 0; i < 12; i++) {
      const p = randomPassword(rng);
      const stored = await fast.hash(p);
      expect(stored.hash).toMatch(/^\$argon2id\$/);
      expect(stored.algorithm).toBe('argon2id');
      expect(await fast.verify(p, stored)).toBe(true);
      expect(await fast.verify(`${p}x`, stored)).toBe(false);
    }
  });

  it('two distinct passwords never verify against each other', async () => {
    const a = await fast.hash('password-alpha');
    const b = await fast.hash('password-beta');
    expect(await fast.verify('password-alpha', b)).toBe(false);
    expect(await fast.verify('password-beta', a)).toBe(false);
  });
});

// ============================================================================
// Bug A — fix-check: breach prefix derived from real SHA-256 (P2)
// Decision outcomes are unchanged; the prefix is now a real crypto hash.
// ============================================================================
describe('Bug A — fix-check: breach decision outcomes preserved with real SHA-256 prefix (P2)', () => {
  it('keeps the documented breach decisions (common -> breached, short -> breached, unique -> not)', async () => {
    const h = new PasswordHasher();
    expect((await h.checkBreach('123456')).breached).toBe(true);
    expect((await h.checkBreach('ab')).breached).toBe(true);
    const unique = await h.checkBreach('a-very-unique-long-passphrase-7Z');
    expect(unique.breached).toBe(false);
    expect(unique.count).toBe(0);
  });
});
