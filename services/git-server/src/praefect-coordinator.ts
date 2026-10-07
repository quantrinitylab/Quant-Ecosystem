import { ClusterStateManager } from './cluster-state.js';
import crypto from 'node:crypto';

export type TransactionState = 'PENDING' | 'COMMITTED' | 'ABORTED';

export interface PraefectTransaction {
  id: string;
  owner: string;
  repo: string;
  ref: string;
  targetSha: string;
  state: TransactionState;
  createdAt: number;
  votes: Map<string, { packfileHash: string; success: boolean }>;
  quarantineDirs: Map<string, string>;
}

export interface CommitResult {
  committed: boolean;
  quorumReached: boolean;
  nodesCommitted: string[];
  generation: number;
  error?: string;
}

export class PraefectWriteCoordinator {
  private readonly transactions: Map<string, PraefectTransaction> = new Map();

  constructor(
    private readonly clusterState: ClusterStateManager,
    private readonly fileOps?: {
      createQuarantine?: (path: string) => Promise<void>;
      cleanupQuarantine?: (path: string) => Promise<void>;
      commitQuarantine?: (quarantinePath: string, repoPath: string) => Promise<void>;
    },
  ) {}

  async beginTransaction(
    owner: string,
    repo: string,
    ref: string,
    targetSha: string,
  ): Promise<PraefectTransaction> {
    const id = `tx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const cleanRepo = repo.replace(/\.git$/, '');
    const nodes = this.clusterState.getHealthyNodes();

    const quarantineDirs = new Map<string, string>();
    for (const node of nodes) {
      const qPath = `${node.storagePath}/${owner}/${cleanRepo}.git/quarantine/${id}`;
      quarantineDirs.set(node.id, qPath);
      if (this.fileOps?.createQuarantine) {
        await this.fileOps.createQuarantine(qPath);
      }
    }

    const tx: PraefectTransaction = {
      id,
      owner,
      repo: cleanRepo,
      ref,
      targetSha,
      state: 'PENDING',
      createdAt: Date.now(),
      votes: new Map(),
      quarantineDirs,
    };

    this.transactions.set(id, tx);
    return tx;
  }

  async vote(
    transactionId: string,
    nodeId: string,
    packfileHash: string,
    success: boolean,
  ): Promise<void> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    if (tx.state !== 'PENDING') {
      throw new Error(`Transaction ${transactionId} is already ${tx.state}`);
    }

    tx.votes.set(nodeId, { packfileHash, success });
  }

  async commitTransaction(transactionId: string): Promise<CommitResult> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    if (tx.state !== 'PENDING') {
      return {
        committed: tx.state === 'COMMITTED',
        quorumReached: tx.state === 'COMMITTED',
        nodesCommitted: [],
        generation: 0,
        error: `Transaction already ${tx.state}`,
      };
    }

    const totalNodes = this.clusterState.getNodes().length; // 3 nodes
    const quorumRequired = Math.floor(totalNodes / 2) + 1; // 2 of 3 quorum

    // Count successful votes by packfileHash
    const hashCounts = new Map<string, string[]>();
    for (const [nodeId, vote] of tx.votes.entries()) {
      if (vote.success && vote.packfileHash) {
        const list = hashCounts.get(vote.packfileHash) ?? [];
        list.push(nodeId);
        hashCounts.set(vote.packfileHash, list);
      }
    }

    // Find if any hash achieved quorum (>= 2)
    let consensusHash: string | null = null;
    let committedNodes: string[] = [];

    for (const [hash, nodes] of hashCounts.entries()) {
      if (nodes.length >= quorumRequired) {
        consensusHash = hash;
        committedNodes = nodes;
        break;
      }
    }

    const repoKey = `${tx.owner}/${tx.repo}`;

    if (!consensusHash || committedNodes.length < quorumRequired) {
      // Quorum failure - rollback
      tx.state = 'ABORTED';
      await this.cleanupTransaction(tx);

      return {
        committed: false,
        quorumReached: false,
        nodesCommitted: [],
        generation: this.clusterState.getHighestGeneration(repoKey),
        error: `Raft quorum not reached: needed ${quorumRequired}, got ${committedNodes.length}`,
      };
    }

    // Quorum reached! Commit transaction
    tx.state = 'COMMITTED';
    const newGeneration = this.clusterState.getHighestGeneration(repoKey) + 1;

    // Apply commit on each quorum node
    for (const nodeId of committedNodes) {
      const node = this.clusterState.getNode(nodeId);
      const qPath = tx.quarantineDirs.get(nodeId);
      if (node && qPath && this.fileOps?.commitQuarantine) {
        await this.fileOps.commitQuarantine(
          qPath,
          `${node.storagePath}/${tx.owner}/${tx.repo}.git`,
        );
      }
      this.clusterState.setRepoGeneration(repoKey, nodeId, newGeneration);
    }

    // Mark nodes that did not vote or failed as DEGRADED
    const allNodes = this.clusterState.getNodes();
    for (const node of allNodes) {
      if (!committedNodes.includes(node.id)) {
        this.clusterState.setNodeStatus(node.id, 'DEGRADED');
      }
    }

    // Clean up quarantine directories
    await this.cleanupTransaction(tx);

    return {
      committed: true,
      quorumReached: true,
      nodesCommitted: committedNodes,
      generation: newGeneration,
    };
  }

  async abortTransaction(transactionId: string): Promise<void> {
    const tx = this.transactions.get(transactionId);
    if (tx && tx.state === 'PENDING') {
      tx.state = 'ABORTED';
      await this.cleanupTransaction(tx);
    }
  }

  getTransaction(transactionId: string): PraefectTransaction | undefined {
    return this.transactions.get(transactionId);
  }

  async reconcileNode(
    targetNodeId: string,
    owner: string,
    repo: string,
  ): Promise<{ reconciled: boolean; newGeneration: number }> {
    const cleanRepo = repo.replace(/\.git$/, '');
    const repoKey = `${owner}/${cleanRepo}`;
    const highestGen = this.clusterState.getHighestGeneration(repoKey);
    const targetGen = this.clusterState.getRepoGeneration(repoKey, targetNodeId);

    if (targetGen >= highestGen) {
      this.clusterState.setNodeStatus(targetNodeId, 'HEALTHY');
      return { reconciled: true, newGeneration: targetGen };
    }

    const primaryNode = this.clusterState.getPrimaryNode(repoKey);
    if (!primaryNode || primaryNode.id === targetNodeId) {
      return { reconciled: false, newGeneration: targetGen };
    }

    // Replicate state from primary to target node
    this.clusterState.setRepoGeneration(repoKey, targetNodeId, highestGen);
    this.clusterState.setNodeStatus(targetNodeId, 'HEALTHY');

    return {
      reconciled: true,
      newGeneration: highestGen,
    };
  }

  private async cleanupTransaction(tx: PraefectTransaction): Promise<void> {
    if (this.fileOps?.cleanupQuarantine) {
      for (const qPath of tx.quarantineDirs.values()) {
        try {
          await this.fileOps.cleanupQuarantine(qPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}
