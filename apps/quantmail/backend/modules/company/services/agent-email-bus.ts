// ============================================================================
// Company OS module — Agent Email Bus: send / poll / observe (Phase 6)
// quantmail-superhub · Task 20.1 (Requirements 12.1, 12.2, 12.3, 12.4)
// ============================================================================
//
// PURPOSE
//   Agents coordinate by emailing each other THROUGH the normal QuantMail
//   pipeline (design §"INTERFACE AgentEmailBus" / "Component: Email as Message
//   Bus"). This service is the structured view over that mail traffic:
//
//       INTERFACE AgentEmailBus
//         PROCEDURE send(fromWorkerId, toWorkerIds, msgType, body, artifacts)
//                                                       RETURNS AgentBusMessage
//           POSTCONDITION: delivered via the normal mail pipeline; threaded to
//                          the work item
//           INVARIANT:     recipients are same-tenant agent identities
//                          (no cross-tenant send)
//         FUNCTION  poll(workerId) RETURNS AgentBusMessage[]   // read mailbox
//         PROCEDURE observe(orgId) RETURNS AgentBusMessage[]   // route / audit
//
//   WHAT MAKES A MESSAGE A "BUS" MESSAGE (design §"STRUCTURE AgentBusMessage")
//     • the reserved system label `agent-bus` on the delivered Email (Req 12.1);
//     • the headers `X-Quant-Agent-Org` = orgId, `X-Quant-Agent-From-Role` and
//       `X-Quant-Agent-Msg-Type` (Req 12.1, 12.2);
//     • it is threaded to the message's `AgentWorkItem` (Req 12.1);
//     • artifacts (diffs / plans / logs / reports) travel as Email attachments
//       (Req 12.4).
//
//   ISOLATION INVARIANT (Requirement 12.3 — validated by Task 20.2's property)
//     A message is delivered ONLY IF its sender AND every recipient is an
//     ACTIVE agent identity within the SAME org AND the SAME tenant. Any
//     cross-tenant / cross-org / non-agent party causes the whole send to be
//     REJECTED before any mail is delivered (fail closed, nothing persisted).
//
//   MODULE BOUNDARY (SRP)
//     This module must NOT import the mail-domain services directly. Delivery
//     therefore goes through an injectable `MailDeliveryPort` seam (dependency
//     inversion): the company module DEFINES the port; the mail-domain side
//     provides the real adapter over `EmailService`/`ThreadService` (see
//     `services/agent-bus-mail-delivery.ts`) and wires it at composition time.
//     Offline/tests use the bundled `InMemoryMailDelivery`.
//
//   PERSISTENCE (additive — see the Prisma schema + `prisma-stub.d.ts`)
//     • `AgentWorkItem`     — the unit of work; one bus EmailThread per item.
//     • `AgentBusEmailMeta` — a structured SIDECAR over each delivered Email
//       carrying the bus headers, msg type, and sender/recipient WORKER ids so
//       `poll`/`observe` can route by worker/org WITHOUT a `headers` column on
//       `Email`. The reserved label, artifacts, recipients and thread still
//       live on the real delivered `Email`.

import { createAppError } from '@quant/server-core';
import type {
  PrismaClient,
  AgentWorker,
  AgentOrg,
  AgentMailboxIdentity,
  AgentWorkItem,
} from '@prisma/client';
import type { AgentRoleKey } from './role-catalog.service';

// ---------------------------------------------------------------------------
// Message-type contract (design §"STRUCTURE AgentBusMessage")
// ---------------------------------------------------------------------------

/** The wire message types carried in the `X-Quant-Agent-Msg-Type` header. */
export type AgentBusMsgType =
  | 'task_assign'
  | 'pr_ready'
  | 'change_request'
  | 'ci_result'
  | 'status'
  | 'escalation'
  | 'done';

/** All valid wire message types (also the accepted `send` inputs). */
export const ALL_MSG_TYPES: readonly AgentBusMsgType[] = [
  'task_assign',
  'pr_ready',
  'change_request',
  'ci_result',
  'status',
  'escalation',
  'done',
];

/** Maps a wire msg type to its Prisma `AgentBusMsgType` enum value. */
const PRISMA_MSG_TYPE: Record<AgentBusMsgType, string> = {
  task_assign: 'TASK_ASSIGN',
  pr_ready: 'PR_READY',
  change_request: 'CHANGE_REQUEST',
  ci_result: 'CI_RESULT',
  status: 'STATUS',
  escalation: 'ESCALATION',
  done: 'DONE',
};

/** Maps a Prisma `AgentBusMsgType` enum value back to the wire msg type. */
const WIRE_MSG_TYPE: Record<string, AgentBusMsgType> = {
  TASK_ASSIGN: 'task_assign',
  PR_READY: 'pr_ready',
  CHANGE_REQUEST: 'change_request',
  CI_RESULT: 'ci_result',
  STATUS: 'status',
  ESCALATION: 'escalation',
  DONE: 'done',
};

/** Maps a Prisma `AgentRoleKey` enum value to the lowercase wire role. */
const WIRE_ROLE: Record<string, AgentRoleKey> = {
  PLANNER: 'planner',
  CODER: 'coder',
  REVIEWER: 'reviewer',
  TESTER: 'tester',
  DEBUGGER: 'debugger',
  UPGRADER: 'upgrader',
  DEVOPS: 'devops',
};

/** The reserved system label every bus message carries (design). */
export const AGENT_BUS_LABEL = 'agent-bus';

// ---------------------------------------------------------------------------
// Artifact + message view types
// ---------------------------------------------------------------------------

/**
 * An artifact carried on a bus message as an Email attachment (Req 12.4):
 * a diff, plan, log, or report. `content` (inline) or `url` (external blob)
 * carries the payload; the rest is descriptive metadata.
 */
export interface AgentBusArtifact {
  filename: string;
  /** diff | plan | log | report (free-form to allow future kinds). */
  kind: 'diff' | 'plan' | 'log' | 'report' | string;
  contentType?: string;
  content?: string;
  url?: string;
  size?: number;
}

/**
 * The structured view over a delivered bus Email (design §"STRUCTURE
 * AgentBusMessage"). Returned by `send` and listed by `poll`/`observe`.
 */
export interface AgentBusMessage {
  emailId: string;
  orgId: string;
  threadId: string;
  workItemId: string;
  fromWorkerId: string;
  /** The lowercase wire role of the sender (X-Quant-Agent-From-Role). */
  fromRole: AgentRoleKey | string;
  toWorkerIds: string[];
  msgType: AgentBusMsgType;
  artifacts: AgentBusArtifact[];
}

// ---------------------------------------------------------------------------
// MailDeliveryPort seam (dependency inversion — keeps the company module
// decoupled from the mail domain)
// ---------------------------------------------------------------------------

/** The three structured headers every bus message carries (Req 12.1, 12.2). */
export interface AgentBusHeaders {
  'X-Quant-Agent-Org': string;
  'X-Quant-Agent-From-Role': string;
  'X-Quant-Agent-Msg-Type': string;
}

/** A delivery request handed to the {@link MailDeliveryPort}. */
export interface DeliverBusMailInput {
  orgId: string;
  /** Owner of the delivered Email row (the org's tenant owner / CEO). */
  ownerUserId: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  body: string;
  /** The reserved system label to apply (always `agent-bus`). */
  label: string;
  headers: AgentBusHeaders;
  /**
   * The work item's existing bus thread, or `null`/`undefined` when this is the
   * first message for the item (the adapter then creates/stitches a thread).
   */
  threadId?: string | null;
  /** Used as the thread subject when a new thread must be created. */
  workItemTitle: string;
  artifacts: AgentBusArtifact[];
}

/** The result of delivering a bus message through the mail pipeline. */
export interface DeliveredBusMail {
  /** The id of the delivered `Email`. */
  emailId: string;
  /** The `EmailThread` the message landed in (the work item's bus thread). */
  threadId: string;
}

/**
 * Delivery seam the bus uses to send mail through the NORMAL mail pipeline
 * (Req 12.1). The company module defines this port; the real adapter over
 * `EmailService` lives on the mail-domain side and is injected at composition
 * time. {@link InMemoryMailDelivery} is the offline/test default.
 */
export interface MailDeliveryPort {
  deliver(input: DeliverBusMailInput): Promise<DeliveredBusMail>;
}

/**
 * Offline/test `MailDeliveryPort`: synthesizes deterministic email + thread ids
 * without touching the mail domain. Production wiring injects the real
 * `EmailService`-backed adapter.
 */
export class InMemoryMailDelivery implements MailDeliveryPort {
  private seq = 0;
  readonly delivered: Array<DeliverBusMailInput & DeliveredBusMail> = [];

  async deliver(input: DeliverBusMailInput): Promise<DeliveredBusMail> {
    const n = ++this.seq;
    const emailId = `bus-email-${n}`;
    const threadId =
      typeof input.threadId === 'string' && input.threadId.length > 0
        ? input.threadId
        : `bus-thread-${n}`;
    this.delivered.push({ ...input, emailId, threadId });
    return { emailId, threadId };
  }
}

// ---------------------------------------------------------------------------
// send() options
// ---------------------------------------------------------------------------

export interface SendOptions {
  /**
   * Thread the message onto an EXISTING work item. When omitted, a new work
   * item is created (assigned to the first recipient) and its bus thread is
   * established by the first delivery (Req 12.1).
   */
  workItemId?: string;
  /** Title for a newly-created work item (defaults to a msg-type-derived one). */
  title?: string;
  /** Subject line for the delivered Email (defaults to a work-item subject). */
  subject?: string;
}

export interface AgentEmailBusOptions {
  /** Mail delivery seam (defaults to {@link InMemoryMailDelivery}). */
  mailDelivery?: MailDeliveryPort;
}

// ---------------------------------------------------------------------------
// AgentEmailBus
// ---------------------------------------------------------------------------

/** A sender/recipient resolved to its worker + active agent mailbox identity. */
interface ResolvedAgent {
  worker: AgentWorker;
  identity: AgentMailboxIdentity;
}

export class AgentEmailBus {
  private readonly mail: MailDeliveryPort;

  constructor(
    private readonly prisma: PrismaClient,
    options: AgentEmailBusOptions = {},
  ) {
    this.mail = options.mailDelivery ?? new InMemoryMailDelivery();
  }

  /**
   * Send a bus message from one agent worker to one or more agent workers
   * (design §"PROCEDURE send"). Delivers through the normal mail pipeline with
   * the reserved `agent-bus` label + the three `X-Quant-Agent-*` headers
   * (Req 12.1, 12.2), threads it to its `AgentWorkItem` (Req 12.1), and carries
   * artifacts as attachments (Req 12.4).
   *
   * FAIL CLOSED (Req 12.3): if the sender or ANY recipient is not an ACTIVE
   * agent identity within the SAME org and tenant, the send is REJECTED and
   * NOTHING is delivered or persisted.
   *
   * @throws 400 INVALID_MSG_TYPE          when `msgType` is not a known type.
   * @throws 400 NO_RECIPIENTS             when `toWorkerIds` is empty.
   * @throws 404 WORKER_NOT_FOUND          when a worker id does not exist.
   * @throws 422 NOT_AGENT_IDENTITY        when a party has no ACTIVE mailbox identity.
   * @throws 403 CROSS_TENANT_BUS_REJECTED when a party is in another org/tenant.
   * @throws 404 ORG_NOT_FOUND             when the sender's org is missing.
   * @throws 404 WORK_ITEM_NOT_FOUND       when `options.workItemId` does not exist.
   */
  async send(
    fromWorkerId: string,
    toWorkerIds: string[],
    msgType: AgentBusMsgType,
    body: string,
    artifacts: AgentBusArtifact[] = [],
    options: SendOptions = {},
  ): Promise<AgentBusMessage> {
    // ----- 0. Validate the message type + recipients ----------------------
    if (typeof msgType !== 'string' || !ALL_MSG_TYPES.includes(msgType)) {
      throw createAppError(
        `Unknown agent-bus message type '${String(msgType)}'`,
        400,
        'INVALID_MSG_TYPE',
      );
    }
    const recipientIds = Array.from(
      new Set((toWorkerIds ?? []).map((id) => (typeof id === 'string' ? id.trim() : '')).filter((id) => id.length > 0)),
    );
    if (recipientIds.length === 0) {
      throw createAppError(
        'At least one recipient worker is required',
        400,
        'NO_RECIPIENTS',
      );
    }

    // ----- 1. Resolve + AUTHORIZE all parties (Req 12.3) -------------------
    // Sender first; every recipient must share its org AND tenant and be an
    // ACTIVE agent identity. Resolved BEFORE any delivery so a rejection
    // leaves no mail and no sidecar behind.
    const sender = await this.resolveAgent(fromWorkerId);
    const recipients: ResolvedAgent[] = [];
    for (const id of recipientIds) {
      const recipient = await this.resolveAgent(id);
      this.assertSameOrgAndTenant(sender, recipient);
      recipients.push(recipient);
    }

    const orgId = sender.worker.orgId;
    const org = await this.prisma.agentOrg.findUnique({ where: { id: orgId } });
    if (!org) {
      throw createAppError('Agent org not found', 404, 'ORG_NOT_FOUND');
    }

    // ----- 2. Resolve or create the work item (Req 12.1 threading) ---------
    const fromRole = this.wireRole(sender);
    const workItem = await this.resolveOrCreateWorkItem(org, recipients[0].worker.id, msgType, body, options);

    // ----- 3. Deliver through the normal mail pipeline (Req 12.1, 12.2, 12.4)
    const headers: AgentBusHeaders = {
      'X-Quant-Agent-Org': orgId,
      'X-Quant-Agent-From-Role': fromRole,
      'X-Quant-Agent-Msg-Type': msgType,
    };
    const subject =
      typeof options.subject === 'string' && options.subject.trim().length > 0
        ? options.subject.trim()
        : `[${msgType}] ${workItem.title}`;
    const normalizedArtifacts = normalizeArtifacts(artifacts);

    const delivered = await this.mail.deliver({
      orgId,
      ownerUserId: org.ceoUserId,
      fromAddress: sender.identity.address,
      toAddresses: recipients.map((r) => r.identity.address),
      subject,
      body: typeof body === 'string' ? body : '',
      label: AGENT_BUS_LABEL,
      headers,
      threadId: workItem.busThreadId,
      workItemTitle: workItem.title,
      artifacts: normalizedArtifacts,
    });

    // ----- 4. Bind the work item to its bus thread on first delivery -------
    if (!workItem.busThreadId) {
      await this.prisma.agentWorkItem.update({
        where: { id: workItem.id },
        data: { busThreadId: delivered.threadId },
      });
    }

    // ----- 5. Persist the structured sidecar (routing index for poll/observe)
    const toIds = recipients.map((r) => r.worker.id);
    await this.prisma.agentBusEmailMeta.create({
      data: {
        emailId: delivered.emailId,
        orgId,
        threadId: delivered.threadId,
        workItemId: workItem.id,
        fromWorkerId: sender.worker.id,
        fromRole,
        toWorkerIds: toIds,
        msgType: PRISMA_MSG_TYPE[msgType],
        label: AGENT_BUS_LABEL,
        headers,
        artifacts: normalizedArtifacts,
      },
    });

    return {
      emailId: delivered.emailId,
      orgId,
      threadId: delivered.threadId,
      workItemId: workItem.id,
      fromWorkerId: sender.worker.id,
      fromRole,
      toWorkerIds: toIds,
      msgType,
      artifacts: normalizedArtifacts,
    };
  }

  /**
   * Read the agent-bus messages addressed to a worker's mailbox (design
   * §"FUNCTION poll"). Scoped to the worker's own org and filtered to messages
   * that list the worker among their recipients. Ordered oldest-first.
   *
   * @throws 404 WORKER_NOT_FOUND when the worker id does not exist.
   */
  async poll(workerId: string): Promise<AgentBusMessage[]> {
    const id = typeof workerId === 'string' ? workerId.trim() : '';
    if (id.length === 0) {
      throw createAppError('A worker id is required', 400, 'WORKER_ID_REQUIRED');
    }
    const worker = await this.prisma.agentWorker.findUnique({ where: { id } });
    if (!worker) {
      throw createAppError('Agent worker not found', 404, 'WORKER_NOT_FOUND');
    }

    const metas = await this.prisma.agentBusEmailMeta.findMany({
      where: { orgId: worker.orgId },
      orderBy: { createdAt: 'asc' },
    });
    return metas
      .filter((m) => toStringArray(m.toWorkerIds).includes(id))
      .map((m) => this.toMessage(m));
  }

  /**
   * Observe every agent-bus message for an org (design §"PROCEDURE observe") —
   * the orchestrator's view for routing and audit. Ordered oldest-first.
   */
  async observe(orgId: string): Promise<AgentBusMessage[]> {
    const id = typeof orgId === 'string' ? orgId.trim() : '';
    if (id.length === 0) {
      throw createAppError('An org id is required', 400, 'ORG_ID_REQUIRED');
    }
    const metas = await this.prisma.agentBusEmailMeta.findMany({
      where: { orgId: id },
      orderBy: { createdAt: 'asc' },
    });
    return metas.map((m) => this.toMessage(m));
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Resolve a worker id to its worker + ACTIVE agent mailbox identity. A worker
   * with no identity, or whose identity is not ACTIVE, is NOT a usable agent
   * identity and is rejected (Req 12.3 — sender/recipient must be agent
   * identities).
   */
  private async resolveAgent(workerId: string): Promise<ResolvedAgent> {
    const id = typeof workerId === 'string' ? workerId.trim() : '';
    if (id.length === 0) {
      throw createAppError('A worker id is required', 400, 'WORKER_ID_REQUIRED');
    }
    const worker = await this.prisma.agentWorker.findUnique({ where: { id } });
    if (!worker) {
      throw createAppError(`Agent worker '${id}' not found`, 404, 'WORKER_NOT_FOUND');
    }
    if (!worker.mailboxIdentityId) {
      throw createAppError(
        `Agent worker '${id}' has no agent mailbox identity`,
        422,
        'NOT_AGENT_IDENTITY',
      );
    }
    const identity = await this.prisma.agentMailboxIdentity.findUnique({
      where: { id: worker.mailboxIdentityId },
    });
    if (!identity || identity.status !== 'ACTIVE') {
      throw createAppError(
        `Agent worker '${id}' has no active agent mailbox identity`,
        422,
        'NOT_AGENT_IDENTITY',
      );
    }
    return { worker, identity };
  }

  /**
   * Enforce the cross-tenant isolation invariant (Req 12.3): the sender and a
   * recipient must share the SAME org AND the SAME tenant, on BOTH the worker
   * and its mailbox identity. Any mismatch fails closed.
   */
  private assertSameOrgAndTenant(sender: ResolvedAgent, recipient: ResolvedAgent): void {
    const sameOrg =
      sender.worker.orgId === recipient.worker.orgId &&
      sender.identity.orgId === recipient.identity.orgId &&
      sender.worker.orgId === sender.identity.orgId &&
      recipient.worker.orgId === recipient.identity.orgId;
    const sameTenant =
      sender.worker.tenantId === recipient.worker.tenantId &&
      sender.identity.tenantId === recipient.identity.tenantId &&
      sender.worker.tenantId === sender.identity.tenantId &&
      recipient.worker.tenantId === recipient.identity.tenantId;
    if (!sameOrg || !sameTenant) {
      throw createAppError(
        'Agent-bus messages may only be sent between agent identities within the same org and tenant',
        403,
        'CROSS_TENANT_BUS_REJECTED',
      );
    }
  }

  /** The lowercase wire role for the sender's X-Quant-Agent-From-Role header. */
  private wireRole(sender: ResolvedAgent): AgentRoleKey | string {
    const fromIdentityRole =
      sender.identity.roleKey != null ? WIRE_ROLE[sender.identity.roleKey] : undefined;
    return fromIdentityRole ?? WIRE_ROLE[sender.worker.role] ?? String(sender.worker.role).toLowerCase();
  }

  /**
   * Resolve an existing work item (when `options.workItemId` is given) or create
   * a fresh one assigned to the first recipient. Each work item maps to one bus
   * EmailThread (`busThreadId`), established lazily by the first delivery.
   */
  private async resolveOrCreateWorkItem(
    org: AgentOrg,
    assignedWorkerId: string,
    msgType: AgentBusMsgType,
    body: string,
    options: SendOptions,
  ): Promise<AgentWorkItem> {
    if (typeof options.workItemId === 'string' && options.workItemId.trim().length > 0) {
      const existing = await this.prisma.agentWorkItem.findUnique({
        where: { id: options.workItemId.trim() },
      });
      if (!existing) {
        throw createAppError('Agent work item not found', 404, 'WORK_ITEM_NOT_FOUND');
      }
      if (existing.orgId !== org.id) {
        // A work item from another org would cross the isolation boundary.
        throw createAppError(
          'Agent-bus messages may only be threaded to a work item within the same org',
          403,
          'CROSS_TENANT_BUS_REJECTED',
        );
      }
      return existing;
    }

    const title =
      typeof options.title === 'string' && options.title.trim().length > 0
        ? options.title.trim()
        : deriveTitle(msgType, body);
    return this.prisma.agentWorkItem.create({
      data: {
        orgId: org.id,
        assignedWorkerId,
        busThreadId: null,
        title,
        spec: typeof body === 'string' && body.length > 0 ? body : null,
        status: 'ASSIGNED',
        linkedSessionId: null,
        linkedPrId: null,
      },
    });
  }

  /** Map a persisted sidecar row to the structured {@link AgentBusMessage} view. */
  private toMessage(meta: {
    emailId: string;
    orgId: string;
    threadId: string;
    workItemId: string;
    fromWorkerId: string;
    fromRole: string;
    toWorkerIds: unknown;
    msgType: string;
    artifacts: unknown;
  }): AgentBusMessage {
    return {
      emailId: meta.emailId,
      orgId: meta.orgId,
      threadId: meta.threadId,
      workItemId: meta.workItemId,
      fromWorkerId: meta.fromWorkerId,
      fromRole: WIRE_ROLE[meta.fromRole] ?? meta.fromRole,
      toWorkerIds: toStringArray(meta.toWorkerIds),
      msgType: WIRE_MSG_TYPE[meta.msgType] ?? (String(meta.msgType).toLowerCase() as AgentBusMsgType),
      artifacts: normalizeArtifacts(meta.artifacts),
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Coerce a persisted Json value into a string[] (recipient/worker ids). */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

/** Coerce/clean a persisted or input artifacts value into AgentBusArtifact[]. */
function normalizeArtifacts(value: unknown): AgentBusArtifact[] {
  if (!Array.isArray(value)) return [];
  const out: AgentBusArtifact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const filename = typeof a.filename === 'string' ? a.filename : '';
    const kind = typeof a.kind === 'string' ? a.kind : 'report';
    if (filename.length === 0) continue;
    const artifact: AgentBusArtifact = { filename, kind };
    if (typeof a.contentType === 'string') artifact.contentType = a.contentType;
    if (typeof a.content === 'string') artifact.content = a.content;
    if (typeof a.url === 'string') artifact.url = a.url;
    if (typeof a.size === 'number') artifact.size = a.size;
    out.push(artifact);
  }
  return out;
}

/** Derive a default work-item title from the msg type + a snippet of the body. */
function deriveTitle(msgType: AgentBusMsgType, body: string): string {
  const snippet =
    typeof body === 'string' ? body.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  return snippet.length > 0 ? `${msgType}: ${snippet}` : `Work item (${msgType})`;
}
