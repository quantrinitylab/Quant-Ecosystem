import { describe, expect, it, vi } from 'vitest';
import { InMemoryTraceCollector } from '@quant/quanty-observability';
import type { QuantyRuntimeEvent } from '@quant/quanty-contracts';
import { TracingEventSink } from '../src/tracing';

const event: QuantyRuntimeEvent = {
  eventId: 'evt-1',
  type: 'quanty.tool.execution.completed.v1',
  occurredAt: '2026-10-10T00:00:00.000Z',
  correlationId: 'task-1',
  sessionId: 'sess-1',
  taskId: 'task-1',
  nodeId: 'node-1',
  payload: { toolId: 'mail.send', apiKey: 'must-never-reach-a-span' },
};

describe('TracingEventSink', () => {
  it('forwards the event unchanged and records an ok span with identifiers only', async () => {
    const traces = new InMemoryTraceCollector();
    const inner = { publish: vi.fn(async (_event: QuantyRuntimeEvent) => {}) };
    const sink = new TracingEventSink(inner, traces);
    await sink.publish(event);
    expect(inner.publish).toHaveBeenCalledTimes(1);
    expect(inner.publish.mock.calls[0]?.[0]).toBe(event);
    const spans = traces.finishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe(event.type);
    expect(spans[0]?.status).toBe('ok');
    expect(spans[0]?.attributes).toEqual({
      eventId: 'evt-1',
      correlationId: 'task-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
      nodeId: 'node-1',
    });
    expect(JSON.stringify(spans)).not.toContain('must-never-reach-a-span');
  });

  it('ends the span with error and rethrows when the inner sink fails', async () => {
    const traces = new InMemoryTraceCollector();
    const boom = new Error('SINK_DOWN');
    const sink = new TracingEventSink(
      {
        publish: async () => {
          throw boom;
        },
      },
      traces,
    );
    await expect(sink.publish(event)).rejects.toBe(boom);
    const spans = traces.finishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status).toBe('error');
  });

  it('omits optional identifiers that are absent from the event', async () => {
    const traces = new InMemoryTraceCollector();
    const sink = new TracingEventSink({ publish: async () => {} }, traces);
    const bare: QuantyRuntimeEvent = {
      eventId: 'evt-2',
      type: 'quanty.session.started.v1',
      occurredAt: '2026-10-10T00:00:00.000Z',
      correlationId: 'corr-2',
      payload: null,
    };
    await sink.publish(bare);
    expect(traces.finishedSpans()[0]?.attributes).toEqual({ eventId: 'evt-2', correlationId: 'corr-2' });
  });
});
