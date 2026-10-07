/**
 * SLO definitions + error-budget evaluator (K12 — reliability).
 *
 * Implements `docs/quant-architecture/products/quantmail/backend/sre-slos.md`:
 * each critical journey defines an availability target, a latency target, an
 * error budget and a measurement window. The {@link SloTracker} consumes real
 * request observations (wired by the `sloPlugin` Fastify plugin), computes
 * burn rates, and fires burn-rate alerts into the existing metrics/logging
 * pipeline — no new monitoring stack.
 *
 * Burn-rate math follows the Google SRE workbook: burnRate = observed error
 * ratio / budgeted error ratio. A burn rate of 1 consumes budget exactly on
 * target; 14.4 exhausts a 30-day budget in ~2 days (fast-burn / page), 6 is
 * the slow-burn (ticket) threshold. Defaults are configurable per tracker.
 */
export interface SloDefinition {
  /** Stable id, e.g. 'quantmail.inbox-read'. Used as a Prometheus label. */
  id: string;
  /** Human journey name, e.g. 'Inbox read'. */
  journey: string;
  description?: string;
  /** Availability target 0..1, e.g. 0.999. */
  availabilityTarget: number;
  /** Latency target in ms evaluated at `latencyPercentile`. */
  latencyTargetMs: number;
  /** Latency percentile, e.g. 0.99 for p99. Default 0.99. */
  latencyPercentile?: number;
  /** Measurement window in hours. Default 720 (30 days). */
  windowHours?: number;
}

export interface SloObservation {
  /** False for 5xx / timeouts / handler throws (server-side failures). */
  ok: boolean;
  latencyMs: number;
  at?: number;
}

export type SloSeverity = 'fast' | 'slow';

export interface BurnRateAlert {
  sloId: string;
  journey: string;
  severity: SloSeverity;
  /** Availability burn rate, or the latency burn rate if that triggered. */
  burnRate: number;
  availabilityBurnRate: number;
  latencyBurnRate: number;
  budgetConsumedPct: number;
  windowHours: number;
  at: string;
}

export type SloStatus = 'healthy' | 'warning' | 'critical' | 'no_data';

export interface SloEvaluation {
  sloId: string;
  journey: string;
  status: SloStatus;
  windowHours: number;
  observations: number;
  availability: {
    target: number;
    errorRate: number | null;
    budgetConsumedPct: number | null;
    burnRate: number | null;
  };
  latency: {
    targetMs: number;
    percentile: number;
    valueMs: number | null;
    budgetConsumedPct: number | null;
    burnRate: number | null;
  };
}

export type SloAlertHandler = (alert: BurnRateAlert) => void;

export interface SloTrackerOptions {
  fastBurnThreshold?: number;
  slowBurnThreshold?: number;
  onAlert?: SloAlertHandler[];
  /** Max observations retained per SLO (ring buffer). Default 20_000. */
  maxObservations?: number;
}

const DEFAULT_FAST_BURN = 14.4;
const DEFAULT_SLOW_BURN = 6;
const DEFAULT_MAX_OBSERVATIONS = 20_000;
const DEFAULT_WINDOW_HOURS = 720;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? NaN;
}

export class SloTracker {
  private readonly defs = new Map<string, Required<SloDefinition>>();
  private readonly observations = new Map<string, SloObservation[]>();
  private readonly fastBurnThreshold: number;
  private readonly slowBurnThreshold: number;
  private readonly alertHandlers: SloAlertHandler[];
  private readonly maxObservations: number;
  /** Active (not yet cleared) alert severities per SLO, for dedupe + re-arm. */
  private readonly activeAlerts = new Map<string, Set<SloSeverity>>();

  constructor(defs: SloDefinition[], options: SloTrackerOptions = {}) {
    for (const def of defs) {
      if (def.availabilityTarget <= 0 || def.availabilityTarget >= 1) {
        throw new Error(`SLO '${def.id}': availabilityTarget must be in (0, 1)`);
      }
      this.defs.set(def.id, {
        id: def.id,
        journey: def.journey,
        description: def.description ?? '',
        availabilityTarget: def.availabilityTarget,
        latencyTargetMs: def.latencyTargetMs,
        latencyPercentile: def.latencyPercentile ?? 0.99,
        windowHours: def.windowHours ?? DEFAULT_WINDOW_HOURS,
      });
      this.observations.set(def.id, []);
      this.activeAlerts.set(def.id, new Set());
    }
    this.fastBurnThreshold = options.fastBurnThreshold ?? DEFAULT_FAST_BURN;
    this.slowBurnThreshold = options.slowBurnThreshold ?? DEFAULT_SLOW_BURN;
    this.alertHandlers = options.onAlert ?? [];
    this.maxObservations = options.maxObservations ?? DEFAULT_MAX_OBSERVATIONS;
  }

  onAlert(handler: SloAlertHandler): void {
    this.alertHandlers.push(handler);
  }

  sloIds(): string[] {
    return [...this.defs.keys()];
  }

  definition(sloId: string): Required<SloDefinition> {
    const def = this.defs.get(sloId);
    if (!def) throw new Error(`unknown SLO '${sloId}'`);
    return def;
  }

  /** Record one journey observation; evaluates burn rate and fires alerts. */
  record(sloId: string, observation: SloObservation): void {
    const def = this.defs.get(sloId);
    if (!def) throw new Error(`unknown SLO '${sloId}'`);
    const list = this.observations.get(sloId)!;
    list.push({ at: Date.now(), ...observation });
    while (list.length > this.maxObservations) list.shift();
    this.evaluateAndAlert(sloId);
  }

  evaluate(sloId: string): SloEvaluation {
    const def = this.definition(sloId);
    const windowStart = Date.now() - def.windowHours * 3_600_000;
    const inWindow = (this.observations.get(sloId) ?? []).filter((o) => (o.at ?? 0) >= windowStart);
    const total = inWindow.length;

    if (total === 0) {
      return {
        sloId,
        journey: def.journey,
        status: 'no_data',
        windowHours: def.windowHours,
        observations: 0,
        availability: { target: def.availabilityTarget, errorRate: null, budgetConsumedPct: null, burnRate: null },
        latency: { targetMs: def.latencyTargetMs, percentile: def.latencyPercentile, valueMs: null, budgetConsumedPct: null, burnRate: null },
      };
    }

    // Availability: burn rate = observed error ratio / budgeted error ratio.
    const failures = inWindow.filter((o) => !o.ok).length;
    const errorRate = failures / total;
    const budgetRatio = 1 - def.availabilityTarget;
    const availabilityBurnRate = errorRate / budgetRatio;
    const availabilityBudgetConsumedPct = Math.min(
      1000,
      (failures / Math.max(1e-9, total * budgetRatio)) * 100,
    );

    // Latency: fraction of observations slower than target vs the budgeted
    // fraction (1 - percentile). Same burn-rate math as availability.
    const slowCount = inWindow.filter((o) => o.latencyMs > def.latencyTargetMs).length;
    const latencyBudgetRatio = 1 - def.latencyPercentile;
    const latencyBurnRate = slowCount / total / latencyBudgetRatio;
    const latencyBudgetConsumedPct = Math.min(
      1000,
      (slowCount / Math.max(1e-9, total * latencyBudgetRatio)) * 100,
    );
    const sortedLatencies = inWindow.map((o) => o.latencyMs).sort((a, b) => a - b);
    const latencyValueMs = percentile(sortedLatencies, def.latencyPercentile);

    const status: SloStatus =
      availabilityBurnRate >= this.fastBurnThreshold || latencyBurnRate >= this.fastBurnThreshold
        ? 'critical'
        : availabilityBurnRate >= this.slowBurnThreshold || latencyBurnRate >= this.slowBurnThreshold
          ? 'warning'
          : 'healthy';

    return {
      sloId,
      journey: def.journey,
      status,
      windowHours: def.windowHours,
      observations: total,
      availability: {
        target: def.availabilityTarget,
        errorRate,
        budgetConsumedPct: availabilityBudgetConsumedPct,
        burnRate: availabilityBurnRate,
      },
      latency: {
        targetMs: def.latencyTargetMs,
        percentile: def.latencyPercentile,
        valueMs: latencyValueMs,
        budgetConsumedPct: latencyBudgetConsumedPct,
        burnRate: latencyBurnRate,
      },
    };
  }

  evaluateAll(): SloEvaluation[] {
    return this.sloIds().map((id) => this.evaluate(id));
  }

  private evaluateAndAlert(sloId: string): void {
    const evaluation = this.evaluate(sloId);
    const active = this.activeAlerts.get(sloId)!;

    const severities: SloSeverity[] = [];
    if (evaluation.status === 'critical') severities.push('fast');
    else if (evaluation.status === 'warning') severities.push('slow');

    for (const severity of severities) {
      if (active.has(severity)) continue; // dedupe: already burning, don't re-fire
      active.add(severity);
      const alert: BurnRateAlert = {
        sloId,
        journey: evaluation.journey,
        severity,
        burnRate: Math.max(
          evaluation.availability.burnRate ?? 0,
          evaluation.latency.burnRate ?? 0,
        ),
        availabilityBurnRate: evaluation.availability.burnRate ?? 0,
        latencyBurnRate: evaluation.latency.burnRate ?? 0,
        budgetConsumedPct: Math.max(
          evaluation.availability.budgetConsumedPct ?? 0,
          evaluation.latency.budgetConsumedPct ?? 0,
        ),
        windowHours: evaluation.windowHours,
        at: new Date().toISOString(),
      };
      for (const handler of this.alertHandlers) {
        try {
          handler(alert);
        } catch {
          // Alert handlers must never break request recording.
        }
      }
    }

    // Re-arm: when the SLO is healthy again, clear active alerts so the next
    // burn fires fresh.
    if (evaluation.status === 'healthy' || evaluation.status === 'no_data') {
      active.clear();
    } else if (evaluation.status === 'warning') {
      active.delete('fast');
    }
  }
}
