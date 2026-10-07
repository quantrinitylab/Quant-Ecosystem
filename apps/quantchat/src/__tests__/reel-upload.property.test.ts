import { describe, it, expect } from 'vitest';
import {
  uploadWithRetry,
  backoffDelayMs,
  UploadNetworkError,
  type UploadResult,
  type UploadTransport,
} from '../lib/upload-retry';
import {
  validateReelFile,
  MAX_REEL_SIZE_BYTES,
  MAX_REEL_DURATION_SECONDS,
} from '../lib/reel-validation';

// ============================================================================
// QuantChat - Reel Upload Property Tests (Task 4.7)
// Property-based tests for upload retry backoff and reel validation.
// ============================================================================

/** mulberry32 — small, fast, deterministic PRNG seeded by a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive from a random float in [0, 1). */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const NUM_CASES = 200;
const dummyFile = new Blob(['x'], { type: 'video/mp4' });

describe('Property 9: upload retry respects exponential backoff', () => {
  // Feature: quantchat-mega-upgrade, Property 9: for any reel upload that fails
  // with a network error, the system retries up to 3 times with delays
  // 1s, 2s, 4s (base-2 exponential backoff).

  it('backoffDelayMs(0|1|2) yields the exact base-2 schedule [1000, 2000, 4000]', () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
  });

  it('retries exactly 3 times with delays [1000, 2000, 4000] on persistent network failure', async () => {
    let attempts = 0;
    const recordedDelays: number[] = [];

    const transport: UploadTransport = async () => {
      attempts += 1;
      throw new UploadNetworkError();
    };
    const sleep = async (ms: number): Promise<void> => {
      recordedDelays.push(ms);
    };

    await expect(
      uploadWithRetry(dummyFile, () => {}, 3, { transport, sleep }),
    ).rejects.toBeInstanceOf(UploadNetworkError);

    // 1 initial attempt + 3 retries = 4 transport invocations, 3 backoff waits.
    expect(attempts).toBe(4);
    expect(recordedDelays).toEqual([1000, 2000, 4000]);
  });

  it('stops retrying as soon as an attempt succeeds (seeded over random failure counts)', async () => {
    const rng = mulberry32(0xc0ffee);

    for (let i = 0; i < NUM_CASES; i++) {
      // Number of leading network failures before a success: 0..3.
      // (<=3 guarantees success within the 3-retry budget.)
      const failuresBeforeSuccess = randInt(rng, 0, 3);

      let attempts = 0;
      const recordedDelays: number[] = [];
      const expected: UploadResult = { videoUrl: 'https://cdn/reel.mp4' };

      const transport: UploadTransport = async () => {
        const current = attempts;
        attempts += 1;
        if (current < failuresBeforeSuccess) {
          throw new UploadNetworkError();
        }
        return expected;
      };
      const sleep = async (ms: number): Promise<void> => {
        recordedDelays.push(ms);
      };

      const result = await uploadWithRetry(dummyFile, () => {}, 3, {
        transport,
        sleep,
      });

      // Resolves with the successful result.
      expect(result).toEqual(expected);
      // Stops immediately after the first success: failures + 1 attempts.
      expect(attempts).toBe(failuresBeforeSuccess + 1);
      // Exactly one backoff wait per failure, following the base-2 schedule.
      const expectedDelays = Array.from({ length: failuresBeforeSuccess }, (_, k) =>
        backoffDelayMs(k),
      );
      expect(recordedDelays).toEqual(expectedDelays);
    }
  });

  it('does NOT retry on a non-retriable HTTP error (seeded over random statuses)', async () => {
    const rng = mulberry32(0x5eed42);

    for (let i = 0; i < NUM_CASES; i++) {
      const status = randInt(rng, 400, 599); // terminal HTTP error codes
      let attempts = 0;
      const recordedDelays: number[] = [];

      const transport: UploadTransport = async () => {
        attempts += 1;
        throw new Error(`Upload failed with status ${status}`);
      };
      const sleep = async (ms: number): Promise<void> => {
        recordedDelays.push(ms);
      };

      await expect(uploadWithRetry(dummyFile, () => {}, 3, { transport, sleep })).rejects.toThrow(
        `status ${status}`,
      );

      // Non-retriable error: a single attempt, no backoff waits.
      expect(attempts).toBe(1);
      expect(recordedDelays).toEqual([]);
    }
  });
});

describe('Property 10: reel validation rejects oversized content', () => {
  // Feature: quantchat-mega-upgrade, Property 10: for any file with size > 100MB
  // OR duration > 60s, validation rejects before upload begins.

  it('rejects exactly when sizeBytes > 100MB OR durationSeconds > 60s (seeded random inputs)', () => {
    const rng = mulberry32(0xba5e1);

    for (let i = 0; i < NUM_CASES; i++) {
      // Span well below and above both limits so all four quadrants are hit.
      const sizeBytes = randInt(rng, 0, 2 * MAX_REEL_SIZE_BYTES);
      const durationSeconds = randInt(rng, 0, 2 * MAX_REEL_DURATION_SECONDS);

      const result = validateReelFile({ sizeBytes, durationSeconds });

      const shouldReject =
        sizeBytes > MAX_REEL_SIZE_BYTES || durationSeconds > MAX_REEL_DURATION_SECONDS;

      expect(result.valid).toBe(!shouldReject);
      if (shouldReject) {
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      } else {
        expect(result.error).toBeUndefined();
      }
    }
  });

  it('accepts content exactly at the limits and rejects one unit over (boundary examples)', () => {
    expect(
      validateReelFile({
        sizeBytes: MAX_REEL_SIZE_BYTES,
        durationSeconds: MAX_REEL_DURATION_SECONDS,
      }).valid,
    ).toBe(true);

    expect(
      validateReelFile({
        sizeBytes: MAX_REEL_SIZE_BYTES + 1,
        durationSeconds: 10,
      }).valid,
    ).toBe(false);

    expect(
      validateReelFile({
        sizeBytes: 1024,
        durationSeconds: MAX_REEL_DURATION_SECONDS + 1,
      }).valid,
    ).toBe(false);
  });
});
