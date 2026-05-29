// ============================================================================
// Error Monitoring - Type Definitions
// ============================================================================

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface ErrorContext {
  user?: { id: string; email?: string; username?: string };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  environment?: string;
  release?: string;
  serverName?: string;
}

export interface Breadcrumb {
  type: 'navigation' | 'http' | 'ui' | 'console' | 'error' | 'default';
  category?: string;
  message: string;
  data?: Record<string, unknown>;
  level: ErrorSeverity;
  timestamp: number;
}

export interface ErrorEvent {
  id: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  stackTrace?: string;
  context: ErrorContext;
  breadcrumbs: Breadcrumb[];
  fingerprint?: string[];
  exception?: {
    type: string;
    value: string;
    stacktrace?: string;
  };
}

export interface ErrorConfig {
  dsn?: string;
  environment: string;
  release?: string;
  sampleRate: number;
  maxBreadcrumbs: number;
  beforeSend?: (event: ErrorEvent) => ErrorEvent | null;
  severityFilter?: ErrorSeverity[];
  debug: boolean;
}

export interface ErrorTransport {
  name: string;
  send(event: ErrorEvent): Promise<boolean>;
  flush(): Promise<void>;
}

export interface ErrorBoundaryOptions {
  onError: (error: Error, errorEvent: ErrorEvent) => void;
  onRecovery?: () => void;
  fallback?: string;
  captureUnhandled?: boolean;
}
