// ============================================================================
// Data Pipeline Package - Aggregation Engine
// ============================================================================

import type {
  AggregationWindow,
  WindowType,
  AggregateFunction,
  AggregateFunctionType,
  WindowResult,
} from '../types';

/** Internal event representation */
interface AggregationEvent {
  timestamp: number;
  data: Record<string, unknown>;
  groupKey: string;
}

/** Active window state */
interface WindowState {
  windowId: string;
  windowStart: number;
  windowEnd: number;
  groupKey: string;
  events: AggregationEvent[];
  isClosed: boolean;
}

/** Session window tracking */
interface SessionState {
  groupKey: string;
  lastEventTime: number;
  events: AggregationEvent[];
  windowStart: number;
}

/**
 * AggregationEngine - Real-time windowed aggregation
 * Supports tumbling windows (fixed-size, non-overlapping),
 * sliding windows (fixed-size, overlapping by slide interval),
 * session windows (gap-based), and various aggregate functions.
 */
export class AggregationEngine {
  private windows: Map<string, AggregationWindow> = new Map();
  private windowStates: Map<string, WindowState[]> = new Map();
  private sessionStates: Map<string, SessionState> = new Map();
  private results: Map<string, WindowResult[]> = new Map();
  private watermark: number = 0;
  private lateEventCount: number = 0;

  /**
   * Register an aggregation window configuration
   */
  public registerAggregation(window: AggregationWindow): void {
    this.windows.set(window.id, window);
    this.windowStates.set(window.id, []);
    this.results.set(window.id, []);
  }

  /**
   * Add an event to all registered aggregation windows
   */
  public addEvent(
    timestamp: number,
    data: Record<string, unknown>,
    groupKey?: string
  ): void {
    const effectiveGroupKey = groupKey ?? this.computeGroupKey(data);
    const event: AggregationEvent = { timestamp, data, groupKey: effectiveGroupKey };

    // Check if event is late (before watermark)
    const isLate = timestamp < this.watermark;
    if (isLate) {
      this.lateEventCount++;
    }

    // Update watermark
    if (timestamp > this.watermark) {
      this.watermark = timestamp;
    }

    // Route event to all registered windows
    for (const [windowId, window] of this.windows.entries()) {
      switch (window.type) {
        case 'tumbling':
          this.addToTumblingWindow(windowId, window, event, isLate);
          break;
        case 'sliding':
          this.addToSlidingWindow(windowId, window, event, isLate);
          break;
        case 'session':
          this.addToSessionWindow(windowId, window, event);
          break;
      }
    }
  }

  /**
   * Get aggregation results for a specific window
   */
  public getWindowResult(windowId: string, groupKey?: string): WindowResult[] {
    const results = this.results.get(windowId) ?? [];
    if (groupKey) {
      return results.filter(r => r.groupKey === groupKey);
    }
    return results;
  }

  /**
   * Flush all open windows and compute final results
   */
  public flush(): WindowResult[] {
    const flushedResults: WindowResult[] = [];

    for (const [windowId, states] of this.windowStates.entries()) {
      const window = this.windows.get(windowId);
      if (!window) continue;

      for (const state of states) {
        if (!state.isClosed && state.events.length > 0) {
          const result = this.computeWindowResult(window, state);
          flushedResults.push(result);
          this.addResult(windowId, result);
          state.isClosed = true;
        }
      }
    }

    // Flush session windows
    for (const [key, session] of this.sessionStates.entries()) {
      if (session.events.length > 0) {
        const windowId = key.split(':')[0];
        const window = this.windows.get(windowId);
        if (window) {
          const state: WindowState = {
            windowId,
            windowStart: session.windowStart,
            windowEnd: session.lastEventTime,
            groupKey: session.groupKey,
            events: session.events,
            isClosed: true,
          };
          const result = this.computeWindowResult(window, state);
          flushedResults.push(result);
          this.addResult(windowId, result);
        }
      }
    }
    this.sessionStates.clear();

    return flushedResults;
  }

  /**
   * Get the current watermark
   */
  public getWatermark(): number {
    return this.watermark;
  }

  /**
   * Get count of late events
   */
  public getLateEventCount(): number {
    return this.lateEventCount;
  }

  /**
   * Advance watermark manually (closes windows behind the watermark)
   */
  public advanceWatermark(timestamp: number): WindowResult[] {
    this.watermark = timestamp;
    return this.closeExpiredWindows();
  }

  /**
   * Add event to tumbling window
   */
  private addToTumblingWindow(
    windowId: string,
    window: AggregationWindow,
    event: AggregationEvent,
    isLate: boolean
  ): void {
    const windowStart = Math.floor(event.timestamp / window.size) * window.size;
    const windowEnd = windowStart + window.size;
    const stateKey = `${windowId}:${event.groupKey}:${windowStart}`;

    let states = this.windowStates.get(windowId)!;
    let state = states.find(
      s => s.windowStart === windowStart && s.groupKey === event.groupKey && !s.isClosed
    );

    if (!state) {
      state = {
        windowId: stateKey,
        windowStart,
        windowEnd,
        groupKey: event.groupKey,
        events: [],
        isClosed: false,
      };
      states.push(state);
    }

    state.events.push(event);

    // Check if window should close (watermark has passed window end)
    if (this.watermark >= windowEnd + window.watermarkDelay) {
      this.closeWindow(windowId, window, state, isLate);
    }
  }

  /**
   * Add event to sliding window
   */
  private addToSlidingWindow(
    windowId: string,
    window: AggregationWindow,
    event: AggregationEvent,
    isLate: boolean
  ): void {
    const slide = window.slide ?? Math.floor(window.size / 2);
    const windowStart = Math.floor(event.timestamp / slide) * slide;

    // Event can belong to multiple overlapping windows
    const numWindows = Math.ceil(window.size / slide);

    let states = this.windowStates.get(windowId)!;

    for (let i = 0; i < numWindows; i++) {
      const start = windowStart - (i * slide);
      const end = start + window.size;

      if (event.timestamp >= start && event.timestamp < end) {
        let state = states.find(
          s => s.windowStart === start && s.groupKey === event.groupKey && !s.isClosed
        );

        if (!state) {
          state = {
            windowId: `${windowId}:${event.groupKey}:${start}`,
            windowStart: start,
            windowEnd: end,
            groupKey: event.groupKey,
            events: [],
            isClosed: false,
          };
          states.push(state);
        }

        state.events.push(event);

        // Close if expired
        if (this.watermark >= end + window.watermarkDelay) {
          this.closeWindow(windowId, window, state, isLate);
        }
      }
    }
  }

  /**
   * Add event to session window
   */
  private addToSessionWindow(
    windowId: string,
    window: AggregationWindow,
    event: AggregationEvent
  ): void {
    const sessionKey = `${windowId}:${event.groupKey}`;
    const gap = window.gap ?? window.size;
    const session = this.sessionStates.get(sessionKey);

    if (!session) {
      // Start new session
      this.sessionStates.set(sessionKey, {
        groupKey: event.groupKey,
        lastEventTime: event.timestamp,
        events: [event],
        windowStart: event.timestamp,
      });
    } else if (event.timestamp - session.lastEventTime > gap) {
      // Gap exceeded, close current session and start new one
      const state: WindowState = {
        windowId: sessionKey,
        windowStart: session.windowStart,
        windowEnd: session.lastEventTime,
        groupKey: session.groupKey,
        events: session.events,
        isClosed: true,
      };
      const result = this.computeWindowResult(window, state);
      this.addResult(windowId, result);

      // Start new session
      this.sessionStates.set(sessionKey, {
        groupKey: event.groupKey,
        lastEventTime: event.timestamp,
        events: [event],
        windowStart: event.timestamp,
      });
    } else {
      // Continue current session
      session.events.push(event);
      session.lastEventTime = event.timestamp;
    }
  }

  /**
   * Close a window and emit result
   */
  private closeWindow(
    windowId: string,
    window: AggregationWindow,
    state: WindowState,
    isLate: boolean
  ): void {
    if (state.isClosed) return;

    state.isClosed = true;
    const result = this.computeWindowResult(window, state);
    result.isLate = isLate;
    this.addResult(windowId, result);
  }

  /**
   * Close all windows that have expired based on current watermark
   */
  private closeExpiredWindows(): WindowResult[] {
    const closedResults: WindowResult[] = [];

    for (const [windowId, states] of this.windowStates.entries()) {
      const window = this.windows.get(windowId);
      if (!window) continue;

      for (const state of states) {
        if (!state.isClosed && this.watermark >= state.windowEnd + window.watermarkDelay) {
          state.isClosed = true;
          const result = this.computeWindowResult(window, state);
          closedResults.push(result);
          this.addResult(windowId, result);
        }
      }
    }

    return closedResults;
  }

  /**
   * Compute aggregation result for a window
   */
  private computeWindowResult(window: AggregationWindow, state: WindowState): WindowResult {
    const aggregates: Record<string, number> = {};

    for (const aggFn of window.aggregations) {
      const values = state.events
        .map(e => Number(e.data[aggFn.field]))
        .filter(v => !isNaN(v));

      aggregates[aggFn.alias] = this.computeAggregate(aggFn.type, values, aggFn.percentile);
    }

    return {
      windowId: state.windowId,
      windowStart: state.windowStart,
      windowEnd: state.windowEnd,
      groupKey: state.groupKey,
      aggregates,
      eventCount: state.events.length,
      isLate: false,
    };
  }

  /**
   * Compute a single aggregate value
   */
  private computeAggregate(
    type: AggregateFunctionType,
    values: number[],
    percentile?: number
  ): number {
    if (values.length === 0) return 0;

    switch (type) {
      case 'count':
        return values.length;

      case 'sum':
        return values.reduce((a, b) => a + b, 0);

      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;

      case 'min':
        return Math.min(...values);

      case 'max':
        return Math.max(...values);

      case 'percentile': {
        const p = (percentile ?? 50) / 100;
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.ceil(p * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
      }

      case 'distinct_count': {
        return new Set(values).size;
      }

      case 'first':
        return values[0];

      case 'last':
        return values[values.length - 1];

      case 'stddev': {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
      }

      case 'variance': {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      }

      default:
        return 0;
    }
  }

  /**
   * Compute group key from event data
   */
  private computeGroupKey(data: Record<string, unknown>): string {
    // Use first registered window's groupBy fields
    for (const window of this.windows.values()) {
      if (window.groupBy.length > 0) {
        return window.groupBy.map(field => String(data[field] ?? '')).join(':');
      }
    }
    return 'default';
  }

  /**
   * Store a window result
   */
  private addResult(windowId: string, result: WindowResult): void {
    if (!this.results.has(windowId)) {
      this.results.set(windowId, []);
    }
    this.results.get(windowId)!.push(result);
  }
}
