// ============================================================================
// @quant/shared-ui - Advanced Virtual List (Windowed Rendering)
// ============================================================================

import { VirtualItem, ScrollState, VirtualListConfig } from './types';

interface VirtualRange {
  startIndex: number;
  endIndex: number;
  overscanStart: number;
  overscanEnd: number;
}

interface ScrollAnchor {
  index: number;
  offset: number;
}

type ScrollListener = (state: ScrollState) => void;
type RangeListener = (items: VirtualItem[]) => void;

export class VirtualList {
  private config: VirtualListConfig;
  private measuredSizes: Map<number, number> = new Map();
  private offsetCache: Map<number, number> = new Map();
  private totalSize: number = 0;
  private scrollState: ScrollState;
  private containerSize: number = 0;
  private visibleRange: VirtualRange;
  private stickyIndices: Set<number>;
  private scrollListeners: Set<ScrollListener> = new Set();
  private rangeListeners: Set<RangeListener> = new Set();
  private lastScrollOffset: number = 0;
  private scrollAnchor: ScrollAnchor | null = null;
  private recycledItems: VirtualItem[] = [];
  private savedScrollPosition: number | null = null;
  private scrollTimeout: any = null;
  private scrollVelocity: number = 0;
  private lastScrollTime: number = 0;

  constructor(config: VirtualListConfig, containerSize: number) {
    this.config = {
      overscan: 5,
      ...config,
    };
    this.containerSize = containerSize;
    this.stickyIndices = new Set(config.stickyIndices || []);
    this.scrollState = {
      offset: 0,
      direction: 'forward',
      isScrolling: false,
      velocity: 0,
    };
    this.visibleRange = { startIndex: 0, endIndex: 0, overscanStart: 0, overscanEnd: 0 };
    this.calculateTotalSize();
    this.updateVisibleRange();
  }

  // Calculate total list height/width
  private calculateTotalSize(): void {
    let total = 0;
    for (let i = 0; i < this.config.itemCount; i++) {
      const size = this.getItemSize(i);
      this.offsetCache.set(i, total);
      total += size;
    }
    this.totalSize = total;
  }

  // Get size of item (measured or estimated)
  private getItemSize(index: number): number {
    return this.measuredSizes.get(index) || this.config.estimatedItemSize;
  }

  // Get item key
  private getItemKey(index: number): string {
    if (this.config.getItemKey) return this.config.getItemKey(index);
    return `item-${index}`;
  }

  // Binary search to find the start index for a given scroll offset
  private findStartIndex(offset: number): number {
    let low = 0;
    let high = this.config.itemCount - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const itemOffset = this.getItemOffset(mid);
      const itemEnd = itemOffset + this.getItemSize(mid);

      if (itemEnd <= offset) {
        low = mid + 1;
      } else if (itemOffset > offset) {
        high = mid - 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, low);
  }

  // Get offset for an item by index
  private getItemOffset(index: number): number {
    const cached = this.offsetCache.get(index);
    if (cached !== undefined) return cached;

    // Calculate from closest known offset
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += this.getItemSize(i);
    }
    this.offsetCache.set(index, offset);
    return offset;
  }

  // Update the visible range based on scroll position
  private updateVisibleRange(): void {
    const { offset } = this.scrollState;
    const overscan = this.config.overscan || 5;

    const startIndex = this.findStartIndex(offset);
    let endIndex = startIndex;
    let accumulatedSize = this.getItemOffset(startIndex) - offset;

    while (endIndex < this.config.itemCount && accumulatedSize < this.containerSize) {
      accumulatedSize += this.getItemSize(endIndex);
      endIndex++;
    }

    // Add overscan
    const overscanStart = Math.max(0, startIndex - overscan);
    const overscanEnd = Math.min(this.config.itemCount - 1, endIndex + overscan);

    this.visibleRange = { startIndex, endIndex, overscanStart, overscanEnd };
  }

  // Get items to render (including overscan and sticky)
  getVisibleItems(): VirtualItem[] {
    const items: VirtualItem[] = [];
    const { overscanStart, overscanEnd } = this.visibleRange;

    // Add sticky items that are above the visible range
    for (const stickyIndex of this.stickyIndices) {
      if (stickyIndex < overscanStart) {
        const stickyOffset = this.getItemOffset(stickyIndex);
        if (stickyOffset < this.scrollState.offset) {
          items.push({
            index: stickyIndex,
            offset: this.scrollState.offset, // Stick to top
            size: this.getItemSize(stickyIndex),
            key: this.getItemKey(stickyIndex),
            isSticky: true,
          });
        }
      }
    }

    // Add visible range items (with recycling)
    for (let i = overscanStart; i <= overscanEnd; i++) {
      const item: VirtualItem = {
        index: i,
        offset: this.getItemOffset(i),
        size: this.getItemSize(i),
        key: this.getItemKey(i),
        isSticky: this.stickyIndices.has(i),
      };
      items.push(item);
    }

    return items;
  }

  // Handle scroll event
  onScroll(offset: number): void {
    const now = Date.now();
    const timeDelta = now - this.lastScrollTime;
    const direction = offset > this.lastScrollOffset ? 'forward' : 'backward';

    // Calculate velocity
    if (timeDelta > 0) {
      this.scrollVelocity = Math.abs(offset - this.lastScrollOffset) / timeDelta;
    }

    this.scrollState = {
      offset,
      direction,
      isScrolling: true,
      velocity: this.scrollVelocity,
    };

    this.lastScrollOffset = offset;
    this.lastScrollTime = now;

    // Update visible range
    this.updateVisibleRange();

    // Notify listeners
    this.notifyScrollListeners();
    this.notifyRangeListeners();

    // Set scrolling timeout
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.scrollState.isScrolling = false;
      this.scrollState.velocity = 0;
      this.notifyScrollListeners();
    }, 150);
  }

  // Measure item after render (for variable height items)
  measureItem(index: number, size: number): void {
    const previousSize = this.measuredSizes.get(index);
    if (previousSize === size) return;

    this.measuredSizes.set(index, size);

    // Invalidate offset cache for items after this one
    for (let i = index + 1; i < this.config.itemCount; i++) {
      this.offsetCache.delete(i);
    }

    // Recalculate total size
    this.recalculateTotalSize();
    this.updateVisibleRange();
    this.notifyRangeListeners();
  }

  // Efficient total size recalculation
  private recalculateTotalSize(): void {
    let total = 0;
    for (let i = 0; i < this.config.itemCount; i++) {
      const size = this.getItemSize(i);
      this.offsetCache.set(i, total);
      total += size;
    }
    this.totalSize = total;
  }

  // Scroll to specific index
  scrollToIndex(index: number, alignment: 'start' | 'center' | 'end' = 'start'): number {
    const itemOffset = this.getItemOffset(index);
    const itemSize = this.getItemSize(index);

    let scrollOffset: number;
    switch (alignment) {
      case 'center':
        scrollOffset = itemOffset - (this.containerSize - itemSize) / 2;
        break;
      case 'end':
        scrollOffset = itemOffset - this.containerSize + itemSize;
        break;
      case 'start':
      default:
        scrollOffset = itemOffset;
    }

    scrollOffset = Math.max(0, Math.min(scrollOffset, this.totalSize - this.containerSize));
    this.onScroll(scrollOffset);
    return scrollOffset;
  }

  // Save scroll position for restoration
  saveScrollPosition(): void {
    this.savedScrollPosition = this.scrollState.offset;
    // Save anchor (closest visible item)
    const startIndex = this.visibleRange.startIndex;
    const itemOffset = this.getItemOffset(startIndex);
    this.scrollAnchor = {
      index: startIndex,
      offset: this.scrollState.offset - itemOffset,
    };
  }

  // Restore saved scroll position
  restoreScrollPosition(): number | null {
    if (this.savedScrollPosition !== null) {
      const offset = this.savedScrollPosition;
      this.onScroll(offset);
      this.savedScrollPosition = null;
      return offset;
    }
    if (this.scrollAnchor) {
      const itemOffset = this.getItemOffset(this.scrollAnchor.index);
      const offset = itemOffset + this.scrollAnchor.offset;
      this.onScroll(offset);
      this.scrollAnchor = null;
      return offset;
    }
    return null;
  }

  // Handle item count change (items added/removed)
  setItemCount(count: number): void {
    const previousCount = this.config.itemCount;
    this.config.itemCount = count;

    if (count < previousCount) {
      // Remove measurements for deleted items
      for (let i = count; i < previousCount; i++) {
        this.measuredSizes.delete(i);
        this.offsetCache.delete(i);
      }
    }

    this.recalculateTotalSize();
    this.updateVisibleRange();
    this.notifyRangeListeners();
  }

  // Prepend items (maintain scroll position)
  prependItems(count: number): number {
    // Shift all measurements
    const newMeasuredSizes = new Map<number, number>();
    this.measuredSizes.forEach((size, index) => {
      newMeasuredSizes.set(index + count, size);
    });
    this.measuredSizes = newMeasuredSizes;
    this.offsetCache.clear();
    this.config.itemCount += count;

    // Maintain scroll position by adjusting offset
    const offsetShift = count * this.config.estimatedItemSize;
    this.recalculateTotalSize();

    const newOffset = this.scrollState.offset + offsetShift;
    this.onScroll(newOffset);
    return newOffset;
  }

  // Append items
  appendItems(count: number): void {
    this.config.itemCount += count;
    this.recalculateTotalSize();
    this.updateVisibleRange();
    this.notifyRangeListeners();
  }

  // Get total estimated size
  getTotalSize(): number {
    return this.totalSize;
  }

  // Get scroll state
  getScrollState(): ScrollState {
    return { ...this.scrollState };
  }

  // Get visible range info
  getVisibleRange(): { start: number; end: number } {
    return {
      start: this.visibleRange.startIndex,
      end: this.visibleRange.endIndex,
    };
  }

  // Update container size (on resize)
  setContainerSize(size: number): void {
    this.containerSize = size;
    this.updateVisibleRange();
    this.notifyRangeListeners();
  }

  // Check if item is measured
  isItemMeasured(index: number): boolean {
    return this.measuredSizes.has(index);
  }

  // Get measurement stats
  getMeasurementStats(): { measured: number; total: number; coverage: number } {
    const measured = this.measuredSizes.size;
    const total = this.config.itemCount;
    return { measured, total, coverage: total > 0 ? measured / total : 0 };
  }

  // Subscribe to scroll changes
  onScrollChange(listener: ScrollListener): () => void {
    this.scrollListeners.add(listener);
    return () => this.scrollListeners.delete(listener);
  }

  // Subscribe to visible range changes
  onRangeChange(listener: RangeListener): () => void {
    this.rangeListeners.add(listener);
    return () => this.rangeListeners.delete(listener);
  }

  // Notify scroll listeners
  private notifyScrollListeners(): void {
    const state = { ...this.scrollState };
    this.scrollListeners.forEach((listener) => listener(state));
  }

  // Notify range listeners
  private notifyRangeListeners(): void {
    const items = this.getVisibleItems();
    this.rangeListeners.forEach((listener) => listener(items));
  }

  // Reset all measurements
  resetMeasurements(): void {
    this.measuredSizes.clear();
    this.offsetCache.clear();
    this.calculateTotalSize();
    this.updateVisibleRange();
    this.notifyRangeListeners();
  }

  // Recycling - get a recycled item descriptor or create new
  getRecycledItem(): VirtualItem | null {
    return this.recycledItems.pop() || null;
  }

  recycleItem(item: VirtualItem): void {
    if (this.recycledItems.length < 50) {
      // Cap recycle pool
      this.recycledItems.push(item);
    }
  }

  destroy(): void {
    this.scrollListeners.clear();
    this.rangeListeners.clear();
    this.measuredSizes.clear();
    this.offsetCache.clear();
    this.recycledItems = [];
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
  }
}

export default VirtualList;
