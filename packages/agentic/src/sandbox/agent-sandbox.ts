import { EventEmitter } from 'events';

export interface SandboxExecution {
  id: string;
  agentId: string;
  task: string;
  result: any;
  safe: boolean;
  violations: string[];
  timestamp: Date;
}

export class AgentSandbox extends EventEmitter {
  private executions: SandboxExecution[] = [];
  private blockedPatterns: string[] = ['rm -rf', 'delete *', 'sudo', 'eval('];

  async executeInSandbox(
    agentId: string,
    task: string,
    executionFn: () => Promise<any>,
  ): Promise<SandboxExecution> {
    const id = `sandbox-${Date.now()}`;
    let safe = true;
    const violations: string[] = [];

    // Pre-execution safety check
    for (const pattern of this.blockedPatterns) {
      if (task.toLowerCase().includes(pattern)) {
        safe = false;
        violations.push(`Blocked pattern: ${pattern}`);
      }
    }

    let result: any = null;
    if (safe) {
      try {
        result = await executionFn();
      } catch (error) {
        safe = false;
        violations.push(`Execution error: ${error}`);
      }
    }

    const execution: SandboxExecution = {
      id,
      agentId,
      task,
      result,
      safe,
      violations,
      timestamp: new Date(),
    };

    this.executions.push(execution);
    this.emit('sandbox:execution', execution);

    return execution;
  }

  getSafeExecutions(agentId?: string): SandboxExecution[] {
    let filtered = this.executions.filter((e) => e.safe);
    if (agentId) filtered = filtered.filter((e) => e.agentId === agentId);
    return filtered;
  }

  getViolations(): SandboxExecution[] {
    return this.executions.filter((e) => !e.safe);
  }
}
