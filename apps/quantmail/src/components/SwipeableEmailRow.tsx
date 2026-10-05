'use client';

/**
 * SwipeableEmailRow — real touch swipe actions for inbox rows.
 *
 * Right swipe → Archive (the filing end, green pane), left swipe → Delete (the
 * destructive end, red pane). The commit distance is a fixed ~80px: distance
 * commits, velocity never does, so no flick can fire an action by accident.
 *
 * The gesture core lives in `../lib/touch-swipe-machine` (pure, unit-tested);
 * this file is the thin React binding: touch handlers, the 1:1 follow under the
 * thumb, the release spring, the threshold haptic, and the click suppression
 * that stops a swiped row from also opening.
 *
 * Touch-only by construction AND by gate: the handlers are `onTouch*` (they
 * never fire for a mouse), and they additionally refuse to engage unless the
 * device reports a coarse pointer — so desktop hover/click behaviour is
 * completely untouched.
 *
 * Competitor note (Gmail / Superhuman): the action fires the instant the finger
 * lifts past the line — the visual commit snaps in the same frame and the
 * existing optimistic mutations (`onArchive`/`onDelete`) remove the row in that
 * same frame with an undo window, so there is no server round-trip between the
 * gesture and the result. Gmail waits on its sync; Superhuman is the bar we
 * match here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TouchSwipeMachine,
  type SwipeCommitDirection,
  type SwipeMachinePhase,
} from '../lib/touch-swipe-machine';

/** True on touch devices. Falls back to true when undetectable (SSR, tests). */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

function tick(ms: number): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      /* haptics are best-effort */
    }
  }
}

export interface UseTouchSwipeOptions {
  onArchive: () => void;
  onDelete: () => void;
  /** Turn the gesture off without changing the call shape. */
  disabled?: boolean;
  /** px of horizontal travel that commits. Default 80. */
  thresholdPx?: number;
  /** Skip the commit snap and haptics (respects reduced motion). */
  reducedMotion?: boolean;
}

export interface UseTouchSwipeReturn {
  handlers: {
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchMove: (event: React.TouchEvent) => void;
    onTouchEnd: (event: React.TouchEvent) => void;
    onTouchCancel: (event: React.TouchEvent) => void;
  };
  /** Signed px the row should translate. `0` at rest. */
  offset: number;
  phase: SwipeMachinePhase;
  /** Which action pane is showing, or `null` at rest. */
  direction: SwipeCommitDirection | null;
  /** Whether the commit line has been crossed. */
  armed: boolean;
  /** `0`–`1` progress toward the commit line, for label opacity ramps. */
  progress: number;
  /** Whether the click that follows this touch should be ignored. */
  wasSwipe: () => boolean;
}

/** How long the click-suppression window stays open after the finger lifts. */
const CLICK_SUPPRESSION_MS = 400;
/** How long the committed row holds its reveal before resetting. */
const COMMIT_HOLD_MS = 240;

export function useTouchSwipe(options: UseTouchSwipeOptions): UseTouchSwipeReturn {
  const { onArchive, onDelete, disabled = false, thresholdPx = 80, reducedMotion = false } = options;

  const machineRef = useRef<TouchSwipeMachine | null>(null);
  if (!machineRef.current) machineRef.current = new TouchSwipeMachine({ thresholdPx });

  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<SwipeMachinePhase>('idle');
  const [direction, setDirection] = useState<SwipeCommitDirection | null>(null);
  const [armed, setArmed] = useState(false);
  /** Release-position snap while a commit holds, overriding the machine offset. */
  const [commitSnap, setCommitSnap] = useState<number | null>(null);
  const swipedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Latest callbacks, read at commit time rather than captured, so the handlers
  // stay referentially stable while a row's actions change underneath them.
  const actionsRef = useRef({ onArchive, onDelete });
  useEffect(() => {
    actionsRef.current = { onArchive, onDelete };
  });

  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current = [];
    },
    [],
  );

  const later = useCallback((run: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      run();
    }, delay);
    timersRef.current.push(timer);
  }, []);

  const sync = useCallback(() => {
    const machine = machineRef.current;
    if (!machine) return;
    const snap = machine.snapshot;
    setOffset(snap.offset);
    setPhase(snap.phase);
    setDirection(snap.direction);
    setArmed(snap.armed);
    if (machine.consumeHaptic() && !reducedMotion) tick(10);
  }, [reducedMotion]);

  const markSwiped = useCallback(() => {
    swipedRef.current = true;
    later(() => {
      swipedRef.current = false;
    }, CLICK_SUPPRESSION_MS);
  }, [later]);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      const machine = machineRef.current;
      if (!machine) return;
      if (disabled || !isCoarsePointer()) {
        // Gated off: never claim the touch, so desktop behaviour is untouched.
        machine.latchOut();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      machine.touchstart(touch.clientX, touch.clientY, event.touches.length);
      sync();
    },
    [disabled, sync],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const machine = machineRef.current;
      if (!machine || disabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      machine.touchmove(touch.clientX, touch.clientY, event.touches.length);
      sync();
    },
    [disabled, sync],
  );

  const onTouchEnd = useCallback(() => {
    const machine = machineRef.current;
    if (!machine || disabled) return;
    const wasEngaged = machine.snapshot.engaged;
    const commit = machine.touchend();
    sync();

    // Any engaged swipe suppresses the click that follows it, committed or not:
    // the finger that dragged a row 40px and thought better of it did not ask
    // to open it either.
    if (wasEngaged) markSwiped();

    if (!commit) {
      // Below the line: spring back, then clear.
      later(() => {
        machine.reset();
        sync();
      }, COMMIT_HOLD_MS);
      return;
    }

    // Past the line: instant visual commit — snap the reveal open in this frame
    // and fire the (optimistic) action in the same frame. No round-trip between
    // the gesture and the result.
    if (!reducedMotion) tick(18);
    const reveal = commit === 'archive' ? thresholdPx + 56 : -(thresholdPx + 56);
    setCommitSnap(reveal);
    const action = commit === 'archive' ? actionsRef.current.onArchive : actionsRef.current.onDelete;
    action();
    later(() => {
      machine.reset();
      setCommitSnap(null);
      sync();
    }, COMMIT_HOLD_MS);
  }, [disabled, later, markSwiped, reducedMotion, sync, thresholdPx]);

  const onTouchCancel = useCallback(() => {
    const machine = machineRef.current;
    if (!machine) return;
    machine.touchcancel();
    sync();
  }, [sync]);

  const wasSwipe = useCallback(() => swipedRef.current, []);

  const renderedOffset = commitSnap ?? offset;
  const progress = thresholdPx > 0 ? Math.min(1, Math.abs(renderedOffset) / thresholdPx) : 0;

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    offset: renderedOffset,
    phase,
    direction,
    armed,
    progress,
    wasSwipe,
  };
}

/**
 * Convenience wrapper: renders the two action panes behind `children` and
 * drives them from `useTouchSwipe`. Prefer the hook directly when the row
 * already owns its shell (as `EmailRow` does).
 */
export function SwipeableEmailRow({
  onArchive,
  onDelete,
  disabled,
  thresholdPx,
  reducedMotion,
  className = '',
  children,
}: UseTouchSwipeOptions & { className?: string; children: React.ReactNode }) {
  const swipe = useTouchSwipe({ onArchive, onDelete, disabled, thresholdPx, reducedMotion });

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {swipe.direction && (
        <div
          aria-hidden="true"
          className={`mail-row-swipe-pane ${swipe.direction === 'archive' ? 'is-archive' : 'is-delete'} ${
            swipe.armed ? 'is-armed' : ''
          }`}
        >
          <span
            className="mail-row-swipe-label"
            style={{ opacity: 0.45 + swipe.progress * 0.55 }}
          >
            {swipe.direction === 'archive' ? (
              <>
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="5" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Archive
              </>
            ) : (
              <>
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                Delete
              </>
            )}
          </span>
        </div>
      )}
      <div
        {...swipe.handlers}
        className={`touch-pan-y ${swipe.phase === 'tracking' ? '' : 'is-swipe-settling'}`}
        style={
          swipe.offset === 0 ? undefined : { transform: `translate3d(${swipe.offset}px, 0, 0)` }
        }
      >
        {children}
      </div>
    </div>
  );
}
