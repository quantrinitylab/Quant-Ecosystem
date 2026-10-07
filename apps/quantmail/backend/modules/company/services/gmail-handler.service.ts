// ============================================================================
// Company OS module — policy-guarded autonomous Gmail handler (Phase 6)
// quantmail-superhub · Task 22.2 (Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6)
// ============================================================================
//
// PURPOSE
//   Operates the CEO's REAL inbox on their behalf, governed by an explicit,
//   opt-in `InboxAutomationPolicy` (design §"Component: Autonomous Gmail
//   Handler"). For each proposed inbox action the handler:
//
//     1. classifies the action's sensitivity using the EXISTING AI email
//        services (Req 15.1) — consumed through the injectable
//        `SensitivityClassifierPort` seam (the production adapter wraps the
//        mail-domain `ai-triage` / `ai-reply` services; see
//        `createTriageSensitivityClassifier`);
//     2. AUTO-EXECUTES it when its sensitivity is at/below the policy threshold
//        AND the action type is permitted, respecting the undo-send window for
//        send-like actions (Req 15.2) — execution flows through the injectable
//        `GmailActionExecutorPort`;
//     3. requires explicit HUMAN APPROVAL when the sensitivity exceeds the
//        threshold (Req 15.3), and for an EXTERNAL send/reply above the
//        threshold (Req 15.4) — the action is routed through the agent module's
//        `AgentApprovalGate.requestApproval` and stays PENDING (never executed)
//        until a human approves it;
//     4. takes NO autonomous action at all when the policy is not enabled for
//        the user (Req 15.6);
//     5. AUDITS every action it takes — autonomous executions via the gate's
//        `recordAutonomous`, approval-required actions via `requestApproval`
//        (Req 15.5). Both write to the SAME `AgentActionAudit` trail owned by
//        the agent module.
//
// MODULE BOUNDARY (SRP — design AD-2)
//   This handler consumes:
//     • the agent module's human-approval gate ONLY via its barrel (`../../agent`)
//       through the structural `ApprovalGatePort` seam — never by reaching into
//       `modules/agent/services/*`;
//     • the mail-domain AI email services ONLY through injectable ports
//       (`SensitivityClassifierPort`, `GmailActionExecutorPort`) — this module
//       NEVER imports the mail-domain services directly, and does NOT touch
//       QuantChat.
//   The real adapters (triage-backed classifier, EmailService-backed executor)
//   are wired at composition time on the mail-domain side.

import { createAppError } from '@quant/server-core';
import type { AgentActionAudit } from '@prisma/client';
import type {
  RequestApprovalInput,
  AgentActionType,
  AgentActionSensitivity,
} from '../../agent';

// ---------------------------------------------------------------------------
// Sensitivity ordering (mirrors the Prisma `AgentActionSensitivity` enum)
// ---------------------------------------------------------------------------

/** A proposed action's sensitivity level (reuses the audit-trail union). */
export type SensitivityLevel = AgentActionSensitivity;

/** Total order over sensitivity so "above threshold" is well-defined. */
const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

// ---------------------------------------------------------------------------
// Proposed inbox actions + policy
// ---------------------------------------------------------------------------

/** The kinds of inbox action the handler can propose/execute (design). */
export type GmailActionKind =
  | 'label'
  | 'archive'
  | 'draft'
  | 'reply'
  | 'send'
  | 'schedule_send'
  | 'followup';

/**
 * Action kinds that actually transmit mail to a recipient. These are the only
 * kinds for which the undo-send window applies, and the only kinds that can be
 * an "external send" (Req 15.4).
 */
const SEND_LIKE: ReadonlySet<GmailActionKind> = new Set<GmailActionKind>([
  'reply',
  'send',
  'schedule_send',
  'followup',
]);

/** True for a send-like (mail-transmitting) action kind. */
export function isSendLike(kind: GmailActionKind): boolean {
  return SEND_LIKE.has(kind);
}

/**
 * A single proposed inbox action. `targetRef` is what the action targets — an
 * email/thread id for label/archive/draft, or the recipient address/id for a
 * send/reply — and is recorded on the audit row.
 */
export interface ProposedGmailAction {
  kind: GmailActionKind;
  /** What the action targets (emailId / threadId / recipient). Required. */
  targetRef: string;
  /** The recipient address for a send/reply (used for classification context). */
  recipient?: string;
  /** True when the recipient is OUTSIDE the user's org/domain (Req 15.4). */
  external?: boolean;
  subject?: string;
  body?: string;
  /** Free-form context recorded with the audit entry. */
  metadata?: Record<string, unknown>;
}

/**
 * The per-user, opt-in guardrail policy (design §"STRUCTURE
 * InboxAutomationPolicy"). When `enabled` is not true, the handler takes NO
 * autonomous action (Req 15.6).
 */
export interface InboxAutomationPolicy {
  /** The CEO / user whose inbox is being operated. */
  userId: string;
  /** Master opt-in switch — false/absent ⇒ no autonomous action (Req 15.6). */
  enabled: boolean;
  /** Actions ABOVE this sensitivity require human approval (Req 15.3). */
  approvalThreshold: SensitivityLevel;
  /** Undo-send window (seconds) respected for send-like auto-executions (Req 15.2). */
  undoSendWindowSeconds: number;
  /** Which action kinds may be AUTO-executed (others require approval). */
  allowedActions: GmailActionKind[];
  /** Ownership boundary for the audit row; defaults to `userId`. */
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Injectable ports (dependency inversion — keeps the company module decoupled
// from the mail domain / AI services)
// ---------------------------------------------------------------------------

/** Context handed to the sensitivity classifier. */
export interface ClassificationContext {
  userId: string;
}

/**
 * Classifies a proposed action's sensitivity using the EXISTING AI email
 * services (Req 15.1). The company module DEFINES this port; the mail-domain
 * side provides the real adapter (over `ai-triage` / `ai-reply`) and injects it
 * at composition time. See {@link createTriageSensitivityClassifier}.
 */
export interface SensitivityClassifierPort {
  classify(action: ProposedGmailAction, ctx: ClassificationContext): Promise<SensitivityLevel>;
}

/**
 * The shape of the existing mail-domain `ai-triage` service (structural — so we
 * never import it across the module boundary). `urgency` is a 0..1 score.
 */
export interface TriagePort {
  triage(
    email: { subject: string; body: string; from: string; receivedAt?: string },
    userId: string,
  ): Promise<{ urgency: number; category?: string; reason?: string; suggestedAction?: string }>;
}

/** Map a 0..1 triage urgency to a discrete sensitivity level. */
export function sensitivityFromUrgency(urgency: number): SensitivityLevel {
  const u = Number.isFinite(urgency) ? Math.max(0, Math.min(1, urgency)) : 0;
  if (u >= 0.85) return 'CRITICAL';
  if (u >= 0.6) return 'HIGH';
  if (u >= 0.3) return 'MEDIUM';
  return 'LOW';
}

/**
 * Build a {@link SensitivityClassifierPort} backed by the existing `ai-triage`
 * service (Req 15.1). This is the production adapter the mail-domain side wires
 * in; it reuses the AI email service rather than re-implementing classification.
 */
export function createTriageSensitivityClassifier(triage: TriagePort): SensitivityClassifierPort {
  return {
    async classify(action, ctx) {
      const res = await triage.triage(
        {
          subject: action.subject ?? '',
          body: action.body ?? '',
          from: action.recipient ?? '',
        },
        ctx.userId,
      );
      return sensitivityFromUrgency(res.urgency);
    },
  };
}

/** Options passed to the executor for a single action. */
export interface GmailExecuteOptions {
  /** The undo-send window (seconds) to apply; 0 for non-send actions (Req 15.2). */
  undoSendWindowSeconds: number;
}

/** The outcome of actually carrying out an inbox action. */
export interface GmailActionResult {
  kind: GmailActionKind;
  targetRef: string;
  /** True when a send-like action was scheduled with a non-zero undo window. */
  scheduledWithUndoWindow: boolean;
  undoSendWindowSeconds: number;
  executedAt: Date;
}

/**
 * Carries out an approved/auto-executable inbox action. The company module
 * DEFINES this port; the mail-domain side provides the real adapter (over
 * `EmailService` / `undo-send` / `smart-send-time`) and injects it. Send-like
 * actions MUST be scheduled with the undo-send window rather than transmitted
 * instantly/irreversibly (Req 15.2).
 */
export interface GmailActionExecutorPort {
  execute(action: ProposedGmailAction, options: GmailExecuteOptions): Promise<GmailActionResult>;
}

/**
 * Offline/test `GmailActionExecutorPort`: records what it was asked to execute
 * (and whether a send-like action got an undo window) without touching the mail
 * domain. Production wiring injects the real `EmailService`-backed adapter.
 */
export class InMemoryGmailActionExecutor implements GmailActionExecutorPort {
  readonly executed: Array<{
    action: ProposedGmailAction;
    options: GmailExecuteOptions;
    result: GmailActionResult;
  }> = [];

  async execute(action: ProposedGmailAction, options: GmailExecuteOptions): Promise<GmailActionResult> {
    const scheduledWithUndoWindow =
      isSendLike(action.kind) && options.undoSendWindowSeconds > 0;
    const result: GmailActionResult = {
      kind: action.kind,
      targetRef: action.targetRef,
      scheduledWithUndoWindow,
      undoSendWindowSeconds: options.undoSendWindowSeconds,
      executedAt: new Date(),
    };
    this.executed.push({ action, options, result });
    return result;
  }
}

/**
 * Structural seam over the agent module's `AgentApprovalGate` (consumed via the
 * agent barrel). The handler needs only these two audit-trail entry points:
 * `requestApproval` (PENDING, human-gated) and `recordAutonomous` (auto-exec
 * audit). `AgentApprovalGate` satisfies this structurally.
 */
export interface ApprovalGatePort {
  requestApproval(input: RequestApprovalInput): Promise<AgentActionAudit>;
  recordAutonomous(input: RequestApprovalInput): Promise<AgentActionAudit>;
}

// ---------------------------------------------------------------------------
// Handler decision + options
// ---------------------------------------------------------------------------

/** The disposition of a single proposed action. */
export type GmailHandlerOutcome = 'NO_ACTION' | 'AUTO_EXECUTED' | 'PENDING_APPROVAL';

/** What the handler decided/did for a single proposed action. */
export interface GmailHandlerDecision {
  action: ProposedGmailAction;
  outcome: GmailHandlerOutcome;
  /** The classified sensitivity (absent only when the policy was disabled). */
  sensitivity?: SensitivityLevel;
  /** The audit row recorded for this action (absent only for NO_ACTION). */
  audit?: AgentActionAudit;
  /** The executor result when AUTO_EXECUTED. */
  result?: GmailActionResult;
  /** Human-readable explanation of the decision. */
  reason: string;
}

export interface GmailHandlerOptions {
  /** Classifies action sensitivity via the existing AI email services (Req 15.1). */
  classifier: SensitivityClassifierPort;
  /** Carries out auto-executable actions, respecting the undo-send window (Req 15.2). */
  executor: GmailActionExecutorPort;
  /** The agent module's human-approval gate + audit trail (Req 15.3, 15.4, 15.5). */
  gate: ApprovalGatePort;
}

// ---------------------------------------------------------------------------
// GmailHandler
// ---------------------------------------------------------------------------

/**
 * The policy-guarded autonomous Gmail handler (design §"INTERFACE
 * GmailHandler"). Reuses the existing AI email services for classification, the
 * existing `AgentApprovalGate` for human gating + audit, and an injectable
 * executor for the actual mail effects.
 */
export class GmailHandler {
  constructor(private readonly opts: GmailHandlerOptions) {}

  /**
   * Decide and (when permitted) carry out a SINGLE proposed inbox action.
   *
   *   • policy not enabled               ⇒ NO_ACTION (nothing audited)      Req 15.6
   *   • sensitivity > threshold          ⇒ PENDING_APPROVAL (not executed)  Req 15.3
   *   • external send/reply > threshold  ⇒ PENDING_APPROVAL (not executed)  Req 15.4
   *   • action kind not auto-permitted   ⇒ PENDING_APPROVAL (not executed)
   *   • sensitivity ≤ threshold & permit ⇒ AUTO_EXECUTED (undo window)      Req 15.2
   *
   * EVERY executed/approval-required action is recorded in the audit trail
   * (Req 15.5).
   *
   * @throws 400 TARGET_REQUIRED when `action.targetRef` is empty.
   */
  async handle(
    policy: InboxAutomationPolicy,
    action: ProposedGmailAction,
  ): Promise<GmailHandlerDecision> {
    // ----- 1. Policy gate: disabled ⇒ take NO autonomous action (Req 15.6) --
    if (!policy || policy.enabled !== true) {
      return {
        action,
        outcome: 'NO_ACTION',
        reason: 'InboxAutomationPolicy is not enabled for this user; no autonomous action taken',
      };
    }

    const targetRef = typeof action.targetRef === 'string' ? action.targetRef.trim() : '';
    if (targetRef.length === 0) {
      throw createAppError('A targetRef is required for an inbox action', 400, 'TARGET_REQUIRED');
    }

    // ----- 2. Classify sensitivity via the existing AI email services (15.1) -
    const sensitivity = await this.opts.classifier.classify(action, { userId: policy.userId });

    const tenantId =
      typeof policy.tenantId === 'string' && policy.tenantId.trim().length > 0
        ? policy.tenantId.trim()
        : policy.userId;

    const aboveThreshold =
      SENSITIVITY_RANK[sensitivity] > SENSITIVITY_RANK[policy.approvalThreshold];
    const permitted = Array.isArray(policy.allowedActions)
      ? policy.allowedActions.includes(action.kind)
      : false;
    const isExternalSend = isSendLike(action.kind) && action.external === true;
    const actionType = resolveActionType(action, aboveThreshold, isExternalSend);

    // ----- 3. Above threshold (incl. external send above threshold) OR a kind
    //          not authorized to auto-execute ⇒ require human approval; the
    //          action stays PENDING and is NEVER executed here (Req 15.3, 15.4).
    if (aboveThreshold || !permitted) {
      const audit = await this.opts.gate.requestApproval({
        tenantId,
        actionType,
        targetRef,
        sensitivity,
        metadata: {
          source: 'gmail-handler',
          kind: action.kind,
          external: isExternalSend,
          reason: aboveThreshold ? 'above_threshold' : 'action_kind_not_auto_permitted',
          ...(action.metadata ?? {}),
        },
      });
      return {
        action,
        outcome: 'PENDING_APPROVAL',
        sensitivity,
        audit,
        reason: aboveThreshold
          ? `Sensitivity ${sensitivity} exceeds the policy threshold ${policy.approvalThreshold}; human approval required`
          : `Action kind '${action.kind}' is not permitted to auto-execute; human approval required`,
      };
    }

    // ----- 4. At/below threshold AND permitted ⇒ AUTO-EXECUTE, respecting the
    //          undo-send window for send-like actions (Req 15.2). -------------
    const undoSendWindowSeconds = isSendLike(action.kind)
      ? Math.max(0, Math.floor(Number(policy.undoSendWindowSeconds) || 0))
      : 0;
    const result = await this.opts.executor.execute(action, { undoSendWindowSeconds });

    // ----- 5. Audit the autonomous execution via the SAME audit trail (15.5) -
    const audit = await this.opts.gate.recordAutonomous({
      tenantId,
      actionType,
      targetRef,
      sensitivity,
      metadata: {
        source: 'gmail-handler',
        kind: action.kind,
        external: isExternalSend,
        undoSendWindowSeconds,
        scheduledWithUndoWindow: result.scheduledWithUndoWindow,
        ...(action.metadata ?? {}),
      },
    });

    return {
      action,
      outcome: 'AUTO_EXECUTED',
      sensitivity,
      audit,
      result,
      reason: `Sensitivity ${sensitivity} is at/below the policy threshold ${policy.approvalThreshold}; auto-executed`,
    };
  }

  /**
   * Decide/execute a batch of proposed actions in order, returning one decision
   * per action. (Sequential so audit ordering is deterministic.)
   */
  async handleAll(
    policy: InboxAutomationPolicy,
    actions: ProposedGmailAction[],
  ): Promise<GmailHandlerDecision[]> {
    const decisions: GmailHandlerDecision[] = [];
    for (const action of actions ?? []) {
      decisions.push(await this.handle(policy, action));
    }
    return decisions;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Map a proposed action to the `AgentActionType` recorded on its audit row. An
 * external send/reply above threshold is recorded as `EXTERNAL_SEND` (Req 15.4);
 * otherwise the kind maps to its Gmail-specific audit type.
 */
function resolveActionType(
  action: ProposedGmailAction,
  aboveThreshold: boolean,
  isExternalSend: boolean,
): AgentActionType {
  if (isExternalSend && aboveThreshold) {
    return 'EXTERNAL_SEND';
  }
  switch (action.kind) {
    case 'send':
      return 'GMAIL_SEND';
    case 'reply':
      return 'GMAIL_REPLY';
    case 'archive':
      return 'GMAIL_ARCHIVE';
    case 'label':
      return 'GMAIL_LABEL';
    case 'schedule_send':
      return 'GMAIL_SCHEDULE_SEND';
    case 'followup':
      return 'GMAIL_FOLLOWUP';
    case 'draft':
    default:
      return 'OTHER';
  }
}
