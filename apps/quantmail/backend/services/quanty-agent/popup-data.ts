// ============================================================================
// Quanty agent — popup dashboard data
// ============================================================================
//
// PURPOSE
//   Assemble the combined payload for GET /api/quanty/popup: live status,
//   activity feed, approval history, browser tasks, the real schedule
//   registry, and the identity cards. Everything comes from the agent core's
//   own stores — activity is real task history, approvals are real recorded
//   grants. Where data is absent the arrays are empty; nothing is fabricated.
//
//   The Next.js layer maps this backend shape onto the frontend
//   `QuantyPopupData` contract (see apps/quantmail/src/app/api/quanty/_lib).

import { getSchedule } from './schedule-registry';
import type { QuantyExecutor, QuantyTaskStore } from './executor';
import { quantyAgentState } from './agent-state';
import type {
  QuantyActivityFeed,
  QuantyActivityItem,
  QuantyApproval,
  QuantyBrowserTask,
  QuantyIdentity,
  QuantyLiveStatus,
  QuantySchedule,
  QuantyTask,
  QuantyToolApp,
} from './types';

export interface QuantyPopupBackendData {
  status: QuantyLiveStatus;
  activity: QuantyActivityFeed;
  approvals: QuantyApproval[];
  browserTasks: QuantyBrowserTask[];
  schedule: QuantySchedule;
  identity: QuantyIdentity;
}

const APP_ICONS: Record<QuantyToolApp, string> = {
  mail: '📧',
  git: '📦',
  calendar: '📅',
  drive: '💾',
  contacts: '👥',
  core: '🤖',
};

function taskIcon(task: QuantyTask, toolAppOf: (toolName: string) => QuantyToolApp | undefined): string {
  const first = task.steps[0]?.toolName;
  const app = first ? toolAppOf(first) : undefined;
  return APP_ICONS[app ?? 'core'];
}

/** Group finished tasks into the Today / Yesterday / Older feed. */
export function buildActivityFeed(
  tasks: QuantyTask[],
  toolAppOf: (toolName: string) => QuantyToolApp | undefined,
): QuantyActivityFeed {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const feed: QuantyActivityFeed = { today: [], yesterday: [], older: [] };
  for (const task of tasks) {
    if (task.status !== 'done' && task.status !== 'failed' && task.status !== 'interrupted') continue;
    const item: QuantyActivityItem = {
      id: task.id,
      icon: taskIcon(task, toolAppOf),
      title: task.command,
      description: task.outcome ?? task.planSummary,
      timestamp: task.updatedAt,
    };
    const ts = new Date(task.updatedAt).getTime();
    if (ts >= startOfToday.getTime()) feed.today.push(item);
    else if (ts >= startOfYesterday.getTime()) feed.yesterday.push(item);
    else feed.older.push(item);
  }
  return feed;
}

export interface PopupDataDeps {
  userId: string;
  store: QuantyTaskStore;
  executor: QuantyExecutor;
  toolAppOf: (toolName: string) => QuantyToolApp | undefined;
}

/** Assemble the full popup payload. Honest empty states, never fabricated rows. */
export async function buildPopupData(deps: PopupDataDeps): Promise<QuantyPopupBackendData> {
  const tasks = await deps.store.listByUser(deps.userId, 100);
  return {
    status: deps.executor.liveStatus(),
    activity: buildActivityFeed(tasks, deps.toolAppOf),
    approvals: quantyAgentState.listApprovals(50),
    browserTasks: quantyAgentState.listBrowserTasks(50),
    schedule: getSchedule(),
    identity: quantyAgentState.getIdentity(),
  };
}
