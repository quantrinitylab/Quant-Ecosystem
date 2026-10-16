// ============================================================================
// @quant/queue — Redis PubSub publisher tests (fix/qm-ci-logs-redis-publish)
// ============================================================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createLogRedisPublisher, resolveLogRedisUrl } from '../redis-publisher';

describe('resolveLogRedisUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers an explicit url override over everything', () => {
    vi.stubEnv('REDIS_URL', 'redis://env:6380');
    expect(
      resolveLogRedisUrl(process.env, { url: 'redis://override:6381' }),
    ).toBe('redis://override:6381');
  });

  it('prefers REDIS_URL over host/port', () => {
    vi.stubEnv('REDIS_URL', 'redis://envhost:6380');
    vi.stubEnv('REDIS_HOST', 'otherhost');
    vi.stubEnv('REDIS_PORT', '6381');
    expect(resolveLogRedisUrl(process.env)).toBe('redis://envhost:6380');
  });

  it('falls back to REDIS_HOST/REDIS_PORT', () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('REDIS_HOST', 'redis.internal');
    vi.stubEnv('REDIS_PORT', '6382');
    expect(resolveLogRedisUrl(process.env)).toBe('redis://redis.internal:6382');
  });

  it('defaults to localhost:6379', () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('REDIS_HOST', '');
    vi.stubEnv('REDIS_PORT', '');
    expect(resolveLogRedisUrl({})).toBe('redis://localhost:6379');
  });
});

describe('createLogRedisPublisher', () => {
  it('returns a publisher with publish and close functions', () => {
    const publisher = createLogRedisPublisher({ port: 1 });
    expect(typeof publisher.publish).toBe('function');
    expect(typeof publisher.close).toBe('function');
    return publisher.close();
  });

  it('close() without ever connecting resolves cleanly', async () => {
    const publisher = createLogRedisPublisher({ port: 1 });
    await expect(publisher.close()).resolves.toBeUndefined();
  });

  it('rejects (never hangs) when Redis is unreachable', async () => {
    // Port 1 is privileged/closed; the short connect timeout keeps this fast.
    const publisher = createLogRedisPublisher({ port: 1, connectTimeoutMs: 300 });
    await expect(publisher.publish('channel:test', 'hello')).rejects.toThrow();
    await publisher.close();
  });

  it('retries the connection on a later publish after a failure', async () => {
    const publisher = createLogRedisPublisher({ port: 1, connectTimeoutMs: 300 });
    await expect(publisher.publish('channel:test', 'one')).rejects.toThrow();
    // Second attempt must also settle (rejected), not hang on stale state.
    await expect(publisher.publish('channel:test', 'two')).rejects.toThrow();
    await publisher.close();
  });
});
