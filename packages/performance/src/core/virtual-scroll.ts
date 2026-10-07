// ============================================================================
// Performance Package - Virtual Scroll
// Viewport calculation, overscan, VARIABLE height items (binary search),
// scroll anchoring, recycled item pool, momentum scrolling
// ============================================================================

import type { VirtualScrollConfig, ScrollState, VirtualScrollItem } from '../types';

/** Item height cache for variable-height items */
interface HeightCache {
  heights: number[];
  offsets: number[];
  totalHeight: number;
  lastComputedIndex: number;
}

/** Recycled DOM item pool */
interface RecyclePool {
  available: VirtualScrollItem[];
  inUse: Map<number, VirtualScrollItem>;
  maxSize: number;
}

/** Scroll anchor for maintaining position */
interface ScrollAnchor {
  index: number;
  offset: number;
  timestamp: number;
}

/**
 * VirtualScroll implements efficient rendering of large lists with variable
 * height items. Uses binary search for O(log n) offset lookup, overscan
 * buffers, scroll anchoring, and a recycled item pool.
 */
export class VirtualScroll {
  private readonly config: VirtualScrollConfig;
  private readonly heightCache: HeightCache;
  private readonly recyclePool: RecyclePool;
  private state: ScrollState;
  private anchor: ScrollAnchor | null;
  private items: unknown[];
  private lastScrollTime: number;
  private scrollVelocity: number;
  private momentumFrame: ReturnType<typeof setTimeout> | null;

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = {
      containerHeight: config.containerHeight ?? 600,
      overscan: config.overscan ?? 5,
      estimatedItemHeight: config.estimatedItemHeight ?? 50,
      enableScrollAnchoring: config.enableScrollAnchoring ?? true,
      recyclePoolSize: config.recyclePoolSize ?? 20,
      momentumDecay: config.momentumDecay ?? 0.95,
    };

    this.heightCache = {
      heights: [],
      offsets: [],
      totalHeight: 0,
      lastComputedIndex: -1,
    };

    this.recyclePool = {
      available: [],
      inUse: new Map(),
      maxSize: this.config.recyclePoolSize,
    };

    this.state = {
      scrollTop: 0,
      visibleStartIndex: 0,
      visibleEndIndex: 0,
      totalHeight: 0,
      offsetTop: 0,
      velocity: 0,
      isScrolling: false,
    };

    this.anchor = null;
    this.items = [];
    this.lastScrollTime = 0;
    this.scrollVelocity = 0;
    this.momentumFrame = null;
  }

  /**
   * Set the data items for the virtual scroll.
   */
  setItems(items: unknown[]): void {
    this.items = items;
    this.initializeHeightCache(items.length);
    this.recalculateOffsets();
    this.updateVisibleRange();
  }

  /**
   * Update the measured height for a specific item (variable heights).
   */
  setItemHeight(index: number, height: number): void {
    if (index < 0 || index >= this.heightCache.heights.length) return;

    const oldHeight = this.heightCache.heights[index];
    if (oldHeight === height) return;

    this.heightCache.heights[index] = height;

    // Recalculate offsets from the changed index onward
    this.recalculateOffsetsFrom(index);

    // Maintain scroll anchor if enabled
    if (this.config.enableScrollAnchoring && this.anchor && index < this.anchor.index) {
      const delta = height - oldHeight;
      this.state.scrollTop += delta;
    }

    this.updateVisibleRange();
  }

  /**
   * Handle scroll event - update state and compute visible range.
   * Uses binary search for finding the first visible item.
   */
  onScroll(scrollTop: number): ScrollState {
    const now = Date.now();
    const dt = now - this.lastScrollTime;

    // Calculate velocity for momentum
    if (dt > 0) {
      this.scrollVelocity = (scrollTop - this.state.scrollTop) / dt;
    }
    this.lastScrollTime = now;

    // Clamp scroll position
    this.state.scrollTop = Math.max(0, Math.min(scrollTop, this.getMaxScroll()));
    this.state.isScrolling = true;
    this.state.velocity = this.scrollVelocity;

    // Update scroll anchor
    if (this.config.enableScrollAnchoring) {
      this.updateAnchor();
    }

    // Compute visible range using binary search
    this.updateVisibleRange();

    return { ...this.state };
  }

  /**
   * Apply momentum scrolling (inertial scroll continuation).
   */
  applyMomentum(): void {
    if (Math.abs(this.scrollVelocity) < 0.1) {
      this.state.isScrolling = false;
      this.scrollVelocity = 0;
      return;
    }

    this.scrollVelocity *= this.config.momentumDecay;
    const newScrollTop = this.state.scrollTop + this.scrollVelocity * 16; // 16ms frame
    this.onScroll(newScrollTop);

    this.momentumFrame = setTimeout(() => this.applyMomentum(), 16);
  }

  /**
   * Stop momentum scrolling.
   */
  stopMomentum(): void {
    if (this.momentumFrame) {
      clearTimeout(this.momentumFrame);
      this.momentumFrame = null;
    }
    this.scrollVelocity = 0;
    this.state.isScrolling = false;
  }

  /**
   * Get the currently visible items with their positions.
   * Items are recycled from the pool when possible.
   */
  getVisibleItems(): VirtualScrollItem[] {
    const visibleItems: VirtualScrollItem[] = [];
    const { visibleStartIndex, visibleEndIndex } = this.state;

    // Include overscan
    const start = Math.max(0, visibleStartIndex - this.config.overscan);
    const end = Math.min(this.items.length - 1, visibleEndIndex + this.config.overscan);

    // Return items from used pool
    const newInUse = new Map<number, VirtualScrollItem>();

    for (let i = start; i <= end; i++) {
      // Try to reuse from pool
      let item = this.recyclePool.inUse.get(i);

      if (!item) {
        item = this.acquireFromPool(i);
      }

      item.index = i;
      item.height = this.heightCache.heights[i] ?? this.config.estimatedItemHeight;
      item.offset = this.heightCache.offsets[i] ?? 0;
      item.data = this.items[i];

      newInUse.set(i, item);
      visibleItems.push(item);
    }

    // Return unused items to pool
    for (const [idx, item] of this.recyclePool.inUse) {
      if (!newInUse.has(idx)) {
        this.returnToPool(item);
      }
    }

    this.recyclePool.inUse = newInUse;
    return visibleItems;
  }

  /**
   * Binary search to find the item index at a given scroll offset.
   * O(log n) complexity for variable-height items.
   */
  findIndexAtOffset(offset: number): number {
    const offsets = this.heightCache.offsets;
    let low = 0;
    let high = offsets.length - 1;

    if (high < 0) return 0;

    // Binary search for the first item whose offset + height > target offset
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const itemBottom = offsets[mid] + (this.heightCache.heights[mid] ?? this.config.estimatedItemHeight);

      if (itemBottom <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /**
   * Get the current scroll state.
   */
  getState(): ScrollState {
    return { ...this.state };
  }

  /**
   * Get total scrollable height.
   */
  getTotalHeight(): number {
    return this.heightCache.totalHeight;
  }

  /**
   * Scroll to a specific item index.
   */
  scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start'): ScrollState {
    const clampedIndex = Math.max(0, Math.min(index, this.items.length - 1));
    const itemOffset = this.heightCache.offsets[clampedIndex] ?? 0;
    const itemHeight = this.heightCache.heights[clampedIndex] ?? this.config.estimatedItemHeight;

    let scrollTop: number;
    switch (align) {
      case 'start':
        scrollTop = itemOffset;
        break;
      case 'center':
        scrollTop = itemOffset - (this.config.containerHeight - itemHeight) / 2;
        break;
      case 'end':
        scrollTop = itemOffset - this.config.containerHeight + itemHeight;
        break;
    }

    return this.onScroll(Math.max(0, scrollTop));
  }

  /**
   * Scroll to a specific pixel offset.
   */
  scrollToOffset(offset: number): ScrollState {
    return this.onScroll(offset);
  }

  /**
   * Get the offset for a given item index.
   */
  getItemOffset(index: number): number {
    return this.heightCache.offsets[index] ?? 0;
  }

  /**
   * Get item count.
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Get recycle pool statistics.
   */
  getPoolStats(): { available: number; inUse: number; maxSize: number } {
    return {
      available: this.recyclePool.available.length,
      inUse: this.recyclePool.inUse.size,
      maxSize: this.recyclePool.maxSize,
    };
  }

  /**
   * Reset the virtual scroll state.
   */
  reset(): void {
    this.items = [];
    this.heightCache.heights = [];
    this.heightCache.offsets = [];
    this.heightCache.totalHeight = 0;
    this.heightCache.lastComputedIndex = -1;
    this.recyclePool.available = [];
    this.recyclePool.inUse.clear();
    this.state.scrollTop = 0;
    this.state.visibleStartIndex = 0;
    this.state.visibleEndIndex = 0;
    this.state.totalHeight = 0;
    this.anchor = null;
    this.stopMomentum();
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Initialize height cache with estimated heights */
  private initializeHeightCache(count: number): void {
    this.heightCache.heights = new Array(count).fill(this.config.estimatedItemHeight);
    this.heightCache.offsets = new Array(count).fill(0);
    this.heightCache.lastComputedIndex = -1;
  }

  /** Recalculate all offsets (prefix sum of heights) */
  private recalculateOffsets(): void {
    this.recalculateOffsetsFrom(0);
  }

  /** Recalculate offsets starting from a given index */
  private recalculateOffsetsFrom(startIndex: number): void {
    const heights = this.heightCache.heights;
    const offsets = this.heightCache.offsets;

    if (heights.length === 0) {
      this.heightCache.totalHeight = 0;
      return;
    }

    // Set first offset
    if (startIndex === 0) {
      offsets[0] = 0;
      startIndex = 1;
    }

    // Compute prefix sums from startIndex
    for (let i = startIndex; i < heights.length; i++) {
      offsets[i] = offsets[i - 1] + heights[i - 1];
    }

    // Update total height
    const lastIdx = heights.length - 1;
    this.heightCache.totalHeight = offsets[lastIdx] + heights[lastIdx];
    this.state.totalHeight = this.heightCache.totalHeight;
    this.heightCache.lastComputedIndex = lastIdx;
  }

  /** Update visible range using binary search */
  private updateVisibleRange(): void {
    if (this.items.length === 0) {
      this.state.visibleStartIndex = 0;
      this.state.visibleEndIndex = 0;
      return;
    }

    // Binary search for first visible item
    const startIndex = this.findIndexAtOffset(this.state.scrollTop);

    // Find last visible item
    const viewportBottom = this.state.scrollTop + this.config.containerHeight;
    const endIndex = this.findIndexAtOffset(viewportBottom);

    this.state.visibleStartIndex = startIndex;
    this.state.visibleEndIndex = Math.min(endIndex, this.items.length - 1);
    this.state.offsetTop = this.heightCache.offsets[startIndex] ?? 0;
  }

  /** Update scroll anchor for maintaining position during layout shifts */
  private updateAnchor(): void {
    const { visibleStartIndex } = this.state;
    const itemOffset = this.heightCache.offsets[visibleStartIndex] ?? 0;

    this.anchor = {
      index: visibleStartIndex,
      offset: this.state.scrollTop - itemOffset,
      timestamp: Date.now(),
    };
  }

  /** Get maximum scroll position */
  private getMaxScroll(): number {
    return Math.max(0, this.heightCache.totalHeight - this.config.containerHeight);
  }

  /** Acquire a virtual scroll item from the recycle pool */
  private acquireFromPool(index: number): VirtualScrollItem {
    if (this.recyclePool.available.length > 0) {
      const item = this.recyclePool.available.pop()!;
      item.recycled = true;
      return item;
    }

    // Create new item
    return {
      index,
      height: this.config.estimatedItemHeight,
      offset: 0,
      data: null,
      recycled: false,
    };
  }

  /** Return an item to the recycle pool */
  private returnToPool(item: VirtualScrollItem): void {
    if (this.recyclePool.available.length < this.recyclePool.maxSize) {
      item.data = null;
      item.recycled = true;
      this.recyclePool.available.push(item);
    }
  }
}
