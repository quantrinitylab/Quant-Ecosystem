// ============================================================================
// Shared — neutral observability span port (OTel-compatible)
// quantmail-superhub · Task 23.1 (Requirements 23.2)
// ============================================================================
//
// PURPOSE
//   A tiny, dependency-free injectable seam for emitting tracing spans around
//   the SuperHub's instrumented operations (Requirement 23.2: "WHEN a delivery,
//   agent step, or retrieval operation runs, THE SuperHub SHALL emit OTel spans
//   for that operation").
//
//   The pillar modules (answers / agent) and the mail-domain delivery pipeline
//   each accept an OPTIONAL {@link SpanPort}. The PRODUCTION wiring injects an
//   adapter over `@quant/observability`'s `DistributedTracer`
//   ({@link createTracerSpanPort}) — exactly the OTel tracer the design names
//   (`@quant/observability` → "spans for delivery, agent steps, retrieval").
//   Offline/unit tests inject {@link RecordingSpanPort} to assert a span was
//   emitted, and when nothing is injected the {@link noopSpanPort} default makes
//   instrumentation a zero-cost no-op.
//
//   The port is declared STRUCTURALLY (no hard import of `@quant/observability`)
//   so a module never takes a build-time dependency on the tracer package — it
//   mirrors how the Retriever hides `@quant/ai` behind a structural
//   `EmbeddingPort`. The real `DistributedTracer` satisfies {@link TracerLike}
//   without any code change to the observability package.

/** Span attribute values permitted by the OTel data model (and our tracer). */
export type SpanAttributeValue = string | number | boolean;

/** A flat bag of span attributes. */
export type SpanAttributes = Record<string, SpanAttributeValue>;

/** Terminal status of a span (mirrors the OTel `SpanStatusCode`). */
export type SpanStatusCode = 'ok' | 'error' | 'unset';

/** The status a span ends with. */
export interface SpanEndStatus {
  code: SpanStatusCode;
  message?: string;
}

/**
 * A live span handle. Callers add attributes/errors while the operation runs and
 * MUST `end()` it exactly once (the {@link withSpan} helper does this for them).
 */
export interface SpanScope {
  /** Merge additional attributes onto the span. */
  setAttributes(attributes: SpanAttributes): void;
  /** Record an error on the span (does not end it). */
  recordError(error: unknown): void;
  /** End the span with an optional status (defaults to `ok`). */
  end(status?: SpanEndStatus): void;
}

/** The injectable tracing seam: start a named span and get a {@link SpanScope}. */
export interface SpanPort {
  startSpan(name: string, attributes?: SpanAttributes): SpanScope;
}

// ---------------------------------------------------------------------------
// No-op default (instrumentation is a zero-cost no-op when nothing is wired)
// ---------------------------------------------------------------------------

const noopScope: SpanScope = {
  setAttributes() {
    /* no-op */
  },
  recordError() {
    /* no-op */
  },
  end() {
    /* no-op */
  },
};

/** The default port: starting a span yields an inert scope. */
export const noopSpanPort: SpanPort = {
  startSpan() {
    return noopScope;
  },
};

// ---------------------------------------------------------------------------
// withSpan — wrap an operation in a span (the only way callers should span)
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside a span named `name`. The span is ended `ok` on success and
 * `error` (with the error recorded) on throw, then the error is re-thrown — so
 * instrumentation never changes the wrapped operation's observable behaviour.
 *
 * @param port  the span port (or `undefined` → {@link noopSpanPort}).
 * @param name  the span name (e.g. `answers.retrieve`, `agent.step`).
 * @param attributes initial span attributes.
 * @param fn    the operation; receives the live {@link SpanScope} to enrich.
 */
export async function withSpan<T>(
  port: SpanPort | undefined,
  name: string,
  attributes: SpanAttributes,
  fn: (scope: SpanScope) => Promise<T> | T,
): Promise<T> {
  const span = (port ?? noopSpanPort).startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.end({ code: 'ok' });
    return result;
  } catch (error) {
    span.recordError(error);
    span.end({
      code: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Production adapter over @quant/observability's DistributedTracer
// ---------------------------------------------------------------------------

/**
 * Structural view of `@quant/observability`'s `DistributedTracer` — exactly the
 * three methods the adapter calls. The real tracer satisfies this shape without
 * a hard import, keeping the modules free of a build-time dependency on the
 * observability package.
 */
export interface TracerLike {
  startSpan(
    name: string,
    kind?: string,
    parentContext?: unknown,
    attributes?: Record<string, string | number | boolean>,
  ): { id: string } | null;
  endSpan(spanId: string, status?: { code: SpanStatusCode; message?: string }): void;
  setSpanAttributes(spanId: string, attributes: Record<string, string | number | boolean>): void;
}

/**
 * Adapt a {@link TracerLike} (the real `DistributedTracer`) into a {@link
 * SpanPort}. Spans are created as `internal` spans; when the tracer declines to
 * sample (returns `null`) the adapter degrades to an inert scope so callers need
 * no null-handling.
 */
export function createTracerSpanPort(tracer: TracerLike): SpanPort {
  return {
    startSpan(name, attributes) {
      const span = tracer.startSpan(name, 'internal', undefined, attributes);
      if (!span) return noopScope;
      const id = span.id;
      return {
        setAttributes(attrs) {
          tracer.setSpanAttributes(id, attrs);
        },
        recordError(error) {
          tracer.setSpanAttributes(id, {
            'error.message': error instanceof Error ? error.message : String(error),
          });
        },
        end(status) {
          tracer.endSpan(id, status ?? { code: 'ok' });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Test double — records emitted spans for assertions
// ---------------------------------------------------------------------------

/** A span captured by {@link RecordingSpanPort}. */
export interface RecordedSpan {
  name: string;
  attributes: SpanAttributes;
  status?: SpanEndStatus;
  ended: boolean;
  errors: unknown[];
}

/**
 * An in-memory {@link SpanPort} that records every span it starts, for use in
 * unit tests asserting the instrumentation invariant (Req 23.2). Not used in
 * production.
 */
export class RecordingSpanPort implements SpanPort {
  readonly spans: RecordedSpan[] = [];

  startSpan(name: string, attributes: SpanAttributes = {}): SpanScope {
    const rec: RecordedSpan = {
      name,
      attributes: { ...attributes },
      ended: false,
      errors: [],
    };
    this.spans.push(rec);
    return {
      setAttributes(attrs) {
        Object.assign(rec.attributes, attrs);
      },
      recordError(error) {
        rec.errors.push(error);
      },
      end(status) {
        rec.ended = true;
        rec.status = status;
      },
    };
  }

  /** The names of every span started, in start order. */
  names(): string[] {
    return this.spans.map((s) => s.name);
  }

  /** All recorded spans with the given name. */
  withName(name: string): RecordedSpan[] {
    return this.spans.filter((s) => s.name === name);
  }
}
