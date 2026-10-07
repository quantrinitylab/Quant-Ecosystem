// ============================================================================
// Search Observability Service - Query metrics and performance tracking
// ============================================================================

export interface QueryRecord {
  query: string;
  latencyMs: number;
  resultCount: number;
  userId: string;
  timestamp: Date;
}

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface SearchMetrics {
  totalQueries: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  zeroResultCount: number;
  avgResultCount: number;
}

export interface SlowQuery {
  query: string;
  latencyMs: number;
  userId: string;
  timestamp: Date;
}

export interface PopularQuery {
  query: string;
  count: number;
}

export interface ZeroResultQuery {
  query: string;
  count: number;
}

/**
 * SearchObservabilityService - Tracks query performance and usage metrics
 *
 * Records query executions and provides aggregated metrics including
 * percentile latencies, popular queries, slow queries, and zero-result queries.
 *
 * NOTE (v1 - demo/development scope): This service uses an in-memory array as its backing
 * store. All metrics data is lost on process restart. This is intentional for the current
 * phase. Production deployment requires a persistence adapter (e.g., time-series database)
 * to retain metrics history across restarts.
 */
export class SearchObservabilityService {
  private readonly records: QueryRecord[] = [];
  private readonly maxRecords: number;

  constructor(options?: { maxRecords?: number }) {
    this.maxRecords = options?.maxRecords ?? 10000;
  }

  recordQuery(query: string, latencyMs: number, resultCount: number, userId: string): void {
    this.records.push({
      query,
      latencyMs,
      resultCount,
      userId,
      timestamp: new Date(),
    });

    // Evict oldest records when exceeding the cap
    if (this.records.length > this.maxRecords) {
      const excess = this.records.length - this.maxRecords;
      this.records.splice(0, excess);
    }
  }

  getMetrics(timeRange?: TimeRange): SearchMetrics {
    const filtered = this.filterByTimeRange(timeRange);

    if (filtered.length === 0) {
      return {
        totalQueries: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        zeroResultCount: 0,
        avgResultCount: 0,
      };
    }

    const latencies = filtered.map((r) => r.latencyMs).sort((a, b) => a - b);
    const totalLatency = latencies.reduce((sum, l) => sum + l, 0);
    const totalResults = filtered.reduce((sum, r) => sum + r.resultCount, 0);
    const zeroResults = filtered.filter((r) => r.resultCount === 0).length;

    return {
      totalQueries: filtered.length,
      avgLatencyMs: Math.round(totalLatency / filtered.length),
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      zeroResultCount: zeroResults,
      avgResultCount: Math.round(totalResults / filtered.length),
    };
  }

  getSlowQueries(thresholdMs: number): SlowQuery[] {
    return this.records
      .filter((r) => r.latencyMs >= thresholdMs)
      .sort((a, b) => b.latencyMs - a.latencyMs)
      .map((r) => ({
        query: r.query,
        latencyMs: r.latencyMs,
        userId: r.userId,
        timestamp: r.timestamp,
      }));
  }

  getPopularQueries(limit: number): PopularQuery[] {
    const counts = new Map<string, number>();
    for (const record of this.records) {
      const normalized = record.query.toLowerCase().trim();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getZeroResultQueries(limit: number): ZeroResultQuery[] {
    const counts = new Map<string, number>();
    for (const record of this.records) {
      if (record.resultCount === 0) {
        const normalized = record.query.toLowerCase().trim();
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private filterByTimeRange(timeRange?: TimeRange): QueryRecord[] {
    if (!timeRange) return this.records;
    return this.records.filter((r) => r.timestamp >= timeRange.from && r.timestamp <= timeRange.to);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
    return sorted[clampedIndex]!;
  }
}
