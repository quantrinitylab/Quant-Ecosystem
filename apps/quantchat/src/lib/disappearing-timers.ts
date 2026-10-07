// ============================================================================
// QuantChat - Disappearing Message Timer Presets (Task 14.8)
//
// Per-conversation disappear timer configuration. The selected duration is
// applied to all NEW messages sent in the conversation; after a message is
// viewed it is deleted once the timer elapses.
//
// Requirements: 18.1 (configurable timers: 5s, 10s, 30s, 1min, 5min, 24h)
// ============================================================================

/** A selectable disappear-timer option. */
export interface DisappearTimerOption {
  /** Stable id. */
  id: string;
  /** Short label shown on the picker button. */
  label: string;
  /** Duration in seconds. 0 means "off" (no timer). */
  seconds: number;
}

/** "Off" sentinel (no disappear timer). */
export const TIMER_OFF_SECONDS = 0;

/**
 * The supported disappear-timer durations (Requirement 18.1).
 * Includes an explicit "Off" option to disable disappearing messages.
 */
export const DISAPPEAR_TIMER_OPTIONS: DisappearTimerOption[] = [
  { id: 'off', label: 'Off', seconds: TIMER_OFF_SECONDS },
  { id: '5s', label: '5s', seconds: 5 },
  { id: '10s', label: '10s', seconds: 10 },
  { id: '30s', label: '30s', seconds: 30 },
  { id: '1min', label: '1 min', seconds: 60 },
  { id: '5min', label: '5 min', seconds: 300 },
  { id: '24h', label: '24h', seconds: 24 * 60 * 60 },
];

/** Valid (non-off) durations in seconds, for validation. */
export const VALID_DISAPPEAR_SECONDS: number[] = DISAPPEAR_TIMER_OPTIONS.filter(
  (o) => o.seconds > 0,
).map((o) => o.seconds);

/** Whether a given seconds value is a supported timer (including "off"). */
export function isValidDisappearTimer(seconds: number): boolean {
  return seconds === TIMER_OFF_SECONDS || VALID_DISAPPEAR_SECONDS.includes(seconds);
}

/** Resolve the option for a seconds value, or undefined if unsupported. */
export function getTimerOption(seconds: number): DisappearTimerOption | undefined {
  return DISAPPEAR_TIMER_OPTIONS.find((o) => o.seconds === seconds);
}

/** Human-readable label for a duration (falls back to "Ns"). */
export function formatTimerLabel(seconds: number): string {
  return getTimerOption(seconds)?.label ?? `${seconds}s`;
}
