import type { AutomationAction, ExecutionResult } from '../types.js';

export class ActionExecutor {
  private results: Map<string, ExecutionResult> = new Map();

  async execute(
    action: AutomationAction,
    context: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = `exec_${action.id}_${startTime}`;

    // Simulate tool execution
    const success = !context['__force_failure'];
    const duration = Date.now() - startTime;

    const result: ExecutionResult = {
      automationId: executionId,
      success,
      stepsCompleted: success ? 1 : 0,
      totalSteps: 1,
      outputs: success ? [{ toolId: action.toolId, params: action.params }] : [],
      error: success ? null : `Tool "${action.toolId}" execution failed`,
      duration,
    };

    this.results.set(executionId, result);
    return result;
  }

  async executeWithRetry(
    action: AutomationAction,
    context: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const { maxRetries, backoffMs, backoffMultiplier } = action.retryPolicy;
    let lastResult: ExecutionResult | null = null;
    let currentBackoff = backoffMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await this.execute(action, context);
      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        await this.delay(currentBackoff);
        currentBackoff = Math.floor(currentBackoff * backoffMultiplier);
      }
    }

    return lastResult!;
  }

  getResult(executionId: string): ExecutionResult | undefined {
    return this.results.get(executionId);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10)));
  }
}
