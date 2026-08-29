/**
 * How a failed query decides whether to try again.
 *
 * The default was `retry: 3` on every query in the app, which has two costs.
 *
 * A deterministic failure pays for four requests instead of one. A 401 on an
 * expired session, a 403 from an untrusted origin, a 404 for a thread someone
 * else deleted: repeating those verbatim cannot change the answer, so the only
 * effect is that the error state takes seven seconds to appear instead of
 * arriving immediately.
 *
 * And a brief backend outage becomes a request storm. Every mounted mailbox
 * query fires four times per cycle, `refetchInterval` starts the next cycle 30s
 * later, and the pages that mount several mailbox views at once multiply it.
 * A local 502 run produced long unbroken triplets of `/api/emails`,
 * `?folderType=DRAFTS` and `?folderType=INBOX` in the network log — the backend
 * was down and we were the ones keeping it busy.
 *
 * So: retry only what a retry can fix.
 */

/** Statuses where the server is explicitly inviting another attempt. */
const RETRYABLE_CLIENT_STATUS = new Set([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
]);

/**
 * A failed API response, carrying the status the client saw.
 *
 * Hooks throw `new Error(response.error.message)` for react-query to catch,
 * which drops the one field a retry decision needs. This keeps it.
 */
export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /**
   * Set `false` to opt out of retrying regardless of status. For the case where
   * the request succeeded and the *body* was unusable: the status says 200, so
   * nothing about the status can express that asking again is pointless.
   */
  readonly retryable: boolean;

  constructor(message: string, statusCode: number, code = 'UNKNOWN', retryable = true) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Build the error to throw from a query function.
 *
 * `statusCode: 0` is what the client reports for a transport failure — DNS,
 * an aborted connection, an offline device — which is exactly the case a retry
 * is for, so it is treated as transient rather than as an unknown 4xx.
 */
export function apiRequestError(
  error: { code?: string; message?: string; statusCode?: number } | undefined,
  fallbackMessage: string,
): ApiRequestError {
  return new ApiRequestError(
    error?.message || fallbackMessage,
    error?.statusCode ?? 0,
    error?.code || 'UNKNOWN',
  );
}

/** Attempts to make in total, including the first, for a transient failure. */
export const MAX_QUERY_ATTEMPTS = 3;

/**
 * react-query's `retry` predicate.
 *
 * Two retries, not three, for anything transient. Every screen that consumes a
 * query pairs it with a visible retry affordance — `ErrorState`'s `onRetry`, or
 * a pull-to-refresh — so the third automatic attempt was spending a request to
 * save a tap that is already on screen.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_ATTEMPTS - 1) return false;

  if (error instanceof ApiRequestError) {
    if (!error.retryable) return false;
    const { statusCode } = error;
    if (statusCode === 0) return true; // transport failure
    if (statusCode >= 400 && statusCode < 500) return RETRYABLE_CLIENT_STATUS.has(statusCode);
    return statusCode >= 500;
  }

  // Not an API error we can read: a thrown TypeError, a parse failure. One more
  // attempt, because the cause is unknown rather than known-permanent.
  return failureCount < 1;
}

/**
 * Delay before attempt N+1: 700ms, then 2.1s.
 *
 * Short enough that a flapping gateway resolves inside one visible loading
 * state, rather than react-query's 1s/2s/4s ramp which outlasts the patience of
 * anyone watching a spinner.
 */
export function queryRetryDelay(failureCount: number): number {
  return Math.min(700 * 3 ** failureCount, 5_000);
}

/**
 * Polling cadence for a live view that is currently failing.
 *
 * Returning `false` on error would be quieter, but a mailbox that stopped
 * polling never recovers on its own — the reader has to reload the page to find
 * out the backend came back. Backing off keeps it self-healing at a fraction of
 * the traffic.
 */
export function backoffInterval(healthy: number, isError: boolean): number {
  return isError ? Math.max(healthy * 4, 120_000) : healthy;
}
