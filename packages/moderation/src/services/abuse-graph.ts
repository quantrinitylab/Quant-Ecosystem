// ============================================================================
// Moderation - Abuse Graph Service
// Tracks relationships between abusive accounts and detects abuse rings
// ============================================================================

import type { AbuseNode, AbuseEdge, AbuseCluster } from '../types';

interface AbuseGraphConfig {
  clusterMinSize: number;
  riskPropagationFactor: number;
}

const DEFAULT_CONFIG: AbuseGraphConfig = {
  clusterMinSize: 3,
  riskPropagationFactor: 0.5,
};

/**
 * AbuseGraphService - Abuse ring detection via graph analysis
 *
 * Tracks relationships between accounts (shared IPs, devices, coordinated
 * activity) and detects abuse clusters using connected component analysis.
 */
export class AbuseGraphService {
  private config: AbuseGraphConfig;
  private nodes: Map<string, AbuseNode>;
  private adjacency: Map<string, Map<string, AbuseEdge>>;
  private counter: number = 0;

  constructor(config: Partial<AbuseGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodes = new Map();
    this.adjacency = new Map();
  }

  /** Add or update a node in the abuse graph */
  addNode(userId: string, signals: string[] = []): AbuseNode {
    const existing = this.nodes.get(userId);
    const now = Date.now();

    if (existing) {
      existing.signals = [...new Set([...existing.signals, ...signals])];
      existing.lastSeen = now;
      existing.riskScore = this.calculateBaseRisk(existing.signals);
      return existing;
    }

    const node: AbuseNode = {
      userId,
      riskScore: this.calculateBaseRisk(signals),
      signals: [...signals],
      firstSeen: now,
      lastSeen: now,
    };

    this.nodes.set(userId, node);
    if (!this.adjacency.has(userId)) {
      this.adjacency.set(userId, new Map());
    }

    return node;
  }

  /** Add an edge between two nodes */
  addEdge(params: {
    fromUserId: string;
    toUserId: string;
    type: AbuseEdge['type'];
    weight?: number;
  }): AbuseEdge {
    const { fromUserId, toUserId, type, weight = 1 } = params;

    // Ensure both nodes exist
    if (!this.nodes.has(fromUserId)) {
      this.addNode(fromUserId);
    }
    if (!this.nodes.has(toUserId)) {
      this.addNode(toUserId);
    }

    const edge: AbuseEdge = {
      fromUserId,
      toUserId,
      type,
      weight,
      createdAt: Date.now(),
    };

    // Add bidirectional edges
    if (!this.adjacency.has(fromUserId)) {
      this.adjacency.set(fromUserId, new Map());
    }
    if (!this.adjacency.has(toUserId)) {
      this.adjacency.set(toUserId, new Map());
    }

    this.adjacency.get(fromUserId)!.set(toUserId, edge);
    this.adjacency.get(toUserId)!.set(fromUserId, {
      ...edge,
      fromUserId: toUserId,
      toUserId: fromUserId,
    });

    return edge;
  }

  /** Find clusters of connected accounts meeting minimum size */
  findClusters(): AbuseCluster[] {
    const visited = new Set<string>();
    const clusters: AbuseCluster[] = [];

    for (const userId of this.nodes.keys()) {
      if (visited.has(userId)) continue;

      const component = this.bfs(userId, visited);

      if (component.length >= this.config.clusterMinSize) {
        this.counter++;
        const memberSignals = new Set<string>();
        let totalRisk = 0;

        for (const memberId of component) {
          const node = this.nodes.get(memberId);
          if (node) {
            node.signals.forEach((s) => memberSignals.add(s));
            totalRisk += node.riskScore;
          }
        }

        clusters.push({
          id: `cluster_${Date.now()}_${this.counter}`,
          memberIds: component,
          riskScore: totalRisk / component.length,
          signals: [...memberSignals],
          detectedAt: Date.now(),
        });
      }
    }

    return clusters;
  }

  /** Get directly connected account IDs */
  getRelatedAccounts(userId: string): string[] {
    const neighbors = this.adjacency.get(userId);
    if (!neighbors) return [];
    return [...neighbors.keys()];
  }

  /** Get risk score for an account (own signals + neighbor influence) */
  getAccountRiskScore(userId: string): number {
    const node = this.nodes.get(userId);
    if (!node) return 0;

    const baseRisk = node.riskScore;
    const neighbors = this.adjacency.get(userId);
    if (!neighbors || neighbors.size === 0) return baseRisk;

    let neighborInfluence = 0;
    for (const [neighborId, edge] of neighbors) {
      const neighborNode = this.nodes.get(neighborId);
      if (neighborNode) {
        neighborInfluence += neighborNode.riskScore * edge.weight;
      }
    }

    const avgNeighborInfluence = neighborInfluence / neighbors.size;
    return Math.min(100, baseRisk + avgNeighborInfluence * this.config.riskPropagationFactor);
  }

  /** Remove a node and all its edges */
  removeNode(userId: string): boolean {
    if (!this.nodes.has(userId)) return false;

    // Remove all edges to this node
    const neighbors = this.adjacency.get(userId);
    if (neighbors) {
      for (const neighborId of neighbors.keys()) {
        const neighborAdj = this.adjacency.get(neighborId);
        if (neighborAdj) {
          neighborAdj.delete(userId);
        }
      }
    }

    this.adjacency.delete(userId);
    this.nodes.delete(userId);
    return true;
  }

  // --- Private Methods ---

  private bfs(startUserId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const queue: string[] = [startUserId];
    visited.add(startUserId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const neighbors = this.adjacency.get(current);
      if (neighbors) {
        for (const neighborId of neighbors.keys()) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }

    return component;
  }

  private calculateBaseRisk(signals: string[]): number {
    if (signals.length === 0) return 0;
    // Each signal contributes 15 points, capped at 100
    return Math.min(100, signals.length * 15);
  }
}
