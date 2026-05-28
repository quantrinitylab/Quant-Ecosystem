import type { UsageRecord, UsageReport } from '../types.js';

export class UsageAnalytics {
  private records: UsageRecord[] = [];

  track(keyId: string, endpoint: string, latencyMs: number, isError: boolean): void {
    const day = new Date().toISOString().slice(0, 10);
    const existing = this.records.find(
      (r) => r.keyId === keyId && r.endpoint === endpoint && r.day === day,
    );
    if (existing) {
      existing.count++;
      if (isError) existing.errors++;
      existing.latencyMs.push(latencyMs);
    } else {
      this.records.push({
        keyId,
        endpoint,
        day,
        count: 1,
        errors: isError ? 1 : 0,
        latencyMs: [latencyMs],
      });
    }
  }

  getRecords(keyId: string): UsageRecord[] {
    return this.records.filter((r) => r.keyId === keyId);
  }

  getRecordsByDay(keyId: string, day: string): UsageRecord[] {
    return this.records.filter((r) => r.keyId === keyId && r.day === day);
  }

  generateReport(keyId: string): UsageReport {
    const records = this.getRecords(keyId);
    let totalRequests = 0;
    let totalErrors = 0;
    const allLatencies: number[] = [];

    for (const r of records) {
      totalRequests += r.count;
      totalErrors += r.errors;
      allLatencies.push(...r.latencyMs);
    }

    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const avgLatency =
      allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0;
    const p95Latency = this.percentile(allLatencies, 95);

    return { keyId, totalRequests, totalErrors, errorRate, avgLatency, p95Latency };
  }

  getErrorRate(keyId: string): number {
    const report = this.generateReport(keyId);
    return report.errorRate;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }
}
