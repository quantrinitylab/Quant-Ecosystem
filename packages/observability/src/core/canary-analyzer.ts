// ============================================================================
// Canary Analyzer - Statistical Analysis for Canary Deployments
// ============================================================================

import { CanaryMetrics, CanaryVerdict, CanaryConfig, CanaryReport, CanaryWindow } from '../types';

export class CanaryAnalyzer {
  private config: CanaryConfig;
  private windows: CanaryWindow[] = [];
  private baselineData: Map<string, number[]> = new Map();
  private canaryData: Map<string, number[]> = new Map();
  private reports: CanaryReport[] = [];
  private analysisCount: number = 0;

  constructor(config?: Partial<CanaryConfig>) {
    this.config = {
      confidenceLevel: config?.confidenceLevel ?? 0.95,
      minimumSampleSize: config?.minimumSampleSize ?? 30,
      metrics: config?.metrics ?? ['latency', 'error_rate', 'throughput'],
      analysisInterval: config?.analysisInterval ?? 60000,
      maxDuration: config?.maxDuration ?? 3600000,
    };
  }

  // Record baseline metric data point
  recordBaseline(metricName: string, value: number): void {
    if (!this.baselineData.has(metricName)) {
      this.baselineData.set(metricName, []);
    }
    this.baselineData.get(metricName)!.push(value);
  }

  // Record canary metric data point
  recordCanary(metricName: string, value: number): void {
    if (!this.canaryData.has(metricName)) {
      this.canaryData.set(metricName, []);
    }
    this.canaryData.get(metricName)!.push(value);
  }

  // Record batch of baseline data
  recordBaselineBatch(metricName: string, values: number[]): void {
    if (!this.baselineData.has(metricName)) {
      this.baselineData.set(metricName, []);
    }
    this.baselineData.get(metricName)!.push(...values);
  }

  // Record batch of canary data
  recordCanaryBatch(metricName: string, values: number[]): void {
    if (!this.canaryData.has(metricName)) {
      this.canaryData.set(metricName, []);
    }
    this.canaryData.get(metricName)!.push(...values);
  }

  // Perform Mann-Whitney U test (non-parametric comparison)
  mannWhitneyUTest(sample1: number[], sample2: number[]): { uStatistic: number; pValue: number } {
    const n1 = sample1.length;
    const n2 = sample2.length;
    if (n1 === 0 || n2 === 0) return { uStatistic: 0, pValue: 1 };

    // Combine and rank all observations
    const combined: { value: number; group: number }[] = [
      ...sample1.map((v) => ({ value: v, group: 1 })),
      ...sample2.map((v) => ({ value: v, group: 2 })),
    ];
    combined.sort((a, b) => a.value - b.value);

    // Assign ranks (handle ties with average rank)
    const ranks = new Array(combined.length);
    let i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j]!.value === combined[i]!.value) {
        j++;
      }
      const averageRank = (i + j + 1) / 2; // 1-indexed average
      for (let k = i; k < j; k++) {
        ranks[k] = averageRank;
      }
      i = j;
    }

    // Sum ranks for group 1
    let r1 = 0;
    for (let k = 0; k < combined.length; k++) {
      if (combined[k]!.group === 1) {
        r1 += ranks[k];
      }
    }

    // Calculate U statistic
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const u2 = n1 * n2 - u1;
    const uStatistic = Math.min(u1, u2);

    // Normal approximation for p-value (large sample)
    const meanU = (n1 * n2) / 2;
    const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

    if (stdU === 0) return { uStatistic, pValue: 1 };

    const z = (uStatistic - meanU) / stdU;
    const pValue = 2 * this.normalCDF(-Math.abs(z)); // Two-tailed

    return { uStatistic, pValue };
  }

  // Chi-squared test for categorical data (e.g., error codes)
  chiSquaredTest(
    observed1: number[],
    observed2: number[],
  ): { chiSquared: number; pValue: number; degreesOfFreedom: number } {
    const k = Math.min(observed1.length, observed2.length);
    if (k === 0) return { chiSquared: 0, pValue: 1, degreesOfFreedom: 0 };

    const total1 = observed1.reduce((a, b) => a + b, 0);
    const total2 = observed2.reduce((a, b) => a + b, 0);
    const grandTotal = total1 + total2;

    if (grandTotal === 0) return { chiSquared: 0, pValue: 1, degreesOfFreedom: k - 1 };

    let chiSquared = 0;
    for (let i = 0; i < k; i++) {
      const rowTotal = observed1[i]! + observed2[i]!;
      const expected1 = (rowTotal * total1) / grandTotal;
      const expected2 = (rowTotal * total2) / grandTotal;

      if (expected1 > 0) {
        chiSquared += Math.pow(observed1[i]! - expected1, 2) / expected1;
      }
      if (expected2 > 0) {
        chiSquared += Math.pow(observed2[i]! - expected2, 2) / expected2;
      }
    }

    const df = k - 1;
    const pValue = 1 - this.chiSquaredCDF(chiSquared, df);

    return { chiSquared, pValue, degreesOfFreedom: df };
  }

  // Analyze a single metric
  analyzeMetric(metricName: string): CanaryMetrics {
    const baseline = this.baselineData.get(metricName) || [];
    const canary = this.canaryData.get(metricName) || [];

    if (
      baseline.length < this.config.minimumSampleSize ||
      canary.length < this.config.minimumSampleSize
    ) {
      return {
        metricName,
        baseline,
        canary,
        pValue: 1,
        significant: false,
      };
    }

    const { pValue } = this.mannWhitneyUTest(baseline, canary);
    const significant = pValue < 1 - this.config.confidenceLevel;

    return {
      metricName,
      baseline,
      canary,
      pValue,
      significant,
    };
  }

  // Analyze all metrics and produce verdict
  analyze(): CanaryReport {
    this.analysisCount++;
    const metricResults: CanaryMetrics[] = [];

    for (const metricName of this.config.metrics) {
      const result = this.analyzeMetric(metricName);
      metricResults.push(result);
    }

    // Determine verdict
    const verdict = this.determineVerdict(metricResults);
    const totalSamples = Math.min(
      ...this.config.metrics.map(
        (m) => (this.baselineData.get(m)?.length || 0) + (this.canaryData.get(m)?.length || 0),
      ),
    );

    const report: CanaryReport = {
      verdict,
      metrics: metricResults,
      sampleSize: totalSamples,
      duration: this.analysisCount * this.config.analysisInterval,
      timestamp: Date.now(),
      recommendation: this.generateRecommendation(verdict, metricResults),
    };

    this.reports.push(report);
    return report;
  }

  // Determine overall verdict from metric results
  private determineVerdict(metrics: CanaryMetrics[]): CanaryVerdict {
    const hasInsufficientData = metrics.some(
      (m) =>
        m.baseline.length < this.config.minimumSampleSize ||
        m.canary.length < this.config.minimumSampleSize,
    );

    if (hasInsufficientData) return 'inconclusive';

    // Check if canary is significantly worse than baseline
    const significantDegradations = metrics.filter((m) => {
      if (!m.significant) return false;
      // Check if canary is worse (higher latency, higher error rate)
      const baselineMedian = this.median(m.baseline);
      const canaryMedian = this.median(m.canary);
      return canaryMedian > baselineMedian;
    });

    if (significantDegradations.length > 0) return 'fail';

    // All metrics pass (no significant degradation)
    const allAnalyzed = metrics.every((m) => m.baseline.length >= this.config.minimumSampleSize);
    if (allAnalyzed) return 'pass';

    return 'inconclusive';
  }

  // Generate recommendation based on verdict
  private generateRecommendation(verdict: CanaryVerdict, metrics: CanaryMetrics[]): string {
    switch (verdict) {
      case 'pass':
        return 'Canary shows no significant degradation. Safe to proceed with rollout.';
      case 'fail':
        const failedMetrics = metrics.filter((m) => m.significant).map((m) => m.metricName);
        return `Canary shows degradation in: ${failedMetrics.join(', ')}. Recommend rollback.`;
      case 'inconclusive':
        return 'Insufficient data for conclusive analysis. Continue collecting samples.';
    }
  }

  // Calculate effect size (Cohen's d)
  calculateEffectSize(baseline: number[], canary: number[]): number {
    if (baseline.length < 2 || canary.length < 2) return 0;

    const meanBaseline = this.mean(baseline);
    const meanCanary = this.mean(canary);
    const stdBaseline = this.standardDeviation(baseline);
    const stdCanary = this.standardDeviation(canary);

    // Pooled standard deviation
    const pooledStd = Math.sqrt(
      ((baseline.length - 1) * stdBaseline * stdBaseline +
        (canary.length - 1) * stdCanary * stdCanary) /
        (baseline.length + canary.length - 2),
    );

    if (pooledStd === 0) return 0;
    return (meanCanary - meanBaseline) / pooledStd;
  }

  // Normal CDF approximation (Abramowitz and Stegun)
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  // Chi-squared CDF approximation using regularized incomplete gamma function
  private chiSquaredCDF(x: number, k: number): number {
    if (x <= 0 || k <= 0) return 0;
    // Wilson-Hilferty approximation
    const z = Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k));
    const denom = Math.sqrt(2 / (9 * k));
    if (denom === 0) return 0;
    return this.normalCDF(z / denom);
  }

  // Statistical helpers
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
  }

  // Save current window
  saveWindow(): void {
    const window: CanaryWindow = {
      startTime: Date.now() - this.analysisCount * this.config.analysisInterval,
      endTime: Date.now(),
      baselineData: Object.fromEntries(this.baselineData),
      canaryData: Object.fromEntries(this.canaryData),
    };
    this.windows.push(window);
  }

  // Should trigger rollback
  shouldRollback(): boolean {
    if (this.reports.length === 0) return false;
    const latestReport = this.reports[this.reports.length - 1]!;
    return latestReport.verdict === 'fail';
  }

  // Get reports
  getReports(): CanaryReport[] {
    return [...this.reports];
  }

  // Get latest report
  getLatestReport(): CanaryReport | null {
    return this.reports.length > 0 ? this.reports[this.reports.length - 1]! : null;
  }

  // Get metric summary
  getMetricSummary(metricName: string): {
    baselineCount: number;
    canaryCount: number;
    baselineMean: number;
    canaryMean: number;
    effectSize: number;
  } {
    const baseline = this.baselineData.get(metricName) || [];
    const canary = this.canaryData.get(metricName) || [];
    return {
      baselineCount: baseline.length,
      canaryCount: canary.length,
      baselineMean: this.mean(baseline),
      canaryMean: this.mean(canary),
      effectSize: this.calculateEffectSize(baseline, canary),
    };
  }

  // Get config
  getConfig(): CanaryConfig {
    return { ...this.config };
  }

  // Update config
  updateConfig(config: Partial<CanaryConfig>): void {
    Object.assign(this.config, config);
  }

  // Has minimum sample size for analysis
  hasMinimumSamples(): boolean {
    for (const metric of this.config.metrics) {
      const baseline = this.baselineData.get(metric) || [];
      const canary = this.canaryData.get(metric) || [];
      if (
        baseline.length < this.config.minimumSampleSize ||
        canary.length < this.config.minimumSampleSize
      ) {
        return false;
      }
    }
    return true;
  }

  // Get total sample count
  getTotalSamples(): number {
    let total = 0;
    for (const [, values] of this.baselineData) total += values.length;
    for (const [, values] of this.canaryData) total += values.length;
    return total;
  }

  // Reset
  reset(): void {
    this.baselineData.clear();
    this.canaryData.clear();
    this.windows = [];
    this.reports = [];
    this.analysisCount = 0;
  }
}
