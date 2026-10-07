// ============================================================================
// Error Monitoring - Sentry Transport
// Sends error events to a Sentry-compatible endpoint
// ============================================================================

import type { ErrorEvent, ErrorTransport } from '../types';

export interface SentryTransportConfig {
  dsn: string;
  batchSize?: number;
  flushInterval?: number;
}

export class SentryTransport implements ErrorTransport {
  readonly name = 'sentry';
  private config: Required<SentryTransportConfig>;
  private batch: ErrorEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SentryTransportConfig) {
    this.config = {
      dsn: config.dsn,
      batchSize: config.batchSize ?? 10,
      flushInterval: config.flushInterval ?? 5000,
    };

    this.startFlushInterval();
  }

  async send(event: ErrorEvent): Promise<boolean> {
    this.batch.push(event);

    if (this.batch.length >= this.config.batchSize) {
      await this.flush();
    }

    return true;
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const events = [...this.batch];
    this.batch = [];

    const payload = this.buildEnvelope(events);

    try {
      const url = this.getEnvelopeUrl();
      await this.sendPayload(url, payload);
    } catch {
      // Re-queue failed events (up to batch limit)
      this.batch = [...events.slice(0, this.config.batchSize), ...this.batch].slice(
        0,
        this.config.batchSize * 2,
      );
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  getPendingCount(): number {
    return this.batch.length;
  }

  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushInterval);
  }

  private getEnvelopeUrl(): string {
    const { dsn } = this.config;
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '');
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  }

  private buildEnvelope(events: ErrorEvent[]): string {
    return events
      .map((event) =>
        JSON.stringify({
          event_id: event.id,
          timestamp: event.timestamp / 1000,
          level: event.severity,
          message: event.message,
          exception: event.exception
            ? {
                values: [
                  {
                    type: event.exception.type,
                    value: event.exception.value,
                    stacktrace: event.exception.stacktrace,
                  },
                ],
              }
            : undefined,
          breadcrumbs: event.breadcrumbs.map((b) => ({
            type: b.type,
            category: b.category,
            message: b.message,
            data: b.data,
            level: b.level,
            timestamp: b.timestamp / 1000,
          })),
          contexts: event.context,
        }),
      )
      .join('\n');
  }

  private async sendPayload(_url: string, _payload: string): Promise<void> {
    // In production, this would use fetch() to send to Sentry
    // For now, we simulate the network call
    await Promise.resolve();
  }
}
