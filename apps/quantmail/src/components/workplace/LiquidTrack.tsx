'use client';

/**
 * LiquidTrack — React host for the Quant Workplace connected tab
 * (`lib/liquid-bar/liquid-bar.ts`).
 *
 * Renders ONE empty, absolutely positioned layer that fills its positioned
 * parent; the LiquidBar class draws the glass bar and the raised tab into that
 * layer and nothing else. React never renders children into it, so the two
 * never fight over DOM nodes. Put the bar's buttons in a sibling grid with the
 * same padding (`pad`) and equal cells, above this layer.
 *
 * Server render and the first client frame show the layer empty (the parent's
 * own background shows through); the bar mounts in a layout effect. Without
 * ResizeObserver (old engines, unit-test DOMs) the layer simply stays empty.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { LiquidBar, type LiquidConfig } from '../../lib/liquid-bar/liquid-bar';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface LiquidTrackProps extends Omit<LiquidConfig, 'count'> {
  /** Number of equal segments along the bar. */
  count: number;
  /** Active segment; -1 or out of range clamps to the nearest end. */
  index: number;
  className?: string;
  /** Test hook. */
  testId?: string;
}

export function LiquidTrack({ count, index, className = '', testId, ...cfg }: LiquidTrackProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<LiquidBar | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const countRef = useRef(count);
  countRef.current = count;
  // Geometry changes are rare (orientation, thickness); rebuild only then.
  const cfgKey = JSON.stringify(cfg);

  useIsoLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    let bar: LiquidBar;
    try {
      bar = new LiquidBar(host, { ...(JSON.parse(cfgKey) as Omit<LiquidConfig, 'count'>), count: countRef.current });
    } catch {
      return; // no SVG/DOM support: the parent's plain background stays
    }
    bar.setIndex(indexRef.current, false);
    barRef.current = bar;
    return () => {
      bar.dispose();
      if (barRef.current === bar) barRef.current = null;
    };
  }, [cfgKey]);

  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (bar.count !== count) bar.setCount(count, index);
    else if (bar.index !== index) bar.setIndex(index);
  }, [count, index]);

  return <div ref={hostRef} aria-hidden="true" data-testid={testId} className={`lq-layer ${className}`} />;
}

export default LiquidTrack;
