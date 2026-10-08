// ============================================================================
// Remote-call timeout policy (K13).
//
// Doc 10-reliability-observability.md: "Remote calls use timeout, bounded
// retry, backoff, idempotency and circuit breaking where appropriate."
// Circuit breaking + per-dependency health live in `src/resilience/` (K12).
// THIS module owns timeouts only: a typed timeout error, a per-dependency
// timeout map with env overrides, and thin wrappers (`withTimeout`,
// `withDependencyTimeout`, `fetchWithTimeout`) that guarantee a remote call
// can never hang a request thread silently — it fails fast with a
// RemoteCallTimeoutError carrying the dependency label for observability.
//
// The module is intentionally dependency-free (no fastify/pino imports) so it
// can be imported from any server-side package or route handler.
// ============================================================================

/** Dependencies with a centrally-managed remote-call timeout. */
export type RemoteDependencyKey =
  | 'postgres'
  | 'redis'
  | 'ses'
  | 'smtp'
  | 'search'
  | 'sso'
  | 'storage'
  | 'default';

/**
 * Typed error raised when a remote call exceeds its timeout budget.
 * Always carries the dependency label + budget so logs, metrics and the
 * health endpoint (K12) can attribute the failure to the right dependency.
 */
export class RemoteCallTimeoutError extends Error {
  readonly code = 'REMOTE_CALL_TIMEOUT';
  readonly dependency: string;
  readonly timeoutMs: number;

  constructor(dependency: string, timeoutMs: number, options?: { cause?: unknown }) {
    super(`Remote call timed out: '${dependency}' exceeded ${timeoutMs}ms`);
    this.name = 'RemoteCallTimeoutError';
    this.dependency = dependency;
    this.timeoutMs = timeoutMs;
    if (options?.cause !== undefined) {
      // `cause` is supported on modern runtimes; assign defensively for older ones.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Central timeout budget per dependency (milliseconds).
 *
 * Rationale (fail-fast for interactive paths, tolerant for delivery paths):
 * - postgres/redis/search: interactive query paths — callers hang user
 *   requests, so budgets are tight (2–5s).
 * - ses/smtp: mail delivery APIs can queue server-side; 10–15s avoids
 *   false-positive timeouts on slow-but-healthy sends.
 * - sso: upstream OIDC/userinfo verification during login; 8s matches the
 *   pre-existing budget in the QuantChat SSO exchange flow.
 * - storage: object-storage first-byte latency (R2/S3); 15s.
 *
 * Override any entry at deploy time with `QUANT_TIMEOUT_<KEY>`, e.g.
 * `QUANT_TIMEOUT_SSO=5000`. Non-positive / unparsable values are ignored.
 */
export const REMOTE_CALL_TIMEOUTS: Record<RemoteDependencyKey, number> = {
  postgres: 5000,
  redis: 2000,
  ses: 10000,
  smtp: 15000,
  search: 5000,
  sso: 8000,
  storage: 15000,
  default: 5000,
};

/** Resolve the effective timeout budget for a dependency. */
export function getTimeoutMs(key: RemoteDependencyKey, overrideMs?: number): number {
  if (typeof overrideMs === 'number' && Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }
  const envName = `QUANT_TIMEOUT_${key.toUpperCase()}`;
  const raw = process.env[envName];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return REMOTE_CALL_TIMEOUTS[key] ?? REMOTE_CALL_TIMEOUTS.default;
}

export interface TimeoutLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface WithTimeoutOptions {
  /** Explicit budget; falls back to the per-dependency map / env. */
  timeoutMs?: number;
  /** Called with the typed error when the budget is exceeded. */
  onTimeout?: (err: RemoteCallTimeoutError) => void;
  /** Optional logger — timeouts are logged with the dependency label. */
  logger?: TimeoutLogger;
}

/**
 * Race a promise against a deadline. Rejects with RemoteCallTimeoutError if
 * the deadline wins; otherwise resolves/rejects with the promise's own
 * outcome. The timer is always cleared on settle and unref'd so it never
 * holds the event loop open.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RemoteCallTimeoutError(label, ms));
    }, ms);
    // Don't hold the process open for a pending remote call (CLI/scripts).
    (timer as unknown as { unref?: () => void }).unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Run `fn` under the centrally-managed timeout for `key`.
 * On timeout: logs with the dependency label (if a logger is given),
 * invokes `onTimeout`, and rejects with RemoteCallTimeoutError.
 */
export function withDependencyTimeout<T>(
  key: RemoteDependencyKey,
  fn: () => Promise<T>,
  options: WithTimeoutOptions = {},
): Promise<T> {
  const ms = getTimeoutMs(key, options.timeoutMs);
  const label = key;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new RemoteCallTimeoutError(label, ms);
      options.logger?.warn(
        { dependency: label, timeoutMs: ms, code: err.code },
        `remote call timeout: ${label}`,
      );
      try {
        options.onTimeout?.(err);
      } catch {
        // onTimeout is observability-only; never mask the timeout itself.
      }
      reject(err);
    }, ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    let result: Promise<T>;
    try {
      result = fn();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    result.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface FetchWithTimeoutOptions extends WithTimeoutOptions {
  /** Extra AbortSignal to compose with the timeout (caller-initiated abort). */
  signal?: AbortSignal;
}

/**
 * fetch() with a guaranteed deadline from the timeout policy.
 * Timeout aborts map to RemoteCallTimeoutError; a caller-initiated abort
 * (via `options.signal`) still surfaces as the original AbortError so
 * callers can distinguish "I cancelled" from "the dependency hung".
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit | undefined,
  key: RemoteDependencyKey,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const ms = getTimeoutMs(key, options.timeoutMs);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  (timer as unknown as { unref?: () => void }).unref?.();

  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new RemoteCallTimeoutError(key, ms, { cause: err });
      options.logger?.warn(
        { dependency: key, timeoutMs: ms, code: timeoutErr.code },
        `remote call timeout: ${key}`,
      );
      try {
        options.onTimeout?.(timeoutErr);
      } catch {
        // observability-only
      }
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
