import { describe, it, expect } from 'vitest';
import { RateLimiter, getClientIp } from '../lib/rate-limit';

describe('RateLimiter (token bucket)', () => {
  it('allows requests up to capacity', () => {
    const limiter = new RateLimiter({ capacity: 3, refillIntervalMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.consume('ip-1', now).allowed).toBe(true);
    expect(limiter.consume('ip-1', now).allowed).toBe(true);
    expect(limiter.consume('ip-1', now).allowed).toBe(true);
  });

  it('blocks once the bucket is empty and reports retryAfterMs', () => {
    const limiter = new RateLimiter({ capacity: 2, refillIntervalMs: 60_000 });
    const now = 1_000_000;
    limiter.consume('ip-1', now);
    limiter.consume('ip-1', now);
    const verdict = limiter.consume('ip-1', now);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterMs).toBeGreaterThan(0);
    expect(verdict.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('refills one token per interval and allows again after a full window', () => {
    const limiter = new RateLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.consume('ip-1', now).allowed).toBe(true);
    expect(limiter.consume('ip-1', now).allowed).toBe(false);
    // 30s later: still empty.
    expect(limiter.consume('ip-1', now + 30_000).allowed).toBe(false);
    // 60s later: one token regenerated.
    const verdict = limiter.consume('ip-1', now + 60_000);
    expect(verdict.allowed).toBe(true);
    expect(verdict.retryAfterMs).toBe(0);
  });

  it('never exceeds capacity no matter how much time passes', () => {
    const limiter = new RateLimiter({ capacity: 2, refillIntervalMs: 60_000 });
    const now = 1_000_000;
    limiter.consume('ip-1', now);
    // 10 minutes later: bucket refills to capacity (2), not beyond.
    expect(limiter.consume('ip-1', now + 600_000).allowed).toBe(true);
    expect(limiter.consume('ip-1', now + 600_000).allowed).toBe(true);
    expect(limiter.consume('ip-1', now + 600_000).allowed).toBe(false);
  });

  it('isolates buckets per key (one IP being limited never affects another)', () => {
    const limiter = new RateLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    const now = 1_000_000;
    limiter.consume('attacker', now);
    expect(limiter.consume('attacker', now).allowed).toBe(false);
    expect(limiter.consume('victim', now).allowed).toBe(true);
  });

  it('prunes long-idle buckets to bound memory on attacker-controlled keys', () => {
    const limiter = new RateLimiter({ capacity: 2, refillIntervalMs: 1_000 });
    const now = 1_000_000;
    limiter.consume('spoofed-ip', now);
    expect(limiter.size()).toBe(1);
    // Idle longer than a full refill cycle (capacity * interval = 2s).
    limiter.consume('other', now + 5_000);
    expect(limiter.size()).toBe(1); // spoofed-ip evicted, only 'other' remains
  });

  it('reset() clears all buckets', () => {
    const limiter = new RateLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    limiter.consume('ip-1', 1_000_000);
    expect(limiter.consume('ip-1', 1_000_000).allowed).toBe(false);
    limiter.reset();
    expect(limiter.consume('ip-1', 1_000_000).allowed).toBe(true);
  });

  it('rejects invalid options at construction', () => {
    expect(() => new RateLimiter({ capacity: 0 })).toThrow();
    expect(() => new RateLimiter({ capacity: -5 })).toThrow();
    expect(() => new RateLimiter({ refillIntervalMs: 0 })).toThrow();
  });

  it('treats empty keys as "unknown" instead of throwing', () => {
    const limiter = new RateLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    expect(limiter.consume('', 1_000_000).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('http://localhost/api/auth/login', { headers });
  }

  it('takes the left-most X-Forwarded-For entry', () => {
    expect(
      getClientIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.4' })),
    ).toBe('203.0.113.7');
  });

  it('falls back to X-Real-IP', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('falls back to "unknown" when no IP headers exist', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});
