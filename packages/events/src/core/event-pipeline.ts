import { EventEmitter } from 'events';

export interface Event {
  id: string;
  type: string;
  userId: string;
  payload: Record<string, any>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EventHandler {
  (event: Event): Promise<void>;
}

export class EventPipeline extends EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();
  private deadLetterQueue: Event[] = [];

  async publish(event: Omit<Event, 'id' | 'timestamp'>): Promise<string> {
    const fullEvent: Event = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    this.emit('event:published', fullEvent);

    // Process handlers
    await this.processEvent(fullEvent);

    return fullEvent.id;
  }

  subscribe(eventType: string, handler: EventHandler) {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  private async processEvent(event: Event) {
    const handlers = this.handlers.get(event.type) || [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Handler failed for event ${event.id}:`, error);
        this.deadLetterQueue.push(event);
        this.emit('event:failed', { event, error });
      }
    }
  }

  getDeadLetterQueue(): Event[] {
    return [...this.deadLetterQueue];
  }

  getStats() {
    return {
      totalHandlers: Array.from(this.handlers.values()).reduce((sum, h) => sum + h.length, 0),
      deadLetterCount: this.deadLetterQueue.length,
      eventTypes: Array.from(this.handlers.keys()),
    };
  }
}

export const eventPipeline = new EventPipeline();
