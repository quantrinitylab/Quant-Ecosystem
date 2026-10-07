// ============================================================================
// Performance Package - Bundle Analyzer
// Module size tracking, tree-shaking analysis, duplicate detection,
// size budgets with threshold alerts, trend tracking
// ============================================================================

import type { BundleMetrics, BudgetStatus } from '../types';

/** Module info for bundle analysis */
interface ModuleInfo {
  id: string;
  path: string;
  size: number;
  gzipSize: number;
  exports: string[];
  usedExports: string[];
  sideEffects: boolean;
  importedBy: string[];
}

/** Size budget definition */
interface SizeBudget {
  name: string;
  type: 'total' | 'chunk' | 'module' | 'initial' | 'asset';
  maxSize: number;
  pattern?: string;
}

/** Trend data point */
interface TrendPoint {
  timestamp: number;
  totalSize: number;
  gzipSize: number;
  moduleCount: number;
  chunkCount: number;
}

/** Duplicate module detection result */
interface DuplicateResult {
  module: string;
  instances: { path: string; size: number; version?: string }[];
  wastedSize: number;
}

/**
 * BundleAnalyzer tracks module sizes, detects tree-shaking opportunities,
 * finds duplicate dependencies, enforces size budgets, and tracks trends.
 */
export class BundleAnalyzer {
  private readonly modules: Map<string, ModuleInfo>;
  private readonly budgets: Map<string, SizeBudget>;
  private readonly trends: TrendPoint[];
  private readonly maxTrendPoints: number;
  private readonly alerts: string[];

  constructor(config: { maxTrendPoints?: number } = {}) {
    this.modules = new Map();
    this.budgets = new Map();
    this.trends = [];
    this.maxTrendPoints = config.maxTrendPoints ?? 100;
    this.alerts = [];
  }

  /**
   * Register a module for analysis.
   */
  addModule(
    id: string,
    path: string,
    size: number,
    options: {
      exports?: string[];
      usedExports?: string[];
      sideEffects?: boolean;
      importedBy?: string[];
    } = {}
  ): void {
    this.modules.set(id, {
      id,
      path,
      size,
      gzipSize: Math.floor(size * 0.35), // Estimate ~65% compression ratio
      exports: options.exports ?? [],
      usedExports: options.usedExports ?? [],
      sideEffects: options.sideEffects ?? false,
      importedBy: options.importedBy ?? [],
    });
  }

  /**
   * Set a size budget for enforcement.
   */
  setBudget(name: string, type: SizeBudget['type'], maxSize: number, pattern?: string): void {
    this.budgets.set(name, { name, type, maxSize, pattern });
  }

  /**
   * Analyze the bundle and produce metrics.
   */
  analyze(): BundleMetrics {
    const totalSize = this.calculateTotalSize();
    const gzipSize = this.calculateGzipSize();
    const duplicates = this.findDuplicates();
    const treeShakeableBytes = this.calculateTreeShakeable();
    const budgetStatuses = this.checkBudgets();

    // Record trend point
    this.recordTrend(totalSize, gzipSize);

    return {
      totalSize,
      gzipSize,
      moduleCount: this.modules.size,
      chunkCount: this.estimateChunkCount(),
      duplicateModules: duplicates.map((d) => d.module),
      treeShakeableBytes,
      budgetStatus: budgetStatuses,
    };
  }

  /**
   * Find duplicate modules in the bundle.
   */
  findDuplicates(): DuplicateResult[] {
    const byName = new Map<string, ModuleInfo[]>();

    for (const mod of this.modules.values()) {
      const name = this.extractModuleName(mod.path);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(mod);
    }

    const duplicates: DuplicateResult[] = [];
    for (const [name, instances] of byName) {
      if (instances.length > 1) {
        const sortedInstances = instances.sort((a, b) => b.size - a.size);
        const wastedSize = sortedInstances.slice(1).reduce((sum, m) => sum + m.size, 0);

        duplicates.push({
          module: name,
          instances: sortedInstances.map((m) => ({ path: m.path, size: m.size })),
          wastedSize,
        });
      }
    }

    return duplicates.sort((a, b) => b.wastedSize - a.wastedSize);
  }

  /**
   * Analyze tree-shaking opportunities - find unused exports.
   */
  analyzeTreeShaking(): { module: string; unusedExports: string[]; savingsEstimate: number }[] {
    const opportunities: { module: string; unusedExports: string[]; savingsEstimate: number }[] = [];

    for (const mod of this.modules.values()) {
      if (mod.exports.length === 0) continue;

      const unusedExports = mod.exports.filter((e) => !mod.usedExports.includes(e));
      if (unusedExports.length > 0) {
        // Estimate savings: proportion of unused exports * module size
        const unusedRatio = unusedExports.length / mod.exports.length;
        const savingsEstimate = Math.floor(mod.size * unusedRatio * 0.7); // 70% of proportional size

        opportunities.push({
          module: mod.path,
          unusedExports,
          savingsEstimate,
        });
      }
    }

    return opportunities.sort((a, b) => b.savingsEstimate - a.savingsEstimate);
  }

  /**
   * Get modules sorted by size (largest first).
   */
  getModulesBySize(limit: number = 20): { path: string; size: number; gzipSize: number }[] {
    return [...this.modules.values()]
      .sort((a, b) => b.size - a.size)
      .slice(0, limit)
      .map((m) => ({ path: m.path, size: m.size, gzipSize: m.gzipSize }));
  }

  /**
   * Check all size budgets and return their status.
   */
  checkBudgets(): BudgetStatus[] {
    const statuses: BudgetStatus[] = [];
    this.alerts.length = 0;

    for (const budget of this.budgets.values()) {
      const actual = this.getBudgetActual(budget);
      const exceeded = actual > budget.maxSize;
      const delta = actual - budget.maxSize;

      statuses.push({
        name: budget.name,
        budget: budget.maxSize,
        actual,
        exceeded,
        delta,
      });

      if (exceeded) {
        this.alerts.push(
          `Budget "${budget.name}" exceeded: ${this.formatSize(actual)} > ${this.formatSize(budget.maxSize)} (+${this.formatSize(delta)})`
        );
      }
    }

    return statuses;
  }

  /**
   * Get size trend over time.
   */
  getTrend(points: number = 10): TrendPoint[] {
    return this.trends.slice(-points);
  }

  /**
   * Calculate size change from previous trend point.
   */
  getSizeChange(): { absolute: number; percentage: number } | null {
    if (this.trends.length < 2) return null;

    const current = this.trends[this.trends.length - 1];
    const previous = this.trends[this.trends.length - 2];

    const absolute = current.totalSize - previous.totalSize;
    const percentage = previous.totalSize > 0
      ? ((absolute / previous.totalSize) * 100)
      : 0;

    return { absolute, percentage };
  }

  /**
   * Get alerts from the last analysis.
   */
  getAlerts(): string[] {
    return [...this.alerts];
  }

  /**
   * Find modules with side effects that might prevent tree-shaking.
   */
  findSideEffectModules(): ModuleInfo[] {
    return [...this.modules.values()].filter((m) => m.sideEffects);
  }

  /**
   * Get a summary report of the bundle analysis.
   */
  getSummary(): {
    totalSize: string;
    gzipSize: string;
    modules: number;
    duplicates: number;
    treeShakeable: string;
    budgetsExceeded: number;
  } {
    const metrics = this.analyze();
    return {
      totalSize: this.formatSize(metrics.totalSize),
      gzipSize: this.formatSize(metrics.gzipSize),
      modules: metrics.moduleCount,
      duplicates: metrics.duplicateModules.length,
      treeShakeable: this.formatSize(metrics.treeShakeableBytes),
      budgetsExceeded: metrics.budgetStatus.filter((b) => b.exceeded).length,
    };
  }

  /**
   * Reset analyzer state.
   */
  reset(): void {
    this.modules.clear();
    this.alerts.length = 0;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Calculate total bundle size */
  private calculateTotalSize(): number {
    let total = 0;
    for (const mod of this.modules.values()) {
      total += mod.size;
    }
    return total;
  }

  /** Calculate total gzip size */
  private calculateGzipSize(): number {
    let total = 0;
    for (const mod of this.modules.values()) {
      total += mod.gzipSize;
    }
    return total;
  }

  /** Calculate tree-shakeable bytes */
  private calculateTreeShakeable(): number {
    let total = 0;
    for (const mod of this.modules.values()) {
      if (mod.exports.length > 0 && !mod.sideEffects) {
        const unusedCount = mod.exports.filter((e) => !mod.usedExports.includes(e)).length;
        if (unusedCount > 0) {
          total += Math.floor(mod.size * (unusedCount / mod.exports.length) * 0.7);
        }
      }
    }
    return total;
  }

  /** Estimate chunk count based on dynamic imports */
  private estimateChunkCount(): number {
    const dynamicModules = [...this.modules.values()].filter(
      (m) => m.importedBy.length === 0 || m.path.includes('lazy') || m.path.includes('dynamic')
    );
    return Math.max(1, dynamicModules.length);
  }

  /** Get actual size for a budget type */
  private getBudgetActual(budget: SizeBudget): number {
    switch (budget.type) {
      case 'total':
        return this.calculateTotalSize();
      case 'module': {
        if (budget.pattern) {
          const matching = [...this.modules.values()].filter(
            (m) => m.path.includes(budget.pattern!)
          );
          return matching.reduce((sum, m) => sum + m.size, 0);
        }
        return 0;
      }
      case 'initial': {
        // Entry modules + their sync dependencies
        const entryModules = [...this.modules.values()].filter(
          (m) => m.importedBy.length === 0
        );
        return entryModules.reduce((sum, m) => sum + m.size, 0);
      }
      default:
        return this.calculateTotalSize();
    }
  }

  /** Extract module name from path */
  private extractModuleName(path: string): string {
    const parts = path.split('/');
    // Handle scoped packages
    if (parts.length > 1 && parts[parts.length - 2].startsWith('@')) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1].replace(/\.(ts|js|tsx|jsx)$/, '');
  }

  /** Record a trend data point */
  private recordTrend(totalSize: number, gzipSize: number): void {
    this.trends.push({
      timestamp: Date.now(),
      totalSize,
      gzipSize,
      moduleCount: this.modules.size,
      chunkCount: this.estimateChunkCount(),
    });

    if (this.trends.length > this.maxTrendPoints) {
      this.trends.shift();
    }
  }

  /** Format size in human-readable format */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
