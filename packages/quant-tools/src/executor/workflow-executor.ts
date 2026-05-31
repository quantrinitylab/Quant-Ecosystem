import { ToolExecutor } from './tool-executor.js';
import type {
  PermissionTier,
  ToolDefinition,
  ToolPlan,
  ToolPlanStep,
  ToolResult,
  WorkflowExecutionOptions,
  WorkflowResult,
} from '../types.js';

export type WorkflowEventType =
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'step_retry'
  | 'confirmation_required'
  | 'rollback_start'
  | 'rollback_complete'
  | 'execution_complete';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: number;
  data?: {
    stepId?: string;
    toolId?: string;
    result?: ToolResult;
    error?: string;
    attempt?: number;
  };
}

export type WorkflowListener = (event: WorkflowEvent) => void;

export class WorkflowExecutor {
  private executor: ToolExecutor;
  private tools: ToolDefinition[];
  private listeners: WorkflowListener[] = [];

  constructor(executor: ToolExecutor, tools?: ToolDefinition[]) {
    this.executor = executor;
    this.tools = tools ?? [];
  }

  on(listener: WorkflowListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async execute(plan: ToolPlan, options: WorkflowExecutionOptions): Promise<WorkflowResult> {
    const startTime = performance.now();
    const completedSteps: Array<{ step: ToolPlanStep; result: ToolResult }> = [];
    const allResults: ToolResult[] = [];
    const outputs = new Map<string, unknown>();

    const maxRetries = options.maxRetries ?? 0;
    const stepTimeoutMs = options.stepTimeoutMs ?? 30000;

    // Build dependency graph
    const remaining = new Set(plan.steps.map((s) => s.stepId));
    const stepMap = new Map(plan.steps.map((s) => [s.stepId, s]));

    while (remaining.size > 0) {
      // Find steps with all dependencies resolved
      const ready: ToolPlanStep[] = [];
      for (const stepId of remaining) {
        const step = stepMap.get(stepId)!;
        const allDepsResolved = step.dependsOn.every((dep) => !remaining.has(dep));
        if (allDepsResolved) {
          ready.push(step);
        }
      }

      if (ready.length === 0) {
        // Circular dependency or bug - break
        break;
      }

      // Confirmation gate for high-permission steps
      for (const step of ready) {
        const tool = this.tools.find((t) => t.id === step.toolId);
        if (tool && tool.permissionTier >= 2 && options.confirmationCallback) {
          this.emit({
            type: 'confirmation_required',
            timestamp: Date.now(),
            data: { stepId: step.stepId, toolId: step.toolId },
          });
          const confirmed = await options.confirmationCallback(step);
          if (!confirmed) {
            const totalLatencyMs = performance.now() - startTime;
            return {
              success: false,
              results: allResults,
              plan,
              totalLatencyMs,
            };
          }
        }
      }

      // Execute ready steps in parallel
      const parallelResults = await Promise.all(
        ready.map((step) =>
          this.executeStepWithRetry(step, outputs, options, maxRetries, stepTimeoutMs),
        ),
      );

      // Collect all results from the batch before checking for failures
      let hasFailure = false;
      for (let i = 0; i < ready.length; i++) {
        const step = ready[i]!;
        const result = parallelResults[i]!;
        allResults.push(result);
        remaining.delete(step.stepId);

        if (result.success) {
          completedSteps.push({ step, result });
          outputs.set(step.stepId, result.data);
        } else {
          hasFailure = true;
        }
      }

      // If any step in the batch failed, trigger rollback and return
      if (hasFailure) {
        if (options.enableRollback && completedSteps.length > 0) {
          const rollbackResults = await this.performRollback(completedSteps, options);
          const totalLatencyMs = performance.now() - startTime;
          return {
            success: false,
            results: allResults,
            rollbackResults,
            plan,
            totalLatencyMs,
          };
        }

        const totalLatencyMs = performance.now() - startTime;
        return {
          success: false,
          results: allResults,
          plan,
          totalLatencyMs,
        };
      }
    }

    this.emit({ type: 'execution_complete', timestamp: Date.now() });
    const totalLatencyMs = performance.now() - startTime;

    return {
      success: true,
      results: allResults,
      plan,
      totalLatencyMs,
    };
  }

  private async executeStepWithRetry(
    step: ToolPlanStep,
    outputs: Map<string, unknown>,
    options: WorkflowExecutionOptions,
    maxRetries: number,
    stepTimeoutMs: number,
  ): Promise<ToolResult> {
    let lastResult: ToolResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.emit({
          type: 'step_retry',
          timestamp: Date.now(),
          data: { stepId: step.stepId, toolId: step.toolId, attempt },
        });
        // Exponential backoff starting at 1s
        const delay = 1000 * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      this.emit({
        type: 'step_start',
        timestamp: Date.now(),
        data: { stepId: step.stepId, toolId: step.toolId },
      });

      // Resolve dependencies into params
      const resolvedParams = { ...step.params };
      for (const dep of step.dependsOn) {
        const depOutput = outputs.get(dep);
        if (depOutput !== undefined) {
          resolvedParams[`_dep_${dep}`] = depOutput;
        }
      }

      const context = {
        userId: options.userId,
        sessionId: options.sessionId,
        permissions: options.permissions,
        dryRun: options.dryRun,
        metadata: options.metadata,
      };

      // Execute with timeout
      const result = await this.executeWithTimeout(
        step.toolId,
        resolvedParams,
        context,
        stepTimeoutMs,
      );

      lastResult = result;

      if (result.success) {
        this.emit({
          type: 'step_complete',
          timestamp: Date.now(),
          data: { stepId: step.stepId, toolId: step.toolId, result },
        });
        return result;
      }

      this.emit({
        type: 'step_failed',
        timestamp: Date.now(),
        data: { stepId: step.stepId, toolId: step.toolId, result, error: result.error },
      });
    }

    return lastResult!;
  }

  private async executeWithTimeout(
    toolId: string,
    params: Record<string, unknown>,
    context: {
      userId: string;
      sessionId: string;
      permissions: PermissionTier;
      dryRun: boolean;
      metadata?: Record<string, string>;
    },
    timeoutMs: number,
  ): Promise<ToolResult> {
    const executionPromise = this.executor.executeSingle(toolId, params, context);
    const timeoutPromise = new Promise<ToolResult>((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          data: null,
          error: `Step timed out after ${timeoutMs}ms`,
          executionId: `exec-timeout-${Date.now()}`,
          toolId,
          latencyMs: timeoutMs,
        });
      }, timeoutMs);
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  private async performRollback(
    completedSteps: Array<{ step: ToolPlanStep; result: ToolResult }>,
    options: WorkflowExecutionOptions,
  ): Promise<ToolResult[]> {
    this.emit({ type: 'rollback_start', timestamp: Date.now() });
    const rollbackResults: ToolResult[] = [];

    // Iterate in reverse
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const { step, result } = completedSteps[i]!;
      const tool = this.tools.find((t) => t.id === step.toolId);

      if (tool?.undoRecipe && result.success) {
        const undoParams = { ...tool.undoRecipe.params, _originalResult: result.data };
        const context = {
          userId: options.userId,
          sessionId: options.sessionId,
          permissions: options.permissions,
          dryRun: options.dryRun,
          metadata: options.metadata,
        };

        const undoResult = await this.executor.executeSingle(
          tool.undoRecipe.toolId,
          undoParams,
          context,
        );
        rollbackResults.push(undoResult);
      }
    }

    this.emit({ type: 'rollback_complete', timestamp: Date.now() });
    return rollbackResults;
  }

  private emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
