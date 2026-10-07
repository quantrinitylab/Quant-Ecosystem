// ============================================================================
// Instrument Decorator - OTel-compatible Method Instrumentation
// ============================================================================

import { DistributedTracer } from './core/distributed-tracer';
import { InstrumentOptions } from './types';

let globalTracer: DistributedTracer | null = null;
let hasWarnedMissingTracer = false;

/**
 * Configure the tracer instance used by the @instrument() decorator.
 */
export function configureInstrument(tracer: DistributedTracer): void {
  globalTracer = tracer;
}

/**
 * Decorator factory that wraps class methods with tracing spans.
 * On method call: starts a span with method name (or custom name),
 * adds class name and args as attributes.
 * On success: ends span with ok status.
 * On error: sets span status to error, re-throws.
 * Works with both sync and async methods (detect Promise return).
 */
export function instrument(options?: InstrumentOptions) {
  return function <T extends Record<string, unknown>>(
    _target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const tracer = globalTracer;
      if (!tracer) {
        if (!hasWarnedMissingTracer) {
          hasWarnedMissingTracer = true;
          globalThis.console.warn(
            '[@quant/observability] @instrument() decorator invoked before configureInstrument() was called. ' +
              'Tracing is disabled. Call configureInstrument(tracer) during application startup.',
          );
        }
        return originalMethod.apply(this, args);
      }

      const spanName = options?.name ?? propertyKey;
      const className = (this as object).constructor?.name ?? 'Unknown';

      const attributes: Record<string, string | number | boolean> = {
        'code.function': propertyKey,
        'code.class': className,
      };

      if (options?.recordArgs !== false) {
        attributes['code.args_count'] = args.length;
      }

      const span = tracer.startSpan(spanName, 'internal', undefined, attributes);
      if (!span) {
        return originalMethod.apply(this, args);
      }

      try {
        const result = originalMethod.apply(this, args);

        // Detect async methods (Promise return)
        if (result instanceof Promise) {
          return result
            .then((value: unknown) => {
              tracer.endSpan(span.id, { code: 'ok' });
              return value;
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              tracer.setSpanAttributes(span.id, { 'error.message': errorMessage });
              tracer.endSpan(span.id, { code: 'error', message: errorMessage });
              throw error;
            });
        }

        // Sync method
        tracer.endSpan(span.id, { code: 'ok' });
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        tracer.setSpanAttributes(span.id, { 'error.message': errorMessage });
        tracer.endSpan(span.id, { code: 'error', message: errorMessage });
        throw error;
      }
    };

    return descriptor;
  };
}
