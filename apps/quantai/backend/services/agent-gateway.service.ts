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
  /**
   * Caller permission tier derived from the verified JWT role claim
   * (roleToPermissionTier). Defaults to 1 — fail closed when the caller
   * could not present a verifiable identity/role.
   */
  permissionTier?: PermissionTier;
}

interface HeldPlan {
  planId: string;
  plan: ToolPlan;
  userId: string;
  createdAt: number;
  reason: string;
  /** Tier the plan was gated at; re-gated against the confirming tier. */
  userTier: PermissionTier;
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
   *
   * Pass the caller's REAL tier (from the verified JWT role claim via
   * roleToPermissionTier). The default of 1 is a fail-closed fallback for
   * callers that could not establish a verifiable identity — it must never
   * be used to silently downgrade an authenticated user.
   */
  checkPermissions(
    plan: ToolPlan,
    userTier: PermissionTier = 1,
  ): { held: false } | { held: true; planId: string; reason: string; steps: unknown[]; userTier: PermissionTier } {
    const verdict = this.gatePlan(plan, userTier);
    if (verdict.blocked) {
      throw createAppError(verdict.blocked, 403, 'TOOL_FORBIDDEN');
    }
    if (!verdict.confirmationRequired) {
      return { held: false };
    }
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.heldPlans.set(planId, {
      planId,
      plan,
      userId: '',
      createdAt: Date.now(),
      reason: verdict.reason,
      userTier,
    });
    return {
      held: true,
      planId,
      reason: verdict.reason,
      steps: plan.steps.map((s) => ({ stepId: s.stepId, toolId: s.toolId, params: s.params })),
      userTier,
    };
  }

  /**
   * Evaluate every step of a plan against a user tier WITHOUT storing a
   * held plan. Used by checkPermissions (which stores on confirmation) and
   * by confirm (which re-gates a held plan against the confirming caller's
   * tier so a stale/changed role fails closed).
   */
  private gatePlan(
    plan: ToolPlan,
    userTier: PermissionTier,
  ): { blocked?: string; confirmationRequired: boolean; reason: string } {
    let confirmationRequired = false;
    let reason = '';
    for (const step of plan.steps) {
      const stepVerdict = this.permissions.evaluate(step.toolId, userTier);
      if (!stepVerdict.allowed) {
        // The engine reason already names required vs held tier, e.g.
        // "Insufficient permissions: requires tier 3, user has tier 1".
        return { blocked: `Tool '${step.toolId}' not allowed: ${stepVerdict.reason}`, confirmationRequired: false, reason: stepVerdict.reason };
      }
      if (stepVerdict.confirmationRequired) {
        confirmationRequired = true;
        reason = stepVerdict.reason;
      }
    }
    return { confirmationRequired, reason };
  }

  /** Execute a plan with the caller's JWT in the execution context. */
  async execute(plan: ToolPlan, opts: GatewayExecuteOptions): Promise<ToolResult[]> {
    const context: ToolExecutionContext = {
      userId: opts.userId,
      sessionId: opts.sessionId ?? `sess-${Date.now()}`,
      permissions: opts.permissionTier ?? 1,
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
   * Re-gates the plan against the confirming caller's tier (opts.permissionTier)
   * so a role that changed or was never verifiable fails closed, even if the
   * original hold admitted the plan.
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
    const confirmingTier = opts.permissionTier ?? 1;
    const reGate = this.gatePlan(held.plan, confirmingTier);
    if (reGate.blocked) {
      this.heldPlans.delete(planId);
      throw createAppError(reGate.blocked, 403, 'TOOL_FORBIDDEN');
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
