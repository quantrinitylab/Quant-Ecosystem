/**
 * quanty-agent/types.ts — Core types for the Quanty Agentic Engine.
 *
 * Vision: Quanty works like Muse — the user gives a natural-language command,
 * Quanty plans steps, uses tools, streams live progress, and reports done.
 * A floating avatar on screen lets the user watch it work.
 */

/** Lifecycle of a Quanty task. */
export type QuantyTaskStatus =
  | 'planning'
  | 'running'
  | 'waiting-confirm'
  | 'done'
  | 'failed'
  | 'interrupted';

/** Lifecycle of a single step inside a task. */
export type QuantyStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** Which product surface a tool belongs to. */
export type QuantyToolApp = 'mail' | 'git' | 'calendar' | 'drive' | 'contacts' | 'core';

/** A single planned/executed step of a task. */
export interface QuantyStep {
  id: string;
  toolName: string;
  /** Human-readable label shown in the live activity feed, e.g. "Archiving 12 unread emails". */
  label: string;
  args: Record<string, unknown>;
  status: QuantyStepStatus;
  /** Result returned by the tool handler (JSON-serializable). */
  result?: unknown;
  /** Error message when status === 'failed'. */
  error?: string;
  startedAt?: string;
  endedAt?: string;
}

/** A full agentic task: command → plan → executed steps. */
export interface QuantyTask {
  id: string;
  userId: string;
  command: string;
  status: QuantyTaskStatus;
  /** Short human-readable summary of what the plan will do. */
  planSummary: string;
  steps: QuantyStep[];
  /** True when at least one step needs explicit user confirmation before running. */
  needsConfirmation: boolean;
  /** Name of the destructive tool currently awaiting confirmation. */
  pendingToolName?: string;
  /** Final human-readable outcome, set when status is done/failed/interrupted. */
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

/** JSON-schema-ish parameter descriptor for a tool (kept dependency-free). */
export interface QuantyToolParam {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

/** Context handed to every tool handler. */
export interface QuantyToolContext {
  userId: string;
  taskId: string;
  /** Prisma client (typed as unknown to avoid a hard dependency in unit tests). */
  prisma: unknown;
  /** Abort signal — handlers should stop work when aborted. */
  signal: AbortSignal;
  /** Append an audit entry; provided by the executor. */
  audit: (entry: Omit<QuantyAuditEntry, 'taskId' | 'userId' | 'timestamp'>) => void;
}

/** Result returned by a tool handler. */
export interface QuantyToolResult {
  ok: boolean;
  /** JSON-serializable payload. */
  data?: unknown;
  /** Human-readable one-liner for the live feed, e.g. "Archived 12 emails". */
  summary: string;
  /** When true, the action can be undone via the companion undo tool. */
  reversible?: boolean;
  /** Opaque token the undo tool needs (e.g. archived email ids). */
  undoToken?: unknown;
}

/** A tool Quanty can invoke. */
export interface QuantyTool {
  /** Unique name, namespaced by app: e.g. "mail.archiveUnread". */
  name: string;
  app: QuantyToolApp;
  description: string;
  parameters: Record<string, QuantyToolParam>;
  /** Destructive tools pause the task and ask the user to confirm first. */
  destructive: boolean;
  /** Whether the action can be undone afterwards. */
  reversible: boolean;
  handler: (args: Record<string, unknown>, ctx: QuantyToolContext) => Promise<QuantyToolResult>;
}

/** One immutable audit-log line for every action Quanty takes. */
export interface QuantyAuditEntry {
  taskId: string;
  userId: string;
  timestamp: string;
  kind: 'task.created' | 'task.planned' | 'step.start' | 'step.done' | 'step.failed' | 'confirm.requested' | 'confirm.granted' | 'task.interrupted' | 'task.done' | 'task.failed';
  toolName?: string;
  stepId?: string;
  detail?: string;
}

/** Progress events pushed to SSE subscribers. */
export type QuantyProgressEvent =
  | { type: 'task'; task: QuantyTask }
  | { type: 'step.start'; taskId: string; step: QuantyStep }
  | { type: 'step.done'; taskId: string; step: QuantyStep; summary: string }
  | { type: 'step.failed'; taskId: string; step: QuantyStep; error: string }
  | { type: 'waiting-confirm'; taskId: string; toolName: string; label: string }
  | { type: 'task.done'; taskId: string; outcome: string }
  | { type: 'task.failed'; taskId: string; error: string }
  | { type: 'task.interrupted'; taskId: string };

/** Callbacks the executor fires while a task runs. */
export interface QuantyExecutorCallbacks {
  onEvent: (event: QuantyProgressEvent) => void;
  onAudit: (entry: QuantyAuditEntry) => void;
}

/** Persistent store seam — in-memory by default, DB-backed later. */
export interface QuantyTaskStore {
  save(task: QuantyTask): Promise<void>;
  get(taskId: string): Promise<QuantyTask | null>;
  listByUser(userId: string, limit?: number): Promise<QuantyTask[]>;
}

// ---------------------------------------------------------------------------
// Agentic popup surface (mirrors the Muse app's deep agentic interface)
// ---------------------------------------------------------------------------

/** One row in the activity feed. */
export interface QuantyActivityItem {
  id: string;
  /** Emoji/short icon key, e.g. "📧". */
  icon: string;
  title: string;
  description: string;
  timestamp: string;
}

/** Activity feed grouped by recency. */
export interface QuantyActivityFeed {
  today: QuantyActivityItem[];
  yesterday: QuantyActivityItem[];
  older: QuantyActivityItem[];
}

/** Schedule bucket. */
export type QuantyScheduleKind = 'daily' | 'interval' | 'weekly';

/** A scheduled/recurring Quanty job. */
export interface QuantyScheduledTask {
  id: string;
  name: string;
  type: QuantyScheduleKind;
  /** Human description, e.g. "Every 10 minutes". */
  schedule: string;
  nextRunAt?: string;
  enabled: boolean;
}

/** Schedules grouped by bucket. */
export interface QuantySchedule {
  daily: QuantyScheduledTask[];
  interval: QuantyScheduledTask[];
  weekly: QuantyScheduledTask[];
}

/** One recorded permission grant. */
export interface QuantyApproval {
  id: string;
  icon: string;
  title: string;
  description: string;
  grantedAt: string;
  /** e.g. "Site always allowed", "This task only". */
  scope: string;
}

/** A browser task Quanty ran (or is running). */
export interface QuantyBrowserTask {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  status: 'running' | 'done' | 'failed';
  createdAt: string;
}

/** Soul + Memory cards shown in the popup. */
export interface QuantyIdentity {
  soul: { title: string; updatedAt: string };
  memory: { title: string; updatedAt: string };
}

/** Live status shown in the popup header. */
export interface QuantyLiveStatus {
  status: 'is working' | 'idle' | 'browsing';
  /** e.g. "Adding tests", "Archiving unread emails". */
  detail: string;
}
