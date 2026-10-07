// ============================================================================
// Agent module — human-approval gating + AgentActionAudit (Pillar 6 / Company OS)
// quantmail-superhub · Task 22.1 (Requirements 14.1, 14.2, 14.3, 23.1, 23.3)
// ============================================================================
//
// PURPOSE
//   Implements the human-approval gate for SENSITIVE agent / Gmail-handler
//   actions (design §"STRUCTURE AgentActionAudit" + §"FUNCTION
//   reportCompletion"):
//
//       POSTCONDITION: merges and sensitive Gmail actions remain pending until
//                      the CEO approves
//       VALIDATION:    sensitive actions (merge, external send above threshold)
//                      MUST have approvedByHuman = true
//
//   A sensitive action (a merge, or an external send above the policy
//   threshold) is NEVER carried out autonomously. The flow is:
//
//       requestApproval(action)  ──▶ PENDING AgentActionAudit (NOT executed)
//          │
//          ├── approve(auditId, userId) ──▶ APPROVED, approvedByHuman = true
//          │                                 (the ONLY path that sets the flag)
//          └── reject(auditId, userId)  ──▶ REJECTED, approvedByHuman = false
//
//   The execution guard (`ensureApproved` / `execute`) REFUSES to run a
//   sensitive action unless a corresponding APPROVED + approvedByHuman audit
//   exists — so merges and sensitive Gmail actions stay pending until a human
//   (the CEO / org owner) approves them (Req 14.1, 14.2). Every sensitive action
//   is recorded in the audit trail with `approvedByHuman` true ONLY when a
//   human approved (Req 14.3, 23.1, 23.3).
//
// MODULE BOUNDARY
//   Lives in the agent module beside the human-gated PR tooling
//   (`quantcode-agent-tools.ts`). It consumes only neutral packages
//   (`@quant/server-core`, `@prisma/client`); it does NOT import the mail domain
//   or QuantChat. The wiring of `open_pr`'s merge path through this gate is done
//   via an injectable port (`MergeApprovalPort`) so no cross-module service is
//   imported directly.

import type { PrismaClient, AgentActionAudit } from '@prisma/client';
import { createAppError } from '@quant/server-core';

// ---------------------------------------------------------------------------
// Domain unions (mirror the Prisma enums; declared locally because the
// generated client surfaces enums only as input-field unions)
// ---------------------------------------------------------------------------

/** The kind of sensitive action being gated/audited. */
export type AgentActionType =
  | 'MERGE'
  | 'GMAIL_SEND'
  | 'GMAIL_REPLY'
  | 'GMAIL_ARCHIVE'
  | 'GMAIL_LABEL'
  | 'GMAIL_SCHEDULE_SEND'
  | 'GMAIL_FOLLOWUP'
  | 'EXTERNAL_SEND'
  | 'OTHER';

/** Sensitivity / level of a proposed action. */
export type AgentActionSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Lifecycle status of an audited action. */
export type AgentActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';

/**
 * Action types that are ALWAYS sensitive and therefore always require explicit
 * human approval before execution (Req 14.1 merge; Req 14.3 external send).
 */
const ALWAYS_SENSITIVE: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
  'MERGE',
  'EXTERNAL_SEND',
]);

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * A proposed sensitive action to gate. `tenantId` always scopes the audit row;
 * `orgId` / `actorWorkerId` are present for Company-OS worker actions and
 * absent (null) for plain Agent-Runtime / human-origin actions.
 */
export interface RequestApprovalInput {
  /** Ownership/isolation boundary for the audit row (required for authz). */
  tenantId: string;
  /** The kind of sensitive action. */
  actionType: AgentActionType;
  /** What the action targets (e.g. a PR id, email id, recipient address). */
  targetRef: string;
  /** The Company-OS org this action belongs to, when applicable. */
  orgId?: string | null;
  /** The worker that proposed the action, when applicable. */
  actorWorkerId?: string | null;
  /** Sensitivity of the action. Defaults to HIGH for always-sensitive kinds. */
  sensitivity?: AgentActionSensitivity;
  /** Free-form payload/context recorded with the audit entry. */
  metadata?: Record<string, unknown>;
}

/**
 * Structural port the QuantCode-scoped `open_pr` tool uses to record a PENDING
 * merge audit without importing this service directly (keeps the tool layer
 * decoupled). {@link AgentApprovalGate} satisfies this structurally.
 */
export interface MergeApprovalPort {
  requestApproval(input: RequestApprovalInput): Promise<AgentActionAudit>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Records and gates sensitive agent/Gmail-handler actions behind explicit human
 * approval, backed by the additive `AgentActionAudit` trail.
 */
export class AgentApprovalGate implements MergeApprovalPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Record a sensitive action as PENDING in the audit trail and return it. This
   * NEVER executes the action — it only requests approval (Req 14.1, 14.2). The
   * audit is created with `approvedByHuman = false`; the flag flips to true only
   * via {@link approve}.
   *
   * @throws 400 TENANT_REQUIRED   when `tenantId` is empty.
   * @throws 400 TARGET_REQUIRED   when `targetRef` is empty.
   */
  async requestApproval(input: RequestApprovalInput): Promise<AgentActionAudit> {
    const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : '';
    if (tenantId.length === 0) {
      throw createAppError('A tenantId is required to audit an action', 400, 'TENANT_REQUIRED');
    }
    const targetRef = typeof input.targetRef === 'string' ? input.targetRef.trim() : '';
    if (targetRef.length === 0) {
      throw createAppError('A targetRef is required to audit an action', 400, 'TARGET_REQUIRED');
    }

    const sensitivity =
      input.sensitivity ?? (ALWAYS_SENSITIVE.has(input.actionType) ? 'HIGH' : 'MEDIUM');

    return this.prisma.agentActionAudit.create({
      data: {
        tenantId,
        orgId: input.orgId ?? null,
        actorWorkerId: input.actorWorkerId ?? null,
        actionType: input.actionType,
        targetRef,
        sensitivity,
        // INVARIANT: a freshly requested action is always PENDING and
        // not-yet-human-approved.
        status: 'PENDING',
        approvedByHuman: false,
        approvedByUserId: null,
        decidedAt: null,
        executedAt: null,
        metadata: (input.metadata ?? {}) as never,
      },
    });
  }

  /**
   * Record an action that is being (or has just been) carried out AUTONOMOUSLY
   * — i.e. WITHOUT human approval because it sits at/below the automation
   * policy threshold (Task 22.2, Req 15.5). The row is written straight to the
   * audit trail as EXECUTED with `approvedByHuman = false` and `executedAt` set,
   * so EVERY handler action is auditable regardless of whether it went through
   * the human-approval path.
   *
   * This NEVER applies to an always-sensitive action (a merge or an external
   * send above threshold) — those must go through {@link requestApproval} →
   * {@link approve} → {@link execute}. It is the caller's responsibility (the
   * `GmailHandler`) to only record actions here that are genuinely at/below the
   * policy threshold; the invariant "sensitive actions MUST be approvedByHuman"
   * is unaffected because such actions never reach this method.
   *
   * @throws 400 TENANT_REQUIRED   when `tenantId` is empty.
   * @throws 400 TARGET_REQUIRED   when `targetRef` is empty.
   */
  async recordAutonomous(input: RequestApprovalInput): Promise<AgentActionAudit> {
    const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : '';
    if (tenantId.length === 0) {
      throw createAppError('A tenantId is required to audit an action', 400, 'TENANT_REQUIRED');
    }
    const targetRef = typeof input.targetRef === 'string' ? input.targetRef.trim() : '';
    if (targetRef.length === 0) {
      throw createAppError('A targetRef is required to audit an action', 400, 'TARGET_REQUIRED');
    }

    const sensitivity =
      input.sensitivity ?? (ALWAYS_SENSITIVE.has(input.actionType) ? 'HIGH' : 'LOW');
    const now = new Date();

    return this.prisma.agentActionAudit.create({
      data: {
        tenantId,
        orgId: input.orgId ?? null,
        actorWorkerId: input.actorWorkerId ?? null,
        actionType: input.actionType,
        targetRef,
        sensitivity,
        // INVARIANT: an autonomously-executed action is EXECUTED and was never
        // human-approved (it did not need to be — it is at/below threshold).
        status: 'EXECUTED',
        approvedByHuman: false,
        approvedByUserId: null,
        decidedAt: null,
        executedAt: now,
        metadata: (input.metadata ?? {}) as never,
      },
    });
  }

  /**
   * A human (CEO / org owner) APPROVES a pending action: sets status APPROVED,
   * `approvedByHuman = true`, and records who decided + when. This is the ONLY
   * method that sets `approvedByHuman = true` (Req 14.3, 23.3).
   *
   * @throws 400 USER_REQUIRED       when `userId` is empty.
   * @throws 404 AUDIT_NOT_FOUND     when the audit does not exist.
   * @throws 409 NOT_PENDING         when the audit is not awaiting a decision.
   */
  async approve(auditId: string, userId: string): Promise<AgentActionAudit> {
    const approver = typeof userId === 'string' ? userId.trim() : '';
    if (approver.length === 0) {
      throw createAppError('An approving userId is required', 400, 'USER_REQUIRED');
    }
    const audit = await this.load(auditId);
    if (audit.status !== 'PENDING') {
      throw createAppError(
        `Only a PENDING action can be approved (was ${audit.status})`,
        409,
        'NOT_PENDING',
      );
    }
    return this.prisma.agentActionAudit.update({
      where: { id: audit.id },
      data: {
        status: 'APPROVED',
        approvedByHuman: true,
        approvedByUserId: approver,
        decidedAt: new Date(),
      },
    });
  }

  /**
   * A human REJECTS a pending action: sets status REJECTED and records who
   * decided. `approvedByHuman` stays false — a rejected action never executes.
   *
   * @throws 400 USER_REQUIRED       when `userId` is empty.
   * @throws 404 AUDIT_NOT_FOUND     when the audit does not exist.
   * @throws 409 NOT_PENDING         when the audit is not awaiting a decision.
   */
  async reject(auditId: string, userId: string): Promise<AgentActionAudit> {
    const decider = typeof userId === 'string' ? userId.trim() : '';
    if (decider.length === 0) {
      throw createAppError('A deciding userId is required', 400, 'USER_REQUIRED');
    }
    const audit = await this.load(auditId);
    if (audit.status !== 'PENDING') {
      throw createAppError(
        `Only a PENDING action can be rejected (was ${audit.status})`,
        409,
        'NOT_PENDING',
      );
    }
    return this.prisma.agentActionAudit.update({
      where: { id: audit.id },
      data: {
        status: 'REJECTED',
        approvedByHuman: false,
        approvedByUserId: decider,
        decidedAt: new Date(),
      },
    });
  }

  /**
   * Execution GUARD (Req 14.1, 14.2): resolve an audit and REFUSE unless it is
   * APPROVED *and* `approvedByHuman = true`. Returns the approved audit so the
   * caller can proceed. A PENDING/REJECTED/already-EXECUTED action is refused.
   *
   * Defence-in-depth: `approvedByHuman` is asserted independently of `status`
   * so the action cannot execute even if a status were ever set to APPROVED
   * without a recorded human approval.
   *
   * @throws 404 AUDIT_NOT_FOUND       when the audit does not exist.
   * @throws 403 APPROVAL_REQUIRED     when not approved by a human.
   * @throws 409 ALREADY_EXECUTED      when the action has already been executed.
   */
  async ensureApproved(auditId: string): Promise<AgentActionAudit> {
    const audit = await this.load(auditId);
    if (audit.status === 'EXECUTED') {
      throw createAppError('This action has already been executed', 409, 'ALREADY_EXECUTED');
    }
    if (audit.status !== 'APPROVED' || audit.approvedByHuman !== true) {
      throw createAppError(
        'This sensitive action requires explicit human approval before it can execute',
        403,
        'APPROVAL_REQUIRED',
      );
    }
    return audit;
  }

  /**
   * Execute a sensitive action through the gate: run the guard, perform the
   * supplied effect, then mark the audit EXECUTED. If the action is not
   * human-approved the effect is NEVER invoked (it fails closed).
   *
   * @throws (see {@link ensureApproved}) when not approved / already executed.
   */
  async execute<T>(auditId: string, effect: () => Promise<T> | T): Promise<T> {
    await this.ensureApproved(auditId);
    const result = await effect();
    await this.prisma.agentActionAudit.update({
      where: { id: auditId },
      data: { status: 'EXECUTED', executedAt: new Date() },
    });
    return result;
  }

  /** Load an audit row or throw 404. */
  private async load(auditId: string): Promise<AgentActionAudit> {
    const audit = await this.prisma.agentActionAudit.findUnique({ where: { id: auditId } });
    if (!audit) {
      throw createAppError('Agent action audit not found', 404, 'AUDIT_NOT_FOUND');
    }
    return audit;
  }
}
