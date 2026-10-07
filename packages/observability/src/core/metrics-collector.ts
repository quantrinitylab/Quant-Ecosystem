// ============================================================================
// Metrics Collector - Prometheus-compatible Metrics Collection
// ============================================================================

import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  SummaryQuantile,
  MetricLabels,
  TimerResult,
} from '../types';

interface RateWindow {
  timestamp: number;
  value: number;
}

export class MetricsCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private summaries: Map<
    string,
    {
      values: number[];
      config: { name: string; labels: MetricLabels; window: number; quantiles: number[] };
    }
  > = new Map();
  private timers: Map<string, { startTime: number; histogram: string }> = new Map();
  private rateWindows: Map<string, RateWindow[]> = new Map();
  private defaultBuckets: number[] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100,
  ];
  private metricDescriptions: Map<string, string> = new Map();

  constructor() {}

  // Generate unique key for metric + labels combination
  private makeKey(name: string, labels: MetricLabels): string {
    const sortedLabels = Object.keys(labels)
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');
    return `${name}{${sortedLabels}}`;
  }

  // --- Counter Operations ---

  // Create or get counter
  createCounter(name: string, description?: string, labels: MetricLabels = {}): Counter {
    const key = this.makeKey(name, labels);
    if (!this.counters.has(key)) {
      const counter: Counter = {
        name,
        value: 0,
        labels,
        type: 'counter',
        createdAt: Date.now(),
      };
      this.counters.set(key, counter);
      if (description) this.metricDescriptions.set(name, description);
    }
    return this.counters.get(key)!;
  }

  // Increment counter (monotonic - value must be positive)
  incrementCounter(name: string, value: number = 1, labels: MetricLabels = {}): Counter {
    if (value < 0) {
      throw new Error('Counter increment must be non-negative');
    }
    const key = this.makeKey(name, labels);
    if (!this.counters.has(key)) {
      this.createCounter(name, undefined, labels);
    }
    const counter = this.counters.get(key)!;
    counter.value += value;

    // Track for rate calculation
    this.recordRateValue(key, counter.value);

    return counter;
  }

  // Get counter value
  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.makeKey(name, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  // --- Gauge Operations ---

  // Create or get gauge
  createGauge(name: string, description?: string, labels: MetricLabels = {}): Gauge {
    const key = this.makeKey(name, labels);
    if (!this.gauges.has(key)) {
      const gauge: Gauge = {
        name,
        value: 0,
        labels,
        type: 'gauge',
        lastUpdated: Date.now(),
      };
      this.gauges.set(key, gauge);
      if (description) this.metricDescriptions.set(name, description);
    }
    return this.gauges.get(key)!;
  }

  // Set gauge to absolute value
  setGauge(name: string, value: number, labels: MetricLabels = {}): Gauge {
    const key = this.makeKey(name, labels);
    if (!this.gauges.has(key)) {
      this.createGauge(name, undefined, labels);
    }
    const gauge = this.gauges.get(key)!;
    gauge.value = value;
    gauge.lastUpdated = Date.now();
    return gauge;
  }

  // Increment gauge
  incrementGauge(name: string, value: number = 1, labels: MetricLabels = {}): Gauge {
    const key = this.makeKey(name, labels);
    if (!this.gauges.has(key)) {
      this.createGauge(name, undefined, labels);
    }
    const gauge = this.gauges.get(key)!;
    gauge.value += value;
    gauge.lastUpdated = Date.now();
    return gauge;
  }

  // Decrement gauge
  decrementGauge(name: string, value: number = 1, labels: MetricLabels = {}): Gauge {
    return this.incrementGauge(name, -value, labels);
  }

  // Get gauge value
  getGauge(name: string, labels: MetricLabels = {}): number {
    const key = this.makeKey(name, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  // --- Histogram Operations ---

  // Create histogram with configurable buckets
  createHistogram(
    name: string,
    description?: string,
    buckets?: number[],
    labels: MetricLabels = {},
  ): Histogram {
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      const sortedBuckets = (buckets || this.defaultBuckets).sort((a, b) => a - b);
      const histogram: Histogram = {
        name,
        buckets: sortedBuckets.map((bound) => ({ upperBound: bound, count: 0 })),
        count: 0,
        sum: 0,
        labels,
        type: 'histogram',
        min: Infinity,
        max: -Infinity,
      };
      this.histograms.set(key, histogram);
      if (description) this.metricDescriptions.set(name, description);
    }
    return this.histograms.get(key)!;
  }

  // Observe a value in histogram
  observeHistogram(name: string, value: number, labels: MetricLabels = {}): Histogram {
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.createHistogram(name, undefined, undefined, labels);
    }
    const histogram = this.histograms.get(key)!;

    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);

    // Increment all buckets where value <= upperBound (cumulative)
    for (const bucket of histogram.buckets) {
      if (value <= bucket.upperBound) {
        bucket.count++;
      }
    }

    return histogram;
  }

  // Calculate percentile from histogram using linear interpolation
  getHistogramPercentile(name: string, percentile: number, labels: MetricLabels = {}): number {
    const key = this.makeKey(name, labels);
    const histogram = this.histograms.get(key);
    if (!histogram || histogram.count === 0) return 0;

    const target = percentile * histogram.count;

    // Find the bucket containing the target count
    let previousBound = 0;
    let previousCount = 0;

    for (const bucket of histogram.buckets) {
      if (bucket.count >= target) {
        // Linear interpolation within the bucket
        const bucketRange = bucket.upperBound - previousBound;
        const countInBucket = bucket.count - previousCount;
        if (countInBucket === 0) return bucket.upperBound;

        const fraction = (target - previousCount) / countInBucket;
        return previousBound + fraction * bucketRange;
      }
      previousBound = bucket.upperBound;
      previousCount = bucket.count;
    }

    // Above all buckets
    return histogram.max;
  }

  // Get histogram statistics
  getHistogramStats(
    name: string,
    labels: MetricLabels = {},
  ): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    const key = this.makeKey(name, labels);
    const histogram = this.histograms.get(key);
    if (!histogram || histogram.count === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    return {
      count: histogram.count,
      sum: histogram.sum,
      avg: histogram.sum / histogram.count,
      min: histogram.min === Infinity ? 0 : histogram.min,
      max: histogram.max === -Infinity ? 0 : histogram.max,
      p50: this.getHistogramPercentile(name, 0.5, labels),
      p90: this.getHistogramPercentile(name, 0.9, labels),
      p95: this.getHistogramPercentile(name, 0.95, labels),
      p99: this.getHistogramPercentile(name, 0.99, labels),
    };
  }

  // --- Summary Operations (CKMS-inspired quantile tracking) ---

  // Create summary with configurable quantiles
  createSummary(
    name: string,
    description?: string,
    quantiles?: number[],
    windowMs?: number,
    labels: MetricLabels = {},
  ): void {
    const key = this.makeKey(name, labels);
    if (!this.summaries.has(key)) {
      this.summaries.set(key, {
        values: [],
        config: {
          name,
          labels,
          window: windowMs || 60000,
          quantiles: quantiles || [0.5, 0.9, 0.95, 0.99],
        },
      });
      if (description) this.metricDescriptions.set(name, description);
    }
  }

  // Observe value for summary
  observeSummary(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.makeKey(name, labels);
    if (!this.summaries.has(key)) {
      this.createSummary(name, undefined, undefined, undefined, labels);
    }
    const summary = this.summaries.get(key)!;
    summary.values.push(value);

    // Periodic compression: keep only values within window
    // Simplified CKMS: maintain sorted order and compress when too large
    if (summary.values.length > 10000) {
      // Keep only recent half (simple compression)
      summary.values = summary.values.slice(-5000);
    }
  }

  // Get summary quantile values
  getSummaryQuantiles(name: string, labels: MetricLabels = {}): Summary {
    const key = this.makeKey(name, labels);
    const summary = this.summaries.get(key);
    if (!summary || summary.values.length === 0) {
      return {
        name,
        quantiles: [],
        count: 0,
        sum: 0,
        labels,
        type: 'summary',
        window: 0,
      };
    }

    const sorted = [...summary.values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    const quantiles: SummaryQuantile[] = summary.config.quantiles.map((q) => {
      const index = Math.ceil(q * count) - 1;
      return {
        quantile: q,
        value: sorted[Math.max(0, Math.min(index, count - 1))]!,
      };
    });

    return {
      name,
      quantiles,
      count,
      sum,
      labels,
      type: 'summary',
      window: summary.config.window,
    };
  }

  // --- Timer Utility ---

  // Start a timer
  startTimer(name: string, histogramName: string): string {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timers.set(timerId, { startTime: Date.now(), histogram: histogramName });
    return timerId;
  }

  // Stop timer and record to histogram
  stopTimer(timerId: string, labels: MetricLabels = {}): TimerResult | null {
    const timer = this.timers.get(timerId);
    if (!timer) return null;

    const endTime = Date.now();
    const duration = endTime - timer.startTime;
    this.timers.delete(timerId);

    // Record duration in seconds to histogram
    this.observeHistogram(timer.histogram, duration / 1000, labels);

    return {
      duration,
      startTime: timer.startTime,
      endTime,
    };
  }

  // --- Rate Calculation ---

  // Record value for rate tracking
  private recordRateValue(key: string, value: number): void {
    if (!this.rateWindows.has(key)) {
      this.rateWindows.set(key, []);
    }
    const window = this.rateWindows.get(key)!;
    window.push({ timestamp: Date.now(), value });

    // Keep last 5 minutes of data
    const cutoff = Date.now() - 300000;
    while (window.length > 0 && window[0]!.timestamp < cutoff) {
      window.shift();
    }
  }

  // Calculate rate (events per second) from counter deltas
  getRate(name: string, labels: MetricLabels = {}, windowMs: number = 60000): number {
    const key = this.makeKey(name, labels);
    const window = this.rateWindows.get(key);
    if (!window || window.length < 2) return 0;

    const now = Date.now();
    const cutoff = now - windowMs;
    const relevantPoints = window.filter((p) => p.timestamp >= cutoff);
    if (relevantPoints.length < 2) return 0;

    const first = relevantPoints[0]!;
    const last = relevantPoints[relevantPoints.length - 1]!;
    const timeDelta = (last.timestamp - first.timestamp) / 1000;
    if (timeDelta === 0) return 0;

    return (last.value - first.value) / timeDelta;
  }

  // --- Metric Export (Prometheus-like text format) ---

  // Export all metrics in Prometheus exposition format
  exportMetrics(): string {
    const lines: string[] = [];

    // Export counters
    const counterNames = new Set<string>();
    for (const [, counter] of this.counters) {
      if (!counterNames.has(counter.name)) {
        counterNames.add(counter.name);
        const desc = this.metricDescriptions.get(counter.name) || counter.name;
        lines.push(`# HELP ${counter.name} ${desc}`);
        lines.push(`# TYPE ${counter.name} counter`);
      }
      const labelsStr = this.formatLabels(counter.labels);
      lines.push(`${counter.name}${labelsStr} ${counter.value}`);
    }

    // Export gauges
    const gaugeNames = new Set<string>();
    for (const [, gauge] of this.gauges) {
      if (!gaugeNames.has(gauge.name)) {
        gaugeNames.add(gauge.name);
        const desc = this.metricDescriptions.get(gauge.name) || gauge.name;
        lines.push(`# HELP ${gauge.name} ${desc}`);
        lines.push(`# TYPE ${gauge.name} gauge`);
      }
      const labelsStr = this.formatLabels(gauge.labels);
      lines.push(`${gauge.name}${labelsStr} ${gauge.value}`);
    }

    // Export histograms
    const histNames = new Set<string>();
    for (const [, hist] of this.histograms) {
      if (!histNames.has(hist.name)) {
        histNames.add(hist.name);
        const desc = this.metricDescriptions.get(hist.name) || hist.name;
        lines.push(`# HELP ${hist.name} ${desc}`);
        lines.push(`# TYPE ${hist.name} histogram`);
      }
      const labelsStr = this.formatLabels(hist.labels);
      for (const bucket of hist.buckets) {
        const le = bucket.upperBound === Infinity ? '+Inf' : bucket.upperBound.toString();
        lines.push(
          `${hist.name}_bucket{le="${le}"${labelsStr ? ',' + labelsStr.slice(1, -1) : ''}} ${bucket.count}`,
        );
      }
      lines.push(`${hist.name}_sum${labelsStr} ${hist.sum}`);
      lines.push(`${hist.name}_count${labelsStr} ${hist.count}`);
    }

    // Export summaries
    for (const [, summary] of this.summaries) {
      const quantileData = this.getSummaryQuantiles(summary.config.name, summary.config.labels);
      if (quantileData.count > 0) {
        const desc = this.metricDescriptions.get(summary.config.name) || summary.config.name;
        lines.push(`# HELP ${summary.config.name} ${desc}`);
        lines.push(`# TYPE ${summary.config.name} summary`);
        const labelsStr = this.formatLabels(summary.config.labels);
        for (const q of quantileData.quantiles) {
          lines.push(
            `${summary.config.name}{quantile="${q.quantile}"${labelsStr ? ',' + labelsStr.slice(1, -1) : ''}} ${q.value}`,
          );
        }
        lines.push(`${summary.config.name}_sum${labelsStr} ${quantileData.sum}`);
        lines.push(`${summary.config.name}_count${labelsStr} ${quantileData.count}`);
      }
    }

    return lines.join('\n');
  }

  // Format labels for Prometheus format
  private formatLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
  }

  // --- Aggregation ---

  // Sum values across label sets for a metric name
  sumCountersByName(name: string): number {
    let sum = 0;
    for (const [, counter] of this.counters) {
      if (counter.name === name) sum += counter.value;
    }
    return sum;
  }

  // Get average gauge value across label sets
  averageGaugeByName(name: string): number {
    let sum = 0;
    let count = 0;
    for (const [, gauge] of this.gauges) {
      if (gauge.name === name) {
        sum += gauge.value;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  // --- Reset & Utility ---

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    this.timers.clear();
    this.rateWindows.clear();
  }

  // Reset specific metric
  resetMetric(name: string, labels: MetricLabels = {}): void {
    const key = this.makeKey(name, labels);
    this.counters.delete(key);
    this.gauges.delete(key);
    this.histograms.delete(key);
    this.summaries.delete(key);
    this.rateWindows.delete(key);
  }

  // Get all metric names
  getMetricNames(): string[] {
    const names = new Set<string>();
    for (const [, c] of this.counters) names.add(c.name);
    for (const [, g] of this.gauges) names.add(g.name);
    for (const [, h] of this.histograms) names.add(h.name);
    for (const [, s] of this.summaries) names.add(s.config.name);
    return Array.from(names);
  }

  // Get stats
  getStats(): {
    counters: number;
    gauges: number;
    histograms: number;
    summaries: number;
    activeTimers: number;
  } {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
      summaries: this.summaries.size,
      activeTimers: this.timers.size,
    };
  }
}
