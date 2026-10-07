import type { MessageBusEvent } from '../types.js';

type Handler = (event: MessageBusEvent) => void;

function matchTopic(pattern: string, topic: string): boolean {
  const patParts = pattern.split('.');
  const topParts = topic.split('.');
  for (let i = 0; i < patParts.length; i++) {
    const pat = patParts[i]!;
    if (pat === '#') return true;
    if (pat === '*') {
      if (topParts[i] === undefined) return false;
      continue;
    }
    if (pat !== topParts[i]) return false;
  }
  return patParts.length === topParts.length;
}

export class MessageBus {
  private subscriptions = new Map<string, Map<string, Handler>>();
  private history: MessageBusEvent[] = [];
  private pendingAcks = new Map<string, MessageBusEvent>();
  private maxHistorySize: number;
  private maxPendingAcks: number;

  constructor(opts: { maxHistorySize?: number; maxPendingAcks?: number } = {}) {
    this.maxHistorySize = opts.maxHistorySize ?? 10_000;
    this.maxPendingAcks = opts.maxPendingAcks ?? 5_000;
  }

  publish(topic: string, payload: unknown, sender: string): MessageBusEvent {
    const event: MessageBusEvent = {
      id: crypto.randomUUID(),
      topic,
      payload,
      sender,
      timestamp: Date.now(),
      acked: false,
    };
    this.history.push(event);
    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }
    this.pendingAcks.set(event.id, event);
    if (this.pendingAcks.size > this.maxPendingAcks) {
      const iter = this.pendingAcks.keys();
      const oldest = iter.next().value;
      if (oldest !== undefined) {
        this.pendingAcks.delete(oldest);
      }
    }
    for (const [pattern, handlers] of this.subscriptions) {
      if (matchTopic(pattern, topic)) {
        for (const handler of handlers.values()) {
          handler(event);
        }
      }
    }
    return event;
  }

  subscribe(pattern: string, handler: Handler): string {
    const id = crypto.randomUUID();
    if (!this.subscriptions.has(pattern)) {
      this.subscriptions.set(pattern, new Map());
    }
    this.subscriptions.get(pattern)!.set(id, handler);
    return id;
  }

  unsubscribe(pattern: string, subscriptionId: string): boolean {
    const handlers = this.subscriptions.get(pattern);
    if (!handlers) return false;
    return handlers.delete(subscriptionId);
  }

  ack(eventId: string): boolean {
    const event = this.pendingAcks.get(eventId);
    if (!event) return false;
    event.acked = true;
    this.pendingAcks.delete(eventId);
    return true;
  }

  getHistory(topic?: string): MessageBusEvent[] {
    if (!topic) return [...this.history];
    return this.history.filter((e) => e.topic === topic);
  }

  getPending(): MessageBusEvent[] {
    return [...this.pendingAcks.values()];
  }
}
