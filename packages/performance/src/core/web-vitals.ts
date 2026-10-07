// ============================================================================
// Performance Package - Web Vitals Collector
// FCP/LCP/FID/CLS/TTFB measurement, percentile calculation (p50/p75/p95/p99),
// alerting thresholds, attribution analysis
// ============================================================================

import type {
  WebVitalsMetrics,
  PercentileResult,
  VitalsThreshold,
  VitalsAttribution,
} from '../types';

/** Metric entry with attribution */
interface MetricEntry {
  value: number;
  timestamp: number;
  url: string;
  deviceType: string;
  attribution?: {
    element?: string;
    source?: string;
  };
}

/** Alert generated from threshold violation */
interface VitalsAlert {
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  timestamp: number;
  url: string;
}

/**
 * WebVitalsCollector measures and analyzes Core Web Vitals (FCP, LCP, FID, CLS, TTFB)
 * with real percentile calculation, threshold alerting, and attribution analysis.
 */
export class WebVitalsCollector {
  private readonly fcpEntries: MetricEntry[];
  private readonly lcpEntries: MetricEntry[];
  private readonly fidEntries: MetricEntry[];
  private readonly clsEntries: MetricEntry[];
  private readonly ttfbEntries: MetricEntry[];
  private readonly alerts: VitalsAlert[];
  private readonly thresholds: Map<string, VitalsThreshold>;
  private readonly maxEntries: number;
  private readonly maxAlerts: number;

  constructor(config: { maxEntries?: number; maxAlerts?: number } = {}) {
    this.maxEntries = config.maxEntries ?? 10000;
    this.maxAlerts = config.maxAlerts ?? 500;

    this.fcpEntries = [];
    this.lcpEntries = [];
    this.fidEntries = [];
    this.clsEntries = [];
    this.ttfbEntries = [];
    this.alerts = [];
    this.thresholds = new Map();

    // Initialize default thresholds (from Google's CWV guidelines)
    this.thresholds.set('fcp', { metric: 'fcp', good: 1800, needsImprovement: 3000, poor: 5000 });
    this.thresholds.set('lcp', { metric: 'lcp', good: 2500, needsImprovement: 4000, poor: 6000 });
    this.thresholds.set('fid', { metric: 'fid', good: 100, needsImprovement: 300, poor: 500 });
    this.thresholds.set('cls', { metric: 'cls', good: 0.1, needsImprovement: 0.25, poor: 0.5 });
    this.thresholds.set('ttfb', { metric: 'ttfb', good: 800, needsImprovement: 1800, poor: 3000 });
  }

  /**
   * Record a complete set of Web Vitals metrics.
   */
  record(metrics: WebVitalsMetrics): void {
    const timestamp = metrics.timestamp || Date.now();
    const url = metrics.url || '/';
    const deviceType = metrics.deviceType || 'desktop';

    this.recordMetric(this.fcpEntries, metrics.fcp, url, deviceType, timestamp);
    this.recordMetric(this.lcpEntries, metrics.lcp, url, deviceType, timestamp);
    this.recordMetric(this.fidEntries, metrics.fid, url, deviceType, timestamp);
    this.recordMetric(this.clsEntries, metrics.cls, url, deviceType, timestamp);
    this.recordMetric(this.ttfbEntries, metrics.ttfb, url, deviceType, timestamp);

    // Check thresholds and generate alerts
    this.checkThreshold('fcp', metrics.fcp, url);
    this.checkThreshold('lcp', metrics.lcp, url);
    this.checkThreshold('fid', metrics.fid, url);
    this.checkThreshold('cls', metrics.cls, url);
    this.checkThreshold('ttfb', metrics.ttfb, url);
  }

  /**
   * Record a single FCP measurement with optional attribution.
   */
  recordFCP(value: number, url: string, attribution?: { element?: string; source?: string }): void {
    this.recordMetric(this.fcpEntries, value, url, 'desktop', Date.now(), attribution);
    this.checkThreshold('fcp', value, url);
  }

  /**
   * Record a single LCP measurement with optional attribution.
   */
  recordLCP(value: number, url: string, attribution?: { element?: string; source?: string }): void {
    this.recordMetric(this.lcpEntries, value, url, 'desktop', Date.now(), attribution);
    this.checkThreshold('lcp', value, url);
  }

  /**
   * Record a single FID measurement.
   */
  recordFID(value: number, url: string): void {
    this.recordMetric(this.fidEntries, value, url, 'desktop', Date.now());
    this.checkThreshold('fid', value, url);
  }

  /**
   * Record a single CLS measurement with attribution.
   */
  recordCLS(value: number, url: string, attribution?: { element?: string; source?: string }): void {
    this.recordMetric(this.clsEntries, value, url, 'desktop', Date.now(), attribution);
    this.checkThreshold('cls', value, url);
  }

  /**
   * Record a single TTFB measurement.
   */
  recordTTFB(value: number, url: string): void {
    this.recordMetric(this.ttfbEntries, value, url, 'desktop', Date.now());
    this.checkThreshold('ttfb', value, url);
  }

  /**
   * Calculate percentiles for a given metric using sorted array approach.
   * Implements precise percentile computation: p50, p75, p95, p99.
   */
  getPercentiles(metric: 'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb'): PercentileResult {
    const entries = this.getEntriesForMetric(metric);
    if (entries.length === 0) {
      return { p50: 0, p75: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, count: 0 };
    }

    // Sort values for percentile calculation
    const values = entries.map((e) => e.value).sort((a, b) => a - b);
    const count = values.length;

    // Calculate percentiles using linear interpolation
    const p50 = this.calculatePercentile(values, 0.5);
    const p75 = this.calculatePercentile(values, 0.75);
    const p95 = this.calculatePercentile(values, 0.95);
    const p99 = this.calculatePercentile(values, 0.99);

    // Calculate min, max, mean
    const min = values[0];
    const max = values[count - 1];
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / count;

    return { p50, p75, p95, p99, min, max, mean, count };
  }

  /**
   * Get percentiles filtered by URL.
   */
  getPercentilesForUrl(
    metric: 'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb',
    url: string,
  ): PercentileResult {
    const entries = this.getEntriesForMetric(metric).filter((e) => e.url === url);
    if (entries.length === 0) {
      return { p50: 0, p75: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, count: 0 };
    }

    const values = entries.map((e) => e.value).sort((a, b) => a - b);
    return {
      p50: this.calculatePercentile(values, 0.5),
      p75: this.calculatePercentile(values, 0.75),
      p95: this.calculatePercentile(values, 0.95),
      p99: this.calculatePercentile(values, 0.99),
      min: values[0]!,
      max: values[values.length - 1]!,
      mean: values.reduce((s, v) => s + v, 0) / values.length,
      count: values.length,
    };
  }

  /**
   * Get attribution analysis - identify what's contributing most to poor metrics.
   */
  getAttribution(metric: 'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb'): VitalsAttribution[] {
    const entries = this.getEntriesForMetric(metric);
    const threshold = this.thresholds.get(metric);
    if (!threshold || entries.length === 0) return [];

    // Group by attribution source
    const bySource = new Map<string, { total: number; count: number; elements: Set<string> }>();

    for (const entry of entries) {
      if (entry.value <= threshold.good) continue; // Only analyze poor entries

      const source = entry.attribution?.source ?? 'unknown';
      if (!bySource.has(source)) {
        bySource.set(source, { total: 0, count: 0, elements: new Set() });
      }
      const group = bySource.get(source)!;
      group.total += entry.value;
      group.count++;
      if (entry.attribution?.element) {
        group.elements.add(entry.attribution.element);
      }
    }

    // Generate attributions sorted by contribution
    const attributions: VitalsAttribution[] = [];
    const totalPoorEntries = entries.filter((e) => e.value > threshold.good).length;

    for (const [source, data] of bySource) {
      const contribution = totalPoorEntries > 0 ? data.count / totalPoorEntries : 0;
      const suggestion = this.generateSuggestion(metric, source);

      attributions.push({
        metric,
        element: [...data.elements][0],
        source,
        contribution,
        suggestion,
      });
    }

    return attributions.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Get score rating for a metric value.
   */
  getRating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Get overall Core Web Vitals score (pass/fail).
   */
  getOverallScore(): { pass: boolean; details: Map<string, string> } {
    const details = new Map<string, string>();
    let allPass = true;

    const metrics: Array<'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb'> = [
      'fcp',
      'lcp',
      'fid',
      'cls',
      'ttfb',
    ];

    for (const metric of metrics) {
      const percentiles = this.getPercentiles(metric);
      if (percentiles.count === 0) {
        details.set(metric, 'no-data');
        continue;
      }

      // CWV uses p75 for pass/fail determination
      const rating = this.getRating(metric, percentiles.p75);
      details.set(metric, rating);

      if (rating !== 'good') allPass = false;
    }

    return { pass: allPass, details };
  }

  /**
   * Get recent alerts.
   */
  getAlerts(limit: number = 50): VitalsAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Set custom threshold for a metric.
   */
  setThreshold(metric: string, threshold: VitalsThreshold): void {
    this.thresholds.set(metric, threshold);
  }

  /**
   * Get entry count for a metric.
   */
  getEntryCount(metric: 'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb'): number {
    return this.getEntriesForMetric(metric).length;
  }

  /**
   * Clear all recorded metrics.
   */
  reset(): void {
    this.fcpEntries.length = 0;
    this.lcpEntries.length = 0;
    this.fidEntries.length = 0;
    this.clsEntries.length = 0;
    this.ttfbEntries.length = 0;
    this.alerts.length = 0;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Calculate a specific percentile from a sorted array using linear interpolation.
   * Uses the "exclusive" method (R6 in R's quantile function).
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const n = sortedValues.length;
    if (n === 0) return 0;
    if (n === 1) return sortedValues[0]!;

    // Use linear interpolation between data points
    const rank = percentile * (n - 1);
    const lowerIndex = Math.floor(rank);
    const upperIndex = Math.ceil(rank);
    const fraction = rank - lowerIndex;

    if (upperIndex >= n) return sortedValues[n - 1]!;
    if (lowerIndex === upperIndex) return sortedValues[lowerIndex]!;

    // Linear interpolation between the two surrounding values
    return (
      sortedValues[lowerIndex]! + fraction * (sortedValues[upperIndex]! - sortedValues[lowerIndex]!)
    );
  }

  /** Record a metric entry */
  private recordMetric(
    entries: MetricEntry[],
    value: number,
    url: string,
    deviceType: string,
    timestamp: number,
    attribution?: { element?: string; source?: string },
  ): void {
    entries.push({ value, timestamp, url, deviceType, attribution });

    // Enforce max entries
    if (entries.length > this.maxEntries) {
      entries.shift();
    }
  }

  /** Check threshold and generate alert if violated */
  private checkThreshold(metric: string, value: number, url: string): void {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return;

    if (value > threshold.poor) {
      this.addAlert(metric, value, threshold.poor, 'critical', url);
    } else if (value > threshold.needsImprovement) {
      this.addAlert(metric, value, threshold.needsImprovement, 'warning', url);
    }
  }

  /** Add an alert */
  private addAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical',
    url: string,
  ): void {
    this.alerts.push({ metric, value, threshold, severity, timestamp: Date.now(), url });
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }
  }

  /** Get entries array for a metric name */
  private getEntriesForMetric(metric: 'fcp' | 'lcp' | 'fid' | 'cls' | 'ttfb'): MetricEntry[] {
    switch (metric) {
      case 'fcp':
        return this.fcpEntries;
      case 'lcp':
        return this.lcpEntries;
      case 'fid':
        return this.fidEntries;
      case 'cls':
        return this.clsEntries;
      case 'ttfb':
        return this.ttfbEntries;
    }
  }

  /** Generate optimization suggestion based on metric and source */
  private generateSuggestion(metric: string, source: string): string {
    const suggestions: Record<string, Record<string, string>> = {
      lcp: {
        image:
          'Optimize images: use WebP/AVIF format, add srcset for responsive images, preload hero image',
        text: 'Ensure critical text is rendered without blocking resources. Use font-display: swap',
        video: 'Use poster image for video elements, lazy load below-fold videos',
        unknown: 'Identify and preload the LCP element, reduce server response time',
      },
      cls: {
        image: 'Set explicit width and height attributes on images to prevent layout shift',
        font: 'Use font-display: optional or preload critical fonts to prevent FOIT/FOUT',
        dynamic: 'Reserve space for dynamically loaded content, use CSS contain: layout',
        unknown: 'Identify shifting elements and add explicit dimensions or CSS containment',
      },
      fid: {
        script: 'Break up long tasks, use requestIdleCallback for non-critical work',
        handler: 'Debounce event handlers, move heavy processing to Web Workers',
        unknown: 'Reduce main thread blocking time by code-splitting and deferring non-critical JS',
      },
      fcp: {
        css: 'Inline critical CSS, defer non-critical stylesheets',
        font: 'Preload critical fonts, use system font stack as fallback',
        unknown: 'Reduce server response time, eliminate render-blocking resources',
      },
      ttfb: {
        server: 'Implement server-side caching, use CDN, optimize database queries',
        redirect: 'Minimize redirects, use HTTP/2 server push',
        unknown: 'Reduce server processing time, implement edge caching',
      },
    };

    return (
      suggestions[metric]?.[source] ??
      suggestions[metric]?.['unknown'] ??
      'Investigate and optimize the identified source'
    );
  }
}
