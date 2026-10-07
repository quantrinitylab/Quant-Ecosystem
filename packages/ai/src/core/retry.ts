// ============================================================================
// AI Core - Retry with Exponential Backoff
// ============================================================================

import type { RetryOptions } from '../types';

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/** Error with status code (e.g., from HTTP responses) */
interface RetryableError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

/**
 * Determine if an error is retryable based on status code.
 * Only retry on 429 (rate limit) and 5xx (server errors).
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const err = error as RetryableError;
  const status = err.status ?? err.statusCode;

  if (status === 429) return true;
  if (status !== undefined && status >= 500) return true;

  // Check for common network error codes
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    return true;
  }

  // Check error message for rate limit indicators
  if (err.message.toLowerCase().includes('rate limit')) return true;
  if (err.message.toLowerCase().includes('too many requests')) return true;

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter: random value between 0 and cappedDelay
  const jitter = Math.random() * cappedDelay * 0.5;
  return cappedDelay + jitter;
}

/**
 * Retry a function with exponential backoff and jitter.
 *
 * Only retries on 429 and 5xx status codes. Other errors are thrown immediately.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted attempts
      if (attempt >= config.maxRetries) {
        throw lastError;
      }

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // Wait before retrying
      const delay = calculateDelay(attempt, config.baseDelayMs, config.maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { isRetryableError, calculateDelay };
