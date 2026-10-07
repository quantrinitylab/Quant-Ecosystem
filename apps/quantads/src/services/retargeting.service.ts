// ============================================================================
// QuantAds - Retargeting Service
// Tracking pixels, event tracking, and audience building for retargeting
// ============================================================================

export interface TrackingPixel {
  id: string;
  siteId: string;
  name: string;
  createdAt: number;
  eventsCount: number;
}

export interface TrackedEvent {
  pixelId: string;
  event: string;
  userId: string;
  timestamp: number;
  metadata: Record<string, string>;
}

export interface RetargetingAudience {
  id: string;
  pixelId: string;
  eventFilter: string;
  size: number;
  lastUpdated: number;
}

export class RetargetingService {
  private pixels: Map<string, TrackingPixel> = new Map();
  private events: TrackedEvent[] = [];
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  createPixel(siteId: string, name: string): TrackingPixel {
    const pixel: TrackingPixel = {
      id: this.generateId('pixel'),
      siteId,
      name,
      createdAt: Date.now(),
      eventsCount: 0,
    };
    this.pixels.set(pixel.id, pixel);
    return pixel;
  }

  deletePixel(pixelId: string): boolean {
    return this.pixels.delete(pixelId);
  }

  trackEvent(
    pixelId: string,
    event: string,
    userId: string,
    metadata?: Record<string, string>,
  ): TrackedEvent | null {
    const pixel = this.pixels.get(pixelId);
    if (!pixel) return null;

    const tracked: TrackedEvent = {
      pixelId,
      event,
      userId,
      timestamp: Date.now(),
      metadata: metadata ?? {},
    };
    this.events.push(tracked);
    pixel.eventsCount += 1;
    return tracked;
  }

  getAudience(pixelId: string, eventFilter?: string): RetargetingAudience {
    const filteredEvents = this.events.filter((e) => {
      if (e.pixelId !== pixelId) return false;
      if (eventFilter && e.event !== eventFilter) return false;
      return true;
    });

    const uniqueUsers = new Set(filteredEvents.map((e) => e.userId));

    return {
      id: this.generateId('audience'),
      pixelId,
      eventFilter: eventFilter ?? 'all',
      size: uniqueUsers.size,
      lastUpdated: Date.now(),
    };
  }

  getPixels(siteId: string): TrackingPixel[] {
    const results: TrackingPixel[] = [];
    for (const pixel of this.pixels.values()) {
      if (pixel.siteId === siteId) {
        results.push(pixel);
      }
    }
    return results;
  }

  getEvents(pixelId: string, limit: number): TrackedEvent[] {
    return this.events.filter((e) => e.pixelId === pixelId).slice(-limit);
  }

  getPixelStats(pixelId: string): {
    totalEvents: number;
    uniqueUsers: number;
    topEvents: { event: string; count: number }[];
  } {
    const pixelEvents = this.events.filter((e) => e.pixelId === pixelId);
    const uniqueUsers = new Set(pixelEvents.map((e) => e.userId));
    const eventCounts = new Map<string, number>();

    for (const ev of pixelEvents) {
      const current = eventCounts.get(ev.event) ?? 0;
      eventCounts.set(ev.event, current + 1);
    }

    const topEvents = [...eventCounts.entries()]
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: pixelEvents.length,
      uniqueUsers: uniqueUsers.size,
      topEvents,
    };
  }
}
