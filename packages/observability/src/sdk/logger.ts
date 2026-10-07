import pino from 'pino';
import { getActiveTraceContext } from './tracing';

export interface LoggerConfig {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Create a structured logger that injects trace context (trace_id, span_id)
 * into every log entry when OpenTelemetry is active.
 */
export function createLogger(config: LoggerConfig): pino.Logger {
  const logger = pino({
    name: config.serviceName,
    level: config.level || process.env.LOG_LEVEL || 'info',
    transport: config.pretty ? { target: 'pino-pretty' } : undefined,
    mixin() {
      const traceCtx = getActiveTraceContext();
      if (traceCtx) {
        return {
          trace_id: traceCtx.traceId,
          span_id: traceCtx.spanId,
        };
      }
      return {};
    },
  });

  return logger;
}
