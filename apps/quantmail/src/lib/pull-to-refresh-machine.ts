/**
 * pull-to-refresh-machine.ts — pure, framework-free state machine for pull-to-refresh.
 *
 * Rules, all load-bearing:
 * 1. The gesture only exists at the very top: it arms only when the scroll
 *    container's `scrollTop` is `<= 0` at `touchstart`. Pulling anywhere else is
 *    a scroll and is never claimed.
 * 2. Only downward travel counts. Upward travel zeroes the pull distance rather
 *    than latching anything — the finger changed its mind, the indicator folds.
 * 3. Resistance: the indicator travels a fraction of the finger so the pull has
 *    weight, and release past the line fires exactly one refresh.
 *
 * The machine never performs the refresh itself: `touchend()` returns `true`
 * when a refresh was requested, and the caller (the React hook) runs the real
 * refetch and calls `complete()` when it settles. That keeps the state machine
 * synchronous and unit-testable.
 */

export type PtrPhase = 'idle' | 'pulling' | 'refreshing';

export interface PullToRefreshConfig {
  /** Pull px at which release fires the refresh. Default 56. */
  releaseThresholdPx?: number;
  /** Cap on the indicator travel. Default 84. */
  maxPullPx?: number;
  /** Fraction of finger travel the indicator follows. Default 0.45. */
  resistance?: number;
}

export interface PtrSnapshot {
  phase: PtrPhase;
  /** Current indicator travel in px. `0` at rest. */
  pullDistance: number;
  /** Whether the pull has crossed the release line. */
  canRelease: boolean;
}

const DEFAULTS: Required<PullToRefreshConfig> = {
  releaseThresholdPx: 56,
  maxPullPx: 84,
  resistance: 0.45,
};

export class PullToRefreshMachine {
  private readonly cfg: Required<PullToRefreshConfig>;
  private phase: PtrPhase = 'idle';
  private startY = 0;
  private pullDistance = 0;

  constructor(config: PullToRefreshConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  get snapshot(): PtrSnapshot {
    return {
      phase: this.phase,
      pullDistance: this.pullDistance,
      canRelease: this.pullDistance >= this.cfg.releaseThresholdPx,
    };
  }

  reset(): void {
    this.phase = 'idle';
    this.startY = 0;
    this.pullDistance = 0;
  }

  /**
   * Arms the gesture only when the list is scrolled all the way to the top.
   * Any other `scrollTop` means the touch is a scroll and is never claimed.
   */
  touchstart(scrollTop: number, y: number): void {
    if (this.phase !== 'idle') return;
    if (scrollTop > 0) return;
    this.startY = y;
    this.pullDistance = 0;
    this.phase = 'pulling';
  }

  touchmove(y: number, touchCount = 1): void {
    if (this.phase !== 'pulling') return;
    // A second finger means a pinch, or the start of one. Fold the indicator
    // and hand the touch back rather than tracking half a gesture.
    if (touchCount !== 1) {
      this.reset();
      return;
    }
    const dy = y - this.startY;
    this.pullDistance = dy > 0 ? Math.min(dy * this.cfg.resistance, this.cfg.maxPullPx) : 0;
  }

  /**
   * Returns `true` when the release fired a refresh. The caller runs the real
   * refetch and must call `complete()` when it settles so the spinner can fold.
   */
  touchend(): boolean {
    if (this.phase !== 'pulling') return false;
    const fire = this.pullDistance >= this.cfg.releaseThresholdPx;
    if (fire) {
      this.phase = 'refreshing';
      this.pullDistance = 44;
    } else {
      this.reset();
    }
    return fire;
  }

  touchcancel(): void {
    if (this.phase === 'pulling') this.reset();
  }

  /** The refresh finished (success or failure): fold the indicator. */
  complete(): void {
    this.reset();
  }
}
