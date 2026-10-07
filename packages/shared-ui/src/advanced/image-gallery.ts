// ============================================================================
// @quant/shared-ui - Advanced Image Gallery with Lightbox
// ============================================================================

import { GalleryItem, LightboxState, GalleryConfig } from './types';

interface GridItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  loaded: boolean;
}

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  deltaX: number;
  isSwiping: boolean;
}

type GalleryListener = (state: { grid: GridItem[]; lightbox: LightboxState }) => void;

export class ImageGallery {
  private items: GalleryItem[] = [];
  private config: GalleryConfig;
  private lightbox: LightboxState;
  private gridItems: GridItem[] = [];
  private containerWidth: number = 800;
  private loadedImages: Set<string> = new Set();
  private preloadedImages: Set<string> = new Set();
  private swipeState: SwipeState;
  private listeners: Set<GalleryListener> = new Set();

  constructor(items: GalleryItem[] = [], config: GalleryConfig = {}) {
    this.items = items;
    this.config = {
      columns: 3,
      gap: 8,
      layout: 'grid',
      enableLightbox: true,
      enableZoom: true,
      preloadCount: 2,
      lazyLoad: true,
      ...config,
    };
    this.lightbox = {
      isOpen: false,
      currentIndex: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      isTransitioning: false,
    };
    this.swipeState = {
      startX: 0,
      startY: 0,
      currentX: 0,
      deltaX: 0,
      isSwiping: false,
    };
    this.calculateGrid();
  }

  // Calculate grid layout (standard grid)
  private calculateGrid(): void {
    if (this.config.layout === 'masonry') {
      this.calculateMasonryLayout();
    } else {
      this.calculateStandardGrid();
    }
  }

  private calculateStandardGrid(): void {
    const columns = this.config.columns || 3;
    const gap = this.config.gap || 8;
    const columnWidth = (this.containerWidth - gap * (columns - 1)) / columns;

    this.gridItems = this.items.map((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const aspectRatio = item.width / item.height;
      const cellHeight = columnWidth / aspectRatio;

      return {
        id: item.id,
        x: col * (columnWidth + gap),
        y: row * (cellHeight + gap),
        width: columnWidth,
        height: cellHeight,
        src: item.thumbnail || item.src,
        loaded: this.loadedImages.has(item.id),
      };
    });
  }

  // Masonry layout (fill gaps with variable height items)
  private calculateMasonryLayout(): void {
    const columns = this.config.columns || 3;
    const gap = this.config.gap || 8;
    const columnWidth = (this.containerWidth - gap * (columns - 1)) / columns;
    const columnHeights: number[] = new Array(columns).fill(0);

    this.gridItems = this.items.map((item) => {
      // Find shortest column
      const shortestCol = columnHeights.indexOf(Math.min(...columnHeights));
      const aspectRatio = item.width / item.height;
      const cellHeight = columnWidth / aspectRatio;

      const gridItem: GridItem = {
        id: item.id,
        x: shortestCol * (columnWidth + gap),
        y: columnHeights[shortestCol]!,
        width: columnWidth,
        height: cellHeight,
        src: item.thumbnail || item.src,
        loaded: this.loadedImages.has(item.id),
      };

      columnHeights[shortestCol] = (columnHeights[shortestCol] ?? 0) + cellHeight + gap;
      return gridItem;
    });
  }

  // Set container width and recalculate
  setContainerWidth(width: number): void {
    this.containerWidth = width;
    this.calculateGrid();
    this.notifyListeners();
  }

  // Set items
  setItems(items: GalleryItem[]): void {
    this.items = items;
    this.calculateGrid();
    this.notifyListeners();
  }

  // Mark image as loaded
  imageLoaded(id: string): void {
    this.loadedImages.add(id);
    const gridItem = this.gridItems.find((g) => g.id === id);
    if (gridItem) gridItem.loaded = true;
    this.notifyListeners();
  }

  // Lazy loading - get items that should be loaded based on scroll position
  getItemsToLoad(scrollTop: number, viewportHeight: number): GalleryItem[] {
    if (!this.config.lazyLoad) return this.items;

    const buffer = viewportHeight * 0.5; // Pre-load half viewport ahead
    const visibleTop = scrollTop - buffer;
    const visibleBottom = scrollTop + viewportHeight + buffer;

    return this.items.filter((item, index) => {
      const gridItem = this.gridItems[index];
      if (!gridItem || this.loadedImages.has(item.id)) return false;
      return gridItem.y + gridItem.height > visibleTop && gridItem.y < visibleBottom;
    });
  }

  // Open lightbox at index
  openLightbox(index: number): void {
    if (!this.config.enableLightbox) return;
    this.lightbox = {
      isOpen: true,
      currentIndex: Math.max(0, Math.min(index, this.items.length - 1)),
      zoom: 1,
      panX: 0,
      panY: 0,
      isTransitioning: true,
    };
    this.preloadAdjacent();
    this.notifyListeners();

    // End transition
    setTimeout(() => {
      this.lightbox.isTransitioning = false;
      this.notifyListeners();
    }, 300);
  }

  // Close lightbox
  closeLightbox(): void {
    this.lightbox.isTransitioning = true;
    this.notifyListeners();
    setTimeout(() => {
      this.lightbox = {
        isOpen: false,
        currentIndex: 0,
        zoom: 1,
        panX: 0,
        panY: 0,
        isTransitioning: false,
      };
      this.notifyListeners();
    }, 300);
  }

  // Navigate in lightbox
  next(): void {
    if (!this.lightbox.isOpen) return;
    const newIndex = (this.lightbox.currentIndex + 1) % this.items.length;
    this.goToIndex(newIndex);
  }

  previous(): void {
    if (!this.lightbox.isOpen) return;
    const newIndex = (this.lightbox.currentIndex - 1 + this.items.length) % this.items.length;
    this.goToIndex(newIndex);
  }

  goToIndex(index: number): void {
    this.lightbox.currentIndex = index;
    this.lightbox.zoom = 1;
    this.lightbox.panX = 0;
    this.lightbox.panY = 0;
    this.preloadAdjacent();
    this.notifyListeners();
  }

  // Preload adjacent images
  private preloadAdjacent(): void {
    const count = this.config.preloadCount || 2;
    const { currentIndex } = this.lightbox;

    for (let offset = -count; offset <= count; offset++) {
      const idx = (currentIndex + offset + this.items.length) % this.items.length;
      if (idx >= 0 && idx < this.items.length) {
        this.preloadedImages.add(this.items[idx]!.id);
      }
    }
  }

  // Get preloaded image sources
  getPreloadSources(): string[] {
    return Array.from(this.preloadedImages)
      .map((id) => this.items.find((item) => item.id === id)?.src)
      .filter((src): src is string => !!src);
  }

  // Zoom controls
  zoomIn(): void {
    if (!this.config.enableZoom) return;
    this.lightbox.zoom = Math.min(5, this.lightbox.zoom + 0.5);
    this.constrainPan();
    this.notifyListeners();
  }

  zoomOut(): void {
    this.lightbox.zoom = Math.max(1, this.lightbox.zoom - 0.5);
    this.constrainPan();
    this.notifyListeners();
  }

  resetZoom(): void {
    this.lightbox.zoom = 1;
    this.lightbox.panX = 0;
    this.lightbox.panY = 0;
    this.notifyListeners();
  }

  // Double-tap/click zoom toggle
  toggleZoom(): void {
    if (this.lightbox.zoom > 1) {
      this.resetZoom();
    } else {
      this.lightbox.zoom = 2.5;
      this.notifyListeners();
    }
  }

  // Pan while zoomed
  pan(deltaX: number, deltaY: number): void {
    if (this.lightbox.zoom <= 1) return;
    this.lightbox.panX += deltaX;
    this.lightbox.panY += deltaY;
    this.constrainPan();
    this.notifyListeners();
  }

  private constrainPan(): void {
    if (this.lightbox.zoom <= 1) {
      this.lightbox.panX = 0;
      this.lightbox.panY = 0;
      return;
    }
    const maxPan = (this.lightbox.zoom - 1) * 200; // Proportional to zoom
    this.lightbox.panX = Math.max(-maxPan, Math.min(maxPan, this.lightbox.panX));
    this.lightbox.panY = Math.max(-maxPan, Math.min(maxPan, this.lightbox.panY));
  }

  // Swipe gesture handling
  swipeStart(x: number, y: number): void {
    if (this.lightbox.zoom > 1) return; // Don't swipe when zoomed
    this.swipeState = { startX: x, startY: y, currentX: x, deltaX: 0, isSwiping: true };
  }

  swipeMove(x: number): void {
    if (!this.swipeState.isSwiping) return;
    this.swipeState.currentX = x;
    this.swipeState.deltaX = x - this.swipeState.startX;
    this.notifyListeners();
  }

  swipeEnd(): void {
    if (!this.swipeState.isSwiping) return;
    const threshold = 50; // Minimum swipe distance

    if (this.swipeState.deltaX > threshold) {
      this.previous();
    } else if (this.swipeState.deltaX < -threshold) {
      this.next();
    }

    this.swipeState = { startX: 0, startY: 0, currentX: 0, deltaX: 0, isSwiping: false };
    this.notifyListeners();
  }

  // Keyboard navigation
  handleKeyboard(key: string): void {
    if (!this.lightbox.isOpen) return;
    switch (key) {
      case 'ArrowRight':
        this.next();
        break;
      case 'ArrowLeft':
        this.previous();
        break;
      case 'Escape':
        this.closeLightbox();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
    }
  }

  // Get current lightbox image
  getCurrentItem(): GalleryItem | null {
    if (!this.lightbox.isOpen) return null;
    return this.items[this.lightbox.currentIndex] ?? null;
  }

  // Get thumbnail strip items
  getThumbnailStrip(
    visibleCount: number = 7,
  ): Array<{ item: GalleryItem; isCurrent: boolean; index: number }> {
    const { currentIndex } = this.lightbox;
    const half = Math.floor(visibleCount / 2);
    const start = Math.max(0, currentIndex - half);
    const end = Math.min(this.items.length, start + visibleCount);

    const result: Array<{ item: GalleryItem; isCurrent: boolean; index: number }> = [];
    for (let i = start; i < end; i++) {
      result.push({ item: this.items[i]!, isCurrent: i === currentIndex, index: i });
    }
    return result;
  }

  // Get grid items
  getGridItems(): GridItem[] {
    return [...this.gridItems];
  }

  // Get lightbox state
  getLightboxState(): LightboxState {
    return { ...this.lightbox };
  }

  // Get total grid height
  getGridHeight(): number {
    if (this.gridItems.length === 0) return 0;
    return Math.max(...this.gridItems.map((item) => item.y + item.height));
  }

  // Subscribe
  subscribe(listener: GalleryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const state = { grid: this.gridItems, lightbox: { ...this.lightbox } };
    this.listeners.forEach((listener) => listener(state));
  }

  destroy(): void {
    this.listeners.clear();
    this.loadedImages.clear();
    this.preloadedImages.clear();
  }
}

export default ImageGallery;
