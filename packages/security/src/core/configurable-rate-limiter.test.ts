import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigurableRateLimiter, InMemoryRateLimitStore } from './configurable-rate-limiter';
import type { RateLimitRule } from './configurable-rate-limiter';

describe('ConfigurableRateLimiter', () => {
  let store: InMemoryRateLimitStore;
  let limiter: ConfigurableRateLimiter;

  const defaultRule: RateLimitRule = {
    action: 'api_call',
    maxRequests: 5,
    windowMs: 60000,
    perUser: true,
    perIp: false,
  };

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    limiter = new ConfigurableRateLimiter(store, [defaultRule]);
  });

  describe('checkLimit', () => {
    it('should allow requests under the limit', async () => {
      const result = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfterMs).toBeNull();
    });

    it('should return allowed:false with retryAfter when limit exceeded', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      }

      // Next request should be denied
      const result = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should return retryAfterMs that reflects actual time remaining in window', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      }

      // Denied request should have retryAfterMs <= windowMs
      const result = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
    });

    it('should allow requests for unconfigured actions', async () => {
      const result = await limiter.checkLimit({ userId: 'user1', action: 'unknown_action' });
      expect(result.allowed).toBe(true);
    });

    it('should support different actions with different limits', async () => {
      const strictRule: RateLimitRule = {
        action: 'login',
        maxRequests: 3,
        windowMs: 60000,
        perUser: false,
        perIp: true,
      };
      limiter.configure('login', strictRule);

      // api_call has limit of 5
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
        expect(result.allowed).toBe(true);
      }

      // login has limit of 3
      for (let i = 0; i < 3; i++) {
        const result = await limiter.checkLimit({ ip: '1.2.3.4', action: 'login' });
        expect(result.allowed).toBe(true);
      }

      // login should be blocked now
      const blocked = await limiter.checkLimit({ ip: '1.2.3.4', action: 'login' });
      expect(blocked.allowed).toBe(false);
    });

    it('should isolate per-user limits (one user does not affect another)', async () => {
      // User1 exhausts their limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      }
      const user1Result = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(user1Result.allowed).toBe(false);

      // User2 should still be allowed
      const user2Result = await limiter.checkLimit({ userId: 'user2', action: 'api_call' });
      expect(user2Result.allowed).toBe(true);
      expect(user2Result.remaining).toBe(4);
    });
  });

  describe('configure', () => {
    it('should add new rules', async () => {
      limiter.configure('upload', {
        action: 'upload',
        maxRequests: 2,
        windowMs: 30000,
        perUser: true,
        perIp: false,
      });

      await limiter.checkLimit({ userId: 'u1', action: 'upload' });
      await limiter.checkLimit({ userId: 'u1', action: 'upload' });
      const result = await limiter.checkLimit({ userId: 'u1', action: 'upload' });
      expect(result.allowed).toBe(false);
    });
  });

  describe('resetLimits', () => {
    it('should reset limits for a specific user and action', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      }
      const blocked = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(blocked.allowed).toBe(false);

      // Reset
      await limiter.resetLimits({ userId: 'user1', action: 'api_call' });

      // Should be allowed again
      const afterReset = await limiter.checkLimit({ userId: 'user1', action: 'api_call' });
      expect(afterReset.allowed).toBe(true);
    });
  });
});

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it('should return null for unknown keys', async () => {
    expect(await store.get('unknown')).toBeNull();
  });

  it('should increment and return count', async () => {
    const count1 = await store.increment('key1', 60000);
    expect(count1).toBe(1);

    const count2 = await store.increment('key1', 60000);
    expect(count2).toBe(2);
  });

  it('should reset a key', async () => {
    await store.increment('key1', 60000);
    await store.reset('key1');
    expect(await store.get('key1')).toBeNull();
  });

  it('should return TTL for an active key', async () => {
    await store.increment('key1', 60000);
    const ttl = await store.getTTL('key1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60000);
  });

  it('should return null TTL for unknown key', async () => {
    const ttl = await store.getTTL('unknown');
    expect(ttl).toBeNull();
  });
});
