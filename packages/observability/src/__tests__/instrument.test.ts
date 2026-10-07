import { describe, it, expect, beforeEach } from 'vitest';
import { instrument, configureInstrument } from '../instrument.js';
import { DistributedTracer } from '../core/distributed-tracer.js';

describe('instrument decorator', () => {
  let tracer: DistributedTracer;

  beforeEach(() => {
    tracer = new DistributedTracer({ headSamplingRate: 1.0 });
    configureInstrument(tracer);
  });

  function applyDecorator(
    target: object,
    propertyKey: string,
    options?: { name?: string; recordArgs?: boolean },
  ): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey)!;
    const decorated = instrument(options)(target as any, propertyKey, descriptor);
    Object.defineProperty(target, propertyKey, decorated);
  }

  it('creates a span for sync methods', () => {
    class TestService {
      greet(name: string): string {
        return `Hello, ${name}`;
      }
    }

    applyDecorator(TestService.prototype, 'greet');

    const svc = new TestService();
    const result = svc.greet('world');

    expect(result).toBe('Hello, world');
    const stats = tracer.getStats();
    expect(stats.totalSpans).toBe(1);
  });

  it('creates a span for async methods', async () => {
    class TestService {
      async fetchData(): Promise<string> {
        return 'data';
      }
    }

    applyDecorator(TestService.prototype, 'fetchData');

    const svc = new TestService();
    const result = await svc.fetchData();

    expect(result).toBe('data');
    const stats = tracer.getStats();
    expect(stats.totalSpans).toBe(1);
  });

  it('sets error status on thrown exceptions', () => {
    class TestService {
      fail(): void {
        throw new Error('test error');
      }
    }

    applyDecorator(TestService.prototype, 'fail');

    const svc = new TestService();
    expect(() => svc.fail()).toThrow('test error');

    const traceIds = tracer.getTraceIds();
    expect(traceIds.length).toBe(1);

    const exported = tracer.exportTrace(traceIds[0]!);
    expect(exported).not.toBeNull();
    const span = exported!.spans[0]!;
    expect(span.status.code).toBe('error');
    expect(span.attributes['error.message']).toBe('test error');
  });

  it('records method arguments as span attributes', () => {
    class TestService {
      add(a: number, b: number): number {
        return a + b;
      }
    }

    applyDecorator(TestService.prototype, 'add');

    const svc = new TestService();
    svc.add(1, 2);

    const traceIds = tracer.getTraceIds();
    const exported = tracer.exportTrace(traceIds[0]!);
    const span = exported!.spans[0]!;
    expect(span.attributes['code.args_count']).toBe(2);
    expect(span.attributes['code.function']).toBe('add');
    expect(span.attributes['code.class']).toBe('TestService');
  });

  it('respects custom span name option', () => {
    class TestService {
      doWork(): void {
        return;
      }
    }

    applyDecorator(TestService.prototype, 'doWork', { name: 'custom-span-name' });

    const svc = new TestService();
    svc.doWork();

    const traceIds = tracer.getTraceIds();
    const exported = tracer.exportTrace(traceIds[0]!);
    const span = exported!.spans[0]!;
    expect(span.name).toBe('custom-span-name');
  });
});
