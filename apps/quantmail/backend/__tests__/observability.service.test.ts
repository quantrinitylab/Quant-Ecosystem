// ============================================================================
// quantmail-superhub · Task 23.1 — observability span port (Req 23.2)
// ============================================================================
//
// The neutral, OTel-compatible span seam every instrumented operation (delivery,
// agent step, retrieval) emits through. These unit tests pin:
//   * `withSpan` ends a span `ok` on success and `error` (recording the error,
//     re-throwing) on failure, never changing the wrapped result;
//   * the `noopSpanPort` default is a zero-cost no-op;
//   * `RecordingSpanPort` captures emitted spans for assertions;
//   * `createTracerSpanPort` ADAPTS a `@quant/observability` `DistributedTracer`
//     (matched structurally via `TracerLike`) — startSpan -> setSpanAttributes
//     -> endSpan — and degrades to an inert scope when the tracer declines to
//     sample (returns null).

import { describe, it, expect, vi } from 'vitest';
import {
  withSpan,
  noopSpanPort,
  RecordingSpanPort,
  createTracerSpanPort,
  type TracerLike,
  type SpanStatusCode,
} from '../shared/observability';

describe('withSpan (Req 23.2)', () => {
  it('emits a span, ends it ok, and returns the operation result on success', async () => {
    const port = new RecordingSpanPort();

    const result = await withSpan(port, 'answers.retrieve', { 'answers.k': 8 }, async (span) => {
      span.setAttributes({ 'answers.result_count': 3 });
      return 'value';
    });

    expect(result).toBe('value');
    expect(port.names()).toEqual(['answers.retrieve']);
    const span = port.spans[0]!;
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: 'ok' });
    expect(span.attributes).toMatchObject({ 'answers.k': 8, 'answers.result_count': 3 });
  });

  it('records the error, ends the span `error`, and RE-THROWS on failure', async () => {
    const port = new RecordingSpanPort();
    const boom = new Error('delivery failed');

    await expect(
      withSpan(port, 'delivery.enqueue_send', {}, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const span = port.spans[0]!;
    expect(span.ended).toBe(true);
    expect(span.status?.code).toBe('error');
    expect(span.status?.message).toBe('delivery failed');
    expect(span.errors).toContain(boom);
  });

  it('defaults to the no-op port (no throw) when none is injected', async () => {
    const result = await withSpan(undefined, 'agent.step', {}, async () => 42);
    expect(result).toBe(42);
    // The no-op port produces an inert scope that ignores attribute/end calls.
    const scope = noopSpanPort.startSpan('x');
    expect(() => {
      scope.setAttributes({ a: 1 });
      scope.recordError(new Error('ignored'));
      scope.end({ code: 'ok' });
    }).not.toThrow();
  });
});

describe('createTracerSpanPort — adapts @quant/observability DistributedTracer (Req 23.2)', () => {
  /** A recording double matching the real DistributedTracer's span API shape. */
  function createTracerDouble() {
    const calls = {
      startSpan: vi.fn(),
      endSpan: vi.fn(),
      setSpanAttributes: vi.fn(),
    };
    let counter = 0;
    const tracer: TracerLike = {
      startSpan(name, _kind, _parent, attributes) {
        calls.startSpan(name, attributes);
        return { id: `span-${++counter}` };
      },
      endSpan(spanId, status) {
        calls.endSpan(spanId, status);
      },
      setSpanAttributes(spanId, attributes) {
        calls.setSpanAttributes(spanId, attributes);
      },
    };
    return { tracer, calls };
  }

  it('routes start/attributes/end through the underlying tracer', async () => {
    const { tracer, calls } = createTracerDouble();
    const port = createTracerSpanPort(tracer);

    await withSpan(port, 'delivery.process', { 'delivery.x': 1 }, async (span) => {
      span.setAttributes({ 'delivery.y': 2 });
    });

    expect(calls.startSpan).toHaveBeenCalledWith('delivery.process', { 'delivery.x': 1 });
    expect(calls.setSpanAttributes).toHaveBeenCalledWith('span-1', { 'delivery.y': 2 });
    expect(calls.endSpan).toHaveBeenCalledWith('span-1', { code: 'ok' as SpanStatusCode });
  });

  it('records an error attribute and ends `error` when the operation throws', async () => {
    const { tracer, calls } = createTracerDouble();
    const port = createTracerSpanPort(tracer);

    await expect(
      withSpan(port, 'agent.step', {}, async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');

    expect(calls.setSpanAttributes).toHaveBeenCalledWith('span-1', { 'error.message': 'nope' });
    expect(calls.endSpan).toHaveBeenCalledWith('span-1', { code: 'error', message: 'nope' });
  });

  it('degrades to an inert scope when the tracer declines to sample (null span)', async () => {
    const tracer: TracerLike = {
      startSpan: () => null,
      endSpan: vi.fn(),
      setSpanAttributes: vi.fn(),
    };
    const port = createTracerSpanPort(tracer);

    const result = await withSpan(port, 'answers.retrieve', {}, async (span) => {
      span.setAttributes({ a: 1 });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(tracer.endSpan).not.toHaveBeenCalled();
    expect(tracer.setSpanAttributes).not.toHaveBeenCalled();
  });
});
