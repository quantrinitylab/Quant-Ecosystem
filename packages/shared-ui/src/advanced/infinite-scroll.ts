// ============================================================================
// @quant/shared-ui - Advanced Infinite Scroll System
// ============================================================================

import { InfiniteScrollState, IntersectionEntry, InfiniteScrollConfig, DOMRectLike } from './types';

type LoadMoreHandler = (
  page: number,
  direction: 'forward' | 'backward',
) => Promise<{ items: any[]; hasMore: boolean }>;
type StateListener = (state: InfiniteScrollState) => void;

interface ScrollAnchor {
  itemIndex: number;
  offsetFromTop: number;
}

export class InfiniteScroll {
  private state: InfiniteScrollState;
  private config: InfiniteScrollConfig;
  private loadMoreHandler: LoadMoreHandler | null = null;
  private listeners: Set<StateListener> = new Set();
  private sentinels: Map<string, IntersectionEntry> = new Map();
  private debounceTimer: any = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private scrollAnchor: ScrollAnchor | null = null;
  private scrollTop: number = 0;
  private itemHeights: number[] = [];
  private totalPages: number = Infinity;

  constructor(config: InfiniteScrollConfig = {}) {
    this.config = {
      threshold: 0.1,
      rootMargin: '200px',
      initialPage: 1,
      pageSize: 20,
      bidirectional: false,
      debounceMs: 100,
      ...config,
    };
    this.state = {
      page: this.config.initialPage || 1,
      totalItems: 0,
      hasMore: true,
      isLoading: false,
      error: null,
      itemCount: 0,
    };
  }

  // Set the load more callback
  setLoadHandler(handler: LoadMoreHandler): void {
    this.loadMoreHandler = handler;
  }

  // Configure sentinel observation (bottom sentinel)
  observeSentinel(id: string, rect: DOMRectLike): void {
    const entry: IntersectionEntry = {
      id,
      isIntersecting: false,
      ratio: 0,
      boundingRect: rect,
    };
    this.sentinels.set(id, entry);
  }

  // Update sentinel intersection state
  updateIntersection(id: string, isIntersecting: boolean, ratio: number): void {
    const entry = this.sentinels.get(id);
    if (!entry) return;

    entry.isIntersecting = isIntersecting;
    entry.ratio = ratio;

    if (isIntersecting && !this.state.isLoading && this.state.hasMore && !this.state.error) {
      this.debouncedLoadMore(id === 'top-sentinel' ? 'backward' : 'forward');
    }
  }

  // Debounced load more trigger
  private debouncedLoadMore(direction: 'forward' | 'backward'): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.loadMore(direction);
    }, this.config.debounceMs);
  }

  // Load more items
  async loadMore(direction: 'forward' | 'backward' = 'forward'): Promise<boolean> {
    if (this.state.isLoading || !this.state.hasMore || !this.loadMoreHandler) {
      return false;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.notifyListeners();

    try {
      const page = direction === 'forward' ? this.state.page : this.state.page - 1;
      if (page < 1) {
        this.state.isLoading = false;
        this.notifyListeners();
        return false;
      }

      const result = await this.loadMoreHandler(page, direction);

      // Update state
      this.state.isLoading = false;
      this.state.itemCount += result.items.length;
      this.state.totalItems = this.state.itemCount;
      this.state.hasMore = result.hasMore;

      if (direction === 'forward') {
        this.state.page++;
      }

      this.retryCount = 0;
      this.notifyListeners();
      return true;
    } catch (error: any) {
      this.state.isLoading = false;
      this.state.error = error?.message || 'Failed to load more items';
      this.notifyListeners();
      return false;
    }
  }

  // Retry after error
  async retry(): Promise<boolean> {
    if (this.retryCount >= this.maxRetries) {
      this.state.error = `Max retries (${this.maxRetries}) exceeded`;
      this.notifyListeners();
      return false;
    }

    this.retryCount++;
    this.state.error = null;
    this.notifyListeners();

    // Exponential backoff
    await this.delay(this.retryDelay * Math.pow(2, this.retryCount - 1));
    return this.loadMore('forward');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Handle scroll event for anchoring
  onScroll(scrollTop: number, containerHeight: number): void {
    const previousScrollTop = this.scrollTop;
    this.scrollTop = scrollTop;

    // Determine scroll direction
    const direction = scrollTop > previousScrollTop ? 'forward' : 'backward';

    // Check if we need to load more (threshold-based)
    const totalContentHeight = this.estimateTotalHeight();
    const distanceFromBottom = totalContentHeight - scrollTop - containerHeight;
    const distanceFromTop = scrollTop;

    const threshold = parseInt(this.config.rootMargin || '200', 10) || 200;

    if (direction === 'forward' && distanceFromBottom < threshold) {
      if (!this.state.isLoading && this.state.hasMore) {
        this.debouncedLoadMore('forward');
      }
    }

    if (this.config.bidirectional && direction === 'backward' && distanceFromTop < threshold) {
      if (!this.state.isLoading && this.state.page > 1) {
        this.saveScrollAnchor();
        this.debouncedLoadMore('backward');
      }
    }
  }

  // Save scroll anchor for position restoration when prepending
  private saveScrollAnchor(): void {
    if (this.itemHeights.length === 0) return;
    // Find which item is at the current scroll position
    let accumulated = 0;
    for (let i = 0; i < this.itemHeights.length; i++) {
      accumulated += this.itemHeights[i] || 50;
      if (accumulated > this.scrollTop) {
        this.scrollAnchor = {
          itemIndex: i,
          offsetFromTop: this.scrollTop - (accumulated - (this.itemHeights[i] || 50)),
        };
        break;
      }
    }
  }

  // Restore scroll position after prepending items
  restoreScrollAnchor(prependedCount: number): number {
    if (!this.scrollAnchor) return this.scrollTop;

    // Calculate new scroll position
    let prependedHeight = 0;
    for (let i = 0; i < prependedCount; i++) {
      prependedHeight += this.itemHeights[i] || 50; // estimated
    }

    const newScrollTop = prependedHeight + this.scrollAnchor.offsetFromTop;
    this.scrollAnchor = null;
    return newScrollTop;
  }

  // Record item height for accurate calculations
  setItemHeight(index: number, height: number): void {
    this.itemHeights[index] = height;
  }

  // Estimate total content height
  private estimateTotalHeight(): number {
    let measured = 0;
    let measuredCount = 0;
    for (const h of this.itemHeights) {
      if (h) {
        measured += h;
        measuredCount++;
      }
    }
    const avgHeight = measuredCount > 0 ? measured / measuredCount : 50;
    const unmeasuredCount = this.state.itemCount - measuredCount;
    return measured + unmeasuredCount * avgHeight;
  }

  // Set total pages (for end detection)
  setTotalPages(total: number): void {
    this.totalPages = total;
    if (this.state.page >= total) {
      this.state.hasMore = false;
      this.notifyListeners();
    }
  }

  // Mark end of data
  setEndReached(): void {
    this.state.hasMore = false;
    this.notifyListeners();
  }

  // Reset to initial state
  reset(): void {
    this.state = {
      page: this.config.initialPage || 1,
      totalItems: 0,
      hasMore: true,
      isLoading: false,
      error: null,
      itemCount: 0,
    };
    this.retryCount = 0;
    this.itemHeights = [];
    this.scrollAnchor = null;
    this.sentinels.clear();
    this.notifyListeners();
  }

  // Get current state
  getState(): InfiniteScrollState {
    return { ...this.state };
  }

  // Get pagination info
  getPaginationInfo(): {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    loadedItems: number;
  } {
    return {
      currentPage: this.state.page,
      totalPages: this.totalPages,
      hasMore: this.state.hasMore,
      loadedItems: this.state.itemCount,
    };
  }

  // Subscribe to state changes
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const state = { ...this.state };
    this.listeners.forEach((listener) => listener(state));
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.listeners.clear();
    this.sentinels.clear();
    this.loadMoreHandler = null;
    this.itemHeights = [];
  }
}

export default InfiniteScroll;
