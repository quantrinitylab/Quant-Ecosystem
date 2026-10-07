import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClusterStateManager } from '../cluster-state.js';
import { PraefectWriteCoordinator } from '../praefect-coordinator.js';

describe('Distributed Praefect 3-Node Raft Consensus Write Coordinator', () => {
  let clusterState: ClusterStateManager;
  let coordinator: PraefectWriteCoordinator;
  let mockCreateQuarantine: any;
  let mockCleanupQuarantine: any;
  let mockCommitQuarantine: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateQuarantine = vi.fn().mockResolvedValue(undefined);
    mockCleanupQuarantine = vi.fn().mockResolvedValue(undefined);
    mockCommitQuarantine = vi.fn().mockResolvedValue(undefined);

    clusterState = new ClusterStateManager({
      nodes: [
        { id: 'node-az1', az: 'us-east-1a', storagePath: '/var/git/az1' },
        { id: 'node-az2', az: 'us-east-1b', storagePath: '/var/git/az2' },
        { id: 'node-az3', az: 'us-east-1c', storagePath: '/var/git/az3' },
      ],
      heartbeatTimeoutMs: 5000,
    });

    coordinator = new PraefectWriteCoordinator(clusterState, {
      createQuarantine: mockCreateQuarantine,
      cleanupQuarantine: mockCleanupQuarantine,
      commitQuarantine: mockCommitQuarantine,
    });
  });

  describe('Cluster Initialization & Node Topology', () => {
    it('initializes 3 storage nodes across 3 availability zones in HEALTHY state', () => {
      const nodes = clusterState.getNodes();
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.id)).toEqual(['node-az1', 'node-az2', 'node-az3']);
      expect(nodes.every((n) => n.status === 'HEALTHY')).toBe(true);
      expect(nodes.map((n) => n.az)).toEqual(['us-east-1a', 'us-east-1b', 'us-east-1c']);
    });

    it('identifies primary node with highest generation', () => {
      const primary = clusterState.getPrimaryNode('alice/my-repo');
      expect(primary).toBeDefined();
      expect(primary?.status).toBe('HEALTHY');
    });
  });

  describe('Quorum Commit Lifecycle (2-of-3 Raft Consensus)', () => {
    const packHash = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';

    it('commits successfully when all 3 nodes acknowledge with identical packfile hash (3/3)', async () => {
      const tx = await coordinator.beginTransaction(
        'alice',
        'my-repo',
        'refs/heads/main',
        'commit-sha-1',
      );
      expect(tx.state).toBe('PENDING');
      expect(mockCreateQuarantine).toHaveBeenCalledTimes(3);

      await coordinator.vote(tx.id, 'node-az1', packHash, true);
      await coordinator.vote(tx.id, 'node-az2', packHash, true);
      await coordinator.vote(tx.id, 'node-az3', packHash, true);

      const result = await coordinator.commitTransaction(tx.id);
      expect(result.committed).toBe(true);
      expect(result.quorumReached).toBe(true);
      expect(result.nodesCommitted).toHaveLength(3);
      expect(result.generation).toBe(1);

      expect(mockCommitQuarantine).toHaveBeenCalledTimes(3);
      expect(mockCleanupQuarantine).toHaveBeenCalledTimes(3);

      // Verify all nodes reached generation 1
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az1')).toBe(1);
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az2')).toBe(1);
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az3')).toBe(1);
    });

    it('commits successfully when 2-of-3 majority nodes acknowledge and marks lagging node DEGRADED', async () => {
      const tx = await coordinator.beginTransaction(
        'alice',
        'my-repo',
        'refs/heads/main',
        'commit-sha-2',
      );

      // node-az1 and node-az2 succeed; node-az3 fails or is partitioned
      await coordinator.vote(tx.id, 'node-az1', packHash, true);
      await coordinator.vote(tx.id, 'node-az2', packHash, true);
      await coordinator.vote(tx.id, 'node-az3', packHash, false);

      const result = await coordinator.commitTransaction(tx.id);
      expect(result.committed).toBe(true);
      expect(result.quorumReached).toBe(true);
      expect(result.nodesCommitted).toEqual(['node-az1', 'node-az2']);
      expect(result.generation).toBe(1);

      // node-az3 missed the commit; marked as DEGRADED
      expect(clusterState.getNode('node-az3')?.status).toBe('DEGRADED');
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az3')).toBe(0);
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az1')).toBe(1);
    });

    it('aborts and rolls back transaction when quorum fails (only 1 node acknowledges)', async () => {
      const tx = await coordinator.beginTransaction(
        'alice',
        'my-repo',
        'refs/heads/main',
        'commit-sha-3',
      );

      // Only 1 node succeeds
      await coordinator.vote(tx.id, 'node-az1', packHash, true);
      await coordinator.vote(tx.id, 'node-az2', packHash, false);
      await coordinator.vote(tx.id, 'node-az3', packHash, false);

      const result = await coordinator.commitTransaction(tx.id);
      expect(result.committed).toBe(false);
      expect(result.quorumReached).toBe(false);
      expect(result.error).toContain('Raft quorum not reached');

      // Verify transaction aborted and quarantined objects cleaned up
      expect(coordinator.getTransaction(tx.id)?.state).toBe('ABORTED');
      expect(mockCommitQuarantine).not.toHaveBeenCalled();
      expect(mockCleanupQuarantine).toHaveBeenCalledTimes(3);
    });

    it('aborts transaction when nodes disagree on packfile hash (split vote)', async () => {
      const tx = await coordinator.beginTransaction(
        'alice',
        'my-repo',
        'refs/heads/main',
        'commit-sha-4',
      );

      // 3 different hashes
      await coordinator.vote(tx.id, 'node-az1', 'hash-A', true);
      await coordinator.vote(tx.id, 'node-az2', 'hash-B', true);
      await coordinator.vote(tx.id, 'node-az3', 'hash-C', true);

      const result = await coordinator.commitTransaction(tx.id);
      expect(result.committed).toBe(false);
      expect(result.quorumReached).toBe(false);
    });
  });

  describe('Node Partition, Heartbeat & Automatic Reconciliation', () => {
    it('detects missing heartbeat and marks node as UNAVAILABLE', () => {
      const node = clusterState.getNode('node-az2');
      expect(node).toBeDefined();

      // Simulate expired heartbeat (> 5000ms ago)
      node!.lastHeartbeat = Date.now() - 10000;

      const healthy = clusterState.getHealthyNodes();
      expect(healthy.map((n) => n.id)).toEqual(['node-az1', 'node-az3']);
      expect(clusterState.getNode('node-az2')?.status).toBe('UNAVAILABLE');
    });

    it('reconciles lagging degraded node by catching up generation from primary', async () => {
      // First transaction with quorum on node-az1 and node-az2
      const tx = await coordinator.beginTransaction(
        'alice',
        'my-repo',
        'refs/heads/main',
        'commit-sha-1',
      );
      await coordinator.vote(tx.id, 'node-az1', 'hash-1', true);
      await coordinator.vote(tx.id, 'node-az2', 'hash-1', true);
      await coordinator.commitTransaction(tx.id);

      expect(clusterState.getNode('node-az3')?.status).toBe('DEGRADED');
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az3')).toBe(0);

      // Reconcile node-az3
      const reconcileResult = await coordinator.reconcileNode('node-az3', 'alice', 'my-repo');
      expect(reconcileResult.reconciled).toBe(true);
      expect(reconcileResult.newGeneration).toBe(1);

      expect(clusterState.getNode('node-az3')?.status).toBe('HEALTHY');
      expect(clusterState.getRepoGeneration('alice/my-repo', 'node-az3')).toBe(1);
    });
  });
});
