import { IntentRouter } from '../planner/intent-router.js';
import { IntentParser } from '../planner/intent-parser.js';
import { MultiStepPlanner } from '../planner/multi-step-planner.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { WorkflowExecutor } from '../executor/workflow-executor.js';
import { ContextManager } from './context-manager.js';
import type { ToolDefinition, ToolPlan, ToolPlanStep, ToolResult, WorkflowResult } from '../types.js';

export type OrchestratorEventType =
  | 'plan_created'
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'execution_complete'
  | 'error'
  | 'confirmation_required'
  | 'rollback_start'
  | 'rollback_complete'
  | 'step_retry';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  data: {
    plan?: ToolPlan;
    stepId?: string;
    toolId?: string;
    result?: ToolResult;
    error?: string;
    results?: ToolResult[];
  };
}

export type OrchestratorListener = (event: OrchestratorEvent) => void;

export interface OrchestratorOptions {
  userId: string;
  sessionId: string;
  dryRun?: boolean;
}

export class CrossAppOrchestrator {
  private intentRouter: IntentRouter;
  private planner: MultiStepPlanner;
  private executor: ToolExecutor;
  private contextManager: ContextManager;
  private tools: ToolDefinition[];
  private listeners: OrchestratorListener[] = [];

  constructor(tools: ToolDefinition[], contextManager?: ContextManager, executor?: ToolExecutor) {
    this.tools = tools;
    this.intentRouter = new IntentRouter(tools);
    this.planner = new MultiStepPlanner();
    this.executor = executor ?? new ToolExecutor();
    this.contextManager = contextManager ?? new ContextManager();
  }

  on(listener: OrchestratorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getExecutor(): ToolExecutor {
    return this.executor;
  }

  createPlan(input: string): ToolPlan {
    // Route intent to find matching tools
    const matches = this.intentRouter.route(input);

    if (matches.length === 0) {
      return {
        id: `plan-${Date.now()}`,
        steps: [],
        estimatedCost: 'free',
        requiredPermission: 0,
        description: `No tools matched: ${input}`,
      };
    }

    // Use the planner to create an execution plan
    const matchedToolIds = new Set(matches.map((m) => m.toolId));
    const matchedTools = this.tools.filter((t) => matchedToolIds.has(t.id));
    const plan = this.planner.plan(input, matchedTools.length > 0 ? matchedTools : this.tools);

    // Inject extracted params from intent routing into plan steps
    for (const step of plan.steps) {
      const match = matches.find((m) => m.toolId === step.toolId);
      if (match) {
        step.params = { ...step.params, ...match.extractedParams };
      }
      // Also inject context-aware params
      step.params = this.contextManager.injectContextIntoParams(step.params, input);
    }

    return plan;
  }

  async execute(input: string, options: OrchestratorOptions): Promise<ToolResult[]> {
    const plan = this.createPlan(input);

    this.emit({
      type: 'plan_created',
      timestamp: Date.now(),
      data: { plan },
    });

    if (plan.steps.length === 0) {
      const emptyResult: ToolResult = {
        success: false,
        data: null,
        error: `No tools matched the intent: ${input}`,
        executionId: `exec-${Date.now()}`,
        toolId: 'none',
        latencyMs: 0,
      };
      this.emit({
        type: 'execution_complete',
        timestamp: Date.now(),
        data: { results: [emptyResult] },
      });
      return [emptyResult];
    }

    const context = this.contextManager.buildExecutionContext(options.userId, options.sessionId);
    if (options.dryRun) {
      context.dryRun = true;
    }

    const results: ToolResult[] = [];

    for (const step of plan.steps) {
      this.emit({
        type: 'step_start',
        timestamp: Date.now(),
        data: { stepId: step.stepId, toolId: step.toolId },
      });

      const result = await this.executor.executeSingle(step.toolId, step.params, context);
      results.push(result);

      if (result.success) {
        this.emit({
          type: 'step_complete',
          timestamp: Date.now(),
          data: { stepId: step.stepId, toolId: step.toolId, result },
        });
      } else {
        this.emit({
          type: 'step_failed',
          timestamp: Date.now(),
          data: { stepId: step.stepId, toolId: step.toolId, result, error: result.error },
        });
        break;
      }
    }

    this.emit({
      type: 'execution_complete',
      timestamp: Date.now(),
      data: { results },
    });

    return results;
  }

  async processNaturalLanguage(
    input: string,
    options: OrchestratorOptions & {
      confirmationCallback?: (step: ToolPlanStep) => Promise<boolean>;
      enableRollback?: boolean;
    },
  ): Promise<WorkflowResult> {
    const intentParser = new IntentParser();
    const intents = intentParser.parse(input, {
      currentApp: undefined,
      currentItem: undefined,
    });

    const plan = this.planner.planFromParsedIntents(intents, this.tools);

    this.emit({
      type: 'plan_created',
      timestamp: Date.now(),
      data: { plan },
    });

    if (plan.steps.length === 0) {
      const result: WorkflowResult = {
        success: false,
        results: [],
        plan,
        totalLatencyMs: 0,
      };
      this.emit({
        type: 'execution_complete',
        timestamp: Date.now(),
        data: { results: [] },
      });
      return result;
    }

    const workflowExecutor = new WorkflowExecutor(this.executor, this.tools);

    // Forward workflow events to orchestrator listeners
    workflowExecutor.on((event) => {
      this.emit({
        type: event.type as OrchestratorEventType,
        timestamp: event.timestamp,
        data: {
          stepId: event.data?.stepId,
          toolId: event.data?.toolId,
          result: event.data?.result,
          error: event.data?.error,
        },
      });
    });

    const executionOptions = {
      userId: options.userId,
      sessionId: options.sessionId,
      permissions: plan.requiredPermission,
      dryRun: options.dryRun ?? false,
      confirmationCallback: options.confirmationCallback,
      enableRollback: options.enableRollback,
    };

    const workflowResult = await workflowExecutor.execute(plan, executionOptions);

    this.emit({
      type: 'execution_complete',
      timestamp: Date.now(),
      data: { results: workflowResult.results },
    });

    return workflowResult;
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
