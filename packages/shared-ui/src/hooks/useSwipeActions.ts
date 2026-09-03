'use client';

// ============================================================================
// Shared UI - useSwipeActions Hook
// ============================================================================

/**
 * Horizontal swipe actions on a row inside a vertically-scrolling list.
 *
 * This exists because the obvious implementation is the one that fails. A
 * `framer-motion` `drag="x"` claims the pointer on the first horizontal pixel,
 * so a thumb travelling up a list at any angle off vertical slides the row it
 * started on, and a generous flick fires the action. QuantMail shipped exactly
 * that, then deleted it — see the note above `EmailRow` in `apps/quantmail`.
 *
 * Three rules keep it honest, and all three are load-bearing:
 *
 * 1. **The gesture has to be claimed, not assumed.** Nothing moves until the
 *    finger has travelled `engagePx` horizontally *and* is at least
 *    `engageBias`× more horizontal than vertical. The moment vertical intent
 *    wins instead, the touch is latched out and cannot be reclaimed however the
 *    finger turns afterwards — a scroll that curves is still a scroll.
 * 2. **Distance commits, velocity never does.** There is no flick path. The
 *    finger must cross `commitRatio` of the element's own width, floored at
 *    `minCommitPx`, which is far enough that it cannot be reached by accident
 *    and cannot be reached at all by a fast one.
 * 3. **The finger owns the pixels.** Travel tracks 1:1 so the row is under the
 *    thumb rather than animating toward it, and `armed` flips exactly when the
 *    commit line is crossed so the caller can show that it has been.
 *
 * The element must carry `touch-action: pan-y`. That is what lets the browser
 * keep owning vertical scroll while surrendering the horizontal axis, and it is
 * why this hook never calls `preventDefault` — React registers `touchmove`
 * passively at the root, so a `preventDefault` there would only log a warning.
 *
 * The hook is deliberately headless and says nothing about what the actions
 * *are*. The one thing a caller must get right is that the two directions are
 * **peers**: both reversible, both a way of filing the thing away. Putting a
 * destructive action on one end and a decoration on the other is what made the
 * first attempt indefensible, and no amount of tuning fixes it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** One end of the gesture. */
export interface SwipeAction {
  /** Shown in the revealed pane, and the accessible name of what will happen. */
  label: string;
  /** Run once, when the finger lifts past the commit distance. */
  onCommit: () => void;
}

export interface UseSwipeActionsOptions {
  /** Revealed when the finger travels **left**. Omit to disable that direction. */
  left?: SwipeAction;
  /** Revealed when the finger travels **right**. Omit to disable that direction. */
  right?: SwipeAction;
  /** Fraction of the element's own width that commits. */
  commitRatio?: number;
  /** Absolute floor for the commit distance, so a narrow row still asks for intent. */
  minCommitPx?: number;
  /** Cap on travel, as a fraction of width, so the row never fully clears its pane. */
  maxTravelRatio?: number;
  /** Horizontal travel before the gesture claims the pointer. */
  engagePx?: number;
  /** How much more horizontal than vertical the travel must be to claim it. */
  engageBias?: number;
  /** Vertical travel that latches the touch out as a scroll. */
  scrollLatchPx?: number;
  /** Skip the release spring and the arming haptic. */
  reducedMotion?: boolean;
  /** Turn the gesture off without changing the call shape. */
  disabled?: boolean;
}

export interface UseSwipeActionsReturn {
  /** Spread onto the element that should follow the finger. */
  handlers: {
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchMove: (event: React.TouchEvent) => void;
    onTouchEnd: (event: React.TouchEvent) => void;
    onTouchCancel: (event: React.TouchEvent) => void;
  };
  /** Attach to the element whose width sets the commit distance. */
  ref: (node: HTMLElement | null) => void;
  /** Signed travel in px. Negative is leftward. `0` at rest. */
  offset: number;
  /** Which pane is showing, or `null` at rest. */
  direction: 'left' | 'right' | null;
  /** Whether the commit line has been crossed — the caller's cue to look committed. */
  armed: boolean;
  /** `0`–`1` progress toward the commit line, for opacity and scale ramps. */
  progress: number;
  /**
   * Whether the click that follows this touch should be ignored.
   *
   * A committed swipe is followed by a synthetic `click` on the same element,
   * which would otherwise also open the row it just filed away.
   */
  wasSwipe: () => boolean;
}

/** Milliseconds the click-suppression window stays open after the finger lifts. */
const CLICK_SUPPRESSION_MS = 400;

/** How long the row holds its committed offset before resetting. */
const COMMIT_HOLD_MS = 220;

type Phase = 'idle' | 'deciding' | 'horizontal' | 'latched-out';

export function useSwipeActions(options: UseSwipeActionsOptions = {}): UseSwipeActionsReturn {
  const {
    left,
    right,
    commitRatio = 0.35,
    minCommitPx = 88,
    maxTravelRatio = 0.62,
    engagePx = 14,
    engageBias = 1.6,
    scrollLatchPx = 10,
    reducedMotion = false,
    disabled = false,
  } = options;

  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const [armed, setArmed] = useState(false);

  const nodeRef = useRef<HTMLElement | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const startRef = useRef({ x: 0, y: 0 });
  /** Element width and the two derived distances, sampled once per touch. */
  const geometryRef = useRef({ commit: minCommitPx, maxTravel: minCommitPx });
  const armedRef = useRef(false);
  const swipedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /**
   * The travel `onTouchEnd` reads to pick a direction.
   *
   * Mirrored into a ref because `onTouchEnd` is spread onto an element that
   * re-renders on every pixel of travel: reading `offset` from the closure would
   * rebuild the handler object each frame, and with it every `useMemo` and
   * `useEffect` downstream of it.
   */
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  // Latest callbacks, read at commit time rather than captured, so the handlers
  // below stay referentially stable while a row's actions change underneath them.
  const actionsRef = useRef({ left, right });
  useEffect(() => {
    actionsRef.current = { left, right };
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

  /** Return to rest. Called on release below the line, on cancel, and after a commit. */
  const settle = useCallback(() => {
    phaseRef.current = 'idle';
    armedRef.current = false;
    setOffset(0);
    setDirection(null);
    setArmed(false);
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || event.touches.length !== 1) {
        phaseRef.current = 'latched-out';
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;

      // `offsetWidth` rather than a rect: a rect reports the *visual* box, so a
      // row still finishing an entrance animation would report a scaled width
      // and quietly move the commit line.
      const width = nodeRef.current?.offsetWidth ?? 0;
      geometryRef.current = {
        commit: Math.max(minCommitPx, width * commitRatio),
        maxTravel: Math.max(minCommitPx, width * maxTravelRatio),
      };

      startRef.current = { x: touch.clientX, y: touch.clientY };
      phaseRef.current = 'deciding';
      armedRef.current = false;
    },
    [commitRatio, disabled, maxTravelRatio, minCommitPx],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const phase = phaseRef.current;
      if (phase === 'idle' || phase === 'latched-out') return;

      // A second finger means a pinch, or the start of one. Hand the touch back.
      if (event.touches.length !== 1) {
        phaseRef.current = 'latched-out';
        if (phase === 'horizontal') settle();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;

      if (phase === 'deciding') {
        // Vertical intent wins the touch outright and keeps it. A scroll that
        // curves into a diagonal is still a scroll, so there is no route back
        // from here — the row cannot start sliding halfway down a flick.
        if (Math.abs(dy) >= scrollLatchPx && Math.abs(dy) >= Math.abs(dx)) {
          phaseRef.current = 'latched-out';
          return;
        }
        if (Math.abs(dx) < engagePx || Math.abs(dx) < Math.abs(dy) * engageBias) return;

        const heading = dx < 0 ? 'left' : 'right';
        if (!actionsRef.current[heading]) {
          // Nothing to reveal this way. Latch out rather than tracking a drag
          // that can never commit, so the row stays still instead of wobbling.
          phaseRef.current = 'latched-out';
          return;
        }
        phaseRef.current = 'horizontal';
        setDirection(heading);
      }

      const heading = dx < 0 ? 'left' : 'right';
      if (!actionsRef.current[heading]) {
        // The finger has crossed back past its own start into a direction with
        // no action. Hold at rest rather than following it.
        setOffset(0);
        setArmed(false);
        armedRef.current = false;
        return;
      }
      setDirection(heading);

      const { commit, maxTravel } = geometryRef.current;
      const travel = Math.min(Math.abs(dx), maxTravel);
      setOffset(dx < 0 ? -travel : travel);

      const nowArmed = travel >= commit;
      if (nowArmed !== armedRef.current) {
        armedRef.current = nowArmed;
        setArmed(nowArmed);
        // One tick on crossing the line, in either direction. This is the whole
        // reason the gesture teaches itself: the first partial drag tells the
        // finger where the commit point is without anything having happened yet.
        if (nowArmed && !reducedMotion && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(12);
        }
      }
    },
    [engageBias, engagePx, reducedMotion, scrollLatchPx, settle],
  );

  const onTouchEnd = useCallback(() => {
    const phase = phaseRef.current;
    phaseRef.current = 'idle';
    if (phase !== 'horizontal') return;

    // Any engaged swipe suppresses the click that follows it, committed or not:
    // the finger that dragged a row 40px and thought better of it did not ask to
    // open it either.
    swipedRef.current = true;
    later(() => {
      swipedRef.current = false;
    }, CLICK_SUPPRESSION_MS);

    if (!armedRef.current) {
      settle();
      return;
    }

    const heading = offsetRef.current < 0 ? 'left' : 'right';
    const action = actionsRef.current[heading];
    armedRef.current = false;

    // Hold the committed offset for a beat before resetting. The action removes
    // the row from its list, so in practice this component unmounts inside the
    // window and nothing is seen; when it does not — a rejected mutation rolling
    // back, a list that re-adds the row — the hold is what stops the row
    // snapping to centre a frame before its pane fades.
    setArmed(false);
    later(settle, COMMIT_HOLD_MS);
    action?.onCommit();
  }, [later, settle]);

  const onTouchCancel = useCallback(() => {
    const phase = phaseRef.current;
    phaseRef.current = 'idle';
    if (phase === 'horizontal') settle();
  }, [settle]);

  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const wasSwipe = useCallback(() => swipedRef.current, []);

  const { commit } = geometryRef.current;
  const progress = commit > 0 ? Math.min(1, Math.abs(offset) / commit) : 0;

  const handlers = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }),
    [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel],
  );

  return { handlers, ref, offset, direction, armed, progress, wasSwipe };
}
