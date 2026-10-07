// ============================================================================
// Error Monitoring - Console Transport
// Logs error events to console for local development
// ============================================================================

import type { ErrorEvent, ErrorSeverity, ErrorTransport } from '../types';

export interface ConsoleTransportConfig {
  minSeverity?: ErrorSeverity;
  verbose?: boolean;
  colorize?: boolean;
}

const SEVERITY_LEVELS: Record<ErrorSeverity, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  fatal: 4,
};

export class ConsoleTransport implements ErrorTransport {
  readonly name = 'console';
  private config: Required<ConsoleTransportConfig>;
  private events: ErrorEvent[] = [];

  constructor(config: ConsoleTransportConfig = {}) {
    this.config = {
      minSeverity: config.minSeverity ?? 'debug',
      verbose: config.verbose ?? false,
      colorize: config.colorize ?? true,
    };
  }

  async send(event: ErrorEvent): Promise<boolean> {
    const minLevel = SEVERITY_LEVELS[this.config.minSeverity];
    const eventLevel = SEVERITY_LEVELS[event.severity];

    if (eventLevel < minLevel) {
      return false;
    }

    this.events.push(event);
    this.logEvent(event);
    return true;
  }

  async flush(): Promise<void> {
    // Console transport sends immediately, nothing to flush
  }

  getLoggedEvents(): ErrorEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  private logEvent(event: ErrorEvent): void {
    const prefix = this.getPrefix(event.severity);
    const timestamp = new Date(event.timestamp).toISOString();

    const message = `${prefix} [${timestamp}] ${event.message}`;

    if (this.config.verbose) {
      const details = {
        id: event.id,
        severity: event.severity,
        context: event.context,
        breadcrumbs: event.breadcrumbs.length,
        exception: event.exception,
      };
      this.writeLog(event.severity, message, details);
    } else {
      this.writeLog(event.severity, message);
    }
  }

  private getPrefix(severity: ErrorSeverity): string {
    switch (severity) {
      case 'fatal':
        return '[FATAL]';
      case 'error':
        return '[ERROR]';
      case 'warning':
        return '[WARN]';
      case 'info':
        return '[INFO]';
      case 'debug':
        return '[DEBUG]';
    }
  }

  private writeLog(severity: ErrorSeverity, message: string, details?: object): void {
    const args: unknown[] = [message];
    if (details) args.push(details);

    switch (severity) {
      case 'fatal':
      case 'error':
        globalThis.console.error(...args);
        break;
      case 'warning':
        globalThis.console.warn(...args);
        break;
      case 'info':
        globalThis.console.info(...args);
        break;
      case 'debug':
        globalThis.console.debug(...args);
        break;
    }
  }
}
