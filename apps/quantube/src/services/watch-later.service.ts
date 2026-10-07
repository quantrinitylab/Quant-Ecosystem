// ============================================================================
// QuantTube - Watch Later Service
// Queue management for watch later with ordering and watched tracking
// ============================================================================

export interface WatchLaterItem {
  videoId: string;
  addedAt: number;
  watched: boolean;
  watchedAt?: number;
  position: number;
}

export class WatchLaterService {
  private queue: WatchLaterItem[] = [];

  add(videoId: string): WatchLaterItem {
    const existing = this.queue.find((item) => item.videoId === videoId);
    if (existing) {
      return existing;
    }

    const item: WatchLaterItem = {
      videoId,
      addedAt: Date.now(),
      watched: false,
      position: this.queue.length,
    };

    this.queue.push(item);
    return item;
  }

  remove(videoId: string): boolean {
    const index = this.queue.findIndex((item) => item.videoId === videoId);
    if (index === -1) {
      return false;
    }

    this.queue.splice(index, 1);
    this.reindex();
    return true;
  }

  getQueue(): WatchLaterItem[] {
    return [...this.queue];
  }

  reorder(videoId: string, newPosition: number): WatchLaterItem[] {
    const currentIndex = this.queue.findIndex((item) => item.videoId === videoId);
    if (currentIndex === -1) {
      return this.getQueue();
    }

    const clampedPosition = Math.max(0, Math.min(newPosition, this.queue.length - 1));
    const [item] = this.queue.splice(currentIndex, 1);
    if (item) {
      this.queue.splice(clampedPosition, 0, item);
    }
    this.reindex();
    return this.getQueue();
  }

  markWatched(videoId: string): void {
    const item = this.queue.find((i) => i.videoId === videoId);
    if (item) {
      item.watched = true;
      item.watchedAt = Date.now();
    }
  }

  getNext(): WatchLaterItem | null {
    const unwatched = this.queue.find((item) => !item.watched);
    return unwatched ?? null;
  }

  clearWatched(): number {
    const watchedCount = this.queue.filter((item) => item.watched).length;
    this.queue = this.queue.filter((item) => !item.watched);
    this.reindex();
    return watchedCount;
  }

  isInQueue(videoId: string): boolean {
    return this.queue.some((item) => item.videoId === videoId);
  }

  private reindex(): void {
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (item) {
        item.position = i;
      }
    }
  }
}
