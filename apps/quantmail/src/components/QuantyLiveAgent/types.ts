/**
 * QuantyLiveAgent — shared types.
 *
 * The live agentic surface: a floating Quanty avatar that takes natural-language
 * commands, executes them as visible steps against real app tools, and narrates
 * progress. The backend contract (POST /api/quanty/tasks, SSE stream) is defined
 * here so the hook and components stay in sync; the backend itself lands later.
 */

/** Lifecycle of a whole task. */
export type QuantyTaskStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting-confirm'
  | 'done'
  | 'failed';

/** Lifecycle of a single step inside a task. */
export type QuantyStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'waiting-confirm'
  | 'skipped';

/** One visible unit of work inside a task. */
export interface QuantyStep {
  /** Stable id from the backend (or client-generated for optimistic steps). */
  id: string;
  /** Human-readable, Hinglish-friendly label, e.g. "5 unread emails dhoondhe". */
  label: string;
  status: QuantyStepStatus;
  /** Optional extra detail, e.g. "3 archive kiye, 2 pehle se the". */
  detail?: string;
  /** ISO timestamp of the last status change. */
  updatedAt: string;
  /** True when executing this step mutates user data irreversibly-ish. */
  destructive?: boolean;
  /**
   * CSS selector of the UI element this step acts on, e.g.
   * '[data-thread-id="abc"]'. The live spotlight (QuantyActionHighlight)
   * glows on this element while the step runs, and tapping the step in the
   * feed re-shows it — so the user SEES every action, nothing happens
   * silently.
   */
  targetSelector?: string;
}

/** A submitted command and everything that happened while running it. */
export interface QuantyTask {
  id: string;
  /** The raw command text the user typed/spoke. */
  command: string;
  status: QuantyTaskStatus;
  steps: QuantyStep[];
  /** Short success summary, e.g. "Ho gaya! 5 emails archive kiye". */
  resultSummary?: string;
  /** Machine-readable result payload (counts, ids) for Undo. */
  resultPayload?: Record<string, unknown>;
  /** True when the task's effects can be reversed via the Undo action. */
  reversible?: boolean;
  /** User-facing error message when status === 'failed'. */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** SSE event shapes emitted by GET /api/quanty/tasks/:id/stream. */
export type QuantyStreamEvent =
  | { type: 'task'; task: QuantyTask }
  | { type: 'step'; step: QuantyStep }
  | { type: 'done'; task: QuantyTask }
  | { type: 'error'; error: string };

/** POST /api/quanty/tasks response. */
export interface QuantySubmitResponse {
  taskId: string;
}

/** Which surface of the live agent is visible. */
export type QuantyAgentMode = 'hidden' | 'chooser' | 'voice';

/** Imperative handle so the existing Quanty AI button can open the chooser. */
export interface QuantyLiveAgentHandle {
  /** Show the mode chooser: [Chat] [Voice Live Agent]. */
  open: () => void;
  /** Jump straight into the voice live-agent session. */
  startVoice: () => void;
  /** End everything and hide. */
  close: () => void;
}

/** Popup tab ids. */
export type QuantyPopupTabId = 'activity' | 'approvals' | 'browser' | 'schedule' | 'identity';

/** One timeline entry in the Activity tab. */
export interface QuantyActivityEntry {
  id: string;
  title: string;
  description?: string;
  /** ISO timestamp; display formatting is done client-side. */
  timestamp: string;
  icon?: 'code' | 'mail' | 'calendar' | 'drive' | 'browser' | 'agent' | 'chat';
}

/** One row in the Approvals history tab. */
export interface QuantyApproval {
  id: string;
  title: string;
  description?: string;
  /** e.g. "Site always allowed". */
  scope: string;
  /** ISO timestamp of the grant. */
  grantedAt: string;
}

/** One row in the Browser tab. */
export interface QuantyBrowserTask {
  id: string;
  title: string;
  /** e.g. "quantmail.in". */
  url: string;
  thumbnailUrl?: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
}

/** One row in the Schedule tab. */
export interface QuantyScheduledTask {
  id: string;
  name: string;
  kind: 'daily' | 'interval' | 'weekly';
  /** Human schedule text, e.g. "Every 10 minutes", "Monday". */
  scheduleText: string;
  /** ISO timestamp of the next run, when known. */
  nextRunAt?: string;
}

/** Identity cards data. */
export interface QuantyIdentityData {
  soul: { updatedAt: string };
  memory: { updatedAt: string };
}

/**
 * GET /api/quanty/popup response contract.
 *
 * The backend (agent core) owns this data: activity = agent task history,
 * approvals = permission grant log, browserTasks = browser task history,
 * schedule = the real cron registry, identity = SOUL.md / MEMORY.md mtimes.
 * Until the backend implements it, the hook surfaces honest empty states —
 * never fabricated entries.
 */
export interface QuantyPopupData {
  /** Live status line, e.g. "Planning...", "Browsing quantmail.in". */
  status: string;
  activity: QuantyActivityEntry[];
  approvals: QuantyApproval[];
  browserTasks: QuantyBrowserTask[];
  schedule: QuantyScheduledTask[];
  identity: QuantyIdentityData;
}

/** Maps a task status onto the BubbleAvatar sheet vocabulary. */
export const TASK_STATUS_TO_BUBBLE = {
  idle: 'idle',
  thinking: 'thinking',
  working: 'working',
  'waiting-confirm': 'listening',
  done: 'success',
  failed: 'error',
} as const;

/** Status dot colors per task status. */
export const TASK_STATUS_DOT: Record<QuantyTaskStatus, string> = {
  idle: 'bg-emerald-400',
  thinking: 'bg-sky-400',
  working: 'bg-blue-500',
  'waiting-confirm': 'bg-amber-400',
  done: 'bg-emerald-400',
  failed: 'bg-red-500',
};

/** Status line shown under the avatar — follows the app locale (English default, Devanagari for 'hi'). */
export const TASK_STATUS_LABEL: Record<QuantyTaskStatus, string> = {
  idle: 'Quanty is ready',
  thinking: 'Thinking…',
  working: 'Working…',
  'waiting-confirm': 'Needs your confirmation',
  done: 'Done!',
  failed: 'Something went wrong',
};

/** Devanagari status captions, used when the app locale is 'hi'. */
export const TASK_STATUS_LABEL_HI: Record<QuantyTaskStatus, string> = {
  idle: 'क्वांटी तैयार है',
  thinking: 'सोच रहा है…',
  working: 'काम चल रहा है…',
  'waiting-confirm': 'आपकी अनुमति चाहिए',
  done: 'हो गया!',
  failed: 'कुछ गड़बड़ हुई',
};

/**
 * Screen-reader status captions for activity-feed steps — follow the app
 * locale (English default, Devanagari for 'hi'), the same convention as the
 * avatar status fix. These were previously hardcoded Roman-script Hinglish
 * ('baki hai', 'chal raha hai', …), leaking into an otherwise English UI.
 */
export const STEP_SR_LABEL: Record<QuantyStepStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  'waiting-confirm': 'Needs your confirmation',
  skipped: 'Skipped',
};

/** Devanagari SR status captions for activity-feed steps, used when the app locale is 'hi'. */
export const STEP_SR_LABEL_HI: Record<QuantyStepStatus, string> = {
  pending: 'बाकी है',
  running: 'चल रहा है',
  done: 'हो गया',
  error: 'असफल हुआ',
  'waiting-confirm': 'आपकी अनुमति चाहिए',
  skipped: 'छोड़ दिया गया',
};

/** Hint appended to a tappable step's aria-label — follows the app locale. */
export const STEP_TAP_HINT = ' — tap to see where the action happened';

/** Devanagari tap hint for tappable steps, used when the app locale is 'hi'. */
export const STEP_TAP_HINT_HI = ' — कार्रवाई कहाँ हुई, यह देखने के लिए टैप करें';

/**
 * Collapse-toggle copy. Visible text and aria-label share the same string so
 * they can never drift into different languages again (the toggle previously
 * showed English 'Expand'/'Collapse' while its aria-label was hardcoded
 * Hinglish 'Saare steps dekhein'/'Sirf latest step dekhein').
 */
export const COLLAPSE_TOGGLE_LABEL: Record<'expand' | 'collapse', string> = {
  expand: 'Expand',
  collapse: 'Collapse',
};

/** Devanagari collapse-toggle copy, used when the app locale is 'hi'. */
export const COLLAPSE_TOGGLE_LABEL_HI: Record<'expand' | 'collapse', string> = {
  expand: 'विस्तार करें',
  collapse: 'समेटें',
};

/**
 * Browser-tab task status captions — follow the app locale (English default,
 * Devanagari for 'hi'). Previously hardcoded Roman-script Hinglish
 * ('chal raha hai', 'poora hua', 'fail hua').
 */
export const BROWSER_TASK_STATUS_LABEL: Record<QuantyBrowserTask['status'], string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

/** Devanagari browser-task status captions, used when the app locale is 'hi'. */
export const BROWSER_TASK_STATUS_LABEL_HI: Record<QuantyBrowserTask['status'], string> = {
  running: 'चल रहा है',
  done: 'पूरा हुआ',
  failed: 'असफल हुआ',
};
