// ============================================================================
// Universal Timeline Service
// ============================================================================

import type { TimelineEvent, TimelineFilter, TimelineSource, TimelineSubscriber } from './types';
import { TimelineAggregator } from './timeline-aggregator';

export interface TimelineServiceOptions {
  maxEntries?: number;
}

export class UniversalTimelineService {
  private events: Map<string, TimelineEvent> = new Map();
  private sources: Map<string, TimelineSource> = new Map();
  private subscribers: Map<string, TimelineSubscriber[]> = new Map();
  private aggregator: TimelineAggregator;
  private counter = 0;
  private readonly maxEntries: number;
  private insertionOrder: string[] = [];

  constructor(options?: TimelineServiceOptions) {
    this.aggregator = new TimelineAggregator();
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  registerSource(source: TimelineSource): void {
    this.sources.set(source.name, source);
  }

  unregisterSource(name: string): boolean {
    return this.sources.delete(name);
  }

  publish(event: Omit<TimelineEvent, 'id' | 'timestamp'>): TimelineEvent {
    const id = `tl_${Date.now()}_${++this.counter}`;
    const full: TimelineEvent = {
      ...event,
      id,
      timestamp: Date.now(),
    };
    this.events.set(id, full);
    this.insertionOrder.push(id);
    this.evictIfNeeded();

    // Notify subscribers for this user
    const callbacks = this.subscribers.get(full.userId) ?? [];
    for (const cb of callbacks) {
      try {
        cb(full);
      } catch {
        // Isolate subscriber errors so one failing subscriber does not block others
      }
    }

    return full;
  }

  private evictIfNeeded(): void {
    while (this.events.size > this.maxEntries && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift();
      if (oldest != null) {
        this.events.delete(oldest);
      }
    }
  }

  query(filter: TimelineFilter): TimelineEvent[] {
    const allEvents = Array.from(this.events.values());
    return this.aggregator.aggregate(allEvents, filter);
  }

  async queryWithSources(filter: TimelineFilter): Promise<TimelineEvent[]> {
    const localEvents = Array.from(this.events.values());

    const sourcePromises = Array.from(this.sources.values()).map((source) =>
      source.fetchEvents(filter),
    );
    const sourceEvents = await Promise.all(sourcePromises);

    const allEvents = [localEvents, ...sourceEvents].flat();
    return this.aggregator.aggregate(allEvents, filter);
  }

  subscribe(userId: string, callback: TimelineSubscriber): () => void {
    const existing = this.subscribers.get(userId) ?? [];
    existing.push(callback);
    this.subscribers.set(userId, existing);

    return () => {
      const callbacks = this.subscribers.get(userId);
      if (callbacks) {
        const idx = callbacks.indexOf(callback);
        if (idx >= 0) {
          callbacks.splice(idx, 1);
        }
      }
    };
  }

  getEvent(id: string): TimelineEvent | undefined {
    return this.events.get(id);
  }

  deleteEvent(id: string): boolean {
    const deleted = this.events.delete(id);
    if (deleted) {
      const idx = this.insertionOrder.indexOf(id);
      if (idx >= 0) {
        this.insertionOrder.splice(idx, 1);
      }
    }
    return deleted;
  }

  getSourceCount(): number {
    return this.sources.size;
  }
}
