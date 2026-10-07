// ============================================================================
// Error Monitoring - GlitchTip Transport
// Sends error events to a GlitchTip-compatible endpoint
// ============================================================================

import type { ErrorEvent, ErrorTransport } from '../types';

export interface GlitchTipTransportConfig {
  dsn: string;
  batchSize?: number;
  flushInterval?: number;
}

export class GlitchTipTransport implements ErrorTransport {
  readonly name = 'glitchtip';
  private config: Required<GlitchTipTransportConfig>;
  private batch: ErrorEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: GlitchTipTransportConfig) {
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

    try {
      const url = this.getStoreUrl();
      await this.sendEvents(url, events);
    } catch {
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

  private getStoreUrl(): string {
    const { dsn } = this.config;
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '');
    return `${url.protocol}//${url.host}/api/${projectId}/store/`;
  }

  private async sendEvents(_url: string, events: ErrorEvent[]): Promise<void> {
    // GlitchTip uses a Sentry-compatible store API
    for (const event of events) {
      await this.sendSingleEvent(event);
    }
  }

  private async sendSingleEvent(_event: ErrorEvent): Promise<void> {
    // In production, this would use fetch() to send to GlitchTip
    await Promise.resolve();
  }
}
