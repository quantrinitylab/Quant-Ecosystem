import { describe, expect, it } from 'vitest';
import { InMemoryMetricsRecorder } from '../src/index';

describe('InMemoryMetricsRecorder', () => {
  it('accumulates counters per label set', () => {
    const m = new InMemoryMetricsRecorder();
    m.incrementCounter('quanty.tasks.completed');
    m.incrementCounter('quanty.tasks.completed', 4);
    m.incrementCounter('quanty.tasks.completed', 2, { app: 'quantmail' });
    const snap = m.snapshot().filter((s) => s.name === 'quanty.tasks.completed');
    expect(snap).toHaveLength(2);
    const unlabeled = snap.find((s) => Object.keys(s.labels).length === 0);
    const labeled = snap.find((s) => s.labels['app'] === 'quantmail');
    expect(unlabeled?.kind).toBe('counter');
    if (unlabeled?.kind === 'counter') expect(unlabeled.value).toBe(5);
    if (labeled?.kind === 'counter') expect(labeled.value).toBe(2);
  });

  it('keeps the latest gauge value', () => {
    const m = new InMemoryMetricsRecorder();
    m.setGauge('quanty.sessions.active', 3);
    m.setGauge('quanty.sessions.active', 7);
    const snap = m.snapshot().find((s) => s.name === 'quanty.sessions.active');
    expect(snap?.kind).toBe('gauge');
    if (snap?.kind === 'gauge') expect(snap.value).toBe(7);
  });

  it('tracks histogram count, sum, min, and max', () => {
    const m = new InMemoryMetricsRecorder();
    m.observeHistogram('quanty.tool.latency_ms', 120);
    m.observeHistogram('quanty.tool.latency_ms', 40);
    m.observeHistogram('quanty.tool.latency_ms', 200);
    const snap = m.snapshot().find((s) => s.name === 'quanty.tool.latency_ms');
    expect(snap).toMatchObject({ kind: 'histogram', count: 3, sum: 360, min: 40, max: 200 });
  });

  it('rejects invalid recordings', () => {
    const m = new InMemoryMetricsRecorder();
    expect(() => m.incrementCounter('', 1)).toThrow('METRIC_NAME_REQUIRED');
    expect(() => m.incrementCounter('c', -1)).toThrow('COUNTER_MUST_NOT_DECREASE');
    expect(() => m.setGauge('g', Number.NaN)).toThrow('METRIC_VALUE_NOT_FINITE');
    expect(() => m.observeHistogram('h', Number.POSITIVE_INFINITY)).toThrow('METRIC_VALUE_NOT_FINITE');
  });

  it('resets a single metric or everything', () => {
    const m = new InMemoryMetricsRecorder();
    m.incrementCounter('a', 1);
    m.setGauge('b', 2);
    m.reset('a');
    expect(m.snapshot().some((s) => s.name === 'a')).toBe(false);
    expect(m.snapshot().some((s) => s.name === 'b')).toBe(true);
    m.reset();
    expect(m.snapshot()).toHaveLength(0);
  });

  it('returns detached snapshots', () => {
    const m = new InMemoryMetricsRecorder();
    m.setGauge('g', 1, { region: 'us' });
    const snap = m.snapshot();
    snap[0]!.labels['region'] = 'mutated';
    expect(m.snapshot()[0]?.labels['region']).toBe('us');
  });
});
