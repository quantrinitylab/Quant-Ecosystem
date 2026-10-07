export interface ResourceLock {
  resourceId: string;
  agentId: string;
  acquiredAt: number;
}

export interface ConflictResult {
  resolved: boolean;
  winner: string;
  loser: string;
  resourceId: string;
}

export class ConflictResolver {
  private locks: Map<string, ResourceLock> = new Map();

  acquireLock(resourceId: string, agentId: string): boolean {
    const existing = this.locks.get(resourceId);
    if (existing && existing.agentId !== agentId) {
      return false;
    }
    this.locks.set(resourceId, {
      resourceId,
      agentId,
      acquiredAt: Date.now(),
    });
    return true;
  }

  releaseLock(resourceId: string, agentId: string): boolean {
    const existing = this.locks.get(resourceId);
    if (!existing || existing.agentId !== agentId) {
      return false;
    }
    this.locks.delete(resourceId);
    return true;
  }

  isLocked(resourceId: string): boolean {
    return this.locks.has(resourceId);
  }

  getLockHolder(resourceId: string): string | undefined {
    return this.locks.get(resourceId)?.agentId;
  }

  resolveConflict(resourceId: string, agents: [string, string]): ConflictResult {
    const existing = this.locks.get(resourceId);
    // First-come-first-served: the agent already holding the lock wins
    const winner = existing?.agentId === agents[0] ? agents[0] : agents[1];
    const loser = winner === agents[0] ? agents[1] : agents[0];

    // Ensure the winner has the lock
    this.locks.set(resourceId, {
      resourceId,
      agentId: winner,
      acquiredAt: existing?.acquiredAt ?? Date.now(),
    });

    return {
      resolved: true,
      winner,
      loser,
      resourceId,
    };
  }

  getActiveLocks(): ReadonlyArray<ResourceLock> {
    return Array.from(this.locks.values());
  }
}
