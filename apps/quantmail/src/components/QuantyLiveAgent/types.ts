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

/**
 * Locale-following copy for the Quanty voice/session surfaces — follows the
 * app locale (English default, Devanagari for 'hi'), same convention as PR
 * #868 and the ActivityFeed/BrowserTab label fix. These aria-labels and the
 * visible mic failure lines previously hardcoded Roman-script Hinglish
 * ('Voice session band karein', 'Sunna band karein', 'Mic ki permission nahi
 * mili…'), leaking into an otherwise English UI.
 */

/** Voice-panel close button aria-label ('Voice session band karein'). */
export const VOICE_SESSION_CLOSE_LABEL = 'Close voice session';
/** Devanagari voice-panel close aria-label, used when the app locale is 'hi'. */
export const VOICE_SESSION_CLOSE_LABEL_HI = 'वॉयस सेशन बंद करें';

/** Inspector popup close button aria-label ('Popup band karein'). */
export const POPUP_CLOSE_LABEL = 'Close popup';
/** Devanagari popup close aria-label, used when the app locale is 'hi'. */
export const POPUP_CLOSE_LABEL_HI = 'पॉपअप बंद करें';

/**
 * Share button copy. The same locale-following string drives the visible
 * title AND the aria-label so they can never drift languages again (the
 * aria-label was hardcoded Hinglish 'Copy ho gaya'/'Status share karein'
 * while the title was already English 'Copied!'/'Share').
 */
export const POPUP_SHARE_LABEL: Record<'share' | 'copied', string> = {
  share: 'Share',
  copied: 'Copied!',
};
/** Devanagari share-button copy, used when the app locale is 'hi'. */
export const POPUP_SHARE_LABEL_HI: Record<'share' | 'copied', string> = {
  share: 'साझा करें',
  copied: 'कॉपी हो गया',
};

/** Result-card dismiss button aria-label ('Result band karein'). */
export const RESULT_DISMISS_LABEL = 'Dismiss result';
/** Devanagari result-dismiss aria-label, used when the app locale is 'hi'. */
export const RESULT_DISMISS_LABEL_HI = 'परिणाम बंद करें';

/** Command-bar recent-commands toggle aria-label. */
export const RECENT_TOGGLE_LABEL: Record<'open' | 'close', string> = {
  open: 'Show recent commands',
  close: 'Close recent commands',
};
/** Devanagari recent-toggle aria-label, used when the app locale is 'hi'. */
export const RECENT_TOGGLE_LABEL_HI: Record<'open' | 'close', string> = {
  open: 'हाल के कमांड देखें',
  close: 'हाल के कमांड बंद करें',
};

/** Command-bar text input aria-label ('Quanty ko command dein'). */
export const COMMAND_INPUT_LABEL = 'Give Quanty a command';
/** Devanagari command-input aria-label, used when the app locale is 'hi'. */
export const COMMAND_INPUT_LABEL_HI = 'क्वांटी को कमांड दें';

/** Command-bar mic toggle aria-label ('Sunna band karein' / 'Bol kar command dein'). */
export const MIC_TOGGLE_LABEL: Record<'start' | 'stop', string> = {
  start: 'Speak your command',
  stop: 'Stop listening',
};
/** Devanagari mic-toggle aria-label, used when the app locale is 'hi'. */
export const MIC_TOGGLE_LABEL_HI: Record<'start' | 'stop', string> = {
  start: 'बोलकर कमांड दें',
  stop: 'सुनना बंद करें',
};

/** Command-bar send button aria-label ('Command bhejein'). */
export const COMMAND_SEND_LABEL = 'Send command';
/** Devanagari send-button aria-label, used when the app locale is 'hi'. */
export const COMMAND_SEND_LABEL_HI = 'कमांड भेजें';

/**
 * Command-bar default placeholder (visible copy). Used only when the caller
 * passes no placeholder prop; follows the app locale.
 */
export const COMMAND_PLACEHOLDER = 'Tell Quanty… "archive my unread emails"';
/** Devanagari command-bar default placeholder, used when the app locale is 'hi'. */
export const COMMAND_PLACEHOLDER_HI = 'क्वांटी से कहें… "मेरे अपठित ईमेल आर्काइव कर दो"';

/**
 * Visible mic failure lines. Every voice failure explains itself in the UI —
 * honest, never swallowed — so the copy must follow the app locale like every
 * other user-facing string.
 */
export type MicErrorKind =
  | 'noSpeechApi'
  | 'permission'
  | 'noSpeech'
  | 'noMic'
  | 'network'
  | 'unknown'
  | 'startFailed';

/** Mic failure lines for the default (English) locale. */
export const MIC_ERROR: Record<MicErrorKind, string> = {
  noSpeechApi: "Voice input isn't available in this browser — type your command instead.",
  permission: "Mic permission wasn't granted — allow mic access in your browser settings, then try again.",
  noSpeech: "Didn't catch that — please speak again.",
  noMic: "No mic found — check your device's mic.",
  network: "Couldn't reach the voice service — type your command instead.",
  unknown: 'Voice ran into a problem — type your command instead.',
  startFailed: "Voice couldn't start — tap the mic button again or type your command.",
};

/** Devanagari mic failure lines, used when the app locale is 'hi'. */
export const MIC_ERROR_HI: Record<MicErrorKind, string> = {
  noSpeechApi: 'इस ब्राउज़र में वॉयस इनपुट उपलब्ध नहीं है — अपना कमांड टाइप करें।',
  permission: 'माइक की अनुमति नहीं मिली — ब्राउज़र सेटिंग्स में माइक की अनुमति दें, फिर दोबारा कोशिश करें।',
  noSpeech: 'कुछ सुनाई नहीं दिया — दोबारा बोलें।',
  noMic: 'माइक नहीं मिला — डिवाइस का माइक जांचें।',
  network: 'वॉयस सेवा से कनेक्ट नहीं हो सका — अपना कमांड टाइप करें।',
  unknown: 'वॉयस में समस्या हुई — अपना कमांड टाइप करें।',
  startFailed: 'वॉयस शुरू नहीं हो सका — माइक बटन दोबारा दबाएं या अपना कमांड टाइप करें।',

};
