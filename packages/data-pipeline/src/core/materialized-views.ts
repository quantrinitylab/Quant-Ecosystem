// ============================================================================
// Data Pipeline Package - Materialized Views
// ============================================================================

import type {
  MaterializedView,
  ViewRefreshPolicy,
  ViewDependency,
  ViewStatus,
  RefreshType,
  CronSchedule,
} from '../types';

/** Refresh result metadata */
interface RefreshResult {
  viewId: string;
  viewName: string;
  status: 'success' | 'partial' | 'failed';
  refreshType: RefreshType;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  duration: number;
  startedAt: number;
  completedAt: number;
  error?: string;
}

/** Dependency graph node */
interface DependencyNode {
  viewId: string;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
  level: number;
}

/** Change tracking entry */
interface ChangeEntry {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  timestamp: number;
  affectedRows: number;
}

/**
 * MaterializedViewManager - Manages materialized views for dashboards
 * Supports incremental and full refresh, dependency tracking,
 * change-based invalidation, and refresh scheduling.
 */
export class MaterializedViewManager {
  private views: Map<string, MaterializedView> = new Map();
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private refreshHistory: Map<string, RefreshResult[]> = new Map();
  private changeLog: ChangeEntry[] = [];
  private viewCounter: number = 0;

  /**
   * Create a new materialized view
   */
  public createView(
    name: string,
    query: string,
    sourceTables: string[],
    refreshPolicy: ViewRefreshPolicy,
    dependencies?: ViewDependency[]
  ): MaterializedView {
    const id = `mv-${++this.viewCounter}-${Date.now()}`;

    const view: MaterializedView = {
      id,
      name,
      query,
      sourceTables,
      refreshPolicy,
      dependencies: dependencies ?? sourceTables.map(table => ({
        sourceTable: table,
        columns: ['*'],
        type: 'read' as const,
      })),
      lastRefreshedAt: null,
      status: 'stale',
      rowCount: 0,
      sizeBytes: 0,
    };

    this.views.set(id, view);
    this.refreshHistory.set(id, []);
    this.updateDependencyGraph(view);

    return view;
  }

  /**
   * Refresh a materialized view
   */
  public refreshView(viewId: string, forceFullRefresh: boolean = false): RefreshResult {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`View '${viewId}' not found`);
    }

    const startedAt = Date.now();
    view.status = 'refreshing';

    const refreshType = forceFullRefresh ? 'full' : view.refreshPolicy.type;
    let result: RefreshResult;

    try {
      switch (refreshType) {
        case 'incremental':
          result = this.performIncrementalRefresh(view, startedAt);
          break;
        case 'full':
          result = this.performFullRefresh(view, startedAt);
          break;
        default:
          result = this.performFullRefresh(view, startedAt);
      }

      view.status = 'fresh';
      view.lastRefreshedAt = Date.now();
    } catch (error) {
      view.status = 'error';
      result = {
        viewId: view.id,
        viewName: view.name,
        status: 'failed',
        refreshType,
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsDeleted: 0,
        duration: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Store refresh history
    const history = this.refreshHistory.get(viewId) ?? [];
    history.push(result);
    this.refreshHistory.set(viewId, history);

    return result;
  }

  /**
   * Invalidate a view (mark as stale)
   */
  public invalidate(viewId: string, cascade: boolean = true): string[] {
    const invalidated: string[] = [];
    const view = this.views.get(viewId);

    if (!view) return invalidated;

    view.status = 'stale';
    invalidated.push(viewId);

    // Cascade invalidation to dependent views
    if (cascade) {
      const node = this.dependencyGraph.get(viewId);
      if (node) {
        for (const dependentId of node.dependedBy) {
          const depView = this.views.get(dependentId);
          if (depView && depView.status === 'fresh') {
            depView.status = 'stale';
            invalidated.push(dependentId);
          }
        }
      }
    }

    return invalidated;
  }

  /**
   * Invalidate views affected by a table change
   */
  public invalidateByTable(tableName: string): string[] {
    const invalidated: string[] = [];

    for (const view of this.views.values()) {
      if (view.sourceTables.includes(tableName) && view.status === 'fresh') {
        view.status = 'stale';
        invalidated.push(view.id);

        // Cascade
        const cascaded = this.invalidate(view.id, true);
        for (const id of cascaded) {
          if (!invalidated.includes(id)) {
            invalidated.push(id);
          }
        }
      }
    }

    return invalidated;
  }

  /**
   * Get dependency information for a view
   */
  public getDependencies(viewId: string): { dependsOn: string[]; dependedBy: string[] } {
    const node = this.dependencyGraph.get(viewId);
    if (!node) {
      return { dependsOn: [], dependedBy: [] };
    }

    return {
      dependsOn: Array.from(node.dependsOn),
      dependedBy: Array.from(node.dependedBy),
    };
  }

  /**
   * Get status of a view
   */
  public getStatus(viewId: string): { view: MaterializedView; isStale: boolean; staleness: number } | null {
    const view = this.views.get(viewId);
    if (!view) return null;

    const staleness = view.lastRefreshedAt
      ? Date.now() - view.lastRefreshedAt
      : Infinity;

    const isStale = view.status === 'stale' ||
      staleness > view.refreshPolicy.staleness;

    return { view, isStale, staleness };
  }

  /**
   * Get all views with their current status
   */
  public getAllViews(): MaterializedView[] {
    return Array.from(this.views.values());
  }

  /**
   * Get views that need refresh based on their policies
   */
  public getViewsNeedingRefresh(): MaterializedView[] {
    const needsRefresh: MaterializedView[] = [];

    for (const view of this.views.values()) {
      if (view.status === 'stale' || view.status === 'error') {
        needsRefresh.push(view);
        continue;
      }

      if (view.lastRefreshedAt) {
        const staleness = Date.now() - view.lastRefreshedAt;
        if (staleness > view.refreshPolicy.staleness) {
          needsRefresh.push(view);
        }
      }
    }

    return needsRefresh;
  }

  /**
   * Get refresh history for a view
   */
  public getRefreshHistory(viewId: string, limit: number = 10): RefreshResult[] {
    const history = this.refreshHistory.get(viewId) ?? [];
    return history.slice(-limit);
  }

  /**
   * Get topologically sorted refresh order
   */
  public getRefreshOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (viewId: string): void => {
      if (visited.has(viewId)) return;
      if (visiting.has(viewId)) return; // Circular dependency

      visiting.add(viewId);
      const node = this.dependencyGraph.get(viewId);
      if (node) {
        for (const dep of node.dependsOn) {
          visit(dep);
        }
      }
      visiting.delete(viewId);
      visited.add(viewId);
      order.push(viewId);
    };

    for (const viewId of this.views.keys()) {
      visit(viewId);
    }

    return order;
  }

  /**
   * Record a table change for change-based refresh
   */
  public recordChange(table: string, operation: 'insert' | 'update' | 'delete', affectedRows: number): void {
    this.changeLog.push({
      table,
      operation,
      timestamp: Date.now(),
      affectedRows,
    });

    // Auto-invalidate affected views if policy is on_change
    for (const view of this.views.values()) {
      if (
        view.sourceTables.includes(table) &&
        view.refreshPolicy.type === 'on_change'
      ) {
        this.invalidate(view.id, true);
      }
    }
  }

  /**
   * Perform incremental refresh (process only changes since last refresh)
   */
  private performIncrementalRefresh(view: MaterializedView, startedAt: number): RefreshResult {
    const lastRefresh = view.lastRefreshedAt ?? 0;

    // Get changes since last refresh
    const relevantChanges = this.changeLog.filter(
      c => c.timestamp > lastRefresh && view.sourceTables.includes(c.table)
    );

    const rowsInserted = relevantChanges
      .filter(c => c.operation === 'insert')
      .reduce((sum, c) => sum + c.affectedRows, 0);
    const rowsUpdated = relevantChanges
      .filter(c => c.operation === 'update')
      .reduce((sum, c) => sum + c.affectedRows, 0);
    const rowsDeleted = relevantChanges
      .filter(c => c.operation === 'delete')
      .reduce((sum, c) => sum + c.affectedRows, 0);

    const totalProcessed = rowsInserted + rowsUpdated + rowsDeleted;
    view.rowCount += rowsInserted - rowsDeleted;
    view.sizeBytes = view.rowCount * 256; // Estimated

    return {
      viewId: view.id,
      viewName: view.name,
      status: 'success',
      refreshType: 'incremental',
      rowsProcessed: totalProcessed,
      rowsInserted,
      rowsUpdated,
      rowsDeleted,
      duration: Date.now() - startedAt,
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Perform full refresh (recompute entire view)
   */
  private performFullRefresh(view: MaterializedView, startedAt: number): RefreshResult {
    // Simulate full view computation
    const estimatedRows = Math.floor(Math.random() * 10000) + 1000;
    view.rowCount = estimatedRows;
    view.sizeBytes = estimatedRows * 256;

    return {
      viewId: view.id,
      viewName: view.name,
      status: 'success',
      refreshType: 'full',
      rowsProcessed: estimatedRows,
      rowsInserted: estimatedRows,
      rowsUpdated: 0,
      rowsDeleted: 0,
      duration: Date.now() - startedAt,
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Update the dependency graph when a view is added
   */
  private updateDependencyGraph(view: MaterializedView): void {
    const node: DependencyNode = {
      viewId: view.id,
      dependsOn: new Set(view.sourceTables),
      dependedBy: new Set(),
      level: 0,
    };

    // Check if any existing views are dependencies
    for (const [existingId, existingNode] of this.dependencyGraph.entries()) {
      // If this view depends on an existing view's output table
      if (view.sourceTables.some(t => t === existingId)) {
        node.dependsOn.add(existingId);
        existingNode.dependedBy.add(view.id);
        node.level = Math.max(node.level, existingNode.level + 1);
      }
    }

    this.dependencyGraph.set(view.id, node);
  }
}
