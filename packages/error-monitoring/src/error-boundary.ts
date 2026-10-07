// ============================================================================
// Error Monitoring - Error Boundary
// Provides error boundary utility with onError callback and recovery support
// ============================================================================

import type { ErrorBoundaryOptions, ErrorEvent, ErrorSeverity } from './types';
import { ErrorCapture } from './error-capture';

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  recoveryAttempts: number;
}

export class ErrorBoundary {
  private options: ErrorBoundaryOptions;
  private state: ErrorBoundaryState;
  private capture: ErrorCapture;
  private maxRecoveryAttempts: number;
  private globalHandler: ((event: { error?: Error; reason?: unknown }) => void) | null = null;

  constructor(options: ErrorBoundaryOptions, capture?: ErrorCapture) {
    this.options = options;
    this.capture = capture ?? new ErrorCapture();
    this.maxRecoveryAttempts = 3;
    this.state = {
      hasError: false,
      error: null,
      recoveryAttempts: 0,
    };
  }

  handleError(error: Error, severity: ErrorSeverity = 'error'): void {
    this.state.hasError = true;
    this.state.error = error;

    const event = this.capture.captureException(error, severity);
    this.options.onError(error, event);
  }

  recover(): boolean {
    if (!this.state.hasError) return true;

    if (this.state.recoveryAttempts >= this.maxRecoveryAttempts) {
      return false;
    }

    this.state.recoveryAttempts++;
    this.state.hasError = false;
    this.state.error = null;

    if (this.options.onRecovery) {
      this.options.onRecovery();
    }

    return true;
  }

  reset(): void {
    this.state = {
      hasError: false,
      error: null,
      recoveryAttempts: 0,
    };
  }

  getState(): ErrorBoundaryState {
    return { ...this.state };
  }

  getFallback(): string | undefined {
    if (this.state.hasError) {
      return this.options.fallback ?? 'Something went wrong';
    }
    return undefined;
  }

  wrap<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        this.handleError(new Error(String(error)));
      }
      return undefined;
    }
  }

  async wrapAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error) {
        this.handleError(error);
      } else {
        this.handleError(new Error(String(error)));
      }
      return undefined;
    }
  }

  setupGlobalHandler(): () => void {
    if (!this.options.captureUnhandled) return () => {};

    const handler = (event: { error?: Error; reason?: unknown }) => {
      const error =
        event.error ??
        (event.reason instanceof Error ? event.reason : new Error('Unhandled error'));
      this.handleError(error, 'fatal');
    };

    this.globalHandler = handler;

    return () => {
      this.globalHandler = null;
    };
  }

  getGlobalHandler(): ((event: { error?: Error; reason?: unknown }) => void) | null {
    return this.globalHandler;
  }

  captureUnhandled(error: Error): ErrorEvent {
    this.handleError(error, 'fatal');
    return this.capture.captureException(error, 'fatal');
  }
}
