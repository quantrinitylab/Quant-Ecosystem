// ============================================================================
// Error Monitoring - Error Capture
// Central error capture and routing system
// ============================================================================

import type {
  ErrorEvent,
  ErrorConfig,
  ErrorContext,
  ErrorSeverity,
  ErrorTransport,
  Breadcrumb,
} from './types';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ErrorCapture {
  private config: ErrorConfig;
  private transports: ErrorTransport[] = [];
  private context: ErrorContext = {};
  private breadcrumbs: Breadcrumb[] = [];
  private eventQueue: ErrorEvent[] = [];

  constructor(config: Partial<ErrorConfig> = {}) {
    this.config = {
      environment: config.environment ?? 'production',
      release: config.release,
      sampleRate: config.sampleRate ?? 1.0,
      maxBreadcrumbs: config.maxBreadcrumbs ?? 100,
      beforeSend: config.beforeSend,
      severityFilter: config.severityFilter,
      debug: config.debug ?? false,
      dsn: config.dsn,
    };
  }

  addTransport(transport: ErrorTransport): void {
    this.transports.push(transport);
  }

  removeTransport(name: string): void {
    this.transports = this.transports.filter((t) => t.name !== name);
  }

  setContext(context: Partial<ErrorContext>): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): ErrorContext {
    return { ...this.context };
  }

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    const crumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: Date.now(),
    };

    this.breadcrumbs.push(crumb);

    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.config.maxBreadcrumbs);
    }
  }

  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  captureException(error: Error, severity: ErrorSeverity = 'error'): ErrorEvent {
    const event: ErrorEvent = {
      id: generateId(),
      message: error.message,
      severity,
      timestamp: Date.now(),
      stackTrace: error.stack,
      context: { ...this.context },
      breadcrumbs: [...this.breadcrumbs],
      exception: {
        type: error.name,
        value: error.message,
        stacktrace: error.stack,
      },
    };

    this.processEvent(event);
    return event;
  }

  captureMessage(message: string, severity: ErrorSeverity = 'info'): ErrorEvent {
    const event: ErrorEvent = {
      id: generateId(),
      message,
      severity,
      timestamp: Date.now(),
      context: { ...this.context },
      breadcrumbs: [...this.breadcrumbs],
    };

    this.processEvent(event);
    return event;
  }

  async flush(): Promise<void> {
    const events = [...this.eventQueue];
    this.eventQueue = [];

    const sendPromises = events.flatMap((event) =>
      this.transports.map((transport) => transport.send(event)),
    );

    await Promise.allSettled(sendPromises);

    for (const transport of this.transports) {
      await transport.flush();
    }
  }

  getQueueSize(): number {
    return this.eventQueue.length;
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  private processEvent(event: ErrorEvent): void {
    // Apply severity filter
    if (this.config.severityFilter && !this.config.severityFilter.includes(event.severity)) {
      return;
    }

    // Apply sample rate
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    // Apply beforeSend hook
    if (this.config.beforeSend) {
      const modified = this.config.beforeSend(event);
      if (!modified) return;
      this.eventQueue.push(modified);
    } else {
      this.eventQueue.push(event);
    }
  }
}
