// ============================================================================
// Distributed Tracer - OpenTelemetry-compatible Distributed Tracing
// ============================================================================

import {
  TraceContext,
  Span,
  SpanKind,
  SpanStatus,
  SpanEvent,
  SpanLink,
  SamplingConfig,
  TraceExport,
} from '../types';

export class DistributedTracer {
  private spans: Map<string, Span> = new Map();
  private traceSpans: Map<string, Set<string>> = new Map();
  private activeSpanStack: Span[] = [];
  private baggage: Map<string, Record<string, string>> = new Map();
  private samplingConfig: SamplingConfig;
  private completedTraces: TraceExport[] = [];
  private spanChildren: Map<string, string[]> = new Map();

  constructor(config?: Partial<SamplingConfig>) {
    this.samplingConfig = {
      headSamplingRate: config?.headSamplingRate ?? 1.0,
      tailSamplingEnabled: config?.tailSamplingEnabled ?? false,
      tailSamplingDurationThreshold: config?.tailSamplingDurationThreshold ?? 5000,
      tailSamplingErrorOnly: config?.tailSamplingErrorOnly ?? false,
    };
  }

  // Generate 128-bit trace ID (32 hex characters)
  generateTraceId(): string {
    const segments: string[] = [];
    for (let i = 0; i < 4; i++) {
      const segment = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0');
      segments.push(segment);
    }
    return segments.join('');
  }

  // Generate 64-bit span ID (16 hex characters)
  generateSpanId(): string {
    const segments: string[] = [];
    for (let i = 0; i < 2; i++) {
      const segment = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0');
      segments.push(segment);
    }
    return segments.join('');
  }

  // Head-based sampling decision
  private shouldSample(): boolean {
    return Math.random() < this.samplingConfig.headSamplingRate;
  }

  // Tail-based sampling decision (after trace completes)
  private shouldRetainTrace(spans: Span[]): boolean {
    if (!this.samplingConfig.tailSamplingEnabled) return true;

    // Retain if any span has error
    if (this.samplingConfig.tailSamplingErrorOnly) {
      return spans.some((s) => s.status.code === 'error');
    }

    // Retain if trace duration exceeds threshold
    const startTimes = spans.map((s) => s.startTime);
    const endTimes = spans.filter((s) => s.endTime !== null).map((s) => s.endTime as number);
    if (startTimes.length === 0 || endTimes.length === 0) return false;

    const traceDuration = Math.max(...endTimes) - Math.min(...startTimes);
    return traceDuration >= this.samplingConfig.tailSamplingDurationThreshold;
  }

  // Start a new span
  startSpan(
    name: string,
    kind: SpanKind = 'internal',
    parentContext?: TraceContext,
    attributes?: Record<string, string | number | boolean>,
  ): Span | null {
    let traceId: string;
    let parentId: string | null = null;
    let sampled = true;

    if (parentContext) {
      traceId = parentContext.traceId;
      parentId = parentContext.spanId;
      sampled = parentContext.sampled;
    } else {
      // Root span - make sampling decision
      sampled = this.shouldSample();
      traceId = this.generateTraceId();
    }

    if (!sampled) return null;

    const spanId = this.generateSpanId();
    const span: Span = {
      id: spanId,
      traceId,
      parentId,
      name,
      kind,
      startTime: Date.now(),
      endTime: null,
      status: { code: 'unset' },
      attributes: attributes || {},
      events: [],
      links: [],
    };

    this.spans.set(spanId, span);

    // Track spans per trace
    if (!this.traceSpans.has(traceId)) {
      this.traceSpans.set(traceId, new Set());
    }
    this.traceSpans.get(traceId)!.add(spanId);

    // Track parent-child relationships
    if (parentId) {
      if (!this.spanChildren.has(parentId)) {
        this.spanChildren.set(parentId, []);
      }
      this.spanChildren.get(parentId)!.push(spanId);
    }

    // Push to active stack
    this.activeSpanStack.push(span);

    return span;
  }

  // End a span
  endSpan(spanId: string, status?: SpanStatus): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = status || { code: 'ok' };

    // Remove from active stack
    const index = this.activeSpanStack.findIndex((s) => s.id === spanId);
    if (index !== -1) {
      this.activeSpanStack.splice(index, 1);
    }

    // Check if this completes the trace (all spans in trace are ended)
    const traceSpanIds = this.traceSpans.get(span.traceId);
    if (traceSpanIds) {
      const allEnded = Array.from(traceSpanIds).every((id) => {
        const s = this.spans.get(id);
        return s && s.endTime !== null;
      });

      if (allEnded) {
        this.finalizeTrace(span.traceId);
      }
    }
  }

  // Finalize a completed trace
  private finalizeTrace(traceId: string): void {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return;

    const spans = Array.from(spanIds)
      .map((id) => this.spans.get(id)!)
      .filter(Boolean);

    // Tail-based sampling check
    if (!this.shouldRetainTrace(spans)) return;

    const rootSpan = spans.find((s) => s.parentId === null) || null;
    const startTimes = spans.map((s) => s.startTime);
    const endTimes = spans.filter((s) => s.endTime !== null).map((s) => s.endTime as number);
    const duration =
      endTimes.length > 0 && startTimes.length > 0
        ? Math.max(...endTimes) - Math.min(...startTimes)
        : 0;

    const traceExport: TraceExport = {
      traceId,
      spans,
      rootSpan,
      duration,
      spanCount: spans.length,
    };

    this.completedTraces.push(traceExport);
  }

  // Add event to a span
  addSpanEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    const span = this.spans.get(spanId);
    if (!span || span.endTime !== null) return;

    const event: SpanEvent = {
      name,
      timestamp: Date.now(),
      attributes: attributes || {},
    };
    span.events.push(event);
  }

  // Add link between spans from different traces
  addSpanLink(
    spanId: string,
    linkedTraceId: string,
    linkedSpanId: string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    const link: SpanLink = {
      traceId: linkedTraceId,
      spanId: linkedSpanId,
      attributes: attributes || {},
    };
    span.links.push(link);
  }

  // Set span attributes
  setSpanAttributes(spanId: string, attributes: Record<string, string | number | boolean>): void {
    const span = this.spans.get(spanId);
    if (!span || span.endTime !== null) return;

    Object.assign(span.attributes, attributes);
  }

  // Get current active span
  getActiveSpan(): Span | null {
    return this.activeSpanStack.length > 0
      ? this.activeSpanStack[this.activeSpanStack.length - 1]!
      : null;
  }

  // Create trace context from span (for propagation)
  getTraceContext(spanId: string): TraceContext | null {
    const span = this.spans.get(spanId);
    if (!span) return null;

    return {
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentId,
      sampled: true,
      baggage: this.baggage.get(span.traceId) || {},
    };
  }

  // W3C Traceparent format injection: version-traceId-spanId-flags
  injectTraceContext(context: TraceContext): string {
    const version = '00';
    const flags = context.sampled ? '01' : '00';
    return `${version}-${context.traceId}-${context.spanId}-${flags}`;
  }

  // W3C Traceparent format extraction
  extractTraceContext(header: string): TraceContext | null {
    const parts = header.split('-');
    if (parts.length < 4) return null;

    const [version, traceId, spanId, flags] = parts;
    if (version !== '00') return null;
    if (traceId!.length !== 32 || spanId!.length !== 16) return null;

    const sampled = flags === '01';
    return {
      traceId: traceId!,
      spanId: spanId!,
      parentSpanId: null,
      sampled,
      baggage: this.baggage.get(traceId!) || {},
    };
  }

  // Set baggage item (propagated across services)
  setBaggageItem(traceId: string, key: string, value: string): void {
    if (!this.baggage.has(traceId)) {
      this.baggage.set(traceId, {});
    }
    this.baggage.get(traceId)![key] = value;
  }

  // Get baggage item
  getBaggageItem(traceId: string, key: string): string | undefined {
    return this.baggage.get(traceId)?.[key];
  }

  // Get all baggage for a trace
  getBaggage(traceId: string): Record<string, string> {
    return this.baggage.get(traceId) || {};
  }

  // Inject baggage as header (W3C baggage format)
  injectBaggage(traceId: string): string {
    const items = this.baggage.get(traceId);
    if (!items) return '';
    return Object.entries(items)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  // Extract baggage from header
  extractBaggage(header: string): Record<string, string> {
    const baggage: Record<string, string> = {};
    if (!header) return baggage;

    header.split(',').forEach((item) => {
      const [key, value] = item.split('=');
      if (key && value) {
        baggage[key.trim()] = value.trim();
      }
    });
    return baggage;
  }

  // Get span tree for a trace
  getSpanTree(traceId: string): Map<string, string[]> {
    const tree = new Map<string, string[]>();
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return tree;

    for (const spanId of spanIds) {
      const children = this.spanChildren.get(spanId) || [];
      tree.set(spanId, children);
    }
    return tree;
  }

  // Get span by ID
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  // Get children of a span
  getSpanChildren(spanId: string): Span[] {
    const childIds = this.spanChildren.get(spanId) || [];
    return childIds.map((id) => this.spans.get(id)).filter((s): s is Span => s !== undefined);
  }

  // Export trace
  exportTrace(traceId: string): TraceExport | null {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return null;

    const spans = Array.from(spanIds)
      .map((id) => this.spans.get(id)!)
      .filter(Boolean);

    const rootSpan = spans.find((s) => s.parentId === null) || null;
    const startTimes = spans.map((s) => s.startTime);
    const endTimes = spans.filter((s) => s.endTime !== null).map((s) => s.endTime as number);
    const duration =
      endTimes.length > 0 && startTimes.length > 0
        ? Math.max(...endTimes) - Math.min(...startTimes)
        : 0;

    return {
      traceId,
      spans,
      rootSpan,
      duration,
      spanCount: spans.length,
    };
  }

  // Get completed traces
  getCompletedTraces(): TraceExport[] {
    return [...this.completedTraces];
  }

  // Get all active spans
  getActiveSpans(): Span[] {
    return [...this.activeSpanStack];
  }

  // Get trace IDs
  getTraceIds(): string[] {
    return Array.from(this.traceSpans.keys());
  }

  // Update sampling config
  updateSamplingConfig(config: Partial<SamplingConfig>): void {
    Object.assign(this.samplingConfig, config);
  }

  // Get sampling config
  getSamplingConfig(): SamplingConfig {
    return { ...this.samplingConfig };
  }

  // Clear all data (for testing/reset)
  reset(): void {
    this.spans.clear();
    this.traceSpans.clear();
    this.activeSpanStack = [];
    this.baggage.clear();
    this.completedTraces = [];
    this.spanChildren.clear();
  }

  // Get statistics
  getStats(): {
    totalSpans: number;
    activeSpans: number;
    completedTraces: number;
    traceCount: number;
  } {
    return {
      totalSpans: this.spans.size,
      activeSpans: this.activeSpanStack.length,
      completedTraces: this.completedTraces.length,
      traceCount: this.traceSpans.size,
    };
  }

  // Compute span duration
  getSpanDuration(spanId: string): number | null {
    const span = this.spans.get(spanId);
    if (!span || span.endTime === null) return null;
    return span.endTime - span.startTime;
  }

  // Find slow spans in a trace
  findSlowSpans(traceId: string, threshold: number): Span[] {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return [];

    return Array.from(spanIds)
      .map((id) => this.spans.get(id)!)
      .filter((span) => {
        if (!span || span.endTime === null) return false;
        return span.endTime - span.startTime >= threshold;
      });
  }

  // Get critical path (longest chain of spans)
  getCriticalPath(traceId: string): Span[] {
    const spanIds = this.traceSpans.get(traceId);
    if (!spanIds) return [];

    const spans = Array.from(spanIds)
      .map((id) => this.spans.get(id)!)
      .filter(Boolean);

    const rootSpan = spans.find((s) => s.parentId === null);
    if (!rootSpan) return [];

    // DFS to find longest path by duration
    const findLongestPath = (spanId: string): Span[] => {
      const span = this.spans.get(spanId);
      if (!span) return [];

      const children = this.spanChildren.get(spanId) || [];
      if (children.length === 0) return [span];

      let longestChildPath: Span[] = [];
      for (const childId of children) {
        const childPath = findLongestPath(childId);
        const childDuration = childPath.reduce((sum, s) => {
          return sum + ((s.endTime || s.startTime) - s.startTime);
        }, 0);
        const longestDuration = longestChildPath.reduce((sum, s) => {
          return sum + ((s.endTime || s.startTime) - s.startTime);
        }, 0);
        if (childDuration > longestDuration) {
          longestChildPath = childPath;
        }
      }

      return [span, ...longestChildPath];
    };

    return findLongestPath(rootSpan.id);
  }
}
