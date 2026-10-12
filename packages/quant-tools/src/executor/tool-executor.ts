import type {
  AuditEntry,
  PermissionTier,
  ToolExecutionContext,
  ToolPlan,
  ToolResult,
} from '../types.js';
import type { PermissionEngine } from '../permissions/permission-engine.js';

/**
 * A tool handler receives the resolved params plus the full execution context.
 * The context carries the userId and, via `metadata`, request-scoped secrets
 * such as the caller's JWT (used by HTTP handlers for delegated auth).
 * Handlers that only need params may ignore the second argument.
 */
export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<unknown>;

export class ToolExecutor {
  private auditEntries: AuditEntry[] = [];
  private handlers: Map<string, ToolHandler> = new Map();
  /**
   * Opt-in Sentinel enforcement (defense in depth). When set, EVERY
   * executeSingle call is permission-checked here — even callers that
   * forgot the route-level checkPermissions gate fail closed.
   * Unset = legacy behavior (no enforcement).
   */
  private permissionEngine: PermissionEngine | null = null;
  private defaultUserTier: PermissionTier = 1;

  registerHandler(toolId: string, handler: ToolHandler): void {
    this.handlers.set(toolId, handler);
  }

  /**
   * Enable executor-level Sentinel enforcement. Tier-2+ tools are refused
   * unless their tool id appears in `context.confirmedToolIds`; tools the
   * user tier cannot reach are refused with TOOL_FORBIDDEN.
   */
  setPermissionEngine(engine: PermissionEngine, opts?: { defaultUserTier?: PermissionTier }): void {
    this.permissionEngine = engine;
    if (opts?.defaultUserTier !== undefined) {
      this.defaultUserTier = opts.defaultUserTier;
    }
  }

  /** True when a live handler is registered — used by the MCP gateway to
   *  distinguish "declared but not wired yet" tools from executable ones. */
  hasHandler(toolId: string): boolean {
    return this.handlers.has(toolId);
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

    // Sentinel enforcement (defense in depth): fail closed BEFORE dry-run
    // simulation or handler dispatch, so no caller can bypass the gate.
    if (this.permissionEngine) {
      const userTier = context.permissions ?? this.defaultUserTier;
      const verdict = this.permissionEngine.evaluate(toolId, userTier);
      if (!verdict.allowed) {
        const latencyMs = performance.now() - start;
        this.logAudit({
          executionId,
          toolId,
          userId: context.userId,
          timestamp: Date.now(),
          action: 'failure',
          details: { error: `TOOL_FORBIDDEN: ${verdict.reason}` },
        });
        return {
          success: false,
          data: null,
          error: `TOOL_FORBIDDEN: ${verdict.reason}`,
          executionId,
          toolId,
          latencyMs,
        };
      }
      const confirmed = context.confirmedToolIds ?? [];
      if (verdict.confirmationRequired && !confirmed.includes(toolId)) {
        const latencyMs = performance.now() - start;
        this.logAudit({
          executionId,
          toolId,
          userId: context.userId,
          timestamp: Date.now(),
          action: 'failure',
          details: { error: 'CONFIRMATION_REQUIRED: tier-2+ tool without Sentinel approval' },
        });
        return {
          success: false,
          data: null,
          error: `CONFIRMATION_REQUIRED: '${toolId}' requires Sentinel approval before execution`,
          executionId,
          toolId,
          latencyMs,
        };
      }
    }

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
      const data = await handler(params, context);
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
