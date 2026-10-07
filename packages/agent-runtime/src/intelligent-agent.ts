import { WorkerAgent } from './worker-agent.js';
import { AgentState } from './state-machine.js';
import { AgentActionTier } from './types.js';
import type {
  AgentPlan,
  CostEstimate,
  PlanStep,
  ToolDefinition,
  ToolExecutionResult,
} from './types.js';
import type { AIEnginePort } from './ai-engine.interface.js';
import type { TypedToolRegistry } from './typed-tool-registry.js';
import type { SpendingLimit } from './spending-limit.js';
import type { AgentTask } from './worker-agent.js';
import { PermissionLevel } from './permissions.js';
import { ApprovalQueue } from './approval-queue.js';
import { TrustScore } from './trust-score.js';
import { KillSwitch } from './kill-switch.js';

// ============================================================================
// Trace Types
// ============================================================================

export interface TraceEvent {
  phase: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  tokenCost: number;
}

// ============================================================================
// IntelligentAgent Configuration
// ============================================================================

export interface IntelligentAgentConfig {
  id: string;
  name: string;
  icon: string;
  defaultPermission: PermissionLevel;
  sandboxed?: boolean;
  aiEngine: AIEnginePort;
  toolRegistry: TypedToolRegistry;
  spendingLimit: SpendingLimit;
  approvalQueue?: ApprovalQueue;
}

// ============================================================================
// Constants
// ============================================================================

const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

const TIER_COST: Record<number, number> = {
  [AgentActionTier.Tier0_ReadOnly]: 0,
  [AgentActionTier.Tier1_DraftOnly]: 0.01,
  [AgentActionTier.Tier2_LowRisk]: 0.05,
  [AgentActionTier.Tier3_HighRisk]: 0.1,
  [AgentActionTier.Tier4_Admin]: 0.5,
};

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// IntelligentAgent
// ============================================================================

export abstract class IntelligentAgent extends WorkerAgent {
  protected readonly aiEngine: AIEnginePort;
  protected readonly toolRegistry: TypedToolRegistry;
  protected readonly spendingLimit: SpendingLimit;
  protected readonly approvalQueue: ApprovalQueue;

  private reasoningTrace: TraceEvent[] = [];
  private currentPlan: AgentPlan | null = null;
  private waitingApprovalSince: number | null = null;
  private idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(config: IntelligentAgentConfig) {
    super({
      id: config.id,
      name: config.name,
      icon: config.icon,
      defaultPermission: config.defaultPermission,
      sandboxed: config.sandboxed,
    });
    this.aiEngine = config.aiEngine;
    this.toolRegistry = config.toolRegistry;
    this.spendingLimit = config.spendingLimit;
    this.approvalQueue = config.approvalQueue ?? new ApprovalQueue();

    // Replace inherited trustScore with one that has onAutoPause wired to KillSwitch
    (this as { trustScore: TrustScore }).trustScore = new TrustScore(
      this.trustScore.getScore(),
      undefined,
      {
        agentId: this.id,
        onAutoPause: (agentId: string) => {
          const killSwitch = KillSwitch.getInstance();
          killSwitch.activate().catch(() => {
            // Best-effort halt
          });
          this.logAction(
            `Agent ${agentId} auto-paused: trust score below threshold`,
            'failure',
            false,
          );
        },
      },
    );

    this.registerHandoffTool();
  }

  private registerHandoffTool(): void {
    const handoffTools = this.getHandoffTools();
    for (const tool of handoffTools) {
      if (!this.toolRegistry.hasTool(tool.name)) {
        this.toolRegistry.registerTool(tool);
      }
    }
  }

  // ============================================================================
  // Abstract methods for subclasses
  // ============================================================================

  /**
   * Subclasses override to provide domain-specific tools.
   */
  protected abstract getAgentTools(): ToolDefinition[];

  /**
   * Subclasses override to provide domain-specific system prompt.
   */
  protected abstract getSystemPrompt(): string;

  // ============================================================================
  // Agent Handoff
  // ============================================================================

  /**
   * Returns all tools available to this agent: domain tools + meta tools (handoff).
   */
  protected getAllTools(): ToolDefinition[] {
    return [...this.getAgentTools(), ...this.getHandoffTools()];
  }

  private getHandoffTools(): ToolDefinition[] {
    const handoffTool: ToolDefinition = {
      name: 'agent.handoff',
      description: 'Hand off a task to another agent by invoking one of its tools',
      parameters: [
        {
          name: 'targetAgentId',
          type: 'string',
          description: 'ID of the agent to delegate to',
          required: true,
        },
        {
          name: 'toolName',
          type: 'string',
          description: 'Tool name to invoke on the target agent',
          required: true,
        },
        {
          name: 'args',
          type: 'object',
          description: 'Arguments to pass to the target tool',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'meta',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Placeholder: log the handoff request. Actual delegation handled at orchestrator level.
        return {
          success: true,
          data: {
            handoff: true,
            targetAgentId: args['targetAgentId'],
            toolName: args['toolName'],
            args: args['args'],
          },
          undoable: false,
        };
      },
    };
    return [handoffTool];
  }

  // ============================================================================
  // Main execution loop
  // ============================================================================

  async execute(task: AgentTask): Promise<void> {
    this.reasoningTrace = [];
    this.currentPlan = null;

    try {
      // Phase 1: Observe
      const context = await this.observe(task);

      // Phase 2: Plan
      const plan = await this.plan(context, task);
      this.currentPlan = plan;

      // Phase 3: Propose actions
      await this.proposeActions(plan);

      // Phase 4: Request permission for high-risk actions
      const approved = await this.requestPermission(plan);
      if (!approved) {
        this.stateMachine.transition(AgentState.FAILED);
        this.logAction(task.description, 'failure', false);
        return;
      }

      // Check spending limit before execution
      const costEstimate = this.getCostPreview();
      if (!this.spendingLimit.canSpend(costEstimate.totalEstimatedCost)) {
        this.stateMachine.transition(AgentState.FAILED);
        this.logAction(`Budget exceeded for: ${task.description}`, 'failure', false);
        return;
      }

      // Phase 5: Execute
      await this.executeActions(plan);

      // Phase 6: Reflect
      await this.reflect(plan, task);

      this.stateMachine.transition(AgentState.DONE);
      this.logAction(task.description, 'success', false);
    } catch (error) {
      const currentState = this.stateMachine.getState();
      if (currentState !== AgentState.FAILED && currentState !== AgentState.DONE) {
        this.stateMachine.transition(AgentState.FAILED);
      }
      this.logAction(
        `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'failure',
        false,
      );
    }
  }

  // ============================================================================
  // Planning loop phases
  // ============================================================================

  private async observe(task: AgentTask): Promise<string> {
    const startTime = Date.now();

    const tools = this.getAllTools();
    const toolDescriptions = tools
      .map((t) => `- ${t.name}: ${t.description} (tier: ${t.requiredTier})`)
      .join('\n');

    const context = `Task: ${task.description}\nParams: ${JSON.stringify(task.params ?? {})}\nAvailable tools:\n${toolDescriptions}`;

    const traceEvent: TraceEvent = {
      phase: 'observe',
      input: { taskId: task.id, description: task.description, params: task.params },
      output: { context },
      durationMs: Date.now() - startTime,
      tokenCost: 0,
    };
    this.reasoningTrace.push(traceEvent);

    return context;
  }

  private async plan(context: string, task: AgentTask): Promise<AgentPlan> {
    const startTime = Date.now();

    // Guard: only transition to EXECUTING if the state machine allows it
    if (this.stateMachine.canTransition(AgentState.EXECUTING)) {
      this.stateMachine.transition(AgentState.EXECUTING);
    }

    const tools = this.getAllTools();
    const toolNames = tools.map((t) => t.name);

    const prompt = `Given the following context, create an execution plan.\n\nContext:\n${context}\n\nAvailable tools: ${toolNames.join(', ')}\n\nRespond with a JSON array of steps. Each step has: toolName, args (object), description.`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    // Parse AI response into plan steps
    const steps = this.parsePlanSteps(result.content, tools);

    // If no valid steps could be parsed, fail gracefully
    if (steps.length === 0) {
      const traceEvent: TraceEvent = {
        phase: 'plan',
        input: { context, tools: toolNames },
        output: { error: 'Failed to parse a valid plan from AI response' },
        durationMs: Date.now() - startTime,
        tokenCost: result.usage.cost,
      };
      this.reasoningTrace.push(traceEvent);
      throw new Error('Plan parsing failed: AI response did not contain a valid JSON plan');
    }

    const plan: AgentPlan = {
      id: generateId('plan'),
      intent: task.description,
      steps,
      estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };

    plan.estimatedCost = this.computeCostEstimate(plan);

    const traceEvent: TraceEvent = {
      phase: 'plan',
      input: { context, tools: toolNames },
      output: { planId: plan.id, steps: steps.length, estimatedCost: plan.estimatedCost },
      durationMs: Date.now() - startTime,
      tokenCost: result.usage.cost,
    };
    this.reasoningTrace.push(traceEvent);

    return plan;
  }

  private async proposeActions(plan: AgentPlan): Promise<void> {
    const startTime = Date.now();

    const proposedActions = plan.steps.map((s) => ({
      tool: s.toolName,
      tier: s.tier,
      description: s.description,
      requiresApproval: s.requiresApproval,
    }));

    const traceEvent: TraceEvent = {
      phase: 'propose-actions',
      input: { planId: plan.id },
      output: { actions: proposedActions },
      durationMs: Date.now() - startTime,
      tokenCost: 0,
    };
    this.reasoningTrace.push(traceEvent);
  }

  private async requestPermission(plan: AgentPlan): Promise<boolean> {
    const startTime = Date.now();

    const highRiskSteps = plan.steps.filter((s) => s.tier >= AgentActionTier.Tier2_LowRisk);

    if (highRiskSteps.length === 0) {
      const traceEvent: TraceEvent = {
        phase: 'request-permission',
        input: { planId: plan.id, highRiskCount: 0 },
        output: { approved: true, reason: 'No high-risk actions' },
        durationMs: Date.now() - startTime,
        tokenCost: 0,
      };
      this.reasoningTrace.push(traceEvent);
      return true;
    }

    // Submit approval requests for high-risk steps
    const approvalIds: string[] = [];
    for (const step of highRiskSteps) {
      const approvalId = generateId('approval');
      this.approvalQueue.submit({
        id: approvalId,
        agentId: this.id,
        action: step.toolName,
        riskLevel: step.tier >= AgentActionTier.Tier3_HighRisk ? 'high' : 'medium',
        metadata: { stepId: step.id, planId: plan.id },
      });
      approvalIds.push(approvalId);
      step.requiresApproval = true;
    }

    // Transition to waiting approval
    this.stateMachine.transition(AgentState.WAITING_APPROVAL);
    this.waitingApprovalSince = Date.now();
    this.startIdleTimeout();

    // Check if all approvals are resolved
    const allApproved = approvalIds.every((id) => {
      const req = this.approvalQueue.getById(id);
      return req?.status === 'approved';
    });

    const allRejected = approvalIds.some((id) => {
      const req = this.approvalQueue.getById(id);
      return req?.status === 'rejected';
    });

    // Resume execution if approved
    if (allApproved) {
      this.clearIdleTimeout();
      this.stateMachine.transition(AgentState.EXECUTING);
    } else if (allRejected) {
      this.clearIdleTimeout();
    }

    const traceEvent: TraceEvent = {
      phase: 'request-permission',
      input: { planId: plan.id, highRiskCount: highRiskSteps.length, approvalIds },
      output: { approved: allApproved, rejected: allRejected },
      durationMs: Date.now() - startTime,
      tokenCost: 0,
    };
    this.reasoningTrace.push(traceEvent);

    return allApproved;
  }

  private async executeActions(plan: AgentPlan): Promise<void> {
    const startTime = Date.now();
    let totalTokenCost = 0;

    plan.status = 'executing';

    for (const step of plan.steps) {
      if (step.status === 'skipped' || step.status === 'failed') continue;

      // Per-step budget check before execution
      const stepCost = TIER_COST[step.tier] ?? 0;
      if (stepCost > 0 && !this.spendingLimit.canSpend(stepCost)) {
        // Mark this step and all remaining pending steps as skipped
        step.status = 'skipped';
        for (const remaining of plan.steps) {
          if (remaining.status === 'pending') {
            remaining.status = 'skipped';
          }
        }
        plan.status = 'failed';
        const traceEvent: TraceEvent = {
          phase: 'execute',
          input: { planId: plan.id, stepCount: plan.steps.length },
          output: {
            status: plan.status,
            error: 'Budget exceeded mid-execution',
            results: plan.steps.map((s) => ({ step: s.id, status: s.status })),
          },
          durationMs: Date.now() - startTime,
          tokenCost: totalTokenCost,
        };
        this.reasoningTrace.push(traceEvent);
        return;
      }

      step.status = 'executing';

      const tool = this.toolRegistry.getTool(step.toolName);
      if (!tool) {
        step.status = 'failed';
        step.result = {
          success: false,
          error: `Tool '${step.toolName}' not found`,
          undoable: false,
        };
        continue;
      }

      try {
        const result = await tool.handler(step.args);
        step.result = result;
        step.status = result.success ? 'completed' : 'failed';

        if (result.success) {
          if (stepCost > 0) {
            this.spendingLimit.recordSpend(stepCost);
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        step.status = 'failed';
        step.result = { success: false, error: errorMsg, undoable: false };
      }
    }

    const allCompleted = plan.steps.every(
      (s) => s.status === 'completed' || s.status === 'skipped',
    );
    plan.status = allCompleted ? 'completed' : 'failed';

    const traceEvent: TraceEvent = {
      phase: 'execute',
      input: { planId: plan.id, stepCount: plan.steps.length },
      output: {
        status: plan.status,
        results: plan.steps.map((s) => ({ step: s.id, status: s.status })),
      },
      durationMs: Date.now() - startTime,
      tokenCost: totalTokenCost,
    };
    this.reasoningTrace.push(traceEvent);
  }

  private async reflect(plan: AgentPlan, task: AgentTask): Promise<void> {
    const startTime = Date.now();

    const results = plan.steps.map((s) => ({
      tool: s.toolName,
      status: s.status,
      result: s.result,
    }));

    const prompt = `Reflect on the execution results for task "${task.description}".\n\nResults:\n${JSON.stringify(results, null, 2)}\n\nProvide a brief quality assessment.`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    const traceEvent: TraceEvent = {
      phase: 'reflect',
      input: { planId: plan.id, results },
      output: { assessment: result.content },
      durationMs: Date.now() - startTime,
      tokenCost: result.usage.cost,
    };
    this.reasoningTrace.push(traceEvent);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Returns the full reasoning trace (decision log) for the last execution.
   */
  getReasoningTrace(): TraceEvent[] {
    return [...this.reasoningTrace];
  }

  /**
   * Re-runs reflect->plan with user feedback injected.
   */
  async redoWithFeedback(feedback: string): Promise<void> {
    if (!this.currentPlan) {
      throw new Error('No previous plan to redo');
    }

    const startTime = Date.now();

    // Reflect with feedback
    const reflectPrompt = `User feedback on previous execution: "${feedback}"\n\nPrevious plan: ${JSON.stringify(this.currentPlan.steps.map((s) => s.toolName))}\n\nCreate an improved plan incorporating this feedback.`;

    const result = await this.aiEngine.infer(reflectPrompt, this.getSystemPrompt());

    const tools = this.getAllTools();
    const newSteps = this.parsePlanSteps(result.content, tools);

    this.currentPlan = {
      ...this.currentPlan,
      id: generateId('plan'),
      steps: newSteps,
      estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
    this.currentPlan.estimatedCost = this.computeCostEstimate(this.currentPlan);

    const traceEvent: TraceEvent = {
      phase: 'redo-with-feedback',
      input: { feedback, previousPlanId: this.currentPlan.id },
      output: { newPlanId: this.currentPlan.id, steps: newSteps.length },
      durationMs: Date.now() - startTime,
      tokenCost: result.usage.cost,
    };
    this.reasoningTrace.push(traceEvent);
  }

  /**
   * Returns estimated cost before execution based on current plan.
   */
  getCostPreview(): CostEstimate {
    if (!this.currentPlan) {
      return { totalEstimatedCost: 0, breakdown: [], currency: 'USD' };
    }
    return this.computeCostEstimate(this.currentPlan);
  }

  // ============================================================================
  // Idle timeout
  // ============================================================================

  /**
   * Check if agent should auto-park due to approval timeout.
   * Call this to force check (used in tests with fake timers).
   */
  checkIdleTimeout(): void {
    if (
      this.waitingApprovalSince !== null &&
      this.stateMachine.getState() === AgentState.WAITING_APPROVAL
    ) {
      const elapsed = Date.now() - this.waitingApprovalSince;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        this.stateMachine.transition(AgentState.IDLE);
        this.waitingApprovalSince = null;
        this.clearIdleTimeout();
        this.logAction('Auto-parked after 24h approval timeout', 'success', false);
      }
    }
  }

  private startIdleTimeout(): void {
    this.clearIdleTimeout();
    this.idleTimeoutHandle = setTimeout(() => {
      this.checkIdleTimeout();
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimeout(): void {
    if (this.idleTimeoutHandle !== null) {
      clearTimeout(this.idleTimeoutHandle);
      this.idleTimeoutHandle = null;
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private parsePlanSteps(aiResponse: string, tools: ToolDefinition[]): PlanStep[] {
    const steps: PlanStep[] = [];

    try {
      // Try to parse JSON from AI response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          toolName?: string;
          args?: Record<string, unknown>;
          description?: string;
        }>;

        for (const item of parsed) {
          const toolName = item.toolName ?? '';
          const tool = tools.find((t) => t.name === toolName);
          if (!tool) continue;

          steps.push({
            id: generateId('step'),
            toolName: tool.name,
            args: item.args ?? {},
            tier: tool.requiredTier,
            description: item.description ?? tool.description,
            requiresApproval: tool.requiredTier >= AgentActionTier.Tier2_LowRisk,
            status: 'pending',
          });
        }
      }
    } catch {
      // If parsing fails, return empty plan - do not fall back to invoking all tools
    }

    return steps;
  }

  private computeCostEstimate(plan: AgentPlan): CostEstimate {
    const breakdown: { step: string; cost: number }[] = [];
    let total = 0;

    for (const step of plan.steps) {
      const cost = TIER_COST[step.tier] ?? 0;
      breakdown.push({ step: step.id, cost });
      total += cost;
    }

    return {
      totalEstimatedCost: total,
      breakdown,
      currency: 'USD',
    };
  }
}
