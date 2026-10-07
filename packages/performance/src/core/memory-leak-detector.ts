// ============================================================================
// Performance Package - Memory Leak Detector
// Heap snapshot comparison, growth rate analysis, object retention tracking,
// WeakRef usage, circular reference detection
// ============================================================================

import type { MemorySnapshot, LeakReport, LeakSeverity, SuspectedLeak } from '../types';

/** Object registration for tracking */
interface TrackedObject {
  id: string;
  type: string;
  size: number;
  createdAt: number;
  refs: Set<string>;
  weakRef: boolean;
  allocationStack?: string;
}

/** Growth analysis window */
interface GrowthWindow {
  startSnapshot: MemorySnapshot;
  endSnapshot: MemorySnapshot;
  duration: number;
  heapGrowthRate: number;
  objectGrowthRate: number;
}

/** Retention path for leak analysis */
interface RetentionPath {
  root: string;
  path: string[];
  retainedSize: number;
  isCircular: boolean;
}

/**
 * MemoryLeakDetector analyzes memory usage patterns to detect potential
 * memory leaks through heap snapshot comparison, growth rate analysis,
 * object retention graph analysis, and circular reference detection.
 */
export class MemoryLeakDetector {
  private readonly snapshots: MemorySnapshot[];
  private readonly trackedObjects: Map<string, TrackedObject>;
  private readonly reports: LeakReport[];
  private readonly maxSnapshots: number;
  private readonly growthThreshold: number;
  private readonly analysisWindowSize: number;
  private snapshotCounter: number;
  private reportCounter: number;

  constructor(config: {
    maxSnapshots?: number;
    growthThreshold?: number;
    analysisWindowSize?: number;
  } = {}) {
    this.snapshots = [];
    this.trackedObjects = new Map();
    this.reports = [];
    this.maxSnapshots = config.maxSnapshots ?? 50;
    this.growthThreshold = config.growthThreshold ?? 0.1; // 10% growth per interval
    this.analysisWindowSize = config.analysisWindowSize ?? 5;
    this.snapshotCounter = 0;
    this.reportCounter = 0;
  }

  /**
   * Take a memory snapshot for analysis.
   */
  takeSnapshot(): MemorySnapshot {
    const objectCounts = new Map<string, number>();
    const retainedSizes = new Map<string, number>();

    // Count objects by type
    for (const obj of this.trackedObjects.values()) {
      objectCounts.set(obj.type, (objectCounts.get(obj.type) ?? 0) + 1);
      retainedSizes.set(obj.type, (retainedSizes.get(obj.type) ?? 0) + obj.size);
    }

    const snapshot: MemorySnapshot = {
      id: `snapshot-${++this.snapshotCounter}`,
      timestamp: Date.now(),
      heapUsed: this.calculateHeapUsed(),
      heapTotal: this.calculateHeapTotal(),
      external: 0,
      arrayBuffers: 0,
      objectCounts,
      retainedSizes,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Register an object for memory tracking.
   */
  trackObject(id: string, type: string, size: number, allocationStack?: string): void {
    this.trackedObjects.set(id, {
      id,
      type,
      size,
      createdAt: Date.now(),
      refs: new Set(),
      weakRef: false,
      allocationStack,
    });
  }

  /**
   * Untrack an object (simulating garbage collection).
   */
  untrackObject(id: string): void {
    const obj = this.trackedObjects.get(id);
    if (!obj) return;

    // Remove references to this object from other objects
    for (const other of this.trackedObjects.values()) {
      other.refs.delete(id);
    }

    this.trackedObjects.delete(id);
  }

  /**
   * Add a reference from one tracked object to another.
   */
  addReference(fromId: string, toId: string): void {
    const from = this.trackedObjects.get(fromId);
    if (from) {
      from.refs.add(toId);
    }
  }

  /**
   * Mark an object as using a WeakRef (won't prevent GC).
   */
  markWeakRef(id: string): void {
    const obj = this.trackedObjects.get(id);
    if (obj) {
      obj.weakRef = true;
    }
  }

  /**
   * Analyze snapshots for memory leak patterns.
   */
  analyze(): LeakReport | null {
    if (this.snapshots.length < this.analysisWindowSize) {
      return null;
    }

    const recentSnapshots = this.snapshots.slice(-this.analysisWindowSize);
    const growthWindow = this.analyzeGrowthWindow(recentSnapshots);

    // Check if growth exceeds threshold
    if (growthWindow.heapGrowthRate < this.growthThreshold &&
        growthWindow.objectGrowthRate < this.growthThreshold) {
      return null;
    }

    // Identify suspected leaking objects
    const suspectedLeaks = this.findSuspectedLeaks(recentSnapshots);
    if (suspectedLeaks.length === 0) return null;

    // Find retention paths
    const retentionPaths = this.findRetentionPaths(suspectedLeaks);

    // Determine severity
    const severity = this.determineSeverity(growthWindow);

    const report: LeakReport = {
      id: `leak-${++this.reportCounter}`,
      detectedAt: Date.now(),
      severity,
      growthRate: growthWindow.heapGrowthRate,
      suspectedObjects: suspectedLeaks,
      retentionPath: retentionPaths.length > 0 ? retentionPaths[0].path : [],
      recommendation: this.generateRecommendation(suspectedLeaks, retentionPaths),
    };

    this.reports.push(report);
    return report;
  }

  /**
   * Detect circular references in the object graph.
   */
  detectCircularReferences(): string[][] {
    const circles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string, path: string[]): void => {
      if (stack.has(id)) {
        const cycleStart = path.indexOf(id);
        if (cycleStart >= 0) {
          circles.push(path.slice(cycleStart));
        }
        return;
      }
      if (visited.has(id)) return;

      visited.add(id);
      stack.add(id);
      path.push(id);

      const obj = this.trackedObjects.get(id);
      if (obj) {
        for (const ref of obj.refs) {
          if (!obj.weakRef) { // Skip weak references
            dfs(ref, [...path]);
          }
        }
      }

      stack.delete(id);
    };

    for (const id of this.trackedObjects.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return circles;
  }

  /**
   * Compare two snapshots and find growth.
   */
  compareSnapshots(oldSnapshot: MemorySnapshot, newSnapshot: MemorySnapshot): {
    heapDelta: number;
    growingTypes: { type: string; countDelta: number; sizeDelta: number }[];
    shrinkingTypes: { type: string; countDelta: number; sizeDelta: number }[];
  } {
    const growingTypes: { type: string; countDelta: number; sizeDelta: number }[] = [];
    const shrinkingTypes: { type: string; countDelta: number; sizeDelta: number }[] = [];

    // Collect all types from both snapshots
    const allTypes = new Set<string>();
    for (const type of oldSnapshot.objectCounts.keys()) allTypes.add(type);
    for (const type of newSnapshot.objectCounts.keys()) allTypes.add(type);

    for (const type of allTypes) {
      const oldCount = oldSnapshot.objectCounts.get(type) ?? 0;
      const newCount = newSnapshot.objectCounts.get(type) ?? 0;
      const oldSize = oldSnapshot.retainedSizes.get(type) ?? 0;
      const newSize = newSnapshot.retainedSizes.get(type) ?? 0;

      const countDelta = newCount - oldCount;
      const sizeDelta = newSize - oldSize;

      if (countDelta > 0 || sizeDelta > 0) {
        growingTypes.push({ type, countDelta, sizeDelta });
      } else if (countDelta < 0 || sizeDelta < 0) {
        shrinkingTypes.push({ type, countDelta, sizeDelta });
      }
    }

    return {
      heapDelta: newSnapshot.heapUsed - oldSnapshot.heapUsed,
      growingTypes: growingTypes.sort((a, b) => b.sizeDelta - a.sizeDelta),
      shrinkingTypes: shrinkingTypes.sort((a, b) => a.sizeDelta - b.sizeDelta),
    };
  }

  /**
   * Get all leak reports.
   */
  getReports(limit: number = 20): LeakReport[] {
    return this.reports.slice(-limit);
  }

  /**
   * Get current tracked object count by type.
   */
  getObjectCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const obj of this.trackedObjects.values()) {
      counts.set(obj.type, (counts.get(obj.type) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Get total tracked objects.
   */
  getTrackedObjectCount(): number {
    return this.trackedObjects.size;
  }

  /**
   * Get snapshot count.
   */
  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  /**
   * Find objects that have been alive longer than the threshold.
   */
  findLongLivedObjects(maxAgeMs: number): TrackedObject[] {
    const now = Date.now();
    return [...this.trackedObjects.values()]
      .filter((obj) => now - obj.createdAt > maxAgeMs);
  }

  /**
   * Get retention size (transitive size of all objects held by a root).
   */
  getRetainedSize(rootId: string): number {
    const visited = new Set<string>();
    let totalSize = 0;

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const obj = this.trackedObjects.get(id);
      if (!obj) return;

      totalSize += obj.size;
      for (const ref of obj.refs) {
        if (!obj.weakRef) traverse(ref);
      }
    };

    traverse(rootId);
    return totalSize;
  }

  /**
   * Reset all tracking data.
   */
  reset(): void {
    this.snapshots.length = 0;
    this.trackedObjects.clear();
    this.reports.length = 0;
    this.snapshotCounter = 0;
    this.reportCounter = 0;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Calculate simulated heap used */
  private calculateHeapUsed(): number {
    let total = 0;
    for (const obj of this.trackedObjects.values()) {
      total += obj.size;
    }
    return total;
  }

  /** Calculate simulated heap total (with overhead) */
  private calculateHeapTotal(): number {
    return Math.ceil(this.calculateHeapUsed() * 1.5);
  }

  /** Analyze growth in a window of snapshots */
  private analyzeGrowthWindow(snapshots: MemorySnapshot[]): GrowthWindow {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const duration = last.timestamp - first.timestamp;

    const heapGrowth = last.heapUsed - first.heapUsed;
    const heapGrowthRate = first.heapUsed > 0 ? heapGrowth / first.heapUsed : 0;

    let firstObjectCount = 0;
    let lastObjectCount = 0;
    for (const count of first.objectCounts.values()) firstObjectCount += count;
    for (const count of last.objectCounts.values()) lastObjectCount += count;

    const objectGrowthRate = firstObjectCount > 0
      ? (lastObjectCount - firstObjectCount) / firstObjectCount
      : 0;

    return {
      startSnapshot: first,
      endSnapshot: last,
      duration,
      heapGrowthRate,
      objectGrowthRate,
    };
  }

  /** Find objects suspected of leaking based on growth analysis */
  private findSuspectedLeaks(snapshots: MemorySnapshot[]): SuspectedLeak[] {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const suspected: SuspectedLeak[] = [];

    // Find types that consistently grow
    const allTypes = new Set<string>();
    for (const type of last.objectCounts.keys()) allTypes.add(type);

    for (const type of allTypes) {
      const firstCount = first.objectCounts.get(type) ?? 0;
      const lastCount = last.objectCounts.get(type) ?? 0;
      const growth = lastCount - firstCount;

      if (growth > 0) {
        // Check if growth is consistent across snapshots
        let consistentGrowth = true;
        for (let i = 1; i < snapshots.length; i++) {
          const prevCount = snapshots[i - 1].objectCounts.get(type) ?? 0;
          const currCount = snapshots[i].objectCounts.get(type) ?? 0;
          if (currCount < prevCount) {
            consistentGrowth = false;
            break;
          }
        }

        if (consistentGrowth && growth > 2) {
          const retainedSize = last.retainedSizes.get(type) ?? 0;
          const growthPerSnapshot = growth / (snapshots.length - 1);

          suspected.push({
            objectType: type,
            count: lastCount,
            retainedSize,
            growthPerSnapshot,
          });
        }
      }
    }

    return suspected.sort((a, b) => b.retainedSize - a.retainedSize);
  }

  /** Find retention paths for suspected leaks */
  private findRetentionPaths(suspects: SuspectedLeak[]): RetentionPath[] {
    const paths: RetentionPath[] = [];

    for (const suspect of suspects.slice(0, 5)) {
      // Find objects of this type
      const objectsOfType = [...this.trackedObjects.values()]
        .filter((obj) => obj.type === suspect.objectType);

      for (const obj of objectsOfType.slice(0, 3)) {
        const path = this.findPathToRoot(obj.id);
        if (path.length > 0) {
          const isCircular = this.isPartOfCycle(obj.id);
          paths.push({
            root: path[0],
            path,
            retainedSize: this.getRetainedSize(obj.id),
            isCircular,
          });
        }
      }
    }

    return paths;
  }

  /** Find path from an object to a root (object with no incoming refs) */
  private findPathToRoot(objectId: string): string[] {
    const visited = new Set<string>();
    const path: string[] = [objectId];

    let currentId = objectId;
    while (true) {
      visited.add(currentId);

      // Find who references this object
      let parent: string | null = null;
      for (const [id, obj] of this.trackedObjects) {
        if (obj.refs.has(currentId) && !visited.has(id)) {
          parent = id;
          break;
        }
      }

      if (!parent) break;
      path.unshift(parent);
      currentId = parent;
    }

    return path;
  }

  /** Check if an object is part of a reference cycle */
  private isPartOfCycle(objectId: string): boolean {
    const visited = new Set<string>();

    const dfs = (id: string): boolean => {
      if (id === objectId && visited.size > 0) return true;
      if (visited.has(id)) return false;
      visited.add(id);

      const obj = this.trackedObjects.get(id);
      if (!obj || obj.weakRef) return false;

      for (const ref of obj.refs) {
        if (dfs(ref)) return true;
      }

      return false;
    };

    const obj = this.trackedObjects.get(objectId);
    if (!obj) return false;

    for (const ref of obj.refs) {
      visited.clear();
      visited.add(objectId);
      if (dfs(ref)) return true;
    }

    return false;
  }

  /** Determine leak severity based on growth */
  private determineSeverity(window: GrowthWindow): LeakSeverity {
    if (window.heapGrowthRate > 0.5) return 'CRITICAL';
    if (window.heapGrowthRate > 0.3) return 'HIGH';
    if (window.heapGrowthRate > 0.15) return 'MEDIUM';
    return 'LOW';
  }

  /** Generate recommendation based on leak analysis */
  private generateRecommendation(suspects: SuspectedLeak[], paths: RetentionPath[]): string {
    const recommendations: string[] = [];

    if (paths.some((p) => p.isCircular)) {
      recommendations.push('Break circular references using WeakRef or WeakMap for back-references.');
    }

    for (const suspect of suspects.slice(0, 3)) {
      if (suspect.objectType.includes('Listener') || suspect.objectType.includes('Handler')) {
        recommendations.push(`Remove event listeners for ${suspect.objectType} when components are destroyed.`);
      } else if (suspect.objectType.includes('Timer') || suspect.objectType.includes('Interval')) {
        recommendations.push(`Clear timers/intervals for ${suspect.objectType} in cleanup.`);
      } else {
        recommendations.push(`Investigate growing ${suspect.objectType} instances (${suspect.growthPerSnapshot.toFixed(1)}/snapshot).`);
      }
    }

    return recommendations.join(' ');
  }
}
