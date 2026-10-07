'use client';

/**
 * A dependency-free windowing virtualizer for vertical lists.
 *
 * QuantMail renders conversation rows that each mount a motion element, a hover
 * action bar and a snooze popover. At a few hundred rows that is already tens of
 * thousands of nodes; the inbox is specified to stay fluid at ten thousand. This
 * hook keeps only the visible window plus an overscan margin mounted.
 *
 * Why hand-rolled rather than a library: the monorepo ships to EKS through a
 * pinned lockfile, and this is ~1 kB of logic with no transitive surface. It
 * measures rows for real rather than trusting a fixed height, so `rem`-based
 * row sizing, browser zoom, the `is-unread` variant and responsive breakpoints
 * all stay correct without hard-coded pixel constants.
 *
 * Positioning uses a single translated container rather than per-row absolute
 * offsets, so the browser composites one transform per scroll frame instead of
 * laying out every visible row.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface VirtualItem {
  index: number;
  key: string | number;
  /** Offset in pixels from the top of the scrollable content. */
  start: number;
  size: number;
  end: number;
  /** True until the row has been measured and is still using the estimate. */
  isEstimated: boolean;
}

export interface UseVirtualizerOptions {
  /** Total number of rows in the underlying data. */
  count: number;
  /**
   * The scroll container. Pass it as state (via {@link useScrollElement}) rather
   * than a ref, so the virtualizer re-measures the moment the element mounts —
   * the list is behind loading and empty states, so it is not there on first
   * render.
   */
  scrollElement: HTMLElement | null;
  /**
   * Height guess for rows that have not been measured yet. A constant is
   * cheapest; a function lets variable-height rows converge faster.
   */
  estimateSize: number | ((index: number) => number);
  /** Extra rows rendered above and below the viewport. Defaults to `6`. */
  overscan?: number;
  /**
   * Stable identity per row. Sizes are cached against this, so an item keeps its
   * measured height when the list is filtered or re-sorted.
   */
  getItemKey?: (index: number) => string | number;
  /** Vertical gap between rows, in pixels. */
  gap?: number;
  /** Padding inside the scrollable content, above the first row. */
  paddingStart?: number;
  /** Padding inside the scrollable content, below the last row. */
  paddingEnd?: number;
  /**
   * Set to `false` to render every row — used below the threshold where
   * windowing costs more than it saves, and to keep tests simple.
   */
  enabled?: boolean;
}

export interface Virtualizer {
  /** Rows to render this frame, in index order. */
  items: VirtualItem[];
  /** Height the scrollable content must reserve. */
  totalSize: number;
  /** Translate to apply to the rendered window's container. */
  offsetTop: number;
  /** React 19 ref callback: attach to each row's outermost element. */
  measureRow: (index: number) => (node: HTMLElement | null) => void;
  /** Bring a row into view. `auto` scrolls the minimum distance needed. */
  scrollToIndex: (index: number, options?: ScrollToIndexOptions) => void;
  scrollToTop: () => void;
  /** Inclusive index range currently mounted. */
  range: { start: number; end: number };
  /** False when windowing is disabled and every row is rendered. */
  isVirtualized: boolean;
}

export interface ScrollToIndexOptions {
  align?: 'auto' | 'start' | 'center' | 'end';
  behavior?: ScrollBehavior;
  /** Pixels of breathing room kept between the row and the viewport edge. */
  margin?: number;
}

/**
 * Largest index whose start offset is at or before `offset`.
 * Binary search keeps scrolling O(log n) rather than O(n) in the row count.
 */
function findStartIndex(offsets: Float64Array, offset: number, count: number): number {
  let low = 0;
  let high = count - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export function useVirtualizer(options: UseVirtualizerOptions): Virtualizer {
  const {
    count,
    scrollElement,
    estimateSize,
    overscan = 6,
    getItemKey,
    gap = 0,
    paddingStart = 0,
    paddingEnd = 0,
    enabled = true,
  } = options;

  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewportSize, setViewportSize] = useState(0);
  /** Bumped when measured sizes change, to recompute the layout. */
  const [measureVersion, setMeasureVersion] = useState(0);

  /** Measured heights, keyed by item identity so they survive re-ordering. */
  const sizeCacheRef = useRef(new Map<string | number, number>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeIndexRef = useRef(new WeakMap<Element, number>());
  const flushHandleRef = useRef<number | null>(null);

  const keyOf = useCallback(
    (index: number): string | number => (getItemKey ? getItemKey(index) : index),
    [getItemKey],
  );

  const estimateOf = useCallback(
    (index: number): number => (typeof estimateSize === 'function' ? estimateSize(index) : estimateSize),
    [estimateSize],
  );

  /**
   * Prefix sums of row offsets: `offsets[i]` is where row `i` starts.
   * Rebuilt only when the count, spacing or a measured size changes — never on
   * scroll.
   */
  const layout = useMemo(() => {
    const offsets = new Float64Array(count + 1);
    const sizes = new Float64Array(count);
    const estimated = new Uint8Array(count);
    const cache = sizeCacheRef.current;

    let cursor = paddingStart;
    for (let i = 0; i < count; i += 1) {
      const cached = cache.get(keyOf(i));
      const size = cached ?? estimateOf(i);
      if (cached === undefined) estimated[i] = 1;
      offsets[i] = cursor;
      sizes[i] = size;
      cursor += size + gap;
    }
    // Trailing gap belongs to no row; drop it before the end padding.
    offsets[count] = count > 0 ? cursor - gap + paddingEnd : paddingStart + paddingEnd;

    return { offsets, sizes, estimated, totalSize: offsets[count] };
    // `measureVersion` is the invalidation signal for `sizeCacheRef`.
  }, [count, gap, paddingStart, paddingEnd, keyOf, estimateOf, measureVersion]);

  // ─────────────────────────────── measurement ──────────────────────────────

  /**
   * Apply measured heights in one batch on the next frame. Mounting a window of
   * rows produces one ResizeObserver entry each; committing them individually
   * would re-render once per row.
   */
  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = requestAnimationFrame(() => {
      flushHandleRef.current = null;
      setMeasureVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const index = nodeIndexRef.current.get(entry.target);
        if (index === undefined) continue;

        // `borderBoxSize` avoids a forced reflow; fall back for older engines.
        const box = entry.borderBoxSize?.[0];
        const height = box ? box.blockSize : (entry.target as HTMLElement).offsetHeight;
        if (height <= 0) continue;

        const key = keyOf(index);
        if (sizeCacheRef.current.get(key) !== height) {
          sizeCacheRef.current.set(key, height);
          changed = true;
        }
      }
      if (changed) scheduleFlush();
    });

    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (flushHandleRef.current !== null) {
        cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = null;
      }
    };
  }, [keyOf, scheduleFlush]);

  /**
   * Ref callback factory for row elements. Uses React 19's ref cleanup so a row
   * leaving the window is unobserved immediately rather than lingering as a
   * detached node inside the observer.
   */
  const measureRow = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      if (!node) return;
      nodeIndexRef.current.set(node, index);
      const observer = observerRef.current;
      if (!observer) {
        // No ResizeObserver (or not yet created): take a one-shot measurement.
        const height = node.offsetHeight;
        if (height > 0 && sizeCacheRef.current.get(keyOf(index)) !== height) {
          sizeCacheRef.current.set(keyOf(index), height);
          scheduleFlush();
        }
        return;
      }
      observer.observe(node);
      return () => {
        observer.unobserve(node);
        nodeIndexRef.current.delete(node);
      };
    },
    [keyOf, scheduleFlush],
  );

  // ──────────────────────────── scroll & viewport ───────────────────────────

  useIsomorphicLayoutEffect(() => {
    const element = scrollElement;
    if (!element) return;

    let frame: number | null = null;
    // The scroll handler only stores a number; the render is deferred to the
    // next animation frame so a fast wheel spin cannot queue more renders than
    // the display can show.
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setScrollOffset(element.scrollTop);
      });
    };

    setScrollOffset(element.scrollTop);
    setViewportSize(element.clientHeight);
    element.addEventListener('scroll', onScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        setViewportSize(element.clientHeight);
        setScrollOffset(element.scrollTop);
      });
      resizeObserver.observe(element);
    }

    return () => {
      element.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollElement]);

  // ────────────────────────────── visible window ────────────────────────────

  const range = useMemo(() => {
    if (!enabled || count === 0) return { start: 0, end: count - 1 };

    // Before the first layout pass the viewport height is unknown; render a
    // conservative first screen so server output and hydration agree.
    const height = viewportSize > 0 ? viewportSize : 900;
    const first = findStartIndex(layout.offsets, scrollOffset, count);
    let last = first;
    const limit = scrollOffset + height;
    while (last < count - 1 && layout.offsets[last + 1] < limit) last += 1;

    return {
      start: Math.max(0, first - overscan),
      end: Math.min(count - 1, last + overscan),
    };
  }, [enabled, count, viewportSize, scrollOffset, layout, overscan]);

  const items = useMemo(() => {
    const result: VirtualItem[] = [];
    if (count === 0) return result;
    for (let index = range.start; index <= range.end; index += 1) {
      result.push({
        index,
        key: keyOf(index),
        start: layout.offsets[index],
        size: layout.sizes[index],
        end: layout.offsets[index] + layout.sizes[index],
        isEstimated: layout.estimated[index] === 1,
      });
    }
    return result;
  }, [count, range, layout, keyOf]);

  // ──────────────────────────────── scrolling ───────────────────────────────

  const scrollToIndex = useCallback(
    (index: number, { align = 'auto', behavior = 'auto', margin = 8 }: ScrollToIndexOptions = {}) => {
      const element = scrollElement;
      if (!element || index < 0 || index >= count) return;

      const start = layout.offsets[index];
      const size = layout.sizes[index];
      const viewport = element.clientHeight;
      const current = element.scrollTop;

      let target: number;
      switch (align) {
        case 'start':
          target = start - margin;
          break;
        case 'end':
          target = start + size - viewport + margin;
          break;
        case 'center':
          target = start - viewport / 2 + size / 2;
          break;
        default: {
          // Scroll the least amount that fully reveals the row.
          if (start - margin < current) target = start - margin;
          else if (start + size + margin > current + viewport) {
            target = start + size - viewport + margin;
          } else return;
        }
      }

      const max = Math.max(0, layout.totalSize - viewport);
      element.scrollTo({ top: Math.min(Math.max(0, target), max), behavior });
    },
    [count, layout, scrollElement],
  );

  const scrollToTop = useCallback(() => {
    scrollElement?.scrollTo({ top: 0 });
  }, [scrollElement]);

  return {
    items,
    totalSize: layout.totalSize,
    offsetTop: items.length > 0 ? items[0].start : 0,
    measureRow,
    scrollToIndex,
    scrollToTop,
    range,
    isVirtualized: enabled,
  };
}

/**
 * Track a scroll container as both state and a ref.
 *
 * The virtualizer needs the element as *state* so it re-runs when the container
 * mounts, while imperative callers (pull-to-refresh reading `scrollTop` inside a
 * touch handler) need a ref they can read without re-subscribing. This returns
 * both, backed by one callback ref.
 */
export function useScrollElement<T extends HTMLElement = HTMLDivElement>(): {
  element: T | null;
  ref: (node: T | null) => void;
  elementRef: { current: T | null };
} {
  const [element, setElement] = useState<T | null>(null);
  const elementRef = useRef<T | null>(null);

  const ref = useCallback((node: T | null) => {
    elementRef.current = node;
    setElement(node);
  }, []);

  return { element, ref, elementRef };
}
