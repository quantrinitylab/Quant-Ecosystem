// ============================================================================
// Performance Package - Query Optimizer
// Plan analysis, index suggestions, N+1 detection, DataLoader batching
// ============================================================================

import type { QueryPlan, QueryOptimization, IndexSuggestion, ScanType, OptimizationType } from '../types';

/** Query log entry for slow query tracking */
interface SlowQueryEntry {
  query: string;
  executionTimeMs: number;
  timestamp: number;
  plan: QueryPlan;
  optimizations: QueryOptimization[];
}

/** Batch request for DataLoader pattern */
interface BatchRequest<K, V> {
  key: K;
  resolve: (value: V) => void;
  reject: (error: Error) => void;
}

/** Query pattern for N+1 detection */
interface QueryPattern {
  pattern: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  windowMs: number;
}

/**
 * QueryOptimizer provides query plan analysis, index suggestion algorithm,
 * N+1 detection, query batching (DataLoader pattern), and slow query logging.
 */
export class QueryOptimizer {
  private readonly slowQueryLog: SlowQueryEntry[];
  private readonly slowQueryThresholdMs: number;
  private readonly maxSlowQueryLogSize: number;
  private readonly queryPatterns: Map<string, QueryPattern>;
  private readonly indexRegistry: Map<string, IndexSuggestion[]>;
  private readonly batchQueues: Map<string, BatchRequest<string, unknown>[]>;
  private readonly batchTimers: Map<string, ReturnType<typeof setTimeout>>;
  private readonly batchMaxSize: number;
  private readonly batchDelayMs: number;
  private readonly n1Threshold: number;
  private readonly n1WindowMs: number;
  private planCounter: number;

  constructor(config: {
    slowQueryThresholdMs?: number;
    maxSlowQueryLogSize?: number;
    batchMaxSize?: number;
    batchDelayMs?: number;
    n1Threshold?: number;
    n1WindowMs?: number;
  } = {}) {
    this.slowQueryThresholdMs = config.slowQueryThresholdMs ?? 100;
    this.maxSlowQueryLogSize = config.maxSlowQueryLogSize ?? 500;
    this.batchMaxSize = config.batchMaxSize ?? 25;
    this.batchDelayMs = config.batchDelayMs ?? 10;
    this.n1Threshold = config.n1Threshold ?? 5;
    this.n1WindowMs = config.n1WindowMs ?? 1000;

    this.slowQueryLog = [];
    this.queryPatterns = new Map();
    this.indexRegistry = new Map();
    this.batchQueues = new Map();
    this.batchTimers = new Map();
    this.planCounter = 0;
  }

  /**
   * Analyze a query and produce an execution plan with cost estimation.
   */
  analyzeQuery(query: string, tableStats?: { rowCount: number; indexes: string[] }): QueryPlan {
    const startTime = Date.now();
    const normalized = this.normalizeQuery(query);
    const scanType = this.determineScanType(normalized, tableStats?.indexes ?? []);
    const rowCount = tableStats?.rowCount ?? 10000;

    // Estimate cost based on scan type and data size
    const estimatedCost = this.estimateCost(scanType, rowCount);
    const rowsExamined = this.estimateRowsExamined(scanType, rowCount);
    const indexUsed = this.findUsableIndex(normalized, tableStats?.indexes ?? []);

    const plan: QueryPlan = {
      id: `plan-${++this.planCounter}`,
      query: normalized,
      estimatedCost,
      actualCost: 0,
      scanType,
      indexUsed,
      rowsExamined,
      rowsReturned: Math.min(rowsExamined, Math.floor(rowCount * 0.1)),
      executionTimeMs: Date.now() - startTime,
    };

    // Track for N+1 detection
    this.trackQueryPattern(normalized);

    return plan;
  }

  /**
   * Suggest optimizations for a query based on its plan.
   */
  suggestOptimizations(plan: QueryPlan): QueryOptimization[] {
    const suggestions: QueryOptimization[] = [];

    // Suggest index if doing full table scan
    if (plan.scanType === 'FULL_TABLE') {
      const indexSuggestion = this.generateIndexSuggestion(plan.query);
      if (indexSuggestion) {
        suggestions.push({
          query: plan.query,
          suggestion: `Add index on ${indexSuggestion.table}(${indexSuggestion.columns.join(', ')})`,
          type: 'ADD_INDEX',
          estimatedImprovement: 0.8,
          indexSuggestion,
        });
      }
    }

    // Check for N+1 pattern
    const n1Detection = this.detectN1Pattern(plan.query);
    if (n1Detection) {
      suggestions.push({
        query: plan.query,
        suggestion: `N+1 query detected: ${n1Detection.count} similar queries in ${n1Detection.windowMs}ms. Consider batching or eager loading.`,
        type: 'ELIMINATE_N_PLUS_1',
        estimatedImprovement: 0.9,
      });
    }

    // Suggest query rewrite for expensive nested loops
    if (plan.scanType === 'NESTED_LOOP' && plan.rowsExamined > 10000) {
      suggestions.push({
        query: plan.query,
        suggestion: 'Consider using HASH_JOIN by adding appropriate indexes or restructuring the query',
        type: 'REWRITE_QUERY',
        estimatedImprovement: 0.6,
      });
    }

    // Suggest partitioning for very large scans
    if (plan.rowsExamined > 1000000) {
      suggestions.push({
        query: plan.query,
        suggestion: 'Consider table partitioning for queries scanning over 1M rows',
        type: 'PARTITION',
        estimatedImprovement: 0.7,
      });
    }

    return suggestions;
  }

  /**
   * DataLoader-style batching: load a single key, actual fetch is batched.
   */
  async load<V>(batchKey: string, key: string, batchFn: (keys: string[]) => Promise<Map<string, V>>): Promise<V> {
    return new Promise<V>((resolve, reject) => {
      if (!this.batchQueues.has(batchKey)) {
        this.batchQueues.set(batchKey, []);
      }

      const queue = this.batchQueues.get(batchKey)!;
      queue.push({ key, resolve: resolve as (v: unknown) => void, reject });

      // Execute batch if at max size
      if (queue.length >= this.batchMaxSize) {
        this.executeBatch(batchKey, batchFn as (keys: string[]) => Promise<Map<string, unknown>>);
        return;
      }

      // Schedule batch execution
      if (!this.batchTimers.has(batchKey)) {
        const timer = setTimeout(() => {
          this.executeBatch(batchKey, batchFn as (keys: string[]) => Promise<Map<string, unknown>>);
        }, this.batchDelayMs);
        this.batchTimers.set(batchKey, timer);
      }
    });
  }

  /**
   * Record a query execution and add to slow query log if threshold exceeded.
   */
  recordExecution(query: string, executionTimeMs: number): void {
    if (executionTimeMs >= this.slowQueryThresholdMs) {
      const plan = this.analyzeQuery(query);
      plan.actualCost = executionTimeMs;
      plan.executionTimeMs = executionTimeMs;

      const entry: SlowQueryEntry = {
        query,
        executionTimeMs,
        timestamp: Date.now(),
        plan,
        optimizations: this.suggestOptimizations(plan),
      };

      this.slowQueryLog.push(entry);
      if (this.slowQueryLog.length > this.maxSlowQueryLogSize) {
        this.slowQueryLog.shift();
      }
    }
  }

  /**
   * Get slow query log entries.
   */
  getSlowQueries(limit: number = 50): SlowQueryEntry[] {
    return this.slowQueryLog.slice(-limit);
  }

  /**
   * Get the top N slowest queries by execution time.
   */
  getTopSlowQueries(n: number = 10): SlowQueryEntry[] {
    return [...this.slowQueryLog]
      .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
      .slice(0, n);
  }

  /**
   * Detect N+1 query patterns in the current window.
   */
  detectAllN1Patterns(): QueryPattern[] {
    const now = Date.now();
    const detected: QueryPattern[] = [];

    for (const [, pattern] of this.queryPatterns) {
      if (pattern.count >= this.n1Threshold && now - pattern.firstSeen <= this.n1WindowMs) {
        detected.push(pattern);
      }
    }

    return detected;
  }

  /**
   * Register an index for optimization analysis.
   */
  registerIndex(table: string, suggestion: IndexSuggestion): void {
    if (!this.indexRegistry.has(table)) {
      this.indexRegistry.set(table, []);
    }
    this.indexRegistry.get(table)!.push(suggestion);
  }

  /**
   * Clear slow query log.
   */
  clearSlowQueryLog(): void {
    this.slowQueryLog.length = 0;
  }

  /**
   * Reset all tracked patterns.
   */
  resetPatterns(): void {
    this.queryPatterns.clear();
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Normalize a query by removing literals and whitespace variations */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .replace(/'[^']*'/g, '?')
      .replace(/\b\d+\b/g, '?')
      .trim();
  }

  /** Determine scan type based on query structure and available indexes */
  private determineScanType(query: string, indexes: string[]): ScanType {
    const upperQuery = query.toUpperCase();

    // Check for JOIN
    if (upperQuery.includes('JOIN')) {
      if (indexes.length > 0) return 'HASH_JOIN';
      return 'NESTED_LOOP';
    }

    // Check if WHERE clause can use an index
    const whereMatch = query.match(/WHERE\s+(\w+)/i);
    if (whereMatch) {
      const whereCol = whereMatch[1].toLowerCase();
      const hasIndex = indexes.some((idx) => idx.toLowerCase().includes(whereCol));
      if (hasIndex) return 'INDEX_SEEK';
    }

    // Check for ORDER BY with index
    if (upperQuery.includes('ORDER BY') && indexes.length > 0) {
      return 'INDEX_SCAN';
    }

    return 'FULL_TABLE';
  }

  /** Estimate query cost based on scan type */
  private estimateCost(scanType: ScanType, rowCount: number): number {
    switch (scanType) {
      case 'INDEX_SEEK': return Math.log2(rowCount) * 2;
      case 'INDEX_SCAN': return rowCount * 0.3;
      case 'HASH_JOIN': return rowCount * 1.5;
      case 'NESTED_LOOP': return rowCount * rowCount * 0.001;
      case 'FULL_TABLE': return rowCount;
    }
  }

  /** Estimate rows examined */
  private estimateRowsExamined(scanType: ScanType, rowCount: number): number {
    switch (scanType) {
      case 'INDEX_SEEK': return Math.min(10, rowCount);
      case 'INDEX_SCAN': return Math.floor(rowCount * 0.3);
      case 'HASH_JOIN': return rowCount;
      case 'NESTED_LOOP': return Math.floor(rowCount * 1.5);
      case 'FULL_TABLE': return rowCount;
    }
  }

  /** Find a usable index for the query */
  private findUsableIndex(query: string, indexes: string[]): string | null {
    const whereMatch = query.match(/WHERE\s+(\w+)/i);
    if (!whereMatch) return null;

    const col = whereMatch[1].toLowerCase();
    return indexes.find((idx) => idx.toLowerCase().includes(col)) ?? null;
  }

  /** Generate an index suggestion based on query analysis */
  private generateIndexSuggestion(query: string): IndexSuggestion | null {
    const tableMatch = query.match(/FROM\s+(\w+)/i);
    const whereMatch = query.match(/WHERE\s+(\w+)\s*[=<>]/i);
    const orderMatch = query.match(/ORDER BY\s+(\w+)/i);

    if (!tableMatch) return null;
    const table = tableMatch[1];
    const columns: string[] = [];

    if (whereMatch) columns.push(whereMatch[1]);
    if (orderMatch && !columns.includes(orderMatch[1])) columns.push(orderMatch[1]);

    if (columns.length === 0) return null;

    return {
      table,
      columns,
      type: columns.length > 1 ? 'COMPOSITE' : 'BTREE',
      estimatedSize: columns.length * 1024 * 100,
    };
  }

  /** Track query pattern for N+1 detection */
  private trackQueryPattern(normalizedQuery: string): void {
    const pattern = this.extractPattern(normalizedQuery);
    const now = Date.now();

    const existing = this.queryPatterns.get(pattern);
    if (existing) {
      // Reset if outside window
      if (now - existing.firstSeen > this.n1WindowMs) {
        existing.count = 1;
        existing.firstSeen = now;
      } else {
        existing.count++;
      }
      existing.lastSeen = now;
    } else {
      this.queryPatterns.set(pattern, {
        pattern,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        windowMs: this.n1WindowMs,
      });
    }
  }

  /** Extract a pattern from a query for N+1 comparison */
  private extractPattern(query: string): string {
    return query.replace(/\?\s*/g, '?').replace(/IN\s*\([^)]+\)/gi, 'IN(?)');
  }

  /** Detect N+1 pattern for a specific query */
  private detectN1Pattern(query: string): QueryPattern | null {
    const pattern = this.extractPattern(query);
    const entry = this.queryPatterns.get(pattern);
    if (entry && entry.count >= this.n1Threshold) {
      return entry;
    }
    return null;
  }

  /** Execute a batched request */
  private async executeBatch(batchKey: string, batchFn: (keys: string[]) => Promise<Map<string, unknown>>): Promise<void> {
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    const queue = this.batchQueues.get(batchKey) ?? [];
    this.batchQueues.delete(batchKey);

    if (queue.length === 0) return;

    const keys = queue.map((r) => r.key);
    const uniqueKeys = [...new Set(keys)];

    try {
      const results = await batchFn(uniqueKeys);
      for (const request of queue) {
        const value = results.get(request.key);
        if (value !== undefined) {
          request.resolve(value);
        } else {
          request.reject(new Error(`Key not found in batch result: ${request.key}`));
        }
      }
    } catch (error) {
      for (const request of queue) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
