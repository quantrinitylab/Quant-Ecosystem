// ============================================================================
// SLO Tracker - Service Level Objective Monitoring and Error Budgets
// ============================================================================

import { SLODefinition, SLOStatus, SLOEvent, SLOReport, BurnRateAlert } from '../types';

interface SLOWindow {
  events: SLOEvent[];
  windowStart: number;
}

export class SLOTracker {
  private slos: Map<string, SLODefinition> = new Map();
  private windows: Map<string, SLOWindow> = new Map();
  private alerts: Map<string, BurnRateAlert[]> = new Map();
  private statusCache: Map<string, SLOStatus> = new Map();

  constructor() {}

  // Define a new SLO
  defineSLO(definition: SLODefinition): void {
    this.slos.set(definition.name, definition);
    this.windows.set(definition.name, {
      events: [],
      windowStart: Date.now(),
    });
    this.alerts.set(definition.name, []);
  }

  // Remove an SLO
  removeSLO(name: string): void {
    this.slos.delete(name);
    this.windows.delete(name);
    this.alerts.delete(name);
    this.statusCache.delete(name);
  }

  // Record an event (success or failure)
  recordEvent(
    sloName: string,
    success: boolean,
    latency?: number,
    metadata?: Record<string, string>,
  ): void {
    const window = this.windows.get(sloName);
    if (!window) return;

    const event: SLOEvent = {
      timestamp: Date.now(),
      success,
      latency,
      metadata,
    };

    window.events.push(event);

    // Prune events outside the window
    const slo = this.slos.get(sloName);
    if (slo) {
      const cutoff = Date.now() - slo.window;
      window.events = window.events.filter((e) => e.timestamp >= cutoff);
    }

    // Update status and check alerts
    this.updateStatus(sloName);
    this.checkBurnRateAlerts(sloName);
  }

  // Calculate error budget
  calculateErrorBudget(sloName: string): {
    total: number;
    consumed: number;
    remaining: number;
    remainingPercentage: number;
  } {
    const slo = this.slos.get(sloName);
    const window = this.windows.get(sloName);
    if (!slo || !window) return { total: 0, consumed: 0, remaining: 0, remainingPercentage: 0 };

    const totalRequests = window.events.length;
    if (totalRequests === 0)
      return { total: 0, consumed: 0, remaining: 0, remainingPercentage: 100 };

    // Error budget = (1 - target) * total_requests
    const allowedFailures = (1 - slo.target) * totalRequests;
    const actualFailures = window.events.filter((e) => !e.success).length;
    const remaining = allowedFailures - actualFailures;
    const remainingPercentage = allowedFailures > 0 ? (remaining / allowedFailures) * 100 : 100;

    return {
      total: allowedFailures,
      consumed: actualFailures,
      remaining: Math.max(0, remaining),
      remainingPercentage: Math.max(0, remainingPercentage),
    };
  }

  // Calculate burn rate over a time window
  calculateBurnRate(sloName: string, windowMs?: number): number {
    const slo = this.slos.get(sloName);
    const sloWindow = this.windows.get(sloName);
    if (!slo || !sloWindow) return 0;

    const now = Date.now();
    const lookbackWindow = windowMs || slo.window;
    const cutoff = now - lookbackWindow;

    const relevantEvents = sloWindow.events.filter((e) => e.timestamp >= cutoff);
    if (relevantEvents.length === 0) return 0;

    const failures = relevantEvents.filter((e) => !e.success).length;
    const errorRate = failures / relevantEvents.length;
    const errorBudgetRate = 1 - slo.target; // Allowed error rate

    if (errorBudgetRate === 0) return errorRate > 0 ? Infinity : 0;

    // Burn rate = actual error rate / allowed error rate
    return errorRate / errorBudgetRate;
  }

  // Update SLO status
  private updateStatus(sloName: string): void {
    const slo = this.slos.get(sloName);
    const window = this.windows.get(sloName);
    if (!slo || !window) return;

    const budget = this.calculateErrorBudget(sloName);
    const burnRate = this.calculateBurnRate(sloName);

    let status: 'met' | 'at_risk' | 'violated';
    if (budget.remainingPercentage <= 0) {
      status = 'violated';
    } else if (budget.remainingPercentage < 25) {
      status = 'at_risk';
    } else {
      status = 'met';
    }

    const totalRequests = window.events.length;
    const successes = window.events.filter((e) => e.success).length;
    const currentValue = totalRequests > 0 ? successes / totalRequests : 1;

    const sloStatus: SLOStatus = {
      slo,
      currentValue,
      errorBudgetRemaining: budget.remainingPercentage,
      burnRate,
      status,
      windowStart: Date.now() - slo.window,
      windowEnd: Date.now(),
    };

    this.statusCache.set(sloName, sloStatus);
  }

  // Check burn rate alerts (multi-window alerting)
  private checkBurnRateAlerts(sloName: string): void {
    const slo = this.slos.get(sloName);
    if (!slo) return;

    const alerts: BurnRateAlert[] = [];

    for (const threshold of slo.burnRateThresholds) {
      const longWindowBurnRate = this.calculateBurnRate(sloName, threshold.longWindow);
      const shortWindowBurnRate = this.calculateBurnRate(sloName, threshold.shortWindow);

      // Multi-window alert: both windows must exceed threshold
      const triggered =
        longWindowBurnRate > threshold.burnRate && shortWindowBurnRate > threshold.burnRate;

      alerts.push({
        severity: threshold.severity,
        burnRate: Math.max(longWindowBurnRate, shortWindowBurnRate),
        threshold: threshold.burnRate,
        triggered,
        window: `${this.formatDuration(threshold.shortWindow)} / ${this.formatDuration(threshold.longWindow)}`,
      });
    }

    this.alerts.set(sloName, alerts);
  }

  // Format duration for display
  private formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  }

  // Get SLO status
  getStatus(sloName: string): SLOStatus | null {
    return this.statusCache.get(sloName) || null;
  }

  // Get all SLO statuses
  getAllStatuses(): SLOStatus[] {
    // Update all statuses
    for (const [name] of this.slos) {
      this.updateStatus(name);
    }
    return Array.from(this.statusCache.values());
  }

  // Get burn rate alerts for an SLO
  getAlerts(sloName: string): BurnRateAlert[] {
    return this.alerts.get(sloName) || [];
  }

  // Get all triggered alerts
  getTriggeredAlerts(): { sloName: string; alerts: BurnRateAlert[] }[] {
    const triggered: { sloName: string; alerts: BurnRateAlert[] }[] = [];
    for (const [name, alerts] of this.alerts) {
      const activeAlerts = alerts.filter((a) => a.triggered);
      if (activeAlerts.length > 0) {
        triggered.push({ sloName: name, alerts: activeAlerts });
      }
    }
    return triggered;
  }

  // Calculate time to error budget exhaustion
  calculateTimeToExhaustion(sloName: string): number | null {
    const slo = this.slos.get(sloName);
    const budget = this.calculateErrorBudget(sloName);
    const burnRate = this.calculateBurnRate(sloName);

    if (!slo || burnRate <= 1) return null; // Not burning faster than allowed
    if (budget.remaining <= 0) return 0; // Already exhausted

    // Time = remaining budget / (burn rate - 1) * window
    const errorBudgetRate = 1 - slo.target;
    const excessRate = (burnRate - 1) * errorBudgetRate;
    if (excessRate <= 0) return null;

    const window = this.windows.get(sloName);
    if (!window || window.events.length === 0) return null;

    const eventsPerMs = window.events.length / slo.window;
    const remainingEvents = budget.remaining;
    const excessFailuresPerMs = excessRate * eventsPerMs;

    if (excessFailuresPerMs <= 0) return null;
    return remainingEvents / excessFailuresPerMs;
  }

  // Generate SLO report
  generateReport(sloName: string): SLOReport | null {
    const slo = this.slos.get(sloName);
    if (!slo) return null;

    this.updateStatus(sloName);
    const status = this.statusCache.get(sloName);
    if (!status) return null;

    const alerts = this.alerts.get(sloName) || [];
    const timeToExhaustion = this.calculateTimeToExhaustion(sloName);

    let recommendation: string;
    if (status.status === 'violated') {
      recommendation =
        'Error budget exhausted. Halt deployments and focus on reliability improvements.';
    } else if (status.status === 'at_risk') {
      recommendation =
        'Error budget running low. Reduce deployment velocity and investigate error sources.';
    } else if (status.burnRate > 1) {
      recommendation = 'Burning error budget faster than sustainable. Monitor closely.';
    } else {
      recommendation = 'SLO is being met. Safe to continue normal operations.';
    }

    return {
      sloName,
      status,
      burnRateAlerts: alerts,
      timeToExhaustion,
      recommendation,
    };
  }

  // Create a composite SLO (multiple indicators combined)
  defineCompositeSLO(name: string, componentSLOs: string[], target: number, window: number): void {
    const compositeDef: SLODefinition = {
      name,
      target,
      metric: `composite(${componentSLOs.join(',')})`,
      window,
      burnRateThresholds: [
        { severity: 'critical', shortWindow: 300000, longWindow: 3600000, burnRate: 14 },
        { severity: 'warning', shortWindow: 1800000, longWindow: 21600000, burnRate: 6 },
        { severity: 'info', shortWindow: 3600000, longWindow: 86400000, burnRate: 3 },
      ],
      description: `Composite SLO combining: ${componentSLOs.join(', ')}`,
    };
    this.defineSLO(compositeDef);
  }

  // Get composite SLO status (worst of components)
  getCompositeSLOStatus(componentSLOs: string[]): 'met' | 'at_risk' | 'violated' {
    let worstStatus: 'met' | 'at_risk' | 'violated' = 'met';
    for (const name of componentSLOs) {
      const status = this.statusCache.get(name);
      if (!status) continue;
      if (status.status === 'violated') return 'violated';
      if (status.status === 'at_risk') worstStatus = 'at_risk';
    }
    return worstStatus;
  }

  // Get event count for an SLO
  getEventCount(sloName: string): { total: number; successes: number; failures: number } {
    const window = this.windows.get(sloName);
    if (!window) return { total: 0, successes: 0, failures: 0 };

    const total = window.events.length;
    const successes = window.events.filter((e) => e.success).length;
    return { total, successes, failures: total - successes };
  }

  // Get all SLO definitions
  getSLOs(): SLODefinition[] {
    return Array.from(this.slos.values());
  }

  // Get SLO by name
  getSLO(name: string): SLODefinition | null {
    return this.slos.get(name) || null;
  }

  // Create default SLOs (availability and latency)
  createDefaultSLOs(servicePrefix: string): void {
    this.defineSLO({
      name: `${servicePrefix}_availability`,
      target: 0.999,
      metric: 'success_rate',
      window: 30 * 24 * 3600000, // 30 days
      burnRateThresholds: [
        { severity: 'critical', shortWindow: 300000, longWindow: 3600000, burnRate: 14.4 },
        { severity: 'warning', shortWindow: 1800000, longWindow: 21600000, burnRate: 6 },
        { severity: 'info', shortWindow: 7200000, longWindow: 86400000, burnRate: 3 },
      ],
      description: `${servicePrefix} service availability (99.9%)`,
    });

    this.defineSLO({
      name: `${servicePrefix}_latency`,
      target: 0.95,
      metric: 'latency_p99_under_500ms',
      window: 30 * 24 * 3600000,
      burnRateThresholds: [
        { severity: 'critical', shortWindow: 300000, longWindow: 3600000, burnRate: 14.4 },
        { severity: 'warning', shortWindow: 1800000, longWindow: 21600000, burnRate: 6 },
      ],
      description: `${servicePrefix} latency (95% under 500ms)`,
    });
  }

  // Get stats
  getStats(): {
    totalSLOs: number;
    met: number;
    atRisk: number;
    violated: number;
    triggeredAlerts: number;
  } {
    let met = 0;
    let atRisk = 0;
    let violated = 0;
    let triggeredAlerts = 0;

    for (const [name] of this.slos) {
      this.updateStatus(name);
      const status = this.statusCache.get(name);
      if (status) {
        switch (status.status) {
          case 'met':
            met++;
            break;
          case 'at_risk':
            atRisk++;
            break;
          case 'violated':
            violated++;
            break;
        }
      }
      const alerts = this.alerts.get(name) || [];
      triggeredAlerts += alerts.filter((a) => a.triggered).length;
    }

    return {
      totalSLOs: this.slos.size,
      met,
      atRisk,
      violated,
      triggeredAlerts,
    };
  }

  // Reset
  reset(): void {
    this.slos.clear();
    this.windows.clear();
    this.alerts.clear();
    this.statusCache.clear();
  }
}
