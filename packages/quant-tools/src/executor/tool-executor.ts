import type { AuditEntry, ToolExecutionContext, ToolPlan, ToolResult } from '../types.js';

export class ToolExecutor {
  private auditEntries: AuditEntry[] = [];
  private handlers: Map<string, (params: Record<string, unknown>) => Promise<unknown>> = new Map();

  registerHandler(
    toolId: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.handlers.set(toolId, handler);
  }

  async execute(plan: ToolPlan, context: ToolExecutionContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const outputs: Map<string, unknown> = new Map();

    for (const step of plan.steps) {
      // Resolve dependencies - merge previous outputs into params
      const resolvedParams = { ...step.params };
      for (const dep of step.dependsOn) {
        const depOutput = outputs.get(dep);
        if (depOutput !== undefined) {
          resolvedParams[`_dep_${dep}`] = depOutput;
        }
      }

      const result = await this.executeSingle(step.toolId, resolvedParams, context);
      results.push(result);
      outputs.set(step.stepId, result.data);

      // Stop execution on failure
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  async executeSingle(
    toolId: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const start = performance.now();

    // Log invocation
    this.logAudit({
      executionId,
      toolId,
      userId: context.userId,
      timestamp: Date.now(),
      action: 'invoke',
      details: { params, dryRun: context.dryRun },
    });

    // Dry run mode - return simulated success
    if (context.dryRun) {
      const latencyMs = performance.now() - start;
      this.logAudit({
        executionId,
        toolId,
        userId: context.userId,
        timestamp: Date.now(),
        action: 'success',
        details: { dryRun: true },
      });
      return {
        success: true,
        data: { dryRun: true, toolId, params },
        executionId,
        toolId,
        latencyMs,
      };
    }

    // Execute handler
    const handler = this.handlers.get(toolId);
    if (!handler) {
      const latencyMs = performance.now() - start;
      this.logAudit({
        executionId,
        toolId,
        userId: context.userId,
        timestamp: Date.now(),
        action: 'failure',
        details: { error: 'No handler registered' },
      });
      return {
        success: false,
        data: null,
        error: `No handler registered for tool '${toolId}'`,
        executionId,
        toolId,
        latencyMs,
      };
    }

    try {
      const data = await handler(params);
      const latencyMs = performance.now() - start;

      this.logAudit({
        executionId,
        toolId,
        userId: context.userId,
        timestamp: Date.now(),
        action: 'success',
        details: { latencyMs },
      });

      return { success: true, data, executionId, toolId, latencyMs };
    } catch (err) {
      const latencyMs = performance.now() - start;
      const error = err instanceof Error ? err.message : 'Unknown error';

      this.logAudit({
        executionId,
        toolId,
        userId: context.userId,
        timestamp: Date.now(),
        action: 'failure',
        details: { error },
      });

      return { success: false, data: null, error, executionId, toolId, latencyMs };
    }
  }

  getAuditEntries(): AuditEntry[] {
    return [...this.auditEntries];
  }

  private logAudit(entry: Omit<AuditEntry, 'id'>): void {
    this.auditEntries.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
    });
  }
}
