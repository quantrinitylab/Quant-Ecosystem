// ============================================================================
// Quanty Next routes — backend <-> frontend shape mapper
// ============================================================================
//
// Pure functions translating the Fastify backend's task/step/event/popup
// shapes into the QuantyLiveAgent frontend contracts. Tested in
// __tests__/quanty-mapper.test.ts.

import type {
  QuantyPopupData,
  QuantyStep as FrontendStep,
  QuantyStepStatus as FrontendStepStatus,
  QuantyTask as FrontendTask,
  QuantyTaskStatus as FrontendTaskStatus,
} from '../../../../components/QuantyLiveAgent/types';

// -- Backend shapes (mirror apps/quantmail/backend/services/quanty-agent/types.ts)

export interface BackendStep {
  id: string;
  toolName: string;
  label: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  destructive?: boolean;
  reversible?: boolean;
  undoToken?: unknown;
}

export interface BackendTask {
  id: string;
  command: string;
  status: 'planning' | 'running' | 'waiting-confirm' | 'done' | 'failed' | 'interrupted';
  planSummary: string;
  steps: BackendStep[];
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendPopupData {
  status: { status: 'is working' | 'idle' | 'browsing'; detail: string };
  activity: {
    today: Array<{ id: string; icon: string; title: string; description: string; timestamp: string }>;
    yesterday: Array<{ id: string; icon: string; title: string; description: string; timestamp: string }>;
    older: Array<{ id: string; icon: string; title: string; description: string; timestamp: string }>;
  };
  approvals: Array<{ id: string; title: string; description: string; scope: string; grantedAt: string }>;
  browserTasks: Array<{ id: string; title: string; url: string; thumbnailUrl?: string; status: 'running' | 'done' | 'failed'; createdAt: string }>;
  schedule: {
    daily: Array<{ id: string; name: string; type: 'daily' | 'interval' | 'weekly'; schedule: string; nextRunAt?: string }>;
    interval: Array<{ id: string; name: string; type: 'daily' | 'interval' | 'weekly'; schedule: string; nextRunAt?: string }>;
    weekly: Array<{ id: string; name: string; type: 'daily' | 'interval' | 'weekly'; schedule: string; nextRunAt?: string }>;
  };
  identity: { soul: { title: string; updatedAt: string }; memory: { title: string; updatedAt: string } };
}

// -- Task / step mapping -----------------------------------------------------

export function mapTaskStatus(s: BackendTask['status']): FrontendTaskStatus {
  switch (s) {
    case 'planning':
      return 'thinking';
    case 'running':
      return 'working';
    case 'waiting-confirm':
      return 'waiting-confirm';
    case 'done':
      return 'done';
    case 'failed':
    case 'interrupted':
      return 'failed';
    default:
      return 'thinking';
  }
}

export function mapStepStatus(s: BackendStep['status'] | 'waiting-confirm'): FrontendStepStatus {
  if (s === 'failed') return 'error';
  if (s === 'waiting-confirm') return 'waiting-confirm';
  return s;
}

/**
 * CSS selector of the UI element a step acts on, for the QuantyActionHighlight
 * spotlight. The user watches the email row glow before it gets archived —
 * nothing happens silently.
 */
export function targetSelectorFor(toolName: string, args: Record<string, unknown>): string | undefined {
  const threadId = args?.threadId;
  if (typeof threadId === 'string' && threadId.length > 0) {
    return `[data-thread-id="${threadId}"]`;
  }
  if (toolName.startsWith('git.')) {
    const repo = args?.repoRef ?? args?.repoId ?? args?.repo;
    if (typeof repo === 'string' && repo.length > 0) {
      return `[data-repo="${repo}"]`;
    }
  }
  return undefined;
}

export function mapStep(step: BackendStep, detail?: string): FrontendStep {
  return {
    id: step.id,
    label: step.label,
    status: mapStepStatus(step.status),
    detail,
    updatedAt: step.endedAt ?? step.startedAt ?? new Date().toISOString(),
    destructive: step.destructive === true,
    targetSelector: targetSelectorFor(step.toolName, step.args ?? {}),
  };
}

export function mapTask(task: BackendTask): FrontendTask {
  const status = mapTaskStatus(task.status);
  const failed = status === 'failed';
  return {
    id: task.id,
    command: task.command,
    status,
    steps: (task.steps ?? []).map((s) => mapStep(s)),
    resultSummary: task.outcome,
    reversible: (task.steps ?? []).some((s) => s.status === 'done' && s.reversible === true),
    error: failed ? task.outcome ?? 'Task failed' : undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// -- Popup mapping -----------------------------------------------------------

type PopupIcon = 'code' | 'mail' | 'calendar' | 'drive' | 'browser' | 'agent' | 'chat';

const EMOJI_TO_ICON: Record<string, PopupIcon> = {
  '📧': 'mail',
  '📦': 'code',
  '📅': 'calendar',
  '💾': 'drive',
  '👥': 'agent',
  '🤖': 'agent',
};

function iconFor(emoji: string): PopupIcon {
  return EMOJI_TO_ICON[emoji] ?? 'agent';
}

function statusLine(s: BackendPopupData['status']): string {
  if (s.status === 'is working' || s.status === 'browsing') return s.detail || 'Kaam chal raha hai…';
  return 'Quanty taiyaar hai';
}

/** Backend popup payload -> frontend QuantyPopupData contract. */
export function mapPopupData(data: BackendPopupData): QuantyPopupData {
  const activity = [...data.activity.today, ...data.activity.yesterday, ...data.activity.older].map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    timestamp: a.timestamp,
    icon: iconFor(a.icon),
  }));
  const approvals = (data.approvals ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    scope: a.scope,
    grantedAt: a.grantedAt,
  }));
  const browserTasks = (data.browserTasks ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
    thumbnailUrl: b.thumbnailUrl,
    status: b.status,
    startedAt: b.createdAt,
  }));
  const schedule = [
    ...data.schedule.daily.map((t) => ({ id: t.id, name: t.name, kind: t.type as 'daily' | 'interval' | 'weekly', scheduleText: t.schedule, nextRunAt: t.nextRunAt })),
    ...data.schedule.interval.map((t) => ({ id: t.id, name: t.name, kind: t.type as 'daily' | 'interval' | 'weekly', scheduleText: t.schedule, nextRunAt: t.nextRunAt })),
    ...data.schedule.weekly.map((t) => ({ id: t.id, name: t.name, kind: t.type as 'daily' | 'interval' | 'weekly', scheduleText: t.schedule, nextRunAt: t.nextRunAt })),
  ];
  return {
    status: statusLine(data.status),
    activity,
    approvals,
    browserTasks,
    schedule,
    identity: {
      soul: { updatedAt: data.identity.soul.updatedAt },
      memory: { updatedAt: data.identity.memory.updatedAt },
    },
  };
}

// -- SSE event translation ---------------------------------------------------

export type BackendStreamEvent =
  | { type: 'task'; task: BackendTask }
  | { type: 'step.start'; taskId: string; step: BackendStep }
  | { type: 'step.done'; taskId: string; step: BackendStep; summary: string }
  | { type: 'step.failed'; taskId: string; step: BackendStep; error: string }
  | { type: 'waiting-confirm'; taskId: string; toolName: string; label: string }
  | { type: 'task.done'; taskId: string; outcome: string }
  | { type: 'task.failed'; taskId: string; error: string }
  | { type: 'task.interrupted'; taskId: string };

export type FrontendStreamEvent =
  | { type: 'task'; task: FrontendTask }
  | { type: 'step'; step: FrontendStep }
  | { type: 'done'; task: FrontendTask }
  | { type: 'error'; error: string };

/**
 * Translate one backend SSE event into the frontend vocabulary.
 * `lastTask` is the most recent full task snapshot seen on this stream —
 * terminal events only carry ids, so the snapshot is rebuilt from it.
 */
export function translateStreamEvent(
  event: BackendStreamEvent,
  lastTask: BackendTask | null,
): FrontendStreamEvent | null {
  switch (event.type) {
    case 'task':
      return { type: 'task', task: mapTask(event.task) };
    case 'step.start':
      return { type: 'step', step: mapStep(event.step) };
    case 'step.done':
      return { type: 'step', step: mapStep(event.step, event.summary) };
    case 'step.failed':
      return { type: 'step', step: mapStep(event.step, event.error) };
    case 'waiting-confirm': {
      // The consent UI keys off a waiting-confirm STEP ("Haan, karo" /
      // "Rehne do") plus the task status. Find the pending/running step for
      // this tool and flip it; fall back to the first unsettled step.
      if (!lastTask) return null;
      const target =
        lastTask.steps.find((s) => s.toolName === event.toolName && (s.status === 'pending' || s.status === 'running')) ??
        lastTask.steps.find((s) => s.status === 'pending' || s.status === 'running');
      const steps = lastTask.steps.map((s) =>
        s === target ? { ...s, status: 'waiting-confirm' as const } : s,
      );
      const task: BackendTask = { ...lastTask, steps: steps as BackendStep[], status: 'waiting-confirm' };
      return { type: 'task', task: mapTask(task) };
    }
    case 'task.done': {
      if (!lastTask) return null;
      const task: BackendTask = { ...lastTask, status: 'done', outcome: event.outcome, updatedAt: new Date().toISOString() };
      return { type: 'done', task: mapTask(task) };
    }
    case 'task.failed': {
      if (!lastTask) return null;
      const task: BackendTask = { ...lastTask, status: 'failed', outcome: `Failed: ${event.error}`, updatedAt: new Date().toISOString() };
      return { type: 'done', task: mapTask(task) };
    }
    case 'task.interrupted': {
      if (!lastTask) return null;
      const task: BackendTask = { ...lastTask, status: 'interrupted', outcome: 'Interrupted by user.', updatedAt: new Date().toISOString() };
      return { type: 'done', task: mapTask(task) };
    }
    default:
      return null;
  }
}
