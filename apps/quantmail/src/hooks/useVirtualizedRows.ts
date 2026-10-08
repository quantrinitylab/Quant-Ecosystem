// ============================================================================
// useVirtualizedRows / useMeasuredColumns — windowed rendering for large Drive
// collections (QM-M39-014). Renders only the rows intersecting the scroll
// viewport plus an overscan margin, so a folder with thousands of files keeps
// a bounded DOM.
//
// Hydration/SSR-safe: until the scroll container is measured on the client
// (measured === false) the caller renders every row in normal flow, which
// matches the server markup exactly. Virtualization only kicks in after
// measurement, and only when the row count exceeds `virtualizeAfterRows`.
// ============================================================================

import { useLayoutEffect, useState, type RefObject } from 'react';

export interface VirtualRangeInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  rowGap?: number;
  rowCount: number;
  overscanRows?: number;
}

/**
 * Pure row-window calculation — unit-testable without a DOM.
 * Returns the inclusive start row and exclusive end row to render.
 */
export function computeVirtualRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  rowGap = 0,
  rowCount,
  overscanRows = 3,
}: VirtualRangeInput): { startRow: number; endRow: number } {
  if (rowCount <= 0 || viewportHeight <= 0 || rowHeight <= 0) {
    return { startRow: 0, endRow: 0 };
  }
  const stride = rowHeight + rowGap;
  // Clamp the start into the list: scrolling past the last row yields an
  // empty window at the end, never a window beyond it.
  const startRow = Math.min(rowCount, Math.max(0, Math.floor(scrollTop / stride) - overscanRows));
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / stride) + overscanRows,
  );
  return { startRow, endRow: Math.max(endRow, startRow) };
}

export interface UseVirtualRowsOptions {
  /** Number of fixed-height rows to render. */
  rowCount: number;
  /** Fixed row height in px — every row MUST be exactly this tall. */
  rowHeight: number;
  /** Vertical gap between rows in px. */
  rowGap?: number;
  overscanRows?: number;
  /** Only virtualize beyond this many rows; smaller lists render in full. */
  virtualizeAfterRows?: number;
  scrollRef: RefObject<HTMLElement | null>;
}

export interface VirtualRows {
  /** False until the container is measured (SSR / first paint): render all rows. */
  measured: boolean;
  /** Whether windowing is active (measured AND rowCount exceeds threshold). */
  virtualized: boolean;
  startRow: number;
  endRow: number;
  /** Total content height in px for the spacer element (0 when not virtualized). */
  totalHeight: number;
}

export function useVirtualizedRows({
  rowCount,
  rowHeight,
  rowGap = 0,
  overscanRows = 3,
  virtualizeAfterRows = 40,
  scrollRef,
}: UseVirtualRowsOptions): VirtualRows {
  const [metrics, setMetrics] = useState<{
    scrollTop: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setMetrics({ scrollTop: el.scrollTop, height: el.clientHeight });
      });
    };
    measure();
    const onScroll = () => {
      setMetrics((m) => (m ? { ...m, scrollTop: el.scrollTop } : m));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [scrollRef]);

  if (!metrics) {
    return {
      measured: false,
      virtualized: false,
      startRow: 0,
      endRow: rowCount,
      totalHeight: 0,
    };
  }

  const virtualized = rowCount > virtualizeAfterRows;
  if (!virtualized) {
    return { measured: true, virtualized: false, startRow: 0, endRow: rowCount, totalHeight: 0 };
  }

  const { startRow, endRow } = computeVirtualRange({
    scrollTop: metrics.scrollTop,
    viewportHeight: metrics.height,
    rowHeight,
    rowGap,
    rowCount,
    overscanRows,
  });
  const totalHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;
  return { measured: true, virtualized: true, startRow, endRow, totalHeight };
}

export interface UseMeasuredColumnsOptions {
  scrollRef: RefObject<HTMLElement | null>;
  /** Minimum tile width in px; columns = max(1, floor((w + gap) / (min + gap))). */
  minColumnWidth: number;
  columnGap?: number;
  /** Column count used before measurement (SSR-safe fallback). */
  fallbackColumns?: number;
}

/**
 * Derives a grid column count from the measured scroll-container width.
 * Returns `fallbackColumns` until measured, so SSR/first paint stay stable.
 */
export function useMeasuredColumns({
  scrollRef,
  minColumnWidth,
  columnGap = 0,
  fallbackColumns = 4,
}: UseMeasuredColumnsOptions): { columns: number; measured: boolean } {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(el.clientWidth));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [scrollRef]);

  if (width === null || width <= 0) return { columns: fallbackColumns, measured: false };
  return {
    columns: Math.max(1, Math.floor((width + columnGap) / (minColumnWidth + columnGap))),
    measured: true,
  };
}
