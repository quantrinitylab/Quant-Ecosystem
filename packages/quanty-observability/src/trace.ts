/**
 * Quanty trace contracts.
 *
 * Typed contracts for distributed trace spans emitted by Quanty runtime
 * components. This module defines the shape of spans only; it performs no
 * I/O and exports nothing over the network. An in-memory collector is
 * provided so tests and local tooling can capture spans without a backend.
 */

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export type SpanStatusCode = 'ok' | 'error' | 'unset';

export type SpanAttributeValue = string | number | boolean;

export interface SpanAttributes {
  [key: string]: SpanAttributeValue;
}

export interface SpanEvent {
  name: string;
  timestampMs: number;
  attributes?: SpanAttributes;
}

/** Minimal propagation context. traceId/spanId are opaque identifiers. */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface StartSpanOptions {
  /** Parent span (or its context). Child inherits the parent's traceId. */
  parent?: SpanContext | SpanHandle;
  kind?: SpanKind;
  attributes?: SpanAttributes;
  /** Override for tests; defaults to Date.now(). */
  startTimeMs?: number;
}

export interface FinishedSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  status: SpanStatusCode;
  attributes: SpanAttributes;
  events: SpanEvent[];
}

export interface SpanHandle {
  readonly context: SpanContext;
  readonly name: string;
  setAttribute(key: string, value: SpanAttributeValue): void;
  setAttributes(attrs: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  /** Start a child span nested under this span. */
  child(name: string, options?: Omit<StartSpanOptions, 'parent'>): SpanHandle;
  end(status?: SpanStatusCode, attributes?: SpanAttributes): FinishedSpan;
  isEnded(): boolean;
}

export interface TraceCollector {
  startSpan(name: string, options?: StartSpanOptions): SpanHandle;
  /** Contexts of spans that have started but not yet ended. */
  activeSpans(): SpanContext[];
  /** Spans that have ended, in end order. */
  finishedSpans(): FinishedSpan[];
  /** Snapshot of finished spans without clearing them. */
  export(): FinishedSpan[];
  /** Discard all captured spans (active handles keep working). */
  clear(): void;
}

export interface CollectorDeps {
  now?: () => number;
  newId?: () => string;
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function parentContext(parent: SpanContext | SpanHandle | undefined): SpanContext | undefined {
  if (!parent) return undefined;
  return 'context' in parent ? parent.context : parent;
}

class InMemorySpan implements SpanHandle {
  readonly context: SpanContext;
  private ended = false;
  private readonly attributes: SpanAttributes;
  private readonly events: SpanEvent[] = [];

  constructor(
    private readonly collector: InMemoryTraceCollector,
    readonly name: string,
    private readonly kind: SpanKind,
    private readonly startTimeMs: number,
    traceId: string,
    parentSpanId: string | undefined,
    initialAttributes: SpanAttributes | undefined,
    private readonly now: () => number,
    private readonly newId: () => string,
  ) {
    this.context = parentSpanId
      ? { traceId, spanId: this.newId(), parentSpanId }
      : { traceId, spanId: this.newId() };
    this.attributes = { ...(initialAttributes ?? {}) };
  }

  setAttribute(key: string, value: SpanAttributeValue): void {
    this.assertOpen();
    this.attributes[key] = value;
  }

  setAttributes(attrs: SpanAttributes): void {
    this.assertOpen();
    Object.assign(this.attributes, attrs);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.assertOpen();
    this.events.push(
      attributes ? { name, timestampMs: this.now(), attributes: { ...attributes } } : { name, timestampMs: this.now() },
    );
  }

  child(name: string, options?: Omit<StartSpanOptions, 'parent'>): SpanHandle {
    return this.collector.startSpan(name, { ...options, parent: this });
  }

  end(status: SpanStatusCode = 'unset', attributes?: SpanAttributes): FinishedSpan {
    this.assertOpen();
    if (attributes) Object.assign(this.attributes, attributes);
    const endTimeMs = this.now();
    const finished: FinishedSpan = {
      spanId: this.context.spanId,
      traceId: this.context.traceId,
      ...(this.context.parentSpanId ? { parentSpanId: this.context.parentSpanId } : {}),
      name: this.name,
      kind: this.kind,
      startTimeMs: this.startTimeMs,
      endTimeMs,
      durationMs: Math.max(0, endTimeMs - this.startTimeMs),
      status,
      attributes: { ...this.attributes },
      events: this.events.map((e) => ({ ...e, attributes: e.attributes ? { ...e.attributes } : undefined })),
    };
    this.ended = true;
    this.collector.finish(this, finished);
    return finished;
  }

  isEnded(): boolean {
    return this.ended;
  }

  private assertOpen(): void {
    if (this.ended) throw new Error('SPAN_ALREADY_ENDED');
  }
}

/**
 * In-memory trace collector. Keeps every finished span in process memory;
 * intended for tests, CLIs, and the local visible-mode UI — not for
 * production backends. Callers that log or export spans must pass them
 * through the redaction module first; this collector never inspects
 * attribute values.
 */
export class InMemoryTraceCollector implements TraceCollector {
  private readonly active = new Map<string, InMemorySpan>();
  private readonly finished: FinishedSpan[] = [];
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(deps: CollectorDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? defaultId;
  }

  startSpan(name: string, options: StartSpanOptions = {}): SpanHandle {
    if (!name) throw new Error('SPAN_NAME_REQUIRED');
    const parent = parentContext(options.parent);
    const traceId = parent?.traceId ?? this.newId();
    const span = new InMemorySpan(
      this,
      name,
      options.kind ?? 'internal',
      options.startTimeMs ?? this.now(),
      traceId,
      parent?.spanId,
      options.attributes,
      this.now,
      this.newId,
    );
    this.active.set(span.context.spanId, span);
    return span;
  }

  activeSpans(): SpanContext[] {
    return [...this.active.values()].map((s) => ({ ...s.context }));
  }

  finishedSpans(): FinishedSpan[] {
    return this.finished.map((s) => ({
      ...s,
      attributes: { ...s.attributes },
      events: s.events.map((e) => ({ ...e, attributes: e.attributes ? { ...e.attributes } : undefined })),
    }));
  }

  export(): FinishedSpan[] {
    return this.finishedSpans();
  }

  clear(): void {
    this.finished.length = 0;
    this.active.clear();
  }

  /** @internal called by InMemorySpan.end */
  finish(span: InMemorySpan, finished: FinishedSpan): void {
    this.active.delete(span.context.spanId);
    this.finished.push(finished);
  }
}
