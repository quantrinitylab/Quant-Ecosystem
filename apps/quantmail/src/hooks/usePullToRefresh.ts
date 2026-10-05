'use client';

/**
 * usePullToRefresh — touch pull-to-refresh for the inbox scroll container.
 *
 * The gesture core lives in `../lib/pull-to-refresh-machine` (pure,
 * unit-tested); this hook is the React binding plus the refresh lifecycle.
 *
 * Contract:
 * - Arms only when the container is scrolled to the very top (`scrollTop <= 0`
 *   at touchstart) and the finger pulls downward. Anywhere else, the touch is a
 *   scroll and is never claimed.
 * - Release past the line fires the caller's `onRefresh` exactly once and the
 *   spinner holds until that promise settles (minimum 450ms so it never
 *   flickers on a fast cache hit).
 * - The refresh is a *background* refresh: the existing rows stay mounted while
 *   the spinner runs — no skeleton wall, the content morphs in place when new
 *   data lands. (Gmail blanks to skeletons; we don't.)
 * - Touch-only: the handlers are `onTouch*`, and they refuse to engage unless
 *   the device reports a coarse pointer, so desktop scroll behaviour is
 *   completely untouched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PullToRefreshMachine } from '../lib/pull-to-refresh-machine';
import { isCoarsePointer } from '../components/SwipeableEmailRow';

/** Minimum ms the spinner stays visible, so a fast refresh never flickers. */
const MIN_SPINNER_MS = 450;

export interface UsePullToRefreshOptions {
  /** The real refetch. May be async; the spinner holds until it settles. */
  onRefresh: () => Promise<unknown> | void;
  /** Turn the gesture off without changing the call shape. */
  disabled?: boolean;
}

export interface UsePullToRefreshReturn {
  /** Spread onto the scroll container. */
  listProps: {
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchMove: (event: React.TouchEvent) => void;
    onTouchEnd: (event: React.TouchEvent) => void;
    onTouchCancel: (event: React.TouchEvent) => void;
  };
  /** Current indicator travel in px. `0` at rest. */
  pullDistance: number;
  /** Whether a refresh is in flight. */
  isRefreshing: boolean;
  /** Imperative refresh (e.g. for a global refresh event): spinner + refetch. */
  triggerRefresh: () => void;
}

export function usePullToRefresh(options: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const { onRefresh, disabled = false } = options;

  const machineRef = useRef<PullToRefreshMachine | null>(null);
  if (!machineRef.current) machineRef.current = new PullToRefreshMachine();

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** Ref mirror of `isRefreshing` so `triggerRefresh` stays referentially stable. */
  const refreshingRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Latest callback, read when the refresh fires rather than captured.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current = [];
    },
    [],
  );

  const sync = useCallback(() => {
    const machine = machineRef.current;
    if (machine) setPullDistance(machine.snapshot.pullDistance);
  }, []);

  const finishRefresh = useCallback(
    (startedAt: number) => {
      const wait = Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt));
      const timer = setTimeout(() => {
        timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
        machineRef.current?.complete();
        refreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
      }, wait);
      timersRef.current.push(timer);
    },
    [],
  );

  const runRefresh = useCallback(() => {
    const startedAt = Date.now();
    refreshingRef.current = true;
    setIsRefreshing(true);
    setPullDistance(44);
    let result: Promise<unknown> | void;
    try {
      result = onRefreshRef.current();
    } catch {
      result = undefined;
    }
    Promise.resolve(result).then(
      () => finishRefresh(startedAt),
      () => finishRefresh(startedAt),
    );
  }, [finishRefresh]);

  const triggerRefresh = useCallback(() => {
    if (disabled || refreshingRef.current) return;
    machineRef.current?.reset();
    runRefresh();
  }, [disabled, runRefresh]);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      const machine = machineRef.current;
      if (!machine || disabled || !isCoarsePointer()) return;
      const target = event.currentTarget as HTMLElement | null;
      const touch = event.touches[0];
      if (!target || !touch) return;
      machine.touchstart(target.scrollTop, touch.clientY);
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
      machine.touchmove(touch.clientY, event.touches.length);
      sync();
    },
    [disabled, sync],
  );

  const onTouchEnd = useCallback(() => {
    const machine = machineRef.current;
    if (!machine || disabled) return;
    if (machine.touchend()) runRefresh();
    else sync();
  }, [disabled, runRefresh, sync]);

  const onTouchCancel = useCallback(() => {
    const machine = machineRef.current;
    if (!machine) return;
    machine.touchcancel();
    sync();
  }, [sync]);

  return {
    listProps: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    pullDistance,
    isRefreshing,
    triggerRefresh,
  };
}
