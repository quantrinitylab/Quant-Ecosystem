// ============================================================================
// QuantAI - Conversation Branching Service
// Branch conversations to explore alternative paths
// ============================================================================

export interface ConversationBranch {
  id: string;
  conversationId: string;
  parentBranchId: string | null;
  fromMessageId: string;
  name: string;
  messageCount: number;
  createdAt: number;
}

export class ConversationBranchingService {
  private branches: Map<string, ConversationBranch> = new Map();
  private activeBranches: Map<string, string> = new Map(); // conversationId -> branchId
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `branch-${this.idCounter}`;
  }

  branch(conversationId: string, fromMessageId: string, name?: string): ConversationBranch {
    const activeBranchId = this.activeBranches.get(conversationId) ?? null;
    const branch: ConversationBranch = {
      id: this.generateId(),
      conversationId,
      parentBranchId: activeBranchId,
      fromMessageId,
      name: name ?? `Branch ${this.idCounter}`,
      messageCount: 0,
      createdAt: Date.now(),
    };
    this.branches.set(branch.id, branch);
    this.activeBranches.set(conversationId, branch.id);
    return branch;
  }

  deleteBranch(branchId: string): boolean {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    // If this is the active branch, revert to parent
    const activeId = this.activeBranches.get(branch.conversationId);
    if (activeId === branchId) {
      if (branch.parentBranchId) {
        this.activeBranches.set(branch.conversationId, branch.parentBranchId);
      } else {
        this.activeBranches.delete(branch.conversationId);
      }
    }

    this.branches.delete(branchId);
    return true;
  }

  getBranches(conversationId: string): ConversationBranch[] {
    const results: ConversationBranch[] = [];
    for (const branch of this.branches.values()) {
      if (branch.conversationId === conversationId) {
        results.push(branch);
      }
    }
    return results;
  }

  switchBranch(branchId: string): ConversationBranch | null {
    const branch = this.branches.get(branchId);
    if (!branch) return null;
    this.activeBranches.set(branch.conversationId, branchId);
    return branch;
  }

  getActiveBranch(conversationId: string): ConversationBranch | null {
    const activeId = this.activeBranches.get(conversationId);
    if (!activeId) return null;
    return this.branches.get(activeId) ?? null;
  }

  renameBranch(branchId: string, name: string): ConversationBranch | null {
    const branch = this.branches.get(branchId);
    if (!branch) return null;
    branch.name = name;
    return branch;
  }

  getBranchHistory(branchId: string): ConversationBranch[] {
    const history: ConversationBranch[] = [];
    let currentId: string | null = branchId;
    while (currentId) {
      const branch = this.branches.get(currentId);
      if (!branch) break;
      history.push(branch);
      currentId = branch.parentBranchId;
    }
    return history;
  }
}
