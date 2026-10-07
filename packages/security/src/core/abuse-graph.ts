// ============================================================================
// Security Package - Abuse Graph for Sybil Detection
// ============================================================================

import { z } from 'zod';

export const SybilClusterSchema = z.object({
  id: z.string(),
  members: z.array(z.string()),
  density: z.number().min(0).max(1),
  targets: z.array(z.string()),
  riskScore: z.number().min(0).max(1),
});

export type SybilCluster = z.infer<typeof SybilClusterSchema>;

export const AbuseReportSchema = z.object({
  reporterId: z.string(),
  targetId: z.string(),
  timestamp: z.number().optional(),
});

export type AbuseReport = z.infer<typeof AbuseReportSchema>;

/**
 * AbuseGraph - Builds a directed graph of reports between users.
 * Nodes are users, edges are reports. Detects sybil clusters
 * where groups of coordinated accounts report the same targets.
 */
export class AbuseGraph {
  private adjacencyList: Map<string, Map<string, number>>;
  private incomingReports: Map<string, Map<string, number>>;
  private reportTimestamps: Map<string, number[]>;
  private cachedClusters: SybilCluster[] | null;
  private clustersDirty: boolean;
  private readonly windowMs: number;

  constructor(windowMinutes: number = 10) {
    this.adjacencyList = new Map();
    this.incomingReports = new Map();
    this.reportTimestamps = new Map();
    this.cachedClusters = null;
    this.clustersDirty = true;
    this.windowMs = windowMinutes * 60 * 1000;
  }

  /** Add a report edge from reporter to target */
  addReport(reporterId: string, targetId: string): void {
    if (!this.adjacencyList.has(reporterId)) {
      this.adjacencyList.set(reporterId, new Map());
    }
    const edges = this.adjacencyList.get(reporterId)!;
    edges.set(targetId, (edges.get(targetId) ?? 0) + 1);

    if (!this.incomingReports.has(targetId)) {
      this.incomingReports.set(targetId, new Map());
    }
    const incoming = this.incomingReports.get(targetId)!;
    incoming.set(reporterId, (incoming.get(reporterId) ?? 0) + 1);

    if (!this.reportTimestamps.has(reporterId)) {
      this.reportTimestamps.set(reporterId, []);
    }
    const timestamps = this.reportTimestamps.get(reporterId)!;
    timestamps.push(Date.now());
    this.pruneTimestamps(timestamps);

    this.clustersDirty = true;
  }

  /** Add multiple reports at once */
  addBulkReports(reports: { reporterId: string; targetId: string }[]): void {
    for (const report of reports) {
      this.addReport(report.reporterId, report.targetId);
    }
  }

  /**
   * Detect sybil clusters - groups of users with high interconnection
   * who target the same users. Uses connected component analysis with
   * density thresholding. Results are cached until the graph is modified.
   */
  detectSybilClusters(minClusterSize: number = 3, densityThreshold: number = 0.5): SybilCluster[] {
    if (!this.clustersDirty && this.cachedClusters !== null) {
      return this.cachedClusters;
    }

    const clusters: SybilCluster[] = [];
    const reporters = Array.from(this.adjacencyList.keys());

    // Build co-reporting graph: two reporters are connected if they report the same targets
    const coReportEdges = new Map<string, Set<string>>();
    for (const reporter of reporters) {
      coReportEdges.set(reporter, new Set());
    }

    for (let i = 0; i < reporters.length; i++) {
      const targetsI = this.adjacencyList.get(reporters[i]!);
      if (!targetsI) continue;
      for (let j = i + 1; j < reporters.length; j++) {
        const targetsJ = this.adjacencyList.get(reporters[j]!);
        if (!targetsJ) continue;

        // Check if they share targets
        let sharedTargets = 0;
        for (const target of targetsI.keys()) {
          if (targetsJ.has(target)) {
            sharedTargets++;
          }
        }
        if (sharedTargets > 0) {
          coReportEdges.get(reporters[i]!)!.add(reporters[j]!);
          coReportEdges.get(reporters[j]!)!.add(reporters[i]!);
        }
      }
    }

    // Find connected components in co-reporting graph
    const visited = new Set<string>();
    for (const reporter of reporters) {
      if (visited.has(reporter)) continue;

      const component: string[] = [];
      const queue: string[] = [reporter];
      while (queue.length > 0) {
        const node = queue.pop()!;
        if (visited.has(node)) continue;
        visited.add(node);
        component.push(node);

        const neighbors = coReportEdges.get(node);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          }
        }
      }

      if (component.length >= minClusterSize) {
        // Calculate density: actual edges / possible edges
        const possibleEdges = (component.length * (component.length - 1)) / 2;
        let actualEdges = 0;
        for (let i = 0; i < component.length; i++) {
          const neighbors = coReportEdges.get(component[i]!);
          if (neighbors) {
            for (let j = i + 1; j < component.length; j++) {
              if (neighbors.has(component[j]!)) {
                actualEdges++;
              }
            }
          }
        }
        const density = possibleEdges > 0 ? actualEdges / possibleEdges : 0;

        if (density >= densityThreshold) {
          // Find common targets
          const targetCounts = new Map<string, number>();
          for (const member of component) {
            const targets = this.adjacencyList.get(member);
            if (targets) {
              for (const target of targets.keys()) {
                targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
              }
            }
          }

          // Targets reported by multiple members
          const sharedTargets = Array.from(targetCounts.entries())
            .filter(([, count]) => count >= 2)
            .map(([target]) => target);

          const riskScore = Math.min(1, density * (component.length / minClusterSize) * 0.5);

          clusters.push({
            id: `cluster-${clusters.length + 1}`,
            members: component,
            density,
            targets: sharedTargets,
            riskScore,
          });
        }
      }
    }

    this.cachedClusters = clusters;
    this.clustersDirty = false;

    return clusters;
  }

  /** Get risk score for a user (0-1) based on reports and cluster membership */
  getUserRisk(userId: string): number {
    let risk = 0;

    // Factor 1: Number of reports received
    const incoming = this.incomingReports.get(userId);
    if (incoming) {
      const totalReports = Array.from(incoming.values()).reduce((sum, count) => sum + count, 0);
      risk += Math.min(0.4, totalReports * 0.05);
    }

    // Factor 2: Is user in a sybil cluster?
    const cluster = this.getClusterForUser(userId);
    if (cluster) {
      risk += cluster.riskScore * 0.4;
    }

    // Factor 3: Report velocity (how quickly they report others)
    const timestamps = this.reportTimestamps.get(userId);
    if (timestamps && timestamps.length > 2) {
      this.pruneTimestamps(timestamps);
      const sorted = [...timestamps].sort((a, b) => a - b);
      const timeDiffs: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        timeDiffs.push(sorted[i]! - sorted[i - 1]!);
      }
      const avgInterval = timeDiffs.reduce((sum, d) => sum + d, 0) / timeDiffs.length;
      // Very fast reporting (< 1 second average) is suspicious
      if (avgInterval < 1000) {
        risk += 0.2;
      } else if (avgInterval < 5000) {
        risk += 0.1;
      }
    }

    return Math.min(1, risk);
  }

  /** Get the sybil cluster containing a user, if any */
  getClusterForUser(userId: string): SybilCluster | null {
    const clusters = this.detectSybilClusters();
    for (const cluster of clusters) {
      if (cluster.members.includes(userId)) {
        return cluster;
      }
    }
    return null;
  }

  /** Prune timestamps older than the sliding window */
  private pruneTimestamps(timestamps: number[]): void {
    const cutoff = Date.now() - this.windowMs;
    let i = 0;
    while (i < timestamps.length && timestamps[i]! < cutoff) {
      i++;
    }
    if (i > 0) {
      timestamps.splice(0, i);
    }
  }

  /** Reset the entire graph */
  reset(): void {
    this.adjacencyList.clear();
    this.incomingReports.clear();
    this.reportTimestamps.clear();
    this.cachedClusters = null;
    this.clustersDirty = true;
  }
}
