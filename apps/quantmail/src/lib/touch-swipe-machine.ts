/**
 * touch-swipe-machine.ts — pure, framework-free state machine for inbox row swipe.
 *
 * Extracted as a pure module (no React, no DOM) so the gesture's core rules can
 * be unit-tested without a browser: threshold behaviour, the horizontal intent
 * lock, spring-back below the line, and the commit on release.
 *
 * Gesture contract (mobile inbox):
 * - Right swipe  → Archive (the filing end, non-destructive)
 * - Left swipe   → Delete  (the destructive end)
 * - A fixed ~80px commit distance: distance commits, velocity never does.
 * - The vertical axis is never hijacked: the touch is claimed only when
 *   |dx| > |dy| × intentLockRatio; the moment vertical intent wins, the touch is
 *   latched out and stays latched out for its whole lifetime.
 *
 * The machine is one-shot per touch: `touchstart` always resets it first.
 */

export type SwipeCommitDirection = 'archive' | 'delete';

/** idle → tracking → settling. `settling` covers both spring-back and the commit hold. */
export type SwipeMachinePhase = 'idle' | 'tracking' | 'settling';

export interface TouchSwipeConfig {
  /** Horizontal px of travel that commits the action. Default 80. */
  thresholdPx?: number;
  /** Cap on travel so the row never fully clears its action pane. Default 160. */
  maxTravelPx?: number;
  /** Horizontal px before the gesture may claim the touch. Default 10. */
  engagePx?: number;
  /** Claim the touch only when |dx| > |dy| × this. Default 1.2. */
  intentLockRatio?: number;
}

export interface SwipeMachineSnapshot {
  phase: SwipeMachinePhase;
  /** Signed travel in px. Positive is rightward. `0` at rest. */
  offset: number;
  /** Which action the finger is currently revealing, or `null` at rest. */
  direction: SwipeCommitDirection | null;
  /** Whether the commit line has been crossed. */
  armed: boolean;
  /** Whether the gesture claimed the touch (vs. a tap or a scroll). */
  engaged: boolean;
}

const DEFAULTS: Required<TouchSwipeConfig> = {
  thresholdPx: 80,
  maxTravelPx: 160,
  engagePx: 10,
  intentLockRatio: 1.2,
};

export class TouchSwipeMachine {
  private readonly cfg: Required<TouchSwipeConfig>;
  private phase: SwipeMachinePhase = 'idle';
  private startX = 0;
  private startY = 0;
  private offset = 0;
  private direction: SwipeCommitDirection | null = null;
  private armed = false;
  private engaged = false;
  private latchedOut = false;
  /** One-shot: true exactly when the threshold was crossed since the last read. */
  private hapticPending = false;
  /** One-shot: set by `touchend` when the finger lifted past the line. */
  private commitPending: SwipeCommitDirection | null = null;

  constructor(config: TouchSwipeConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  get snapshot(): SwipeMachineSnapshot {
    return {
      phase: this.phase,
      offset: this.offset,
      direction: this.direction,
      armed: this.armed,
      engaged: this.engaged,
    };
  }

  /** Read-and-clear the threshold-crossed tick (drives `navigator.vibrate`). */
  consumeHaptic(): boolean {
    const pending = this.hapticPending;
    this.hapticPending = false;
    return pending;
  }

  /** Read-and-clear the committed action after `touchend`. */
  consumeCommit(): SwipeCommitDirection | null {
    const commit = this.commitPending;
    this.commitPending = null;
    return commit;
  }

  reset(): void {
    this.phase = 'idle';
    this.startX = 0;
    this.startY = 0;
    this.offset = 0;
    this.direction = null;
    this.armed = false;
    this.engaged = false;
    this.latchedOut = false;
    this.hapticPending = false;
    this.commitPending = null;
  }

  touchstart(x: number, y: number, touchCount = 1): void {
    this.reset();
    // Two fingers is a pinch, not a swipe: hand the touch back immediately.
    if (touchCount !== 1) {
      this.latchedOut = true;
      return;
    }
    this.startX = x;
    this.startY = y;
    this.phase = 'tracking';
  }

  touchmove(x: number, y: number, touchCount = 1): void {
    if (this.phase !== 'tracking' || this.latchedOut) return;

    // A second finger landing mid-gesture means a pinch is starting: release
    // the row and hand the touch back.
    if (touchCount !== 1) {
      this.latchedOut = true;
      this.springBack();
      return;
    }

    const dx = x - this.startX;
    const dy = y - this.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!this.engaged) {
      // Vertical intent wins the touch outright and keeps it. A scroll that
      // curves into a diagonal is still a scroll, so there is no route back
      // from here — the row cannot start sliding halfway down a flick.
      if (ady >= this.cfg.engagePx && ady >= adx) {
        this.latchedOut = true;
        return;
      }
      // Not enough horizontal travel yet, or not horizontal enough to claim it.
      if (adx < this.cfg.engagePx || adx < ady * this.cfg.intentLockRatio) return;
      this.engaged = true;
    }

    const heading: SwipeCommitDirection = dx >= 0 ? 'archive' : 'delete';
    this.direction = heading;

    const travel = Math.min(adx, this.cfg.maxTravelPx);
    this.offset = dx >= 0 ? travel : -travel;

    const wasArmed = this.armed;
    this.armed = travel >= this.cfg.thresholdPx;
    // One tick on crossing the line, upward only: the finger learns where the
    // commit point is without anything having happened yet.
    if (this.armed && !wasArmed) this.hapticPending = true;
  }

  /**
   * Returns the committed action when the finger lifted past the line, else
   * `null`. On a commit the offset is held where the finger left it so the
   * caller can snap it to the full reveal; otherwise the row springs back.
   */
  touchend(): SwipeCommitDirection | null {
    if (this.phase !== 'tracking') {
      this.reset();
      return null;
    }
    const commit = this.engaged && this.armed && this.direction ? this.direction : null;
    if (commit) {
      this.commitPending = commit;
      this.phase = 'settling';
    } else {
      this.springBack();
    }
    return commit;
  }

  touchcancel(): void {
    if (this.phase === 'tracking') this.springBack();
    else this.reset();
  }

  /** Refuse the touch outright (gated off, disabled): never claim it. */
  latchOut(): void {
    this.reset();
    this.latchedOut = true;
  }

  private springBack(): void {
    // `settling` (not straight to `idle`) so the caller's release transition
    // can play before the state is cleared.
    this.phase = 'settling';
    this.offset = 0;
    this.direction = null;
    this.armed = false;
    this.engaged = false;
    this.latchedOut = false;
  }
}
