// ============================================================================
// Quant Ecosystem - Error Monitoring
// Comprehensive error capture, transport, and boundary management
// ============================================================================

export type {
  ErrorEvent,
  ErrorConfig,
  ErrorSeverity,
  ErrorContext,
  ErrorTransport,
  Breadcrumb,
  ErrorBoundaryOptions,
} from './types';

export { ErrorCapture } from './error-capture';
export { ErrorBoundary } from './error-boundary';
export type { ErrorBoundaryState } from './error-boundary';

export { SentryTransport } from './transports/sentry-transport';
export type { SentryTransportConfig } from './transports/sentry-transport';

export { GlitchTipTransport } from './transports/glitchtip-transport';
export type { GlitchTipTransportConfig } from './transports/glitchtip-transport';

export { ConsoleTransport } from './transports/console-transport';
export type { ConsoleTransportConfig } from './transports/console-transport';
