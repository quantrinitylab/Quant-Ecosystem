export interface RefUpdate {
  oldSha: string;
  newSha: string;
  refName: string;
}

export interface PreReceiveResult {
  allowed: boolean;
  reason?: string;
}

export interface BranchProtectionRule {
  branchPattern: string;
  requiredApprovals: number;
  requireStatusChecks: boolean;
}

export class GitHooksService {
  private protectionRules: Map<string, BranchProtectionRule[]>;

  constructor(protectionRules?: Map<string, BranchProtectionRule[]>) {
    this.protectionRules = protectionRules ?? new Map();
  }

  async preReceive(repoId: string, refs: RefUpdate[]): Promise<PreReceiveResult> {
    const rules = this.protectionRules.get(repoId) ?? [];

    for (const ref of refs) {
      for (const rule of rules) {
        if (this.matchesBranchPattern(ref.refName, rule.branchPattern)) {
          // Deny force pushes to protected branches (old sha is not zero and new sha rewrites history)
          if (this.isForceDelete(ref)) {
            return {
              allowed: false,
              reason: `Cannot delete protected branch matching pattern '${rule.branchPattern}'`,
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  async postReceive(repoId: string, _refs: RefUpdate[]): Promise<void> {
    // Trigger CI runs, notifications, etc.
    // This is a hook point for integration with CI service
    void repoId;
  }

  setProtectionRules(repoId: string, rules: BranchProtectionRule[]): void {
    this.protectionRules.set(repoId, rules);
  }

  private matchesBranchPattern(refName: string, pattern: string): boolean {
    const branchName = refName.replace('refs/heads/', '');
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return branchName.startsWith(pattern.slice(0, -1));
    }
    return branchName === pattern;
  }

  private isForceDelete(ref: RefUpdate): boolean {
    const zeroes = '0000000000000000000000000000000000000000';
    return ref.newSha === zeroes;
  }
}
