export interface SandboxAction {
  id: string;
  agentId: string;
  action: string;
  params: Record<string, unknown>;
  timestamp: number;
  wouldHaveExecuted: boolean;
}

export class AgentSandbox {
  private sandboxMode: boolean = true;
  private log: SandboxAction[] = [];

  constructor(sandboxMode: boolean = true) {
    this.sandboxMode = sandboxMode;
  }

  execute(agentId: string, action: string, params: Record<string, unknown> = {}): SandboxAction {
    const entry: SandboxAction = {
      id: `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      action,
      params,
      timestamp: Date.now(),
      wouldHaveExecuted: this.sandboxMode,
    };
    this.log.push(entry);
    return entry;
  }

  getLog(): ReadonlyArray<SandboxAction> {
    return [...this.log];
  }

  isInSandbox(): boolean {
    return this.sandboxMode;
  }

  promote(): void {
    this.sandboxMode = false;
  }

  reset(): void {
    this.sandboxMode = true;
    this.log = [];
  }
}
