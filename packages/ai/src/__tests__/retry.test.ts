import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, isRetryableError, calculateDelay } from '../core/retry';

describe('retryWithBackoff', () => {
  it('returns result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 status errors', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(error429).mockResolvedValueOnce('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx status errors', async () => {
    const error500 = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error500)
      .mockRejectedValueOnce(error500)
      .mockResolvedValueOnce('recovered');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx errors (except 429)', async () => {
    const error400 = Object.assign(new Error('Bad Request'), { status: 400 });
    const fn = vi.fn().mockRejectedValueOnce(error400);

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401 errors', async () => {
    const error401 = Object.assign(new Error('Unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValueOnce(error401);

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    const error500 = Object.assign(new Error('Server Error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(error500);

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('Server Error');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('retries on rate limit message errors', async () => {
    const rateLimitError = new Error('rate limit exceeded');
    const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce('ok');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isRetryableError', () => {
  it('returns true for 429 errors', () => {
    const error = Object.assign(new Error('rate limited'), { status: 429 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for 500 errors', () => {
    const error = Object.assign(new Error('server error'), { status: 500 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for 503 errors', () => {
    const error = Object.assign(new Error('service unavailable'), { status: 503 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for 400 errors', () => {
    const error = Object.assign(new Error('bad request'), { status: 400 });
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('returns true for ECONNRESET', () => {
    const error = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    expect(isRetryableError(error)).toBe(true);
  });
});

describe('calculateDelay', () => {
  it('increases exponentially', () => {
    const delay0 = calculateDelay(0, 1000, 30000);
    const delay1 = calculateDelay(1, 1000, 30000);
    const delay2 = calculateDelay(2, 1000, 30000);
    // Each should be roughly double the previous (with jitter)
    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('caps at maxDelayMs', () => {
    const delay = calculateDelay(10, 1000, 5000);
    // With jitter the max would be 5000 + 0.5 * 5000 = 7500
    expect(delay).toBeLessThanOrEqual(7500);
  });
});
