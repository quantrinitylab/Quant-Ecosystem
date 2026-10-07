// ============================================================================
// Agent Gateway Service (Phase 2)
// ============================================================================
// Owns the ToolExecutor with real HTTP handlers registered, plus the
// Sentinel confirmation store for tier-2+ tool calls.
//
// Usage in routes:
//   const gw = getAgentGateway();            // singleton
//   const plan = gw.plan(message);           // CrossAppOrchestrator.createPlan
//   const held = gw.checkPermissions(plan);  // -> { held: true, planId } | { held: false }
//   const results = await gw.execute(plan, { userId, jwt, requestId });
//   // ... or after approval:
//   const results = await gw.confirm(planId, { userId, jwt, requestId, approved });
// ============================================================================

import {
  CrossAppOrchestrator,
  PermissionEngine,
  ToolExecutor,
  allTools,
  type PermissionTier,
  type ToolExecutionContext,
  type ToolPlan,
  type ToolResult,
} from '@quant/quant-tools';
import { createAppError } from '@quant/server-core';
import { getEndpoint, getToolRoute } from './app-endpoints';
import {
  createHttpToolHandler,
  mapQuantCalendarCreate,
  mapQuantMailSend,
} from './http-tool-handler';

export interface GatewayExecuteOptions {
  userId: string;
  /** Delegated user JWT forwarded to target app backends. */
  jwt: string;
  requestId?: string;
  sessionId?: string;
  dryRun?: boolean;
}

interface HeldPlan {
  planId: string;
  plan: ToolPlan;
  userId: string;
  createdAt: number;
  reason: string;
}

const HELD_PLAN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Param mappers per toolId (agent schema -> target API shape). */
const PARAM_MAPPERS: Record<string, (p: Record<string, unknown>) => Record<string, unknown>> = {
  'quantmail.send': mapQuantMailSend,
  'quantcalendar.create-event': mapQuantCalendarCreate,
};

class AgentGateway {
  private readonly orchestrator: CrossAppOrchestrator;
  private readonly executor: ToolExecutor;
  private readonly permissions: PermissionEngine;
  private readonly heldPlans = new Map<string, HeldPlan>();

  constructor() {
    this.executor = new ToolExecutor();
    this.orchestrator = new CrossAppOrchestrator(allTools, undefined, this.executor);
    this.permissions = new PermissionEngine(allTools);
    this.registerHttpHandlers();
  }

  /** Register a real HTTP handler for every tool that has an endpoint route. */
  private registerHttpHandlers(): void {
    let registered = 0;
    for (const tool of allTools) {
      const endpoint = getEndpoint(tool.appId);
      if (!endpoint) continue;
      const route = getToolRoute(tool.appId, tool.id);
      if (!route) continue;
      this.executor.registerHandler(
        tool.id,
        createHttpToolHandler({
          endpoint,
          toolId: tool.id,
          route,
          mapParams: PARAM_MAPPERS[tool.id],
        }),
      );
      registered += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`[agent-gateway] registered ${registered} HTTP tool handlers`);
  }

  getExecutor(): ToolExecutor {
    return this.executor;
  }

  getOrchestrator(): CrossAppOrchestrator {
    return this.orchestrator;
  }

  /** Natural language -> tool plan (no execution). */
  plan(message: string): ToolPlan {
    return this.orchestrator.createPlan(message);
  }

  /**
   * Permission gate for a plan. Returns a held planId when any step needs
   * Sentinel confirmation (tier >= 2) or the user tier is insufficient.
   */
  checkPermissions(
    plan: ToolPlan,
    userTier: PermissionTier = 1,
  ): { held: false } | { held: true; planId: string; reason: string; steps: unknown[] } {
    for (const step of plan.steps) {
      const verdict = this.permissions.evaluate(step.toolId, userTier);
      if (!verdict.allowed) {
        throw createAppError(`Tool '${step.toolId}' not allowed: ${verdict.reason}`, 403, 'TOOL_FORBIDDEN');
      }
      if (verdict.confirmationRequired) {
        const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.heldPlans.set(planId, {
          planId,
          plan,
          userId: '',
          createdAt: Date.now(),
          reason: verdict.reason,
        });
        return {
          held: true,
          planId,
          reason: verdict.reason,
          steps: plan.steps.map((s) => ({ stepId: s.stepId, toolId: s.toolId, params: s.params })),
        };
      }
    }
    return { held: false };
  }

  /** Execute a plan with the caller's JWT in the execution context. */
  async execute(plan: ToolPlan, opts: GatewayExecuteOptions): Promise<ToolResult[]> {
    const context: ToolExecutionContext = {
      userId: opts.userId,
      sessionId: opts.sessionId ?? `sess-${Date.now()}`,
      permissions: 1,
      dryRun: opts.dryRun ?? false,
      metadata: {
        jwt: opts.jwt,
        ...(opts.requestId ? { requestId: opts.requestId } : {}),
      },
    };
    return this.executor.execute(plan, context);
  }

  /**
   * Resume a held plan after Sentinel approval.
   * Throws 404 when the planId is unknown/expired, 403 on user mismatch.
   */
  async confirm(
    planId: string,
    opts: GatewayExecuteOptions & { approved: boolean },
  ): Promise<ToolResult[]> {
    const held = this.heldPlans.get(planId);
    if (!held || Date.now() - held.createdAt > HELD_PLAN_TTL_MS) {
      this.heldPlans.delete(planId);
      throw createAppError('Plan not found or expired', 404, 'PLAN_NOT_FOUND');
    }
    if (held.userId && held.userId !== opts.userId) {
      throw createAppError('Plan belongs to a different user', 403, 'PLAN_USER_MISMATCH');
    }
    this.heldPlans.delete(planId);
    if (!opts.approved) {
      return [];
    }
    return this.execute(held.plan, opts);
  }

  /** Bind the held plan to the requesting user (called by the chat route). */
  bindHeldPlan(planId: string, userId: string): void {
    const held = this.heldPlans.get(planId);
    if (held) held.userId = userId;
  }
}

let singleton: AgentGateway | null = null;

/** Process-wide singleton — handlers are registered once at startup. */
export function getAgentGateway(): AgentGateway {
  if (!singleton) singleton = new AgentGateway();
  return singleton;
}
