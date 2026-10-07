import { describe, it, expect, vi } from 'vitest';
import {
  ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  ONE_TIME_PREKEY_TARGET,
  createLocalIdentity,
  generateOneTimePreKeys,
  oneTimePreKeysToGenerate,
  replenishOneTimePreKeys,
  type OneTimePreKeyReplenishmentTransport,
} from '../features/encryption/e2eeClient';

// Unit tests for client one-time prekey replenishment (Task 4, Requirement 2.8).
// The Web_Client reads its remaining unclaimed one-time prekey count and, when it
// drops below the threshold (10), generates and uploads PUBLIC one-time prekeys
// until the pool reaches the target (100).

describe('oneTimePreKeysToGenerate (replenishment policy, Req 2.8)', () => {
  it('generates nothing while the pool is at or above the threshold', () => {
    expect(oneTimePreKeysToGenerate(ONE_TIME_PREKEY_REPLENISH_THRESHOLD)).toBe(0);
    expect(oneTimePreKeysToGenerate(50)).toBe(0);
    expect(oneTimePreKeysToGenerate(ONE_TIME_PREKEY_TARGET)).toBe(0);
  });

  it('refills up to the target once below the threshold', () => {
    // Empty pool -> generate the full target.
    expect(oneTimePreKeysToGenerate(0)).toBe(ONE_TIME_PREKEY_TARGET);
    // Just below threshold -> top up to the target.
    expect(oneTimePreKeysToGenerate(9)).toBe(ONE_TIME_PREKEY_TARGET - 9);
    // Negative/garbage counts are clamped to a full refill.
    expect(oneTimePreKeysToGenerate(-5)).toBe(ONE_TIME_PREKEY_TARGET);
  });

  it('never exceeds the backend per-batch limit of 100', () => {
    for (let count = 0; count < ONE_TIME_PREKEY_REPLENISH_THRESHOLD; count += 1) {
      expect(oneTimePreKeysToGenerate(count)).toBeLessThanOrEqual(100);
    }
  });
});

describe('generateOneTimePreKeys (Req 2.8, 16.1)', () => {
  it('produces the requested number of distinct PUBLIC one-time prekeys', () => {
    const identity = createLocalIdentity();
    const keys = generateOneTimePreKeys(identity, 25);
    expect(keys).toHaveLength(25);
    expect(new Set(keys).size).toBe(25);
    // PUBLIC material only — no private key strings leak into the upload batch.
    const privateKey = identity.identityKeyPair.privateKey;
    expect(keys).not.toContain(privateKey);
    for (const key of keys) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty batch for a zero count', () => {
    const identity = createLocalIdentity();
    expect(generateOneTimePreKeys(identity, 0)).toEqual([]);
  });
});

describe('replenishOneTimePreKeys (Req 2.8)', () => {
  it('uploads a full top-up to the target when the pool is empty', async () => {
    const identity = createLocalIdentity();
    const uploaded: string[] = [];
    const transport: OneTimePreKeyReplenishmentTransport = {
      getRemainingCount: vi.fn().mockResolvedValue(0),
      uploadOneTimePreKeys: vi.fn(async (keys: string[]) => {
        uploaded.push(...keys);
      }),
    };

    const result = await replenishOneTimePreKeys(identity, transport);

    expect(result.remainingBefore).toBe(0);
    expect(result.uploaded).toBe(ONE_TIME_PREKEY_TARGET);
    expect(uploaded).toHaveLength(ONE_TIME_PREKEY_TARGET);
    // Each uploaded batch must respect the backend's 1–100 size limit.
    const calls = (transport.uploadOneTimePreKeys as ReturnType<typeof vi.fn>).mock.calls;
    for (const [batch] of calls) {
      expect((batch as string[]).length).toBeGreaterThanOrEqual(1);
      expect((batch as string[]).length).toBeLessThanOrEqual(100);
    }
  });

  it('tops up to the target when below the threshold', async () => {
    const identity = createLocalIdentity();
    const transport: OneTimePreKeyReplenishmentTransport = {
      getRemainingCount: vi.fn().mockResolvedValue(3),
      uploadOneTimePreKeys: vi.fn().mockResolvedValue(undefined),
    };

    const result = await replenishOneTimePreKeys(identity, transport);

    expect(result.uploaded).toBe(ONE_TIME_PREKEY_TARGET - 3);
    // After replenishment the pool reaches at least the target (Req 2.8).
    expect(result.remainingBefore + result.uploaded).toBeGreaterThanOrEqual(ONE_TIME_PREKEY_TARGET);
  });

  it('is a no-op when the pool is already at or above the threshold', async () => {
    const identity = createLocalIdentity();
    const upload = vi.fn().mockResolvedValue(undefined);
    const transport: OneTimePreKeyReplenishmentTransport = {
      getRemainingCount: vi.fn().mockResolvedValue(42),
      uploadOneTimePreKeys: upload,
    };

    const result = await replenishOneTimePreKeys(identity, transport);

    expect(result.uploaded).toBe(0);
    expect(upload).not.toHaveBeenCalled();
  });
});
