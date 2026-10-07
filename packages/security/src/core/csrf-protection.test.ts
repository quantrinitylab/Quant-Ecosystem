import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CSRFManager } from './csrf-protection';
import type { CSRFToken } from '../types';

const SECRET = 'unit-test-secret-key-1234567890';

/** Helper: real HMAC-SHA256 reference (the value the FIXED computeHMAC must equal). */
function realHmac(token: string, sessionId: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${token}:${sessionId}`).digest('hex');
}

/** Controlled access to private members for deterministic observation (see task notes). */
type CSRFInternals = {
  computeHMAC(token: string, sessionId: string): string;
  tokens: Map<string, CSRFToken>;
};
function internals(mgr: CSRFManager): CSRFInternals {
  return mgr as unknown as CSRFInternals;
}

// ============================================================================
// Task 18.3 — Fix-check: CSRF integrity tag equals HMAC-SHA256 reference (P3)
// Converted from the Phase-1 exploration block. PASSES on FIXED code.
// PBT: >=100 seeded random (token, sessionId) pairs via inline mulberry32.
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

function randomString(rng: () => number, minLen = 0, maxLen = 40): string {
  const len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(33 + Math.floor(rng() * 94));
  }
  return s;
}

describe('Bug B — fix-check: CSRF integrity tag equals HMAC-SHA256 reference (P3)', () => {
  it('computeHMAC(token, sessionId) === createHmac(sha256, secret).update(`token:sessionId`) for >=100 inputs', () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const rng = mulberry32(0x5c5f1);
    for (let i = 0; i < 120; i++) {
      const token = randomString(rng, 1, 40);
      const sessionId = randomString(rng, 1, 40);
      const tag = internals(mgr).computeHMAC(token, sessionId);
      expect(tag).toBe(realHmac(token, sessionId));
      expect(tag).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('a length-mismatched stored tag yields hmac_invalid (no throw) in the compare path', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('sessionLM');
    // A non-64-hex stored tag decodes to a different-length buffer than the expected HMAC,
    // so the length-guarded crypto.timingSafeEqual short-circuits to hmac_invalid (not a throw).
    internals(mgr).tokens.get(token)!.hmac = 'abcd';
    const res = await mgr.validateToken(token, 'sessionLM');
    expect(res).toEqual({ valid: false, reason: 'hmac_invalid' });
  });

  it('a token whose stored tag is the genuine HMAC validates as "valid"', async () => {
    // On FIXED code the stored tag already IS the genuine HMAC, so validation passes.
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('sessionX');
    const stored = internals(mgr).tokens.get(token)!;
    expect(stored.hmac).toBe(realHmac(token, 'sessionX'));
    const res = await mgr.validateToken(token, 'sessionX');
    expect(res).toEqual({ valid: true, reason: 'valid' });
  });
});

// ============================================================================
// Task 7 — Preservation baseline: CSRF protocol/state semantics & reason codes (P8)
// Asserts OUTCOMES; must PASS on UNFIXED code and remain green after the fix.
// ============================================================================
describe('Bug B — preservation: CSRF lifecycle, reason codes, and caps (P8)', () => {
  it('returns reason "valid" for a freshly generated single-use token', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    const res = await mgr.validateToken(token, 's1');
    expect(res).toEqual({ valid: true, reason: 'valid' });
  });

  it('returns "token_mismatch" when the double-submit header differs from the cookie token', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    const res = await mgr.validateToken(token, 's1', 'a-different-header-token');
    expect(res).toEqual({ valid: false, reason: 'token_mismatch' });
  });

  it('accepts a matching double-submit header (header === cookie token)', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    const res = await mgr.validateToken(token, 's1', token);
    expect(res).toEqual({ valid: true, reason: 'valid' });
  });

  it('returns "token_not_found" for an unknown token', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const res = await mgr.validateToken('no-such-token', 's1');
    expect(res).toEqual({ valid: false, reason: 'token_not_found' });
  });

  it('returns "token_expired" once the token is past its expiry', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET, tokenExpiry: -1 });
    const { token } = await mgr.generateToken('s1');
    const res = await mgr.validateToken(token, 's1');
    expect(res).toEqual({ valid: false, reason: 'token_expired' });
  });

  it('returns "session_mismatch" when the session binding differs', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('sessionA');
    const res = await mgr.validateToken(token, 'sessionB');
    expect(res).toEqual({ valid: false, reason: 'session_mismatch' });
  });

  it('returns "token_already_used" on replay (single-use enforcement)', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    expect((await mgr.validateToken(token, 's1')).reason).toBe('valid');
    const replay = await mgr.validateToken(token, 's1');
    expect(replay).toEqual({ valid: false, reason: 'token_already_used' });
  });

  it('returns "hmac_invalid" when the stored integrity tag is tampered', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    internals(mgr).tokens.get(token)!.hmac = 'tampered-tag-value';
    const res = await mgr.validateToken(token, 's1');
    expect(res).toEqual({ valid: false, reason: 'hmac_invalid' });
  });

  it('caps active tokens per session at 10 and evicts the oldest', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const issued: string[] = [];
    for (let i = 0; i < 11; i++) {
      issued.push((await mgr.generateToken('s1')).token);
    }
    expect(mgr.getSessionTokenCount('s1')).toBe(10);
    // The oldest (first) token was evicted -> token_not_found.
    expect((await mgr.validateToken(issued[0]!, 's1')).reason).toBe('token_not_found');
    // The newest token is still valid.
    expect((await mgr.validateToken(issued[10]!, 's1')).reason).toBe('valid');
  });

  it('rotateTokens invalidates prior session tokens and issues a fresh valid token', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token: oldToken } = await mgr.generateToken('s1');
    const { token: newToken } = await mgr.rotateTokens('s1');
    expect((await mgr.validateToken(oldToken, 's1')).reason).toBe('token_not_found');
    expect((await mgr.validateToken(newToken, 's1')).reason).toBe('valid');
  });

  it('invalidateSession removes all tokens for the session', async () => {
    const mgr = new CSRFManager({ secretKey: SECRET });
    const { token } = await mgr.generateToken('s1');
    await mgr.invalidateSession('s1');
    expect(mgr.getSessionTokenCount('s1')).toBe(0);
    expect((await mgr.validateToken(token, 's1')).reason).toBe('token_not_found');
  });
});
