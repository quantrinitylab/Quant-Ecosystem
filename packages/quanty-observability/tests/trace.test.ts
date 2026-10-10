import { describe, expect, it } from 'vitest';
import { InMemoryTraceCollector } from '../src/index';

function deterministic() {
  let n = 0;
  let t = 1000;
  return {
    collector: new InMemoryTraceCollector({
      now: () => (t += 10),
      newId: () => `id-${(n += 1)}`,
    }),
  };
}

describe('InMemoryTraceCollector', () => {
  it('creates a root span with a new trace id', () => {
    const { collector } = deterministic();
    const span = collector.startSpan('quanty.task');
    expect(span.context.traceId).toBe('id-1');
    expect(span.context.spanId).toBe('id-2');
    expect(span.context.parentSpanId).toBeUndefined();
    expect(collector.activeSpans()).toHaveLength(1);
    const finished = span.end('ok');
    expect(finished.traceId).toBe('id-1');
    expect(finished.name).toBe('quanty.task');
    expect(finished.status).toBe('ok');
    expect(finished.durationMs).toBeGreaterThanOrEqual(0);
    expect(finished.endTimeMs).toBeGreaterThanOrEqual(finished.startTimeMs);
    expect(collector.activeSpans()).toHaveLength(0);
  });

  it('nests child spans under the parent trace', () => {
    const { collector } = deterministic();
    const root = collector.startSpan('task.run');
    const child = root.child('tool.call', { kind: 'client' });
    const grandchild = collector.startSpan('llm.request', { parent: child.context });
    expect(child.context.traceId).toBe(root.context.traceId);
    expect(child.context.parentSpanId).toBe(root.context.spanId);
    expect(grandchild.context.traceId).toBe(root.context.traceId);
    expect(grandchild.context.parentSpanId).toBe(child.context.spanId);
    expect(grandchild.context.spanId).not.toBe(child.context.spanId);

    grandchild.end('ok');
    child.end('error', { 'error.message': 'timeout' });
    const finishedRoot = root.end();
    expect(finishedRoot.status).toBe('unset');

    const exported = collector.export();
    expect(exported.map((s) => s.name)).toEqual(['llm.request', 'tool.call', 'task.run']);
    const toolCall = exported.find((s) => s.name === 'tool.call');
    expect(toolCall?.status).toBe('error');
    expect(toolCall?.attributes['error.message']).toBe('timeout');
    expect(toolCall?.kind).toBe('client');
  });

  it('records attributes and events on spans', () => {
    const { collector } = deterministic();
    const span = collector.startSpan('session.start', { attributes: { 'session.id': 's1' } });
    span.setAttribute('user.id', 'u1');
    span.setAttributes({ retries: 2, cached: true });
    span.addEvent('cache.miss');
    span.addEvent('retry', { attempt: 1 });
    const finished = span.end('ok');
    expect(finished.attributes).toEqual({ 'session.id': 's1', 'user.id': 'u1', retries: 2, cached: true });
    expect(finished.events).toHaveLength(2);
    expect(finished.events[0]?.name).toBe('cache.miss');
    expect(finished.events[1]?.attributes).toEqual({ attempt: 1 });
    expect(finished.events[1]?.timestampMs).toBeGreaterThanOrEqual(finished.startTimeMs);
  });

  it('rejects double-end and empty names', () => {
    const { collector } = deterministic();
    const span = collector.startSpan('once');
    span.end();
    expect(() => span.end()).toThrow('SPAN_ALREADY_ENDED');
    expect(() => span.setAttribute('k', 'v')).toThrow('SPAN_ALREADY_ENDED');
    expect(() => collector.startSpan('')).toThrow('SPAN_NAME_REQUIRED');
  });

  it('exports a detached snapshot and clears on demand', () => {
    const { collector } = deterministic();
    collector.startSpan('a').end();
    collector.startSpan('b').end();
    const first = collector.export();
    expect(first).toHaveLength(2);
    first[0]!.attributes['mutated'] = true;
    expect(collector.finishedSpans()[0]?.attributes['mutated']).toBeUndefined();
    collector.clear();
    expect(collector.export()).toHaveLength(0);
  });
});
