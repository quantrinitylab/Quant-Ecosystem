/**
 * Quanty metrics contracts.
 *
 * Typed contracts for counters, gauges, and histograms emitted by Quanty
 * runtime components. In-memory recording only — no exporters, no network.
 * Counter values are monotonic; gauges hold the latest value; histograms
 * keep count/sum/min/max (percentiles are intentionally not computed here).
 */

export type MetricKind = 'counter' | 'gauge' | 'histogram';

export interface MetricLabels {
  [key: string]: string;
}

export interface MetricDescriptor {
  name: string;
  kind: MetricKind;
  description?: string;
  unit?: string;
}

export interface CounterSnapshot {
  kind: 'counter';
  name: string;
  labels: MetricLabels;
  value: number;
}

export interface GaugeSnapshot {
  kind: 'gauge';
  name: string;
  labels: MetricLabels;
  value: number;
}

export interface HistogramSnapshot {
  kind: 'histogram';
  name: string;
  labels: MetricLabels;
  count: number;
  sum: number;
  min: number;
  max: number;
}

export type MetricSnapshot = CounterSnapshot | GaugeSnapshot | HistogramSnapshot;

export interface MetricsRecorder {
  /** Counters only move forward; negative deltas throw. */
  incrementCounter(name: string, value?: number, labels?: MetricLabels, description?: string): void;
  /** Gauges hold the most recently set value. */
  setGauge(name: string, value: number, labels?: MetricLabels, description?: string): void;
  observeHistogram(name: string, value: number, labels?: MetricLabels, description?: string): void;
  snapshot(): MetricSnapshot[];
  /** Reset one metric series, or everything when no name is given. */
  reset(name?: string): void;
}

function labelKey(name: string, labels: MetricLabels): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`);
  return `${name}\x00${parts.join(',')}`;
}

function assertMetricName(name: string): void {
  if (!name || !name.trim()) throw new Error('METRIC_NAME_REQUIRED');
}

function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new Error(`METRIC_VALUE_NOT_FINITE:${what}`);
}

/**
 * In-memory metrics recorder for tests and local tooling. Series are keyed
 * by metric name plus sorted label set. Snapshots are detached copies.
 */
export class InMemoryMetricsRecorder implements MetricsRecorder {
  private readonly counters = new Map<string, { name: string; labels: MetricLabels; value: number }>();
  private readonly gauges = new Map<string, { name: string; labels: MetricLabels; value: number }>();
  private readonly histograms = new Map<
    string,
    { name: string; labels: MetricLabels; count: number; sum: number; min: number; max: number }
  >();

  incrementCounter(name: string, value = 1, labels: MetricLabels = {}): void {
    assertMetricName(name);
    assertFinite(value, name);
    if (value < 0) throw new Error(`COUNTER_MUST_NOT_DECREASE:${name}`);
    const key = labelKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, { name, labels: { ...labels }, value });
    }
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    assertMetricName(name);
    assertFinite(value, name);
    this.gauges.set(labelKey(name, labels), { name, labels: { ...labels }, value });
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    assertMetricName(name);
    assertFinite(value, name);
    const key = labelKey(name, labels);
    const existing = this.histograms.get(key);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
    } else {
      this.histograms.set(key, { name, labels: { ...labels }, count: 1, sum: value, min: value, max: value });
    }
  }

  snapshot(): MetricSnapshot[] {
    const out: MetricSnapshot[] = [];
    for (const c of this.counters.values()) {
      out.push({ kind: 'counter', name: c.name, labels: { ...c.labels }, value: c.value });
    }
    for (const g of this.gauges.values()) {
      out.push({ kind: 'gauge', name: g.name, labels: { ...g.labels }, value: g.value });
    }
    for (const h of this.histograms.values()) {
      out.push({
        kind: 'histogram',
        name: h.name,
        labels: { ...h.labels },
        count: h.count,
        sum: h.sum,
        min: h.min,
        max: h.max,
      });
    }
    return out;
  }

  reset(name?: string): void {
    if (name === undefined) {
      this.counters.clear();
      this.gauges.clear();
      this.histograms.clear();
      return;
    }
    for (const [key, series] of this.counters) {
      if (series.name === name) this.counters.delete(key);
    }
    for (const [key, series] of this.gauges) {
      if (series.name === name) this.gauges.delete(key);
    }
    for (const [key, series] of this.histograms) {
      if (series.name === name) this.histograms.delete(key);
    }
  }
}
