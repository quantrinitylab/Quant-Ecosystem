export type NodeStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface StorageNode {
  id: string;
  az: string;
  storagePath: string;
  status: NodeStatus;
  generation: number;
  lastHeartbeat: number;
}

export interface ClusterConfig {
  nodes: Array<{
    id: string;
    az: string;
    storagePath: string;
  }>;
  heartbeatTimeoutMs?: number;
}

export class ClusterStateManager {
  private readonly nodes: Map<string, StorageNode> = new Map();
  private readonly repoGenerations: Map<string, Map<string, number>> = new Map(); // repoKey -> (nodeId -> generation)
  private readonly heartbeatTimeoutMs: number;

  constructor(config?: ClusterConfig) {
    this.heartbeatTimeoutMs = config?.heartbeatTimeoutMs ?? 5000;

    const defaultNodes = config?.nodes ?? [
      { id: 'node-az1', az: 'us-east-1a', storagePath: '/var/git/az1' },
      { id: 'node-az2', az: 'us-east-1b', storagePath: '/var/git/az2' },
      { id: 'node-az3', az: 'us-east-1c', storagePath: '/var/git/az3' },
    ];

    for (const n of defaultNodes) {
      this.nodes.set(n.id, {
        ...n,
        status: 'HEALTHY',
        generation: 0,
        lastHeartbeat: Date.now(),
      });
    }
  }

  getNodes(): StorageNode[] {
    return Array.from(this.nodes.values());
  }

  getNode(id: string): StorageNode | undefined {
    return this.nodes.get(id);
  }

  recordHeartbeat(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.lastHeartbeat = Date.now();
      if (node.status === 'UNAVAILABLE') {
        node.status = 'DEGRADED'; // Reconnecting node needs reconciliation
      }
    }
  }

  setNodeStatus(id: string, status: NodeStatus): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = status;
    }
  }

  getHealthyNodes(): StorageNode[] {
    const now = Date.now();
    return Array.from(this.nodes.values()).filter((n) => {
      const isAlive = now - n.lastHeartbeat <= this.heartbeatTimeoutMs;
      if (!isAlive && n.status === 'HEALTHY') {
        n.status = 'UNAVAILABLE';
      }
      return n.status === 'HEALTHY' && isAlive;
    });
  }

  getActiveNodes(): StorageNode[] {
    const now = Date.now();
    return Array.from(this.nodes.values()).filter((n) => {
      const isAlive = now - n.lastHeartbeat <= this.heartbeatTimeoutMs;
      if (!isAlive) {
        n.status = 'UNAVAILABLE';
        return false;
      }
      return n.status !== 'UNAVAILABLE';
    });
  }

  getRepoGeneration(repoKey: string, nodeId: string): number {
    const map = this.repoGenerations.get(repoKey);
    return map?.get(nodeId) ?? 0;
  }

  setRepoGeneration(repoKey: string, nodeId: string, generation: number): void {
    let map = this.repoGenerations.get(repoKey);
    if (!map) {
      map = new Map();
      this.repoGenerations.set(repoKey, map);
    }
    map.set(nodeId, generation);
  }

  getHighestGeneration(repoKey: string): number {
    const map = this.repoGenerations.get(repoKey);
    if (!map || map.size === 0) return 0;
    return Math.max(...Array.from(map.values()));
  }

  getPrimaryNode(repoKey: string): StorageNode | null {
    const highestGen = this.getHighestGeneration(repoKey);
    const activeNodes = this.getHealthyNodes();

    // Prefer healthy node with the highest generation
    for (const node of activeNodes) {
      if (this.getRepoGeneration(repoKey, node.id) === highestGen) {
        return node;
      }
    }

    return activeNodes[0] ?? null;
  }
}
