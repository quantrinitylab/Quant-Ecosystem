// ============================================================================
// Error Monitoring - Initialization Helper
// Convenience function for production setup with global error handlers
// ============================================================================

import { ErrorCapture } from './error-capture';
import { SentryTransport } from './transports/sentry-transport';
import { GlitchTipTransport } from './transports/glitchtip-transport';

export interface InitErrorMonitoringConfig {
  dsn: string;
  environment?: string;
  release?: string;
  provider: 'sentry' | 'glitchtip';
  sampleRate?: number;
  debug?: boolean;
}

export function initErrorMonitoring(config: InitErrorMonitoringConfig): ErrorCapture {
  if (!config.dsn) {
    throw new Error('Error monitoring DSN is required');
  }

  const capture = new ErrorCapture({
    dsn: config.dsn,
    environment: config.environment ?? 'production',
    release: config.release,
    sampleRate: config.sampleRate ?? 1.0,
    debug: config.debug ?? false,
  });

  if (config.provider === 'sentry') {
    capture.addTransport(new SentryTransport({ dsn: config.dsn }));
  } else {
    capture.addTransport(new GlitchTipTransport({ dsn: config.dsn }));
  }

  setupGlobalHandlers(capture);

  return capture;
}

function setupGlobalHandlers(capture: ErrorCapture): void {
  // Detect browser vs Node environment without relying on DOM types
  const isBrowser =
    typeof globalThis !== 'undefined' && 'window' in globalThis && 'document' in globalThis;

  if (isBrowser) {
    // Browser environment - use globalThis to access window APIs
    const win = globalThis as unknown as {
      onerror:
        | ((
            message: string | Event,
            source?: string,
            lineno?: number,
            colno?: number,
            error?: Error,
          ) => void)
        | null;
      addEventListener: (type: string, handler: (event: unknown) => void) => void;
    };

    const previousOnerror = win.onerror;

    win.onerror = (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      if (error) {
        capture.captureException(error, 'error');
      }
      if (previousOnerror) {
        previousOnerror(message, source, lineno, colno, error);
      }
    };

    win.addEventListener('unhandledrejection', (event: unknown) => {
      const rejectionEvent = event as { reason?: unknown };
      const reason = rejectionEvent.reason;
      const error = reason instanceof Error ? reason : new Error(String(reason));
      capture.captureException(error, 'error');
    });
  } else if (typeof process !== 'undefined' && process.on) {
    // Node.js environment
    process.on('uncaughtException', (error: Error) => {
      capture.captureException(error, 'fatal');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      capture.captureException(error, 'error');
    });
  }
}
