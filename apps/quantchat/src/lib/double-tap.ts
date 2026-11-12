// QC-F-648 — Double-tap quick-react: pointer discriminator (pure, no React).
//
// The shipped thread page has no double-tap wiring anywhere and the
// src/mobile/gestures.ts DoubleTap utility is dead twice over (no
// processDoubleTap dispatch, zero shipped consumers), so Slice-1 does NOT
// build on it. This tiny tracker is the whole gesture decision: a second
// pointerup on the SAME message, from the SAME pointer, within 300 ms and
// within 12 px of the first tap's release point, is a double-tap. Everything
// else is one (or two) single taps, and single taps on a bubble are no-ops
// — so there is deliberately NO tap-delay anywhere in Slice-1.
//
// Rules enforced here (each pinned by a unit test):
// - interactive descendants (button / a / input / textarea / select /
//   [role="button"]) never count as a tap and reset any pending first tap,
//   so a tap on Reply / a snap card / a link can never become half of a
//   double-tap;
// - a different pointer id resets the pending first tap (two-finger taps
//   never count);
// - pointer movement beyond the threshold between down and up cancels the
//   pending tap (scroll/drag can never fire a reaction);
// - a slow second tap (> 300 ms), a far second tap (> 12 px), or a tap on a
//   different message never fires.

export const DOUBLE_TAP_WINDOW_MS = 300;
export const DOUBLE_TAP_MOVE_PX = 12;

interface PendingTap {
  pointerId: number;
  timeMs: number;
  x: number;
  y: number;
}

interface ActiveDown {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export class DoubleTapTracker {
  private readonly pendingUp = new Map<string, PendingTap>();
  private readonly activeDown = new Map<string, ActiveDown>();

  pointerDown(messageId: string, pointerId: number, x: number, y: number): void {
    const pending = this.pendingUp.get(messageId);
    if (pending && pending.pointerId !== pointerId) {
      // A second finger starts: the first finger's pending tap is void.
      this.pendingUp.delete(messageId);
    }
    this.activeDown.set(messageId, { pointerId, x, y, moved: false });
  }

  pointerMove(messageId: string, pointerId: number, x: number, y: number): void {
    const down = this.activeDown.get(messageId);
    if (!down || down.pointerId !== pointerId) return;
    if (distance(down.x, down.y, x, y) > DOUBLE_TAP_MOVE_PX) {
      down.moved = true;
      // Scroll/drag cancels the pending first tap outright.
      this.pendingUp.delete(messageId);
    }
  }

  /**
   * Record a pointerup. Returns true exactly when this release completes a
   * double-tap on `messageId`; false otherwise (including interactive taps,
   * which are ignored entirely).
   */
  pointerUp(
    messageId: string,
    pointerId: number,
    x: number,
    y: number,
    nowMs: number,
    isInteractiveTarget: boolean,
  ): boolean {
    this.activeDown.delete(messageId);
    if (isInteractiveTarget) {
      // The tap belongs to the control (Reply / snap / link): it is neither
      // a first tap nor a completing tap, and it voids any pending tap.
      this.pendingUp.delete(messageId);
      return false;
    }
    const pending = this.pendingUp.get(messageId);
    if (
      pending &&
      pending.pointerId === pointerId &&
      nowMs - pending.timeMs <= DOUBLE_TAP_WINDOW_MS &&
      distance(pending.x, pending.y, x, y) <= DOUBLE_TAP_MOVE_PX
    ) {
      this.pendingUp.delete(messageId);
      return true;
    }
    this.pendingUp.set(messageId, { pointerId, timeMs: nowMs, x, y });
    return false;
  }

  /** Forget all state for a message (unmount / conversation change). */
  cancel(messageId: string): void {
    this.pendingUp.delete(messageId);
    this.activeDown.delete(messageId);
  }
}
