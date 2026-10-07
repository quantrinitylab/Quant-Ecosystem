import type { AgentPlan, AgentWorkflowResult, ToolDefinition } from '../types.js';
import type { ExecutionEngine } from '../execution-engine.js';

export abstract class BaseWorkflow {
  protected plan: AgentPlan | null = null;
  protected result: AgentWorkflowResult | null = null;

  constructor(protected executionEngine: ExecutionEngine) {}

  abstract get name(): string;
  abstract get description(): string;
  abstract getTools(): ToolDefinition[];
  abstract buildPlan(input: Record<string, unknown>): AgentPlan;

  async execute(input: Record<string, unknown>, agentId: string): Promise<AgentWorkflowResult> {
    this.plan = this.buildPlan(input);
    this.result = await this.executionEngine.executePlan(this.plan, agentId);
    return this.result;
  }

  getAuditTrail(): string[] {
    return this.result?.auditEntries ?? [];
  }

  getUndoableActions(): string[] {
    return this.result?.undoableActions ?? [];
  }

  getCost(): number {
    return this.result?.totalCost ?? 0;
  }

  getPlan(): AgentPlan | null {
    return this.plan;
  }
}
