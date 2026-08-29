import { describe, it, expect } from 'vitest';
import {
  ApiRequestError,
  MAX_QUERY_ATTEMPTS,
  apiRequestError,
  backoffInterval,
  queryRetryDelay,
  shouldRetryQuery,
} from '../lib/query-retry';

/**
 * The query client defaulted to `retry: 3` for everything. Two consequences,
 * both of which these cases pin against:
 *
 * A deterministic failure cost four requests and about seven seconds before the
 * error state appeared — a 401 on an expired session, a 404 for a thread someone
 * else deleted. Repeating those verbatim cannot change the answer.
 *
 * And a brief backend outage became a request storm. A local 502 run produced
 * unbroken runs of the same three mailbox requests in the network log: each
 * mounted mailbox query fired four times, `refetchInterval` opened the next cycle
 * 30s later, and nothing throttled.
 */
describe('shouldRetryQuery', () => {
  const at = (failureCount: number, status: number) =>
    shouldRetryQuery(failureCount, new ApiRequestError('nope', status));

  it('retries server failures', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(at(0, status), `${status}`).toBe(true);
    }
  });

  it('retries transport failures, which the client reports as status 0', () => {
    expect(at(0, 0)).toBe(true);
  });

  it('does not retry a client error, because the request itself is the problem', () => {
    for (const status of [400, 401, 403, 404, 409, 410, 422]) {
      expect(at(0, status), `${status}`).toBe(false);
    }
  });

  it('retries only the client errors that mean "ask again"', () => {
    expect(at(0, 408)).toBe(true); // Request Timeout
    expect(at(0, 425)).toBe(true); // Too Early
    expect(at(0, 429)).toBe(true); // Too Many Requests
  });

  it('honours an explicit opt-out even on a retryable status', () => {
    // A 200 with an unusable body: the status cannot express that asking again
    // is pointless, so the error says so directly.
    const final = new ApiRequestError('malformed', 0, 'MALFORMED', false);
    expect(shouldRetryQuery(0, final)).toBe(false);
  });

  it('stops after MAX_QUERY_ATTEMPTS attempts in total', () => {
    // failureCount is the number of failures *so far*, so the last allowed
    // retry is requested at MAX_QUERY_ATTEMPTS - 2.
    expect(at(MAX_QUERY_ATTEMPTS - 2, 502)).toBe(true);
    expect(at(MAX_QUERY_ATTEMPTS - 1, 502)).toBe(false);
    expect(at(MAX_QUERY_ATTEMPTS, 502)).toBe(false);
  });

  it('gives an unreadable error exactly one more attempt', () => {
    // A thrown TypeError or a JSON parse failure: unknown, not known-permanent.
    expect(shouldRetryQuery(0, new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError('fetch failed'))).toBe(false);
    expect(shouldRetryQuery(0, 'a string someone threw')).toBe(true);
    expect(shouldRetryQuery(0, undefined)).toBe(true);
  });
});

describe('apiRequestError', () => {
  it('carries the status through so the retry decision can read it', () => {
    const error = apiRequestError(
      { code: 'UNAUTHORIZED', message: 'Session expired', statusCode: 401 },
      'Failed to load inbox',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Session expired');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('falls back to the caller message when the response carries none', () => {
    expect(apiRequestError(undefined, 'Failed to load inbox').message).toBe('Failed to load inbox');
    expect(apiRequestError({ statusCode: 503 }, 'Failed to load inbox').message).toBe(
      'Failed to load inbox',
    );
  });

  it('treats a missing status as a transport failure rather than an unknown 4xx', () => {
    // `statusCode: 0` is what the API client reports when the request never got
    // an answer, which is precisely the case a retry exists for.
    expect(apiRequestError({ message: 'Network request failed' }, 'x').statusCode).toBe(0);
    expect(shouldRetryQuery(0, apiRequestError(undefined, 'x'))).toBe(true);
  });
});

describe('queryRetryDelay', () => {
  it('resolves both retries inside one visible loading state', () => {
    expect(queryRetryDelay(0)).toBe(700);
    expect(queryRetryDelay(1)).toBe(2_100);
    // Under three seconds total, against react-query's 1s + 2s + 4s ramp.
    expect(queryRetryDelay(0) + queryRetryDelay(1)).toBeLessThan(3_000);
  });

  it('is capped, so a long-lived query cannot back off indefinitely', () => {
    expect(queryRetryDelay(10)).toBe(5_000);
  });
});

describe('backoffInterval', () => {
  it('polls at the healthy cadence while the view is working', () => {
    expect(backoffInterval(30_000, false)).toBe(30_000);
  });

  it('backs off to at least two minutes once the view is failing', () => {
    expect(backoffInterval(30_000, true)).toBe(120_000);
    expect(backoffInterval(60_000, true)).toBe(240_000);
  });

  it('keeps polling rather than stopping, so a recovered backend is noticed', () => {
    // Returning `false` would be quieter, but the mailbox would then only find
    // out the backend came back when someone reloaded the page.
    expect(backoffInterval(30_000, true)).toBeGreaterThan(0);
  });
});
