/**
 * quanty-agent/task-store.ts — Durable backing for the Quanty agentic engine.
 *
 * WR-G durability fix (fix/qm-quanty-task-durability): the engine used to
 * keep everything in process memory — InMemoryTaskStore, process-local SSE
 * subscribers, no-op audit persist — so a backend restart or a second replica
 * lost every task, approval and progress event. This module provides:
 *
 *   PrismaQuantyTaskStore — QuantyTaskStore backed by the `quanty_tasks`
 *     table (steps ride along as JSON; they are always read/written with
 *     the task). Survives restarts, works across replicas.
 *   persistAuditEvent / listTaskEvents — the append-only `quanty_task_events`
 *     log. The SSE stream replays it, so late joiners and reconnects see the
 *     full progress history, not just live frames ("replayable progress").
 *   recordApproval / listApprovals — durable, per-user permission grants
 *     (`quanty_approval_records`). The old in-memory approval list was
 *     process-global and not even scoped per user.
 *   loadStepReceipt / storeStepReceipt — per-step idempotent effects via the
 *     repo-wide IdempotencyOperation table (operationId
 *     "quanty:step:<taskId>:<stepId>"). A completed receipt is replayed
 *     instead of re-invoking the tool, so retries/restarts cannot duplicate
 *     an effect. Each completed step carries its receiptId for
 *     receipt-based verification.
 *   recoverInterruptedTasks — boot sweep: tasks left in a non-terminal state
 *     by a previous process are honestly marked interrupted (never faked as
 *     done), with their plan, completed steps and receipts preserved.
 *   auditEntryToProgressEvent — maps persisted audit entries back onto SSE
 *     progress frames for replay.
 *
 * All Prisma access goes through minimal structural delegate interfaces (the
 * same seam philosophy as packages/server-core idempotency.ts): no generated
 * client import, unit-testable with fakes, and every function degrades
 * gracefully (no-op / empty) when the delegates are absent — e.g. route
 * tests that register with an empty prisma mock.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  QuantyApproval,
  QuantyAuditEntry,
  QuantyProgressEvent,
  QuantyStep,
  QuantyTask,
  QuantyTaskStatus,
  QuantyTaskStore,
} from './types';

// ---------------------------------------------------------------------------
// Minimal structural Prisma delegates (no generated-client import).
// ---------------------------------------------------------------------------

export interface QuantyTaskRow {
  id: string;
  userId: string;
  command: string;
  status: string;
  planSummary: string;
  steps: string;
  needsConfirmation: boolean;
  pendingToolName: string | null;
  outcome: string | null;
  background: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface QuantyTaskCreateData {
  id: string;
  userId: string;
  command: string;
  status: string;
  planSummary: string;
  steps: string;
  needsConfirmation: boolean;
  pendingToolName?: string | null;
  outcome?: string | null;
  background: boolean;
}

interface QuantyTaskUpdateData {
  status?: string;
  planSummary?: string;
  steps?: string;
  needsConfirmation?: boolean;
  pendingToolName?: string | null;
  outcome?: string | null;
  background?: boolean;
  updatedAt?: Date;
}

export interface QuantyTaskTable {
  upsert(args: { where: { id: string }; create: QuantyTaskCreateData; update: QuantyTaskUpdateData }): Promise<unknown>;
  findUnique(args: { where: { id: string } }): Promise<QuantyTaskRow | null>;
  findMany(args: {
    where: { userId?: string; status?: { in: string[] } };
    orderBy: { updatedAt: 'desc' | 'asc' };
    take?: number;
  }): Promise<QuantyTaskRow[]>;
  updateMany(args: {
    where: { id: { in: string[] } };
    data: { status: string; outcome: string; updatedAt: Date };
  }): Promise<{ count: number }>;
}

export interface QuantyTaskEventRow {
  id: string;
  taskId: string;
  userId: string;
  kind: string;
  toolName: string | null;
  stepId: string | null;
  detail: string | null;
  createdAt: Date;
}

export interface QuantyTaskEventTable {
  create(args: {
    data: {
      taskId: string;
      userId: string;
      kind: string;
      toolName?: string | null;
      stepId?: string | null;
      detail?: string | null;
    };
  }): Promise<unknown>;
  findMany(args: {
    where: { taskId: string };
    orderBy: { createdAt: 'asc' };
    take?: number;
  }): Promise<QuantyTaskEventRow[]>;
}

export interface QuantyApprovalRecordRow {
  id: string;
  userId: string;
  taskId: string | null;
  toolName: string;
  label: string;
  scope: string;
  grantedAt: Date;
}

export interface QuantyApprovalRecordTable {
  create(args: {
    data: { userId: string; taskId?: string | null; toolName: string; label: string; scope: string };
  }): Promise<unknown>;
  findMany(args: {
    where: { userId: string };
    orderBy: { grantedAt: 'desc' };
    take?: number;
  }): Promise<QuantyApprovalRecordRow[]>;
}

/** Minimal structural view of the repo-wide idempotency_operation delegate. */
export interface StepReceiptRow {
  operationId: string;
  fingerprint: string;
  status: string;
  responseBody: string | null;
  expiresAt: Date;
}

export interface StepReceiptTable {
  findUnique(args: { where: { operationId: string } }): Promise<StepReceiptRow | null>;
  upsert(args: {
    where: { operationId: string };
    create: { operationId: string; fingerprint: string; status: string; responseBody: string; expiresAt: Date };
    update: { fingerprint: string; status: string; responseBody: string; expiresAt: Date };
  }): Promise<unknown>;
}

interface DurableDb {
  tasks: QuantyTaskTable;
  events: QuantyTaskEventTable;
  approvals: QuantyApprovalRecordTable;
  receipts: StepReceiptTable;
}

/** Resolve the durable delegates from an unknown prisma client. Null when absent. */
export function resolveDurableDb(prisma: unknown): DurableDb | null {
  const p = prisma as
    | {
        quantyTask?: QuantyTaskTable;
        quantyTaskEvent?: QuantyTaskEventTable;
        quantyApprovalRecord?: QuantyApprovalRecordTable;
        idempotencyOperation?: StepReceiptTable;
      }
    | null
    | undefined;
  if (!p || !p.quantyTask || !p.quantyTaskEvent || !p.quantyApprovalRecord || !p.idempotencyOperation) {
    return null;
  }
  return {
    tasks: p.quantyTask,
    events: p.quantyTaskEvent,
    approvals: p.quantyApprovalRecord,
    receipts: p.idempotencyOperation,
  };
}

/** True when the prisma client carries the Quanty durability tables. */
export function hasDurableDb(prisma: unknown): boolean {
  return resolveDurableDb(prisma) !== null;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping.
// ---------------------------------------------------------------------------

const TASK_STATUSES: QuantyTaskStatus[] = ['planning', 'running', 'waiting-confirm', 'done', 'failed', 'interrupted'];

function parseSteps(json: string): QuantyStep[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (s): s is QuantyStep =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as { id?: unknown }).id === 'string' &&
      typeof (s as { toolName?: unknown }).toolName === 'string',
  );
}

function rowToTask(row: QuantyTaskRow): QuantyTask {
  if (!TASK_STATUSES.includes(row.status as QuantyTaskStatus)) {
    throw new Error(`Corrupt quanty_tasks row ${row.id}: unknown status "${row.status}"`);
  }
  return {
    id: row.id,
    userId: row.userId,
    command: row.command,
    status: row.status as QuantyTaskStatus,
    planSummary: row.planSummary,
    steps: parseSteps(row.steps),
    needsConfirmation: row.needsConfirmation,
    pendingToolName: row.pendingToolName ?? undefined,
    background: row.background,
    outcome: row.outcome ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function taskToCreateData(task: QuantyTask): QuantyTaskCreateData {
  return {
    id: task.id,
    userId: task.userId,
    command: task.command,
    status: task.status,
    planSummary: task.planSummary,
    steps: JSON.stringify(task.steps),
    needsConfirmation: task.needsConfirmation,
    pendingToolName: task.pendingToolName ?? null,
    outcome: task.outcome ?? null,
    background: task.background,
  };
}

function taskToUpdateData(task: QuantyTask): QuantyTaskUpdateData {
  return {
    status: task.status,
    planSummary: task.planSummary,
    steps: JSON.stringify(task.steps),
    needsConfirmation: task.needsConfirmation,
    pendingToolName: task.pendingToolName ?? null,
    outcome: task.outcome ?? null,
    background: task.background,
    updatedAt: new Date(task.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// PrismaQuantyTaskStore — the durable QuantyTaskStore.
// ---------------------------------------------------------------------------

/**
 * DB-backed task store. Constructing it throws a clear error when the prisma
 * client lacks the Quanty tables — the route catches that and falls back to
 * the in-memory store (honest degradation, e.g. in tests).
 */
export class PrismaQuantyTaskStore implements QuantyTaskStore {
  private readonly table: QuantyTaskTable;

  constructor(prisma: unknown) {
    const db = resolveDurableDb(prisma);
    if (!db) {
      throw new Error('PrismaQuantyTaskStore: prisma client lacks quantyTask/quantyTaskEvent/quantyApprovalRecord/idempotencyOperation delegates');
    }
    this.table = db.tasks;
  }

  async save(task: QuantyTask): Promise<void> {
    await this.table.upsert({
      where: { id: task.id },
      create: taskToCreateData(task),
      update: taskToUpdateData(task),
    });
  }

  async get(taskId: string): Promise<QuantyTask | null> {
    const row = await this.table.findUnique({ where: { id: taskId } });
    return row ? rowToTask(row) : null;
  }

  async listByUser(userId: string, limit = 20): Promise<QuantyTask[]> {
    const rows = await this.table.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const tasks: QuantyTask[] = [];
    for (const row of rows) {
      try {
        tasks.push(rowToTask(row));
      } catch {
        // A corrupt row must not take down the whole feed; it is skipped.
      }
    }
    return tasks;
  }
}

// ---------------------------------------------------------------------------
// Audit events — the replayable progress log.
// ---------------------------------------------------------------------------

/**
 * Persist one audit entry. Best-effort: a failing audit write is logged and
 * swallowed — it must never break the task it describes. No-op when the
 * durable DB is absent.
 */
export async function persistAuditEvent(prisma: unknown, entry: QuantyAuditEntry): Promise<void> {
  const db = resolveDurableDb(prisma);
  if (!db) return;
  try {
    await db.events.create({
      data: {
        taskId: entry.taskId,
        userId: entry.userId,
        kind: entry.kind,
        toolName: entry.toolName ?? null,
        stepId: entry.stepId ?? null,
        detail: entry.detail ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[quanty-agent] audit persist failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/** Load a task's audit entries oldest-first — the replay source for SSE. */
export async function listTaskEvents(prisma: unknown, taskId: string, limit = 500): Promise<QuantyAuditEntry[]> {
  const db = resolveDurableDb(prisma);
  if (!db) return [];
  const rows = await db.events.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return rows.map(
    (r): QuantyAuditEntry => ({
      taskId: r.taskId,
      userId: r.userId,
      timestamp: r.createdAt.toISOString(),
      kind: r.kind as QuantyAuditEntry['kind'],
      toolName: r.toolName ?? undefined,
      stepId: r.stepId ?? undefined,
      detail: r.detail ?? undefined,
    }),
  );
}

// ---------------------------------------------------------------------------
// Durable approvals — per-user permission grants.
// ---------------------------------------------------------------------------

export interface ApprovalInput {
  userId: string;
  taskId?: string;
  toolName: string;
  label: string;
  scope: string;
}

/** Record a permission grant durably. Returns the stored approval. */
export async function recordApproval(prisma: unknown, input: ApprovalInput): Promise<QuantyApproval | null> {
  const db = resolveDurableDb(prisma);
  if (!db) return null;
  const grantedAt = new Date().toISOString();
  await db.approvals.create({
    data: {
      userId: input.userId,
      taskId: input.taskId ?? null,
      toolName: input.toolName,
      label: input.label,
      scope: input.scope,
    },
  });
  return {
    id: randomUUID(),
    icon: '⚠️',
    title: `Approved: ${input.toolName}`,
    description: input.label,
    grantedAt,
    scope: input.scope,
  };
}

/** List a user's approvals, newest first. Empty when the DB is absent. */
export async function listApprovals(prisma: unknown, userId: string, limit = 50): Promise<QuantyApproval[]> {
  const db = resolveDurableDb(prisma);
  if (!db) return [];
  const rows = await db.approvals.findMany({
    where: { userId },
    orderBy: { grantedAt: 'desc' },
    take: limit,
  });
  return rows.map(
    (r): QuantyApproval => ({
      id: r.id,
      icon: '⚠️',
      title: `Approved: ${r.toolName}`,
      description: r.label,
      grantedAt: r.grantedAt.toISOString(),
      scope: r.scope,
    }),
  );
}

// ---------------------------------------------------------------------------
// Boot recovery — stale non-terminal tasks are honestly marked interrupted.
// ---------------------------------------------------------------------------

const STALE_STATUSES = ['planning', 'running', 'waiting-confirm'];

const RESTART_OUTCOME =
  'Quanty backend restarted while this task was in flight — it did not finish. ' +
  'Its plan, completed steps and receipts are preserved above; re-submit the command to resume from the last completed step.';

/**
 * Mark every task left in a non-terminal state by a previous process as
 * interrupted, with an honest outcome (never faked as done/failed), plus one
 * audit entry per task so the replay log explains the gap. Pages through ALL
 * matching rows (not just the first 1000) so a large backlog is fully
 * recovered. Returns the number of tasks recovered. No-op (0) when the
 * durable DB is absent.
 */
export async function recoverInterruptedTasks(prisma: unknown): Promise<number> {
  const db = resolveDurableDb(prisma);
  if (!db) return 0;
  let recovered = 0;
  for (;;) {
    const stale = await db.tasks.findMany({
      where: { status: { in: STALE_STATUSES } },
      orderBy: { updatedAt: 'asc' },
      take: 1000,
    });
    if (stale.length === 0) break;
    const now = new Date();
    const ids = stale.map((r) => r.id);
    await db.tasks.updateMany({
      where: { id: { in: ids } },
      data: { status: 'interrupted', outcome: RESTART_OUTCOME, updatedAt: now },
    });
    for (const row of stale) {
      await persistAuditEvent(prisma, {
        taskId: row.id,
        userId: row.userId,
        timestamp: now.toISOString(),
        kind: 'task.interrupted',
        detail: RESTART_OUTCOME,
      });
    }
    recovered += stale.length;
    // A full page means there may be more — repeat until a short page.
    if (stale.length < 1000) break;
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// Step receipts — idempotent effects via the repo-wide IdempotencyOperation.
// ---------------------------------------------------------------------------

/** How long a step receipt stays replayable. */
export const STEP_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The idempotency operation id for a step's effect. Also stored as step.receiptId. */
export function stepReceiptKey(taskId: string, stepId: string): string {
  return `quanty:step:${taskId}:${stepId}`;
}

/** Deterministic JSON with recursively sorted keys (fingerprint-stable). */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

/**
 * Fingerprint binding a receipt to the exact step invocation — same task,
 * same step, same tool, same args. A re-run with different args does NOT
 * match and re-executes (last-writer-wins on the receipt row).
 */
export function stepFingerprint(taskId: string, step: Pick<QuantyStep, 'id' | 'toolName' | 'args'>): string {
  return createHash('sha256')
    .update(stableJson({ taskId, stepId: step.id, toolName: step.toolName, args: step.args ?? {} }))
    .digest('hex');
}

export interface StoredStepReceipt {
  summary: string;
  data?: unknown;
  reversible?: boolean;
  undoToken?: unknown;
}

/**
 * Load a completed receipt for this exact step invocation. Returns null when
 * there is no row, it expired, it is not completed, the fingerprint does not
 * match (the plan changed — re-execute), or the stored payload is corrupt.
 * Never throws; never returns a receipt for a different invocation.
 */
export async function loadStepReceipt(
  prisma: unknown,
  taskId: string,
  step: Pick<QuantyStep, 'id' | 'toolName' | 'args'>,
): Promise<StoredStepReceipt | null> {
  const db = resolveDurableDb(prisma);
  if (!db) return null;
  try {
    const row = await db.receipts.findUnique({ where: { operationId: stepReceiptKey(taskId, step.id) } });
    if (!row || row.status !== 'completed') return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    if (row.fingerprint !== stepFingerprint(taskId, step)) return null;
    if (!row.responseBody) return null;
    const parsed: unknown = JSON.parse(row.responseBody);
    if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { summary?: unknown }).summary !== 'string') {
      return null;
    }
    const p = parsed as StoredStepReceipt;
    return { summary: p.summary, data: p.data, reversible: p.reversible, undoToken: p.undoToken };
  } catch {
    return null;
  }
}

/**
 * Store the completed receipt for a step invocation. Best-effort: a failing
 * write is logged and swallowed — the step already succeeded, and failing
 * the task over a receipt write would be dishonest. No-op when the durable
 * DB is absent.
 */
export async function storeStepReceipt(
  prisma: unknown,
  taskId: string,
  step: Pick<QuantyStep, 'id' | 'toolName' | 'args'>,
  receipt: StoredStepReceipt,
): Promise<boolean> {
  const db = resolveDurableDb(prisma);
  if (!db) return false;
  const key = stepReceiptKey(taskId, step.id);
  const data = {
    operationId: key,
    fingerprint: stepFingerprint(taskId, step),
    status: 'completed',
    responseBody: JSON.stringify(receipt),
    expiresAt: new Date(Date.now() + STEP_RECEIPT_TTL_MS),
  };
  try {
    await db.receipts.upsert({ where: { operationId: key }, create: data, update: data });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[quanty-agent] step receipt persist failed (non-fatal):', err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SSE replay — map persisted audit entries back onto progress frames.
// ---------------------------------------------------------------------------

function stepForReplay(task: QuantyTask, entry: QuantyAuditEntry): QuantyStep {
  const found = entry.stepId ? task.steps.find((s) => s.id === entry.stepId) : undefined;
  if (found) return found;
  // The step is gone from the plan (or the row predates it) — synthesize an
  // honest placeholder rather than dropping the frame.
  return {
    id: entry.stepId ?? 'unknown-step',
    toolName: entry.toolName ?? 'unknown-tool',
    label: entry.toolName ?? 'unknown step',
    args: {},
    status: entry.kind === 'step.done' ? 'done' : entry.kind === 'step.failed' ? 'failed' : 'pending',
  };
}

/**
 * Map one persisted audit entry onto its SSE progress frame, for stream
 * replay on (re)connect. Returns null for entries that carry no progress
 * frame (task.created/task.planned/confirm.granted/task.backgrounded — the
 * snapshot the stream opens with already covers that state).
 */
export function auditEntryToProgressEvent(entry: QuantyAuditEntry, task: QuantyTask): QuantyProgressEvent | null {
  const taskId = entry.taskId;
  switch (entry.kind) {
    case 'step.start':
      return { type: 'step.start', taskId, step: stepForReplay(task, entry) };
    case 'step.done':
      return { type: 'step.done', taskId, step: stepForReplay(task, entry), summary: entry.detail ?? '' };
    case 'step.failed':
      return { type: 'step.failed', taskId, step: stepForReplay(task, entry), error: entry.detail ?? '' };
    case 'confirm.requested': {
      const step = entry.stepId ? task.steps.find((s) => s.id === entry.stepId) : undefined;
      return {
        type: 'waiting-confirm',
        taskId,
        toolName: entry.toolName ?? '',
        label: step?.label ?? entry.toolName ?? '',
      };
    }
    case 'task.done':
      return { type: 'task.done', taskId, outcome: entry.detail ?? '' };
    case 'task.failed':
      return { type: 'task.failed', taskId, error: entry.detail ?? '' };
    case 'task.interrupted':
      return { type: 'task.interrupted', taskId };
    default:
      return null;
  }
}
