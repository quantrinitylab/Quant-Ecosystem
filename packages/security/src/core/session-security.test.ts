import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { SessionSecurity } from './session-security';

// The secret the FIXED generateFingerprint is documented to key its HMAC with.
const DEFAULT_FP_SECRET = 'default-fingerprint-secret-change-in-production';

function realFingerprint(ip: string, userAgent: string, secret = DEFAULT_FP_SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${ip}:${userAgent}`).digest('hex');
}

// ============================================================================
// Task 18.5 — Fix-check: session fingerprint equals keyed digest, stable, distinct (P5)
// Converted from the Phase-1 exploration block. PASSES on FIXED code.
// generateFingerprint is private — observed via the stored SecureSession.fingerprint.
// PBT: >=100 seeded random (ip, userAgent) pairs via inline mulberry32.
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

function randomIp(rng: () => number): string {
  const octet = () => Math.floor(rng() * 256);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
}

function randomUserAgent(rng: () => number): string {
  const len = 1 + Math.floor(rng() * 30);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(33 + Math.floor(rng() * 94));
  }
  return s;
}

describe('Bug D — fix-check: session fingerprint equals keyed HMAC digest (P5)', () => {
  it('stored fingerprint === HMAC-SHA256 reference for >=100 random (ip, userAgent) inputs', async () => {
    const ss = new SessionSecurity();
    const rng = mulberry32(0xf1c3a);
    for (let i = 0; i < 110; i++) {
      const ip = randomIp(rng);
      const ua = randomUserAgent(rng);
      const session = await ss.createSession('u', { ip, userAgent: ua });
      expect(session.fingerprint).toBe(realFingerprint(ip, ua));
      expect(session.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is stable: identical (ip, userAgent) yields the same fingerprint', async () => {
    const ss = new SessionSecurity();
    const a = await ss.createSession('u1', { ip: '9.9.9.9', userAgent: 'Mozilla/5.0' });
    const b = await ss.createSession('u2', { ip: '9.9.9.9', userAgent: 'Mozilla/5.0' });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toBe(realFingerprint('9.9.9.9', 'Mozilla/5.0'));
  });

  it('differs for distinct inputs', async () => {
    const ss = new SessionSecurity();
    const a = await ss.createSession('u', { ip: '1.2.3.4', userAgent: 'UA-A' });
    const b = await ss.createSession('u', { ip: '1.2.3.4', userAgent: 'UA-B' });
    const c = await ss.createSession('u', { ip: '5.6.7.8', userAgent: 'UA-A' });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

// ============================================================================
// Task 9 — Preservation baseline: session lifecycle + binding OUTCOMES (P10)
// Asserts pass/fail outcomes, NOT the fingerprint string value.
// ============================================================================
describe('Bug D — preservation: session lifecycle outcomes (P10)', () => {
  it('validates a session with identical (ip, userAgent)', async () => {
    const ss = new SessionSecurity();
    const s = await ss.createSession('u1', { ip: '10.0.0.1', userAgent: 'Chrome' });
    const res = await ss.validateSession(s.id, { ip: '10.0.0.1', userAgent: 'Chrome' });
    expect(res.valid).toBe(true);
    expect(res.reason).toBe('valid');
  });

  it('fails binding with fingerprint_mismatch when client attributes change', async () => {
    const ss = new SessionSecurity();
    const s = await ss.createSession('u1', { ip: '10.0.0.1', userAgent: 'Chrome' });
    const res = await ss.validateSession(s.id, { ip: '10.0.0.1', userAgent: 'Firefox' });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('fingerprint_mismatch');
  });

  it('returns session_not_found for an unknown session id', async () => {
    const ss = new SessionSecurity();
    const res = await ss.validateSession('does-not-exist', { ip: '1.1.1.1', userAgent: 'X' });
    expect(res).toEqual({ valid: false, reason: 'session_not_found' });
  });

  it('enforces the concurrent-session limit by evicting the oldest', async () => {
    const ss = new SessionSecurity({ maxConcurrent: 2 });
    const s1 = await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    expect(ss.getUserSessions('u1')).toHaveLength(2);
    // The oldest session was evicted.
    const evicted = await ss.validateSession(s1.id, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(evicted.reason).toBe('session_not_found');
  });

  it('expires a session past its absolute timeout', async () => {
    const ss = new SessionSecurity({ absoluteTimeout: -1 });
    const s = await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    const res = await ss.validateSession(s.id, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(res.reason).toBe('session_expired');
  });

  it('expires a session past its idle timeout', async () => {
    const ss = new SessionSecurity({ idleTimeout: -1 });
    const s = await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    const res = await ss.validateSession(s.id, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(res.reason).toBe('idle_timeout');
  });

  it('rotates on privilege escalation and prevents fixation (new id, old destroyed)', async () => {
    const ss = new SessionSecurity({ rotateOnAuth: true });
    const original = await ss.createSession('u1', { ip: '1.1.1.1', userAgent: 'UA' });
    const rotated = await ss.onPrivilegeEscalation(original.id, 5);
    expect(rotated).not.toBeNull();
    expect(rotated!.id).not.toBe(original.id);
    expect(rotated!.rotatedFrom).toBe(original.id);
    expect(rotated!.privilegeLevel).toBe(5);
    // Old session id is gone (fixation prevention).
    const old = await ss.validateSession(original.id, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(old.reason).toBe('session_not_found');
    // Rotated session still binds to the same client attributes.
    const stillValid = await ss.validateSession(rotated!.id, { ip: '1.1.1.1', userAgent: 'UA' });
    expect(stillValid.valid).toBe(true);
  });

  it('emits secure cookie attributes', () => {
    const ss = new SessionSecurity();
    const attrs = ss.getCookieAttributes('sid-123');
    expect(attrs).toContain('HttpOnly');
    expect(attrs).toContain('Secure');
    expect(attrs).toContain('SameSite=strict');
    expect(attrs).toContain('Path=/');
    expect(attrs).toContain('Max-Age=');
  });
});
