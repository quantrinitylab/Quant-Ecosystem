/**
 * Per-dependency health registry (K12 — reliability).
 *
 * Implements spec M16 (`docs/quant-architecture/products/quantmail/backend/
 * health-dependencies.md`): for every declared dependency track health,
 * latency, error rate, timeout rate, circuit state and last successful
 * operation — plus the declared degraded-mode behavior a dependency failure
 * must have.
 *
 * Honesty rules (no invented health data):
 * - a dependency with no wiring in this deployment reports `not_configured`
 * - a configured dependency with no live probe reports `unknown`
 * - probes run through the dependency's circuit breaker, so a tripped breaker
 *   surfaces as `unavailable` with circuitState `open` instead of hammering
 *   the dependency on every health scrape
 */
import { CircuitBreaker, type CircuitBreakerOptions, type CircuitState } from './circuit-breaker';

/** Honest dependency health states, ordered by severity. */
export type DependencyStatus = 'ok' | 'degraded' | 'unavailable' | 'unknown' | 'not_configured';

export interface DependencyProbeOutcome {
  ok: boolean;
  detail?: string;
}

export interface DependencyDefinition {
  /** Stable key, e.g. 'postgres'. Surfaced on /health/detailed. */
  name: string;
  /** 'external' = remote system with its own failure modes; 'internal' = in-process module. */
  kind: 'external' | 'internal';
  /**
   * False when the dependency is not wired in this deployment (no URL, no
   * credentials, no client). Reports `not_configured` — never fake healthy.
   */
  configured: boolean;
  /**
   * Declared degraded-mode behavior when this dependency fails (spec M16
   * requirement). Shown on the health endpoint so on-call knows what to expect.
   */
  degradedMode: string;
  /**
   * Live probe. Omit when no cheap, safe probe exists — a configured dependency
   * without a probe honestly reports `unknown`. The probe should be fast and
   * read-only; the registry additionally bounds it with `probeTimeoutMs`.
   */
  probe?: () => Promise<DependencyProbeOutcome>;
  /** Upper bound for a single probe run. Default 2000ms. */
  probeTimeoutMs?: number;
  /** Probe latency above this marks the dependency `degraded` instead of `ok`. */
  latencyDegradedMs?: number;
  /** Circuit-breaker tuning for this dependency's probes (name is derived from the dependency). */
  breaker?: Omit<CircuitBreakerOptions, 'name'>;
}

export interface DependencyHealthReport {
  name: string;
  kind: 'external' | 'internal';
  configured: boolean;
  status: DependencyStatus;
  /** Last probe round-trip in ms; null when no probe ran. */
  latencyMs: number | null;
  /** Rolling probe failure rate 0..1; null when no probes have run. */
  errorRate: number | null;
  /** Rolling probe timeout rate 0..1; null when no probes have run. */
  timeoutRate: number | null;
  /** Breaker state; null for unconfigured/probeless dependencies. */
  circuitState: CircuitState | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  degradedMode: string;
}

interface ProbeSample {
  ok: boolean;
  timedOut: boolean;
  at: number;
}

/** Rolling window of recent probe outcomes per dependency. */
const MAX_SAMPLES = 50;
const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

class ProbeTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`dependency probe for '${name}' timed out after ${timeoutMs}ms`);
    this.name = 'ProbeTimeoutError';
  }
}

export class DependencyRegistry {
  private readonly defs = new Map<string, DependencyDefinition>();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly samples = new Map<string, ProbeSample[]>();
  private readonly lastLatencyMs = new Map<string, number>();
  private readonly lastError = new Map<string, string | null>();
  private readonly lastSuccessAt = new Map<string, number | null>();

  register(def: DependencyDefinition): void {
    if (this.defs.has(def.name)) {
      throw new Error(`dependency '${def.name}' is already registered`);
    }
    this.defs.set(def.name, def);
    if (def.configured && def.probe) {
      this.breakers.set(
        def.name,
        new CircuitBreaker({ name: def.name, ...(def.breaker ?? {}) }),
      );
    }
    this.samples.set(def.name, []);
    this.lastError.set(def.name, null);
    this.lastSuccessAt.set(def.name, null);
  }

  registeredNames(): string[] {
    return [...this.defs.keys()];
  }

  /** Probe one dependency and return its honest health report. */
  async check(name: string): Promise<DependencyHealthReport> {
    const def = this.defs.get(name);
    if (!def) throw new Error(`unknown dependency '${name}'`);

    if (!def.configured) {
      return this.report(def, {
        status: 'not_configured',
        circuitState: null,
      });
    }

    if (!def.probe) {
      return this.report(def, {
        status: 'unknown',
        circuitState: null,
      });
    }

    const breaker = this.breakers.get(name);
    const timeoutMs = def.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    const startedAt = Date.now();
    let timedOut = false;
    let outcome: DependencyProbeOutcome | null = null;
    let error: string | null = null;

    try {
      if (!breaker) throw new Error(`no circuit breaker for probed dependency '${name}'`);
      outcome = await breaker.execute(async () => {
        let timer: NodeJS.Timeout | undefined;
        try {
          const probePromise = def.probe!();
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new ProbeTimeoutError(name, timeoutMs)),
              timeoutMs,
            );
            // Don't let a pending probe timer keep the process alive.
            timer.unref?.();
          });
          return await Promise.race([probePromise, timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      });
    } catch (err) {
      timedOut = err instanceof ProbeTimeoutError;
      error =
        err instanceof Error && err.name === 'CircuitOpenError'
          ? `circuit open — probe skipped (${this.lastError.get(name) ?? 'previous failure'})`
          : err instanceof Error
            ? err.message
            : String(err ?? 'unknown probe error');
    }

    const latencyMs = Date.now() - startedAt;
    this.recordSample(name, outcome?.ok === true, timedOut);
    this.lastLatencyMs.set(name, latencyMs);

    if (outcome?.ok === true) {
      this.lastSuccessAt.set(name, Date.now());
      this.lastError.set(name, null);
      const degraded =
        def.latencyDegradedMs !== undefined && latencyMs > def.latencyDegradedMs;
      return this.report(def, {
        status: degraded ? 'degraded' : 'ok',
        circuitState: breaker?.currentState ?? null,
      });
    }

    this.lastError.set(name, error ?? outcome?.detail ?? 'probe reported failure');
    return this.report(def, {
      status: 'unavailable',
      circuitState: breaker?.currentState ?? null,
    });
  }

  /** Probe every registered dependency in parallel. Never throws. */
  async checkAll(): Promise<Record<string, DependencyHealthReport>> {
    const entries = await Promise.all(
      [...this.defs.keys()].map(async (name) => {
        try {
          return [name, await this.check(name)] as const;
        } catch (err) {
          // A broken registry entry must not take down the health endpoint.
          const def = this.defs.get(name)!;
          return [
            name,
            this.report(def, {
              status: 'unknown',
              circuitState: null,
              forcedError: err instanceof Error ? err.message : String(err),
            }),
          ] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  private recordSample(name: string, ok: boolean, timedOut: boolean): void {
    const list = this.samples.get(name) ?? [];
    list.push({ ok, timedOut, at: Date.now() });
    while (list.length > MAX_SAMPLES) list.shift();
    this.samples.set(name, list);
  }

  private rates(name: string): { errorRate: number | null; timeoutRate: number | null } {
    const list = this.samples.get(name) ?? [];
    if (list.length === 0) return { errorRate: null, timeoutRate: null };
    const failures = list.filter((s) => !s.ok).length;
    const timeouts = list.filter((s) => s.timedOut).length;
    return { errorRate: failures / list.length, timeoutRate: timeouts / list.length };
  }

  private report(
    def: DependencyDefinition,
    partial: {
      status: DependencyStatus;
      circuitState: CircuitState | null;
      forcedError?: string;
    },
  ): DependencyHealthReport {
    const { errorRate, timeoutRate } = this.rates(def.name);
    const breaker = this.breakers.get(def.name);
    return {
      name: def.name,
      kind: def.kind,
      configured: def.configured,
      status: partial.status,
      latencyMs: this.lastLatencyMs.get(def.name) ?? null,
      errorRate,
      timeoutRate,
      circuitState: partial.circuitState,
      consecutiveFailures: breaker?.snapshot().consecutiveFailures ?? 0,
      lastError: partial.forcedError ?? this.lastError.get(def.name) ?? null,
      lastSuccessAt: this.lastSuccessAt.get(def.name)
        ? new Date(this.lastSuccessAt.get(def.name)!).toISOString()
        : null,
      degradedMode: def.degradedMode,
    };
  }
}
