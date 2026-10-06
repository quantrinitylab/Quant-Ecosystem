/**
 * QuantyLiveAgent — the contextual agentic surface, Muse-style.
 *
 * Mount `<QuantyLiveAgent ref={ref} />` once, high in the tree. Wire the
 * existing Quanty AI button/pill to `ref.current?.open()`:
 *
 *   tap Quanty button → mode chooser [Chat] [Voice Live Agent]
 *   Voice Live Agent → avatar animates to the front-camera position,
 *     voice session starts, live panel opens below it
 *   TAP THE AVATAR → 5-tab inspector popup
 *     (Activity · Approvals · Browser · Schedule · Identity)
 *
 * VISIBLE LIVE OPERATION: every agent step may carry `targetSelector`;
 * QuantyActionHighlight spotlights that element while the step runs, and
 * tapping a feed step re-shows where it acted.
 *
 * Backend contracts (implemented separately by the agent core):
 * - POST /api/quanty/tasks, SSE GET /api/quanty/tasks/:id/stream, … (useQuantyAgent)
 * - GET  /api/quanty/popup → QuantyPopupData (useQuantyPopupData)
 */
export { QuantyLiveAgent } from './QuantyLiveAgent';
export type { QuantyLiveAgentProps } from './QuantyLiveAgent';

export { QuantyAvatar } from './QuantyAvatar';
export type { QuantyAvatarProps } from './QuantyAvatar';

export { QuantyModeChooser } from './QuantyModeChooser';
export type { QuantyModeChooserProps, QuantyChooserSelection } from './QuantyModeChooser';

export { QuantyActionHighlight } from './QuantyActionHighlight';
export type { QuantyActionHighlightProps } from './QuantyActionHighlight';

export { QuantyPopup } from './QuantyPopup';
export type { QuantyPopupProps } from './QuantyPopup';

export { QuantyPopupHeader } from './QuantyPopupHeader';
export type { QuantyPopupHeaderProps } from './QuantyPopupHeader';

export { QuantyPopupTabs } from './QuantyPopupTabs';
export type { QuantyPopupTabsProps } from './QuantyPopupTabs';

export { QuantyActivityTab } from './tabs/QuantyActivityTab';
export type { QuantyActivityTabProps } from './tabs/QuantyActivityTab';

export { QuantyApprovalsTab } from './tabs/QuantyApprovalsTab';
export type { QuantyApprovalsTabProps } from './tabs/QuantyApprovalsTab';

export { QuantyBrowserTab } from './tabs/QuantyBrowserTab';
export type { QuantyBrowserTabProps } from './tabs/QuantyBrowserTab';

export { QuantyScheduleTab } from './tabs/QuantyScheduleTab';
export type { QuantyScheduleTabProps } from './tabs/QuantyScheduleTab';

export { QuantyIdentityTab } from './tabs/QuantyIdentityTab';
export type { QuantyIdentityTabProps } from './tabs/QuantyIdentityTab';

export { useQuantyPopupData } from './useQuantyPopupData';
export type { UseQuantyPopupData, UseQuantyPopupDataOptions } from './useQuantyPopupData';

export { QuantyCommandBar, loadRecentCommands, saveRecentCommand } from './QuantyCommandBar';
export type { QuantyCommandBarProps } from './QuantyCommandBar';

export { QuantyActivityFeed } from './QuantyActivityFeed';
export type { QuantyActivityFeedProps } from './QuantyActivityFeed';

export { QuantyResultCard } from './QuantyResultCard';
export type { QuantyResultCardProps } from './QuantyResultCard';

export { useQuantyAgent } from './useQuantyAgent';
export type { UseQuantyAgent, UseQuantyAgentOptions } from './useQuantyAgent';

export {
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
  TASK_STATUS_TO_BUBBLE,
} from './types';
export type {
  QuantyActivityEntry,
  QuantyAgentMode,
  QuantyApproval,
  QuantyBrowserTask,
  QuantyIdentityData,
  QuantyLiveAgentHandle,
  QuantyPopupData,
  QuantyPopupTabId,
  QuantyScheduledTask,
  QuantyStep,
  QuantyStepStatus,
  QuantyStreamEvent,
  QuantySubmitResponse,
  QuantyTask,
  QuantyTaskStatus,
} from './types';

export { formatClockTime, formatRelativeTime, dayBucket, DAY_BUCKET_LABEL } from './quantyTime';
