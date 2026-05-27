// ============================================================================
// Universal Timeline Service
// ============================================================================

import type { TimelineEvent, TimelineFilter, TimelineSource, TimelineSubscriber } from './types';
import { TimelineAggregator } from './timeline-aggregator';

export class UniversalTimelineService {
  private events: Map<string, TimelineEvent> = new Map();
  private sources: Map<string, TimelineSource> = new Map();
  private subscribers: Map<string, TimelineSubscriber[]> = new Map();
  private aggregator: TimelineAggregator;
  private counter = 0;

  constructor() {
    this.aggregator = new TimelineAggregator();
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

    // Notify subscribers for this user
    const callbacks = this.subscribers.get(full.userId) ?? [];
    for (const cb of callbacks) {
      cb(full);
    }

    return full;
  }

  query(filter: TimelineFilter): TimelineEvent[] {
    const allEvents = Array.from(this.events.values());
    return this.aggregator.aggregate(allEvents, filter);
  }

  async queryWithSources(filter: TimelineFilter): Promise<TimelineEvent[]> {
    const localEvents = Array.from(this.events.values());
    const sourceEvents: TimelineEvent[][] = [];

    for (const [, source] of this.sources) {
      const events = await source.fetchEvents(filter);
      sourceEvents.push(events);
    }

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
    return this.events.delete(id);
  }

  getSourceCount(): number {
    return this.sources.size;
  }
}
