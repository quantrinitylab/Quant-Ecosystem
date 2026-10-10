import type { TraceCollector } from '@quant/quanty-observability';
import type { QuantyRuntimeEvent } from '@quant/quanty-contracts';
import type { QuantyEventSink } from './runtime';

/**
 * QuantyEventSink decorator that records every published runtime event as a
 * trace span in an injected TraceCollector, then forwards the event to the
 * inner sink unchanged.
 *
 * Span attributes carry identifiers only (event / correlation / session /
 * task / node). The event payload is never copied into a span: payloads may
 * contain secrets or PII, and spans are exactly what gets logged and
 * exported — the redaction module in @quant/quanty-observability exists for
 * payload-shaped data, and keeping payloads out of spans removes the need.
 *
 * If the inner sink throws, the span ends with status 'error' and the error
 * propagates to the caller unchanged.
 */
export class TracingEventSink implements QuantyEventSink {
  constructor(
    private readonly inner: QuantyEventSink,
    private readonly traces: TraceCollector,
  ) {}

  async publish(event: QuantyRuntimeEvent): Promise<void> {
    const span = this.traces.startSpan(event.type, {
      attributes: {
        eventId: event.eventId,
        correlationId: event.correlationId,
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(event.taskId ? { taskId: event.taskId } : {}),
        ...(event.nodeId ? { nodeId: event.nodeId } : {}),
      },
    });
    try {
      await this.inner.publish(event);
      span.end('ok');
    } catch (error) {
      span.end('error');
      throw error;
    }
  }
}
