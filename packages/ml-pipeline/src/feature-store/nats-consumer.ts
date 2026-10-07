// ============================================================================
// Feature Store - NATS Event Consumer
// ============================================================================

import type { FeatureAggregator, UserEvent, EventType } from './aggregator';

export interface NatsSubscriber {
  subscribe(subject: string, handler: (data: Uint8Array) => void): void;
  unsubscribe(subject: string): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

const VALID_EVENT_TYPES: Set<string> = new Set([
  'view',
  'click',
  'like',
  'share',
  'dwell',
  'dismiss',
]);

export interface NatsFeatureConsumerOptions {
  onError?: (error: unknown, rawData: Uint8Array) => void;
}

export class NatsFeatureConsumer {
  private readonly nats: NatsSubscriber;
  private readonly aggregator: FeatureAggregator;
  private readonly subject = 'user.events.*';
  private readonly onError: ((error: unknown, rawData: Uint8Array) => void) | undefined;
  private running = false;

  constructor(
    nats: NatsSubscriber,
    aggregator: FeatureAggregator,
    options?: NatsFeatureConsumerOptions,
  ) {
    this.nats = nats;
    this.aggregator = aggregator;
    this.onError = options?.onError;
  }

  async start(): Promise<void> {
    await this.nats.connect();
    this.nats.subscribe(this.subject, (data: Uint8Array) => {
      this.handleMessage(data);
    });
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.nats.unsubscribe(this.subject);
    await this.nats.disconnect();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleMessage(data: Uint8Array): void {
    try {
      const text = new TextDecoder().decode(data);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const event = this.parseEvent(parsed);
      if (event) {
        this.aggregator.processEvent(event);
      }
    } catch (error) {
      if (this.onError) {
        this.onError(error, data);
      }
    }
  }

  private parseEvent(raw: Record<string, unknown>): UserEvent | null {
    const userId = raw['userId'];
    const eventType = raw['eventType'];
    const itemId = raw['itemId'];
    const timestamp = raw['timestamp'];

    if (typeof userId !== 'string' || !userId) return null;
    if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.has(eventType)) return null;
    if (typeof itemId !== 'string' || !itemId) return null;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;

    const event: UserEvent = {
      userId,
      eventType: eventType as EventType,
      itemId,
      timestamp,
    };

    if (typeof raw['topicId'] === 'string') {
      event.topicId = raw['topicId'];
    }
    if (typeof raw['durationMs'] === 'number' && Number.isFinite(raw['durationMs'])) {
      event.durationMs = raw['durationMs'];
    }

    return event;
  }
}
