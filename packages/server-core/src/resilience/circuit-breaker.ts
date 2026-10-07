/**
 * Circuit breaker primitive (K12 — reliability).
 *
 * Shared across all Quant apps via @quant/server-core. Implements the classic
 * closed → open → half-open lifecycle:
 *
 * - closed: calls flow through; consecutive failures are counted.
 * - open: calls fail fast with {@link CircuitOpenError} — no load is placed on
 *   the struggling dependency while it recovers.
 * - half-open: after `resetTimeoutMs`, one trial call is allowed through. If it
 *   succeeds (successThreshold times) the breaker closes; if it fails the
 *   breaker re-opens.
 *
 * The breaker is dependency-agnostic: wrap any remote call (probe, RPC, HTTP)
 * with {@link CircuitBreaker.execute}. Per-dependency circuit state is surfaced
 * on the detailed health endpoint via {@link DependencyRegistry}.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Logical dependency name, e.g. 'postgres'. Used in errors and snapshots. */
  name: string;
  /** Consecutive failures that trip the breaker open. Default 5. */
  failureThreshold?: number;
  /** Consecutive half-open successes that close the breaker. Default 1. */
  successThreshold?: number;
  /** How long the breaker stays open before allowing a trial. Default 30s. */
  resetTimeoutMs?: number;
}

/** Thrown by {@link CircuitBreaker.execute} when the circuit is open. */
export class CircuitOpenError extends Error {
  readonly dependencyName: string;

  constructor(dependencyName: string) {
    super(`circuit breaker for '${dependencyName}' is open — call rejected without touching the dependency`);
    this.name = 'CircuitOpenError';
    this.dependencyName = dependencyName;
  }
}

export interface CircuitBreakerSnapshot {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastError: string | null;
  lastStateChangeAt: string;
  openedAt: string | null;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_SUCCESS_THRESHOLD = 1;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeoutMs: number;

  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastError: string | null = null;
  private openedAt: number | null = null;
  private lastStateChangeAt: number = Date.now();

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD);
    this.successThreshold = Math.max(1, options.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD);
    this.resetTimeoutMs = Math.max(0, options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS);
  }

  /**
   * Current state, lazily promoting open → half-open once the reset timeout
   * has elapsed. Reading the state never performs I/O.
   */
  get currentState(): CircuitState {
    if (
      this.state === 'open' &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.transition('half-open');
    }
    return this.state;
  }

  /**
   * Run `fn` through the breaker. Rejects with {@link CircuitOpenError} while
   * open (fail fast); records success/failure otherwise.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.currentState === 'open') {
      throw new CircuitOpenError(this.name);
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  /** Record an externally observed success (for call sites not using execute). */
  recordSuccess(): void {
    this.lastError = null;
    if (this.state === 'half-open') {
      this.consecutiveSuccesses += 1;
      this.consecutiveFailures = 0;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.transition('closed');
      }
      return;
    }
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }

  /** Record an externally observed failure (for call sites not using execute). */
  recordFailure(err?: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err ?? 'unknown error');
    this.consecutiveFailures += 1;
    this.consecutiveSuccesses = 0;
    if (this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
      this.transition('open');
    }
  }

  /** Manually close the breaker (e.g. after an operator-confirmed recovery). */
  reset(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastError = null;
    this.openedAt = null;
    this.transition('closed');
  }

  snapshot(): CircuitBreakerSnapshot {
    return {
      name: this.name,
      state: this.currentState,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastError: this.lastError,
      lastStateChangeAt: new Date(this.lastStateChangeAt).toISOString(),
      openedAt: this.openedAt !== null ? new Date(this.openedAt).toISOString() : null,
    };
  }

  private transition(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    this.lastStateChangeAt = Date.now();
    if (next === 'open') {
      this.openedAt = Date.now();
      this.consecutiveSuccesses = 0;
    }
    if (next === 'closed') {
      this.openedAt = null;
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    }
    if (next === 'half-open') {
      this.consecutiveSuccesses = 0;
    }
  }
}
