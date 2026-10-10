import { z } from 'zod';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditTrail } from './audit-trail.js';

/**
 * QM-QUANTY-009 — the approval queue is the runtime's single approval gate.
 *
 * It implements the canonical Quanty approval contract shape
 * (`packages/quanty-contracts/src/approval.ts`): every request is a persisted
 * record carrying the exact action, resource (node), risk, policy version,
 * requester and expiry, plus a SHA-256 action hash. A high-risk action may
 * only proceed after an *authenticated* decision (step-up verified, never the
 * requesting agent itself) matches that exact record before it expires.
 * Rejection, expiry and cancellation are terminal and stop the action;
 * retries re-enter the gate instead of bypassing it.
 *
 * There is deliberately no client-writable "approved" flag: all reads return
 * deep copies, and the only way a record changes state is `decide()` /
 * `cancel()` on this class.
 */

export const APPROVAL_POLICY_VERSION = 'quanty-approval/v1';
export const DEFAULT_APPROVAL_TIMEOUT_MS = 15 * 60 * 1000;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  action: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  timeout: z.number().positive().optional(),
  /** Resource / node the action targets (contract: nodeId). */
  resourceId: z.string().optional(),
  /** Parent task this approval belongs to (contract: taskId). */
  taskId: z.string().optional(),
  /** Who requested the action. Defaults to agentId. */
  requesterId: z.string().optional(),
  /** Policy version the request was classified under. */
  policyVersion: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/** Mirrors QuantyApprovalStatus in @quant/quanty-contracts. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

/**
 * An authenticated decision context. Decisions are only accepted from an
 * identified decider who completed step-up verification (QM-BACK-005) and who
 * is not the requesting agent (no self-approval).
 */
export interface ApprovalDecisionContext {
  decidedBy: string;
  stepUpVerified: boolean;
  channel?: 'voice' | 'touch' | 'text' | 'biometric';
}

export interface ApprovalCancelContext {
  cancelledBy: string;
}

export interface ApprovalHistoryEvent {
  event:
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'cancelled'
    | 'decision_blocked'
    | 'integrity_blocked';
  at: number;
  actor?: string;
  detail?: string;
}

export interface QueuedRequest {
  request: ApprovalRequest;
  status: ApprovalStatus;
  submittedAt: number;
  resolvedAt?: number;
  /** Absolute expiry (ms epoch). A pending record past this is expired. */
  expiresAt: number;
  /** Policy version in force for this record. */
  policyVersion: string;
  /** SHA-256 over the canonical action fields, fixed at submit time. */
  actionHash: string;
  decision?: {
    decision: 'approved' | 'rejected';
    decidedBy: string;
    decidedAt: number;
    stepUpVerified: boolean;
    channel?: string;
  };
  cancelledBy?: string;
  /** Append-only audit history for this record. Every transition is here. */
  history: ApprovalHistoryEvent[];
}

interface ActionHashFields {
  action: string;
  agentId: string;
  resourceId?: string;
  riskLevel: ApprovalRequest['riskLevel'];
  policyVersion: string;
}

/** Deterministic hash over the exact action a decision was made for. */
export function computeActionHash(fields: ActionHashFields): string {
  const canonical = JSON.stringify({
    action: fields.action,
    agentId: fields.agentId,
    policyVersion: fields.policyVersion,
    resourceId: fields.resourceId ?? null,
    riskLevel: fields.riskLevel,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Persistence seam for approval records. The in-memory implementation keeps
 * the historical behaviour for tests and ephemeral runtimes; the file
 * implementation is the durable form (restart-safe, cross-instance via
 * read-through). A database-backed implementation can be dropped in behind
 * this interface without touching the gate logic.
 */
export interface ApprovalStore {
  get(id: string): QueuedRequest | undefined;
  put(record: QueuedRequest): void;
  getAll(): QueuedRequest[];
}

export class InMemoryApprovalStore implements ApprovalStore {
  private records: Map<string, QueuedRequest> = new Map();

  get(id: string): QueuedRequest | undefined {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }

  put(record: QueuedRequest): void {
    this.records.set(record.request.id, clone(record));
  }

  getAll(): QueuedRequest[] {
    return Array.from(this.records.values()).map((r) => clone(r));
  }
}

export class FileApprovalStore implements ApprovalStore {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      this.writeAll([]);
    }
  }

  private readAll(): QueuedRequest[] {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as QueuedRequest[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeAll(records: QueuedRequest[]): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  get(id: string): QueuedRequest | undefined {
    // Read-through so decisions made by another process/instance are seen.
    return this.readAll().find((r) => r.request.id === id);
  }

  put(record: QueuedRequest): void {
    const records = this.readAll();
    const idx = records.findIndex((r) => r.request.id === record.request.id);
    if (idx >= 0) {
      records[idx] = clone(record);
    } else {
      records.push(clone(record));
    }
    this.writeAll(records);
  }

  getAll(): QueuedRequest[] {
    return this.readAll();
  }
}

export interface ApprovalQueueOptions {
  store?: ApprovalStore;
  /** Optional shared audit spine; every gate event is mirrored into it. */
  auditTrail?: AuditTrail;
  /** Clock override (tests). Defaults to Date.now. */
  now?: () => number;
  /** Backstop poll interval for waitForDecision. Defaults to 25ms. */
  pollIntervalMs?: number;
}

export class ApprovalQueue {
  private readonly store: ApprovalStore;
  private readonly auditTrail?: AuditTrail;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private waiters: Set<() => void> = new Set();

  constructor(options: ApprovalQueueOptions = {}) {
    this.store = options.store ?? new InMemoryApprovalStore();
    this.auditTrail = options.auditTrail;
    this.now = options.now ?? (() => Date.now());
    this.pollIntervalMs = options.pollIntervalMs ?? 25;
  }

  submit(request: ApprovalRequest): QueuedRequest {
    const parsed = ApprovalRequestSchema.parse(request);
    const policyVersion = parsed.policyVersion ?? APPROVAL_POLICY_VERSION;
    const actionHash = computeActionHash({
      action: parsed.action,
      agentId: parsed.agentId,
      resourceId: parsed.resourceId,
      riskLevel: parsed.riskLevel,
      policyVersion,
    });

    const existing = this.store.get(parsed.id);
    if (existing) {
      // Idempotent re-submit of the exact same action (retry / restart):
      // return the live record so the caller re-enters the gate on it.
      // A different action under the same approval id is an integrity fault.
      if (existing.actionHash !== actionHash) {
        this.appendHistory(existing, {
          event: 'integrity_blocked',
          at: this.now(),
          detail: 're-submit attempted with a different action under the same approval id',
        });
        throw new Error(
          `Approval request ${parsed.id} already exists for a different action (hash mismatch)`,
        );
      }
      return clone(existing);
    }

    const submittedAt = this.now();
    const record: QueuedRequest = {
      request: parsed,
      status: 'pending',
      submittedAt,
      expiresAt: submittedAt + (parsed.timeout ?? DEFAULT_APPROVAL_TIMEOUT_MS),
      policyVersion,
      actionHash,
      history: [{ event: 'submitted', at: submittedAt, actor: parsed.requesterId ?? parsed.agentId }],
    };
    this.store.put(record);
    this.emitAudit(record, 'submitted', 'pending');
    this.notifyWaiters();
    return clone(record);
  }

  decide(
    requestId: string,
    decision: 'approved' | 'rejected',
    ctx: ApprovalDecisionContext,
  ): QueuedRequest {
    const record = this.mustGet(requestId);
    this.sweepRecord(record);

    if (record.status !== 'pending') {
      throw new Error(`Request ${requestId} is already ${record.status}`);
    }
    if (!ctx || typeof ctx.decidedBy !== 'string' || ctx.decidedBy.length === 0) {
      this.appendHistory(record, {
        event: 'decision_blocked',
        at: this.now(),
        detail: 'decision attempted without an authenticated decider identity',
      });
      throw new Error(`Decision for request ${requestId} requires an authenticated decider`);
    }
    if (ctx.decidedBy === record.request.agentId) {
      this.appendHistory(record, {
        event: 'decision_blocked',
        at: this.now(),
        actor: ctx.decidedBy,
        detail: 'self-approval by the requesting agent is forbidden',
      });
      throw new Error(`Request ${requestId} cannot be decided by the requesting agent itself`);
    }
    const needsStepUp = record.request.riskLevel === 'high' || record.request.riskLevel === 'critical';
    if (needsStepUp && ctx.stepUpVerified !== true) {
      this.appendHistory(record, {
        event: 'decision_blocked',
        at: this.now(),
        actor: ctx.decidedBy,
        detail: 'decision attempted without step-up verification for a high-risk action',
      });
      throw new Error(
        `Decision for request ${requestId} requires step-up verification (high-risk action)`,
      );
    }

    const at = this.now();
    record.status = decision;
    record.resolvedAt = at;
    record.decision = {
      decision,
      decidedBy: ctx.decidedBy,
      decidedAt: at,
      stepUpVerified: ctx.stepUpVerified,
      ...(ctx.channel ? { channel: ctx.channel } : {}),
    };
    record.history.push({ event: decision, at, actor: ctx.decidedBy });
    this.store.put(record);
    this.emitAudit(record, decision, decision === 'approved' ? 'success' : 'failure', ctx.decidedBy);
    this.notifyWaiters();
    return clone(record);
  }

  approve(requestId: string, ctx: ApprovalDecisionContext): QueuedRequest {
    return this.decide(requestId, 'approved', ctx);
  }

  reject(requestId: string, ctx: ApprovalDecisionContext): QueuedRequest {
    return this.decide(requestId, 'rejected', ctx);
  }

  cancel(requestId: string, ctx: ApprovalCancelContext): QueuedRequest {
    const record = this.mustGet(requestId);
    this.sweepRecord(record);
    if (record.status !== 'pending') {
      throw new Error(`Request ${requestId} is already ${record.status}`);
    }
    if (!ctx || typeof ctx.cancelledBy !== 'string' || ctx.cancelledBy.length === 0) {
      throw new Error(`Cancel for request ${requestId} requires an identified canceller`);
    }
    const at = this.now();
    record.status = 'cancelled';
    record.resolvedAt = at;
    record.cancelledBy = ctx.cancelledBy;
    record.history.push({ event: 'cancelled', at, actor: ctx.cancelledBy });
    this.store.put(record);
    this.emitAudit(record, 'cancelled', 'failure', ctx.cancelledBy);
    this.notifyWaiters();
    return clone(record);
  }

  /**
   * Blocks until the record reaches a terminal state
   * (approved / rejected / expired / cancelled). This is the gate the
   * orchestrator awaits — the worker is never started while this is pending.
   */
  async waitForDecision(requestId: string): Promise<QueuedRequest> {
    for (;;) {
      const record = this.mustGet(requestId);
      this.sweepRecord(record);
      if (record.status !== 'pending') {
        return clone(record);
      }
      const msUntilExpiry = Math.max(0, record.expiresAt - this.now());
      const wakeIn = Math.max(1, Math.min(this.pollIntervalMs, msUntilExpiry));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.waiters.delete(onNotify);
          resolve();
        }, wakeIn);
        const onNotify = () => {
          clearTimeout(timer);
          resolve();
        };
        this.waiters.add(onNotify);
      });
    }
  }

  /**
   * Verifies that neither the persisted record nor the live action was
   * tampered with after the decision: the stored fields must still hash to
   * the recorded actionHash, and the live action fields must match it too.
   */
  verifyActionIntegrity(
    requestId: string,
    current: { action: string; agentId: string; resourceId?: string; riskLevel: ApprovalRequest['riskLevel'] },
  ): boolean {
    const record = this.store.get(requestId);
    if (!record) return false;
    const storedHash = computeActionHash({
      action: record.request.action,
      agentId: record.request.agentId,
      resourceId: record.request.resourceId,
      riskLevel: record.request.riskLevel,
      policyVersion: record.policyVersion,
    });
    if (storedHash !== record.actionHash) return false;
    const currentHash = computeActionHash({
      action: current.action,
      agentId: current.agentId,
      resourceId: current.resourceId,
      riskLevel: current.riskLevel,
      policyVersion: record.policyVersion,
    });
    return currentHash === record.actionHash;
  }

  getPending(): ReadonlyArray<QueuedRequest> {
    this.sweepAll();
    return this.store.getAll().filter((e) => e.status === 'pending');
  }

  getById(requestId: string): QueuedRequest | undefined {
    const record = this.store.get(requestId);
    if (!record) return undefined;
    this.sweepRecord(record);
    return clone(record);
  }

  getAll(): ReadonlyArray<QueuedRequest> {
    this.sweepAll();
    return this.store.getAll();
  }

  private mustGet(requestId: string): QueuedRequest {
    const record = this.store.get(requestId);
    if (!record) {
      throw new Error(`Request ${requestId} not found`);
    }
    return record;
  }

  /** Lazy expiry: a pending record past expiresAt becomes terminal 'expired'. */
  private sweepRecord(record: QueuedRequest): void {
    if (record.status === 'pending' && this.now() > record.expiresAt) {
      const at = this.now();
      record.status = 'expired';
      record.resolvedAt = at;
      record.history.push({ event: 'expired', at });
      this.store.put(record);
      this.emitAudit(record, 'expired', 'failure');
      this.notifyWaiters();
    }
  }

  private sweepAll(): void {
    for (const record of this.store.getAll()) {
      this.sweepRecord(record);
    }
  }

  private appendHistory(record: QueuedRequest, event: ApprovalHistoryEvent): void {
    record.history.push(event);
    this.store.put(record);
  }

  private emitAudit(
    record: QueuedRequest,
    event: ApprovalHistoryEvent['event'],
    result: 'success' | 'failure' | 'pending',
    actor?: string,
  ): void {
    if (!this.auditTrail) return;
    this.auditTrail.log({
      id: `approval-${record.request.id}-${event}-${this.now()}`,
      agentId: record.request.agentId,
      action: `approval.${event}`,
      timestamp: this.now(),
      result,
      reversible: false,
      metadata: {
        approvalId: record.request.id,
        actionHash: record.actionHash,
        policyVersion: record.policyVersion,
        riskLevel: record.request.riskLevel,
        ...(actor ? { actor } : {}),
      },
    });
  }

  private notifyWaiters(): void {
    const waiters = Array.from(this.waiters);
    this.waiters.clear();
    for (const wake of waiters) wake();
  }
}
