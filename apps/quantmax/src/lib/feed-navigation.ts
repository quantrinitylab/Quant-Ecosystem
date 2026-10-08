// ============================================================================
// QuantMax - feed navigation input mapping (desktop)
// Pure, DOM-free mapping used by the For You feed page:
//   - keyboard: ArrowDown/j -> next, ArrowUp/k -> previous,
//               Space -> play/pause, m -> mute
//   - wheel: deliberate vertical scrolls advance the feed
// Kept DOM-free so the contract is unit-testable in a node environment.
// ============================================================================

export type FeedKeyAction = 'next' | 'previous' | 'togglePlay' | 'toggleMute';

export function resolveFeedKeyAction(key: string): FeedKeyAction | null {
  switch (key) {
    case 'ArrowDown':
    case 'j':
    case 'J':
      return 'next';
    case 'ArrowUp':
    case 'k':
    case 'K':
      return 'previous';
    case ' ':
      return 'togglePlay';
    case 'm':
    case 'M':
      return 'toggleMute';
    default:
      return null;
  }
}

/** Minimum |deltaY| (px) before a wheel gesture advances the feed. */
export const WHEEL_DELTA_THRESHOLD = 24;

/** Minimum ms between wheel-driven advances (trackpad jitter guard). */
export const WHEEL_COOLDOWN_MS = 600;

export function resolveWheelDirection(deltaY: number): 'next' | 'previous' | null {
  if (Math.abs(deltaY) < WHEEL_DELTA_THRESHOLD) return null;
  return deltaY > 0 ? 'next' : 'previous';
}
