// ============================================================================
// Performance Package - Database Optimizer
// Slow query detection, index advisor, connection pool monitor, partitioning
// ============================================================================

/** Slow query detection result */
export interface SlowQueryResult {
  query: string;
  durationMs: number;
  threshold: number;
  isSlow: boolean;
  recommendation: string;
}

/** Query pattern for index analysis */
export interface QueryPatternInput {
  query: string;
  frequency: number;
  avgDurationMs: number;
  table: string;
  columns: string[];
}

/** Index recommendation */
export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'BTREE' | 'HASH' | 'COMPOSITE' | 'COVERING';
  reason: string;
  estimatedImprovement: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/** Connection pool statistics */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgAcquireTimeMs: number;
  maxConnections: number;
}

/** Pool health result */
export interface PoolHealthResult {
  healthy: boolean;
  utilization: number;
  saturation: number;
  recommendations: string[];
}

/** Table statistics for partition analysis */
export interface TableStats {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  avgRowSizeBytes: number;
  hasTimestampColumn: boolean;
  hasTenantColumn: boolean;
  readWriteRatio: number;
  oldestRowAge: number;
}

/** Partition recommendation */
export interface PartitionRecommendation {
  tableName: string;
  strategy: 'RANGE' | 'LIST' | 'HASH' | 'NONE';
  partitionKey: string;
  reason: string;
  estimatedBenefit: string;
}

/**
 * DatabaseOptimizer provides actionable database optimization recommendations
 * including slow query detection, index advising, connection pool monitoring,
 * and partition recommendations.
 */
export class DatabaseOptimizer {
  private readonly defaultThresholdMs: number;
  private readonly slowQueries: SlowQueryResult[];
  private readonly maxSlowQueryLog: number;

  constructor(config: { defaultThresholdMs?: number; maxSlowQueryLog?: number } = {}) {
    this.defaultThresholdMs = config.defaultThresholdMs ?? 100;
    this.maxSlowQueryLog = config.maxSlowQueryLog ?? 500;
    this.slowQueries = [];
  }

  /**
   * Detect if a query is slow and provide recommendations.
   */
  slowQueryDetector(query: string, durationMs: number, threshold?: number): SlowQueryResult {
    const thresholdMs = threshold ?? this.defaultThresholdMs;
    const isSlow = durationMs > thresholdMs;

    let recommendation = 'Query performance is acceptable.';
    if (isSlow) {
      recommendation = this.generateSlowQueryRecommendation(query, durationMs, thresholdMs);
    }

    const result: SlowQueryResult = {
      query,
      durationMs,
      threshold: thresholdMs,
      isSlow,
      recommendation,
    };

    if (isSlow) {
      this.slowQueries.push(result);
      if (this.slowQueries.length > this.maxSlowQueryLog) {
        this.slowQueries.shift();
      }
    }

    return result;
  }

  /**
   * Analyze query patterns and suggest indexes.
   */
  indexAdvisor(queryPatterns: QueryPatternInput[]): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];

    for (const pattern of queryPatterns) {
      const recommendation = this.analyzePatternForIndex(pattern);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // Sort by priority (critical first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Monitor connection pool health and provide recommendations.
   */
  connectionPoolMonitor(poolStats: PoolStats): PoolHealthResult {
    const utilization =
      poolStats.maxConnections > 0 ? poolStats.activeConnections / poolStats.maxConnections : 0;
    const saturation =
      poolStats.maxConnections > 0
        ? (poolStats.activeConnections + poolStats.waitingRequests) / poolStats.maxConnections
        : 0;

    const recommendations: string[] = [];
    let healthy = true;

    // High utilization warning
    if (utilization > 0.8) {
      healthy = false;
      recommendations.push(
        `Connection pool utilization is ${(utilization * 100).toFixed(1)}%. Consider increasing maxConnections.`,
      );
    }

    // Saturation warning
    if (saturation > 1.0) {
      healthy = false;
      recommendations.push(
        `Pool is saturated (${(saturation * 100).toFixed(1)}%). Requests are queuing. Increase pool size or reduce connection hold time.`,
      );
    }

    // Idle connection waste
    if (
      poolStats.idleConnections > poolStats.maxConnections * 0.5 &&
      poolStats.waitingRequests === 0
    ) {
      recommendations.push(
        `${poolStats.idleConnections} idle connections detected. Consider reducing minConnections to save resources.`,
      );
    }

    // High acquire time
    if (poolStats.avgAcquireTimeMs > 50) {
      healthy = false;
      recommendations.push(
        `Average acquire time is ${poolStats.avgAcquireTimeMs}ms. This indicates pool exhaustion. Consider increasing pool size.`,
      );
    }

    // Waiting requests
    if (poolStats.waitingRequests > 0) {
      recommendations.push(
        `${poolStats.waitingRequests} requests are waiting for connections. Pool may be undersized.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Connection pool is healthy. No action needed.');
    }

    return {
      healthy,
      utilization,
      saturation,
      recommendations,
    };
  }

  /**
   * Recommend partitioning strategy based on table statistics.
   */
  partitionRecommender(tableStats: TableStats): PartitionRecommendation {
    // Small tables don't need partitioning
    if (tableStats.rowCount < 1_000_000) {
      return {
        tableName: tableStats.tableName,
        strategy: 'NONE',
        partitionKey: '',
        reason: `Table has ${tableStats.rowCount.toLocaleString()} rows, below the 1M threshold for partitioning.`,
        estimatedBenefit: 'None needed.',
      };
    }

    // Time-series data: RANGE partition by timestamp
    if (tableStats.hasTimestampColumn && tableStats.readWriteRatio > 5) {
      return {
        tableName: tableStats.tableName,
        strategy: 'RANGE',
        partitionKey: 'created_at',
        reason:
          'High read-to-write ratio with timestamp column suggests time-series access patterns.',
        estimatedBenefit:
          'Queries filtering by date range can skip older partitions, reducing scan time by ~60-80%.',
      };
    }

    // Multi-tenant: LIST partition by tenant
    if (tableStats.hasTenantColumn) {
      return {
        tableName: tableStats.tableName,
        strategy: 'LIST',
        partitionKey: 'tenant_id',
        reason:
          'Multi-tenant table benefits from tenant-based partitioning for isolation and performance.',
        estimatedBenefit:
          'Tenant-scoped queries only scan relevant partition, improving performance by ~70%.',
      };
    }

    // Large table without clear pattern: HASH partition
    return {
      tableName: tableStats.tableName,
      strategy: 'HASH',
      partitionKey: 'id',
      reason: `Table has ${tableStats.rowCount.toLocaleString()} rows. Hash partitioning distributes load evenly.`,
      estimatedBenefit:
        'Parallel query execution across partitions, ~40% improvement for full scans.',
    };
  }

  /**
   * Get recorded slow queries.
   */
  getSlowQueries(limit?: number): SlowQueryResult[] {
    return limit ? this.slowQueries.slice(-limit) : [...this.slowQueries];
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Generate a recommendation for a slow query */
  private generateSlowQueryRecommendation(
    query: string,
    durationMs: number,
    threshold: number,
  ): string {
    const upperQuery = query.toUpperCase();
    const parts: string[] = [];

    parts.push(`Query took ${durationMs}ms (threshold: ${threshold}ms).`);

    if (upperQuery.includes('SELECT *')) {
      parts.push('Avoid SELECT *; select only needed columns.');
    }

    if (!upperQuery.includes('WHERE') && !upperQuery.includes('LIMIT')) {
      parts.push('Add WHERE clause or LIMIT to reduce rows scanned.');
    }

    if (upperQuery.includes('JOIN') && durationMs > threshold * 5) {
      parts.push('Consider adding indexes on JOIN columns or restructuring the query.');
    }

    if (upperQuery.includes('ORDER BY') && upperQuery.includes('OFFSET')) {
      parts.push(
        'Pagination with OFFSET is inefficient for large datasets. Consider keyset pagination.',
      );
    }

    if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
      parts.push('Leading wildcard in LIKE prevents index usage. Consider full-text search.');
    }

    if (parts.length === 1) {
      parts.push('Review query execution plan and consider adding appropriate indexes.');
    }

    return parts.join(' ');
  }

  /** Analyze a query pattern and generate index recommendation */
  private analyzePatternForIndex(pattern: QueryPatternInput): IndexRecommendation | null {
    if (pattern.columns.length === 0) return null;

    // Determine priority based on frequency and duration
    let priority: IndexRecommendation['priority'] = 'low';
    if (pattern.frequency > 1000 && pattern.avgDurationMs > 100) {
      priority = 'critical';
    } else if (pattern.frequency > 100 && pattern.avgDurationMs > 50) {
      priority = 'high';
    } else if (pattern.frequency > 10 || pattern.avgDurationMs > 50) {
      priority = 'medium';
    }

    // Determine index type
    let type: IndexRecommendation['type'] = 'BTREE';
    if (pattern.columns.length > 1) {
      type = 'COMPOSITE';
    }
    if (
      pattern.query.toUpperCase().includes('=') &&
      !pattern.query.toUpperCase().includes('RANGE')
    ) {
      type = pattern.columns.length > 1 ? 'COMPOSITE' : 'HASH';
    }

    const estimatedImprovement = Math.min(0.95, pattern.avgDurationMs > 100 ? 0.8 : 0.5);

    return {
      table: pattern.table,
      columns: pattern.columns,
      type,
      reason: `Query executes ${pattern.frequency} times/hour with avg ${pattern.avgDurationMs}ms. Index on (${pattern.columns.join(', ')}) would reduce scan time.`,
      estimatedImprovement,
      priority,
    };
  }
}
