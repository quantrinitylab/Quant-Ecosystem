// ============================================================================
// Persistence Layer — transient-error retry utility
// Spec: quantchat-mega-upgrade, Task 9.7 / 9.9
// Design: Component 6 "Persistence Layer (Prisma + PostgreSQL)" —
//         "Retry with Exponential Backoff Pattern"
//
// Implements the `withRetry` + `isTransientError` pattern from the design doc.
// The persistence layer retries a transient DB operation up to `maxRetries`
// times using base-2 exponential backoff (1s, 2s, 4s) before propagating the
// error (the route layer maps the propagated error to a 503 response).
//
// `sleep` is injectable so the backoff schedule can be observed deterministically
// in tests without real timers.
// ============================================================================

/**
 * Prisma "known request" error codes that represent transient connectivity /
 * availability problems and are therefore safe to retry:
 *   P1001 — can't reach database server
 *   P1002 — database server reached but timed out
 *   P1008 — operation timed out
 *   P1017 — server has closed the connection
 */
export const TRANSIENT_PRISMA_ERROR_CODES = ['P1001', 'P1002', 'P1008', 'P1017'] as const;

export type TransientPrismaErrorCode = (typeof TRANSIENT_PRISMA_ERROR_CODES)[number];

/**
 * Determine whether an error is a transient database error that should be
 * retried. Prisma's `PrismaClientKnownRequestError` carries a string `code`
 * field; we duck-type on that so this utility does not need to import the
 * generated Prisma client (and remains unit-testable without a live DB).
 */
export function isTransientError(error: unknown): boolean {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return (
      typeof code === 'string' && (TRANSIENT_PRISMA_ERROR_CODES as readonly string[]).includes(code)
    );
  }
  return false;
}

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Compute the backoff delay (in ms) applied *before* the retry that follows a
 * given zero-based attempt index. Base-2 exponential: 1000, 2000, 4000, ...
 */
export function backoffDelayMs(attempt: number): number {
  return Math.pow(2, attempt) * 1000;
}

/**
 * Execute `operation`, retrying on transient DB errors with exponential
 * backoff. With the default `maxRetries = 3` an always-transiently-failing
 * operation is invoked 4 times total (1 initial + 3 retries), sleeping
 * [1000, 2000, 4000] ms between attempts, then throws the last error.
 *
 * Non-transient errors are thrown immediately without any retry or sleep.
 *
 * @param operation the async DB operation to run
 * @param maxRetries maximum number of retries after the initial attempt
 * @param sleep injectable delay function (defaults to real `setTimeout`)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  sleep: SleepFn = defaultSleep,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries || !isTransientError(error)) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt));
    }
  }
  // Unreachable: the loop either returns a value or throws.
  throw new Error('withRetry: unreachable state');
}
