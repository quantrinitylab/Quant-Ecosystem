// ============================================================================
// Performance Package - Lazy Loader
// IntersectionObserver simulation, progressive loading, priority queues
// ============================================================================

import type { LazyLoadConfig, LazyLoadItem } from '../types';

/** Observer entry tracking visibility */
interface ObserverEntry {
  id: string;
  element: string;
  isIntersecting: boolean;
  intersectionRatio: number;
  boundingRect: { top: number; bottom: number; height: number };
}

/** Preconnect hint generated */
interface PreconnectHint {
  origin: string;
  crossOrigin: boolean;
  generated: boolean;
}

/** Load queue with priority scheduling */
interface PriorityQueueEntry {
  item: LazyLoadItem;
  priority: number;
  addedAt: number;
}

/**
 * LazyLoader implements lazy loading with IntersectionObserver simulation,
 * progressive image loading, priority queues, and preconnect/preload hint
 * generation for optimal resource loading.
 */
export class LazyLoader {
  private readonly config: LazyLoadConfig;
  private readonly items: Map<string, LazyLoadItem>;
  private readonly loadQueue: PriorityQueueEntry[];
  private readonly loadedItems: Set<string>;
  private readonly preconnectHints: Map<string, PreconnectHint>;
  private readonly observers: Map<string, ObserverEntry>;
  private viewportTop: number;
  private viewportBottom: number;
  private isProcessing: boolean;
  private totalLoaded: number;
  private totalErrors: number;

  constructor(config: Partial<LazyLoadConfig> = {}) {
    this.config = {
      rootMargin: config.rootMargin ?? '200px 0px',
      threshold: config.threshold ?? 0.1,
      fallbackSrc: config.fallbackSrc ?? 'data:image/svg+xml,...',
      progressive: config.progressive ?? true,
      priorityLevels: config.priorityLevels ?? 3,
      preconnectOrigins: config.preconnectOrigins ?? [],
    };

    this.items = new Map();
    this.loadQueue = [];
    this.loadedItems = new Set();
    this.preconnectHints = new Map();
    this.observers = new Map();
    this.viewportTop = 0;
    this.viewportBottom = 800;
    this.isProcessing = false;
    this.totalLoaded = 0;
    this.totalErrors = 0;

    // Initialize preconnect hints
    for (const origin of this.config.preconnectOrigins) {
      this.preconnectHints.set(origin, {
        origin,
        crossOrigin: true,
        generated: false,
      });
    }
  }

  /**
   * Register an item for lazy loading observation.
   */
  observe(id: string, src: string, position: number, priority?: number): void {
    const item: LazyLoadItem = {
      id,
      src,
      priority: priority ?? this.calculatePriority(position),
      loaded: false,
      visible: false,
      loadStartTime: 0,
      loadEndTime: 0,
    };

    this.items.set(id, item);

    // Create observer entry
    this.observers.set(id, {
      id,
      element: src,
      isIntersecting: false,
      intersectionRatio: 0,
      boundingRect: { top: position, bottom: position + 300, height: 300 },
    });

    // Check if already in viewport
    this.checkIntersection(id);
  }

  /**
   * Unobserve an item, removing it from tracking.
   */
  unobserve(id: string): void {
    this.items.delete(id);
    this.observers.delete(id);
    // Remove from load queue
    const idx = this.loadQueue.findIndex((e) => e.item.id === id);
    if (idx >= 0) this.loadQueue.splice(idx, 1);
  }

  /**
   * Update the viewport position (simulating scroll).
   * Triggers intersection checks for all observed items.
   */
  updateViewport(scrollTop: number, viewportHeight: number): void {
    const rootMarginPx = this.parseRootMargin();
    this.viewportTop = scrollTop - rootMarginPx;
    this.viewportBottom = scrollTop + viewportHeight + rootMarginPx;

    // Check all observers for intersection changes
    for (const [id] of this.observers) {
      this.checkIntersection(id);
    }
  }

  /**
   * Process the load queue, loading items by priority.
   */
  async processQueue(concurrency: number = 3): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let loaded = 0;

    // Sort queue by priority (higher first)
    this.loadQueue.sort((a, b) => b.priority - a.priority);

    // Process in batches
    while (this.loadQueue.length > 0) {
      const batch = this.loadQueue.splice(0, concurrency);
      const promises = batch.map((entry) => this.loadItem(entry.item));
      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          loaded++;
        }
      }
    }

    this.isProcessing = false;
    return loaded;
  }

  /**
   * Get progressive loading stages for an image (blur-up technique).
   */
  getProgressiveStages(src: string): string[] {
    if (!this.config.progressive) return [src];

    // Generate progressive loading stages
    return [
      this.config.fallbackSrc, // Stage 1: LQIP fallback
      this.generateThumbnailUrl(src, 20), // Stage 2: Tiny thumbnail
      this.generateThumbnailUrl(src, 40), // Stage 3: Low quality
      src, // Stage 4: Full quality
    ];
  }

  /**
   * Generate preconnect link hints for registered origins.
   */
  getPreconnectHints(): string[] {
    const hints: string[] = [];
    for (const [origin, hint] of this.preconnectHints) {
      if (!hint.generated) {
        const crossOrigin = hint.crossOrigin ? ' crossorigin' : '';
        hints.push(`<link rel="preconnect" href="${origin}"${crossOrigin}>`);
        hint.generated = true;
      }
    }
    return hints;
  }

  /**
   * Generate preload hints for high-priority items.
   */
  getPreloadHints(maxItems: number = 5): string[] {
    const hints: string[] = [];
    const highPriority = [...this.items.values()]
      .filter((item) => !item.loaded && item.priority >= this.config.priorityLevels - 1)
      .slice(0, maxItems);

    for (const item of highPriority) {
      const type = this.detectResourceType(item.src);
      hints.push(`<link rel="preload" href="${item.src}" as="${type}">`);
    }
    return hints;
  }

  /**
   * Get loading statistics.
   */
  getStats(): {
    total: number;
    loaded: number;
    pending: number;
    errors: number;
    queueSize: number;
  } {
    return {
      total: this.items.size,
      loaded: this.totalLoaded,
      pending: this.loadQueue.length,
      errors: this.totalErrors,
      queueSize: this.loadQueue.length,
    };
  }

  /**
   * Check if an item has been loaded.
   */
  isLoaded(id: string): boolean {
    return this.loadedItems.has(id);
  }

  /**
   * Get all visible items in the current viewport.
   */
  getVisibleItems(): LazyLoadItem[] {
    return [...this.items.values()].filter((item) => item.visible);
  }

  /**
   * Reset the loader state.
   */
  reset(): void {
    this.items.clear();
    this.loadQueue.length = 0;
    this.loadedItems.clear();
    this.observers.clear();
    this.totalLoaded = 0;
    this.totalErrors = 0;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Check intersection for an observed item */
  private checkIntersection(id: string): void {
    const observer = this.observers.get(id);
    const item = this.items.get(id);
    if (!observer || !item) return;

    const rect = observer.boundingRect;
    const wasIntersecting = observer.isIntersecting;

    // Check if element rect overlaps with viewport
    observer.isIntersecting = rect.bottom > this.viewportTop && rect.top < this.viewportBottom;

    // Calculate intersection ratio
    if (observer.isIntersecting) {
      const visibleTop = Math.max(rect.top, this.viewportTop);
      const visibleBottom = Math.min(rect.bottom, this.viewportBottom);
      observer.intersectionRatio = (visibleBottom - visibleTop) / rect.height;
    } else {
      observer.intersectionRatio = 0;
    }

    // Trigger load if newly intersecting and meets threshold
    if (
      observer.isIntersecting &&
      !wasIntersecting &&
      observer.intersectionRatio >= this.config.threshold
    ) {
      item.visible = true;
      if (!item.loaded && !this.loadedItems.has(id)) {
        this.enqueueLoad(item);
      }
    }

    if (!observer.isIntersecting && wasIntersecting) {
      item.visible = false;
    }
  }

  /** Add item to the priority load queue */
  private enqueueLoad(item: LazyLoadItem): void {
    // Check if already queued
    if (this.loadQueue.some((e) => e.item.id === item.id)) return;

    this.loadQueue.push({
      item,
      priority: item.priority,
      addedAt: Date.now(),
    });
  }

  /** Load a single item */
  private async loadItem(item: LazyLoadItem): Promise<boolean> {
    try {
      item.loadStartTime = Date.now();

      // Simulate network load with latency based on priority
      const latency = Math.max(10, 100 - item.priority * 20);
      await new Promise((resolve) => setTimeout(resolve, latency));

      item.loaded = true;
      item.loadEndTime = Date.now();
      this.loadedItems.add(item.id);
      this.totalLoaded++;
      return true;
    } catch {
      this.totalErrors++;
      return false;
    }
  }

  /** Calculate priority based on position relative to viewport */
  private calculatePriority(position: number): number {
    const distanceFromViewport = Math.abs(position - this.viewportTop);
    // Items closer to viewport get higher priority
    const maxDistance = 2000;
    const normalized = Math.max(0, 1 - distanceFromViewport / maxDistance);
    return Math.floor(normalized * (this.config.priorityLevels - 1));
  }

  /** Parse root margin value to pixels */
  private parseRootMargin(): number {
    const match = this.config.rootMargin.match(/(\d+)px/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /** Generate a thumbnail URL for progressive loading */
  private generateThumbnailUrl(src: string, quality: number): string {
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}q=${quality}&w=40`;
  }

  /** Detect resource type from URL */
  private detectResourceType(src: string): string {
    if (src.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i)) return 'image';
    if (src.match(/\.(js|mjs)(\?|$)/i)) return 'script';
    if (src.match(/\.(css)(\?|$)/i)) return 'style';
    if (src.match(/\.(woff|woff2|ttf|otf)(\?|$)/i)) return 'font';
    return 'fetch';
  }
}
