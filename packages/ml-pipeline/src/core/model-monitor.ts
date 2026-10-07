// ============================================================================
// ML Pipeline - Model Monitor (Drift Detection & Performance Monitoring)
// ============================================================================

import {
  ModelDriftAlert,
  DriftDetectionConfig,
  AlertRule,
  AlertSeverity,
  DistributionBin,
  DriftReport,
} from '../types';
import { postJson, readEnvUrl, warnServingFallback } from './serving';

interface MonitoredMetric {
  name: string;
  values: number[];
  timestamps: number[];
  baselineDistribution: DistributionBin[];
}

interface AlertState {
  rule: AlertRule;
  lastTriggered: number;
  triggerCount: number;
}

/** Per-feature baseline/current windows submitted to a drift-detection backend. */
export interface DriftDetectionRequest {
  modelName: string;
  features: { name: string; baseline: number[]; current: number[] }[];
  predictions: { baseline: number[]; current: number[] };
}

/**
 * Real model-monitoring backend (e.g. Evidently AI or SageMaker Model Monitor).
 * When configured, checkDriftServed delegates drift detection to the backend;
 * otherwise the in-process naive drift statistics are used.
 */
export interface ModelMonitorBackend {
  detectDrift(request: DriftDetectionRequest): Promise<DriftReport>;
  isAvailable(): boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function parseSeverity(v: unknown): AlertSeverity {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'critical' ? v : 'low';
}

function parseAlert(raw: unknown, modelName: string): ModelDriftAlert {
  const obj = asRecord(raw);
  return {
    metric: typeof obj['metric'] === 'string' ? obj['metric'] : 'unknown',
    expected: num(obj['expected']),
    actual: num(obj['actual']),
    severity: parseSeverity(obj['severity']),
    timestamp: typeof obj['timestamp'] === 'number' ? obj['timestamp'] : Date.now(),
    modelName: typeof obj['modelName'] === 'string' ? obj['modelName'] : modelName,
    description: typeof obj['description'] === 'string' ? obj['description'] : '',
  };
}

function parseDriftReport(raw: unknown, modelName: string): DriftReport {
  const obj = asRecord(raw);
  const featureDrifts: { feature: string; psi: number; drifted: boolean }[] = [];
  const fdRaw = obj['featureDrifts'];
  if (Array.isArray(fdRaw)) {
    for (const item of fdRaw) {
      const c = asRecord(item);
      if (typeof c['feature'] === 'string') {
        featureDrifts.push({
          feature: c['feature'],
          psi: num(c['psi']),
          drifted: Boolean(c['drifted']),
        });
      }
    }
  }
  const pd = asRecord(obj['predictionDrift']);
  const performanceMetrics: Record<string, number> = {};
  const pmRaw = asRecord(obj['performanceMetrics']);
  for (const [k, v] of Object.entries(pmRaw)) {
    if (typeof v === 'number') performanceMetrics[k] = v;
  }
  const alerts: ModelDriftAlert[] = [];
  const alertsRaw = obj['alerts'];
  if (Array.isArray(alertsRaw)) {
    for (const a of alertsRaw) alerts.push(parseAlert(a, modelName));
  }
  return {
    modelName: typeof obj['modelName'] === 'string' ? obj['modelName'] : modelName,
    reportTime: typeof obj['reportTime'] === 'number' ? obj['reportTime'] : Date.now(),
    featureDrifts,
    predictionDrift: { psi: num(pd['psi']), drifted: Boolean(pd['drifted']) },
    performanceMetrics,
    alerts,
  };
}

/**
 * HTTP-backed model-monitoring backend. Posts baseline/current windows to a
 * deployed drift-detection service (configured via MODEL_MONITOR_URL) and parses
 * the returned drift report.
 */
export class HttpModelMonitorBackend implements ModelMonitorBackend {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  isAvailable(): boolean {
    return this.url.length > 0;
  }

  async detectDrift(request: DriftDetectionRequest): Promise<DriftReport> {
    const raw = await postJson<unknown>(this.url, request);
    return parseDriftReport(raw, request.modelName);
  }
}

function createModelMonitorBackendFromEnv(): ModelMonitorBackend | null {
  const url = readEnvUrl('MODEL_MONITOR_URL');
  return url ? new HttpModelMonitorBackend(url) : null;
}

/**
 * @simulated The in-process PSI / KL-divergence / KS-test drift statistics are a
 * NAIVE pure-JS implementation used as a fallback. When a real
 * ModelMonitorBackend is configured (injected, or auto-created from
 * MODEL_MONITOR_URL), checkDriftServed delegates drift detection to it and falls
 * back to the naive path on error.
 * Production path: Evidently AI or SageMaker Model Monitor.
 */
export class ModelMonitor {
  private config: DriftDetectionConfig;
  private metrics: Map<string, MonitoredMetric> = new Map();
  private alerts: ModelDriftAlert[] = [];
  private alertStates: Map<string, AlertState> = new Map();
  private baselineFeatures: Map<string, number[]> = new Map();
  private baselinePredictions: number[] = [];
  private modelName: string;
  private retrainingTriggered: boolean = false;
  private readonly backend: ModelMonitorBackend | null;

  constructor(
    modelName: string,
    config: Partial<DriftDetectionConfig> = {},
    backend?: ModelMonitorBackend | null,
  ) {
    this.modelName = modelName;
    this.config = {
      windowSize: config.windowSize ?? 1000,
      threshold: config.threshold ?? 0.25,
      method: config.method ?? 'psi',
      checkInterval: config.checkInterval ?? 3600000,
      alertRules: config.alertRules ?? [],
    };
    for (const rule of this.config.alertRules) {
      this.alertStates.set(rule.metric, { rule, lastTriggered: 0, triggerCount: 0 });
    }
    this.backend = backend ?? createModelMonitorBackendFromEnv();
  }

  /** Whether a real model-monitoring backend is configured and available. */
  isServed(): boolean {
    return this.backend !== null && this.backend.isAvailable();
  }

  /**
   * Detect drift via the served backend when configured, falling back to the
   * naive in-process checkDrift() on absence or error. Alerts returned by the
   * backend are recorded and the retraining trigger is updated.
   */
  async checkDriftServed(): Promise<DriftReport> {
    if (this.backend && this.backend.isAvailable()) {
      try {
        const report = await this.backend.detectDrift(this.buildDriftRequest());
        for (const alert of report.alerts) {
          this.alerts.push(alert);
        }
        if (this.alerts.length > 1000) {
          this.alerts = this.alerts.slice(-500);
        }
        const driftedCount = report.featureDrifts.filter((f) => f.drifted).length;
        if (driftedCount > report.featureDrifts.length * 0.5 || report.predictionDrift.drifted) {
          this.retrainingTriggered = true;
        }
        return report;
      } catch (error) {
        warnServingFallback('model-monitor', 'detectDrift', error);
      }
    }
    return this.checkDrift();
  }

  private buildDriftRequest(): DriftDetectionRequest {
    const features: { name: string; baseline: number[]; current: number[] }[] = [];
    for (const [name, metric] of this.metrics.entries()) {
      if (name === '__predictions__') continue;
      const baseline = this.baselineFeatures.get(name) ?? [];
      features.push({ name, baseline: [...baseline], current: [...metric.values] });
    }
    const predMetric = this.metrics.get('__predictions__');
    return {
      modelName: this.modelName,
      features,
      predictions: {
        baseline: [...this.baselinePredictions],
        current: predMetric ? [...predMetric.values] : [],
      },
    };
  }

  // Set baseline distributions from training data
  setBaseline(features: Map<string, number[]>, predictions: number[]): void {
    this.baselineFeatures = new Map(features);
    this.baselinePredictions = [...predictions];
    // Compute baseline distributions
    for (const [name, values] of features.entries()) {
      const bins = this.computeDistribution(values);
      this.metrics.set(name, {
        name,
        values: [],
        timestamps: [],
        baselineDistribution: bins,
      });
    }
    const predBins = this.computeDistribution(predictions);
    this.metrics.set('__predictions__', {
      name: '__predictions__',
      values: [],
      timestamps: [],
      baselineDistribution: predBins,
    });
  }

  // Record new observations
  recordFeature(name: string, value: number): void {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = { name, values: [], timestamps: [], baselineDistribution: [] };
      this.metrics.set(name, metric);
    }
    metric.values.push(value);
    metric.timestamps.push(Date.now());
    // Maintain window
    if (metric.values.length > this.config.windowSize) {
      metric.values = metric.values.slice(-this.config.windowSize);
      metric.timestamps = metric.timestamps.slice(-this.config.windowSize);
    }
  }

  recordPrediction(value: number): void {
    this.recordFeature('__predictions__', value);
  }

  recordMetricValue(name: string, value: number): void {
    this.recordFeature(name, value);
    this.checkAlertRules(name, value);
  }

  // Compute Population Stability Index
  computePSI(reference: number[], current: number[], numBins: number = 10): number {
    if (reference.length === 0 || current.length === 0) return 0;
    const refBins = this.binValues(reference, numBins);
    const curBins = this.binValues(current, numBins);
    let psi = 0;
    for (let i = 0; i < numBins; i++) {
      const refProp = (refBins[i]! + 0.001) / (reference.length + 0.001 * numBins);
      const curProp = (curBins[i]! + 0.001) / (current.length + 0.001 * numBins);
      psi += (curProp - refProp) * Math.log(curProp / refProp);
    }
    return psi;
  }

  // KL Divergence approximation
  computeKLDivergence(p: number[], q: number[], numBins: number = 10): number {
    if (p.length === 0 || q.length === 0) return 0;
    const pBins = this.binValues(p, numBins);
    const qBins = this.binValues(q, numBins);
    let kl = 0;
    for (let i = 0; i < numBins; i++) {
      const pProp = (pBins[i]! + 0.001) / (p.length + 0.001 * numBins);
      const qProp = (qBins[i]! + 0.001) / (q.length + 0.001 * numBins);
      kl += pProp * Math.log(pProp / qProp);
    }
    return kl;
  }

  // Kolmogorov-Smirnov test statistic
  computeKSStatistic(a: number[], b: number[]): number {
    const combined = [
      ...a.map((v) => ({ value: v, source: 'a' as const })),
      ...b.map((v) => ({ value: v, source: 'b' as const })),
    ].sort((x, y) => x.value - y.value);
    let aCDF = 0,
      bCDF = 0;
    let maxDiff = 0;
    for (const item of combined) {
      if (item.source === 'a') aCDF += 1 / a.length;
      else bCDF += 1 / b.length;
      maxDiff = Math.max(maxDiff, Math.abs(aCDF - bCDF));
    }
    return maxDiff;
  }

  private binValues(values: number[], numBins: number): number[] {
    if (values.length === 0) return new Array(numBins).fill(0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const bins = new Array(numBins).fill(0);
    for (const v of values) {
      const idx = Math.min(Math.floor(((v - min) / range) * numBins), numBins - 1);
      bins[idx]++;
    }
    return bins;
  }

  private computeDistribution(values: number[], numBins: number = 10): DistributionBin[] {
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const binWidth = range / numBins;
    const bins: DistributionBin[] = [];
    const counts = new Array(numBins).fill(0);
    for (const v of values) {
      const idx = Math.min(Math.floor(((v - min) / range) * numBins), numBins - 1);
      counts[idx]++;
    }
    for (let i = 0; i < numBins; i++) {
      bins.push({
        lower: min + i * binWidth,
        upper: min + (i + 1) * binWidth,
        count: counts[i],
        proportion: counts[i] / values.length,
      });
    }
    return bins;
  }

  // Check all features for drift
  checkDrift(): DriftReport {
    const featureDrifts: { feature: string; psi: number; drifted: boolean }[] = [];
    for (const [name, metric] of this.metrics.entries()) {
      if (name === '__predictions__') continue;
      if (metric.values.length === 0) continue;
      const baseline = this.baselineFeatures.get(name);
      if (!baseline || baseline.length === 0) continue;
      let driftScore: number;
      switch (this.config.method) {
        case 'psi':
          driftScore = this.computePSI(baseline, metric.values);
          break;
        case 'kl_divergence':
          driftScore = this.computeKLDivergence(baseline, metric.values);
          break;
        case 'ks_test':
          driftScore = this.computeKSStatistic(baseline, metric.values);
          break;
        default:
          driftScore = this.computePSI(baseline, metric.values);
      }
      const drifted = driftScore > this.config.threshold;
      featureDrifts.push({ feature: name, psi: driftScore, drifted });
      if (drifted) {
        this.createAlert(name, driftScore, 'Feature distribution drift detected');
      }
    }
    // Check prediction drift
    const predMetric = this.metrics.get('__predictions__');
    let predictionDrift = { psi: 0, drifted: false };
    if (predMetric && predMetric.values.length > 0 && this.baselinePredictions.length > 0) {
      const predPSI = this.computePSI(this.baselinePredictions, predMetric.values);
      predictionDrift = { psi: predPSI, drifted: predPSI > this.config.threshold };
      if (predictionDrift.drifted) {
        this.createAlert('predictions', predPSI, 'Prediction distribution drift detected');
      }
    }
    // Collect performance metrics
    const performanceMetrics: Record<string, number> = {};
    for (const [name, metric] of this.metrics.entries()) {
      if (metric.values.length > 0) {
        performanceMetrics[name] = metric.values[metric.values.length - 1]!;
      }
    }
    const report: DriftReport = {
      modelName: this.modelName,
      reportTime: Date.now(),
      featureDrifts,
      predictionDrift,
      performanceMetrics,
      alerts: this.getRecentAlerts(10),
    };
    // Check if retraining should be triggered
    const driftedCount = featureDrifts.filter((f) => f.drifted).length;
    if (driftedCount > featureDrifts.length * 0.5 || predictionDrift.drifted) {
      this.retrainingTriggered = true;
    }
    return report;
  }

  private checkAlertRules(metricName: string, value: number): void {
    for (const rule of this.config.alertRules) {
      if (rule.metric !== metricName) continue;
      let triggered = false;
      switch (rule.operator) {
        case 'gt':
          triggered = value > rule.threshold;
          break;
        case 'lt':
          triggered = value < rule.threshold;
          break;
        case 'gte':
          triggered = value >= rule.threshold;
          break;
        case 'lte':
          triggered = value <= rule.threshold;
          break;
        case 'eq':
          triggered = value === rule.threshold;
          break;
      }
      if (triggered) {
        const state = this.alertStates.get(metricName);
        const now = Date.now();
        if (state && now - state.lastTriggered >= rule.cooldown) {
          this.createAlert(
            metricName,
            value,
            `Alert rule triggered: ${metricName} ${rule.operator} ${rule.threshold}`,
          );
          state.lastTriggered = now;
          state.triggerCount++;
        }
      }
    }
  }

  private createAlert(metric: string, actual: number, description: string): void {
    const severity = this.determineSeverity(actual);
    const alert: ModelDriftAlert = {
      metric,
      expected: this.config.threshold,
      actual,
      severity,
      timestamp: Date.now(),
      modelName: this.modelName,
      description,
    };
    this.alerts.push(alert);
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-500);
    }
  }

  private determineSeverity(score: number): AlertSeverity {
    const threshold = this.config.threshold;
    if (score > threshold * 4) return 'critical';
    if (score > threshold * 2) return 'high';
    if (score > threshold * 1.5) return 'medium';
    return 'low';
  }

  addAlertRule(rule: AlertRule): void {
    this.config.alertRules.push(rule);
    this.alertStates.set(rule.metric, { rule, lastTriggered: 0, triggerCount: 0 });
  }

  getRecentAlerts(limit: number = 50): ModelDriftAlert[] {
    return this.alerts.slice(-limit);
  }

  getAlertsBySeveity(severity: AlertSeverity): ModelDriftAlert[] {
    return this.alerts.filter((a) => a.severity === severity);
  }

  shouldRetrain(): boolean {
    return this.retrainingTriggered;
  }

  resetRetrainingTrigger(): void {
    this.retrainingTriggered = false;
  }

  getMetricHistory(name: string): { values: number[]; timestamps: number[] } {
    const metric = this.metrics.get(name);
    if (!metric) return { values: [], timestamps: [] };
    return { values: [...metric.values], timestamps: [...metric.timestamps] };
  }

  getMonitoredFeatures(): string[] {
    return Array.from(this.metrics.keys()).filter((k) => k !== '__predictions__');
  }

  clear(): void {
    this.metrics.clear();
    this.alerts = [];
    this.retrainingTriggered = false;
  }
}
