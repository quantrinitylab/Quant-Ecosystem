// ============================================================================
// SLO Burn Rate - Multi-window Burn Rate Alerting
// ============================================================================

import { SLODefinition, BurnRateAlert } from './types';
import { SLOTracker } from './core/slo-tracker';

interface BurnRateEvent {
  timestamp: number;
  success: boolean;
  latency?: number;
}

export class BurnRateCalculator {
  private sloDefinition: SLODefinition;
  private tracker: SLOTracker;
  private events: BurnRateEvent[] = [];

  constructor(sloDefinition: SLODefinition) {
    this.sloDefinition = sloDefinition;
    this.tracker = new SLOTracker();
    this.tracker.defineSLO(sloDefinition);
  }

  /**
   * Record an event (success or failure with optional latency).
   */
  addEvent(success: boolean, latency?: number): void {
    const event: BurnRateEvent = {
      timestamp: Date.now(),
      success,
      latency,
    };
    this.events.push(event);
    this.tracker.recordEvent(this.sloDefinition.name, success, latency);
  }

  /**
   * Compute burn rate for a specific time window.
   */
  calculateBurnRate(windowMs: number): number {
    return this.tracker.calculateBurnRate(this.sloDefinition.name, windowMs);
  }

  /**
   * Detect whether the error budget is exhausted.
   */
  detectBudgetExhaustion(): boolean {
    const budget = this.tracker.calculateErrorBudget(this.sloDefinition.name);
    return budget.remaining <= 0;
  }

  /**
   * Calculate time until error budget exhaustion in milliseconds.
   * Returns null if not burning faster than allowed.
   */
  getTimeToExhaustion(): number | null {
    return this.tracker.calculateTimeToExhaustion(this.sloDefinition.name);
  }

  /**
   * Get active alerts based on fast (5m/1h) and slow (30m/6h) burn rate windows.
   */
  getActiveAlerts(): BurnRateAlert[] {
    const alerts: BurnRateAlert[] = [];

    for (const threshold of this.sloDefinition.burnRateThresholds) {
      const shortBurnRate = this.calculateBurnRate(threshold.shortWindow);
      const longBurnRate = this.calculateBurnRate(threshold.longWindow);

      const triggered = shortBurnRate > threshold.burnRate && longBurnRate > threshold.burnRate;

      alerts.push({
        severity: threshold.severity,
        burnRate: Math.max(shortBurnRate, longBurnRate),
        threshold: threshold.burnRate,
        triggered,
        window: `${this.formatDuration(threshold.shortWindow)} / ${this.formatDuration(threshold.longWindow)}`,
      });
    }

    return alerts;
  }

  /**
   * Get the underlying SLO tracker status.
   */
  getStatus() {
    return this.tracker.getStatus(this.sloDefinition.name);
  }

  /**
   * Get error budget information.
   */
  getErrorBudget() {
    return this.tracker.calculateErrorBudget(this.sloDefinition.name);
  }

  private formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  }
}
