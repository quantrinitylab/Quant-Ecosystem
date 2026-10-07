export type {
  ActionType,
  BrowserAction,
  ActionResult,
  PageState,
  FormField,
  SessionStatus,
  BrowserSession,
  EncryptedCookieData,
  SiteAuth,
  SpendingCap,
  ReplayEntry,
  ActionSequence,
} from './types.js';
export { ActionTier } from './types.js';

export {
  createClickAction,
  createTypeAction,
  createScrollAction,
  createNavigateAction,
  createExtractAction,
  createScreenshotAction,
  createWaitAction,
  createSelectAction,
  classifyAction,
} from './actions/browser-actions.js';

export { ActionPlanner } from './planner/action-planner.js';
export type {
  ActionPlannerStrategy,
  ActionPlannerConfig,
  ReplanContext,
} from './planner/action-planner.js';

export { PageStateManager } from './state/page-state.js';

export { SessionManager } from './session/session-manager.js';
export type { EncryptedCookieStore } from './session/session-manager.js';

export { TrustFramework } from './trust/trust-framework.js';

export { ActionReplayRecorder } from './audit/action-replay.js';
