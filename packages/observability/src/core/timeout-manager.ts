// ============================================================================
// Timeout Manager - Cascading Timeout and Deadline Management
// ============================================================================

import { TimeoutConfig, TimeoutContext, TimeoutResult } from '../types';

interface TimeoutPolicy {
  operation: string;
  timeout: number;
  adaptiveEnabled: boolean;
}

interface LatencyObservation {
  duration: number;
  timestamp: number;
}

type TimeoutCallback = (operation: string, elapsed: number, configured: number) => void;

export class TimeoutManager {
  private config: TimeoutConfig;
  private policies: Map<string, TimeoutPolicy> = new Map();
  private activeContexts: Map<string, TimeoutContext> = new Map();
  private latencyHistory: Map<string, LatencyObservation[]> = new Map();
  private adaptiveTimeouts: Map<string, number> = new Map();
  private onTimeoutCallback: TimeoutCallback | null = null;
  private totalTimeouts: number = 0;
  private totalExecutions: number = 0;
  private cancelTokens: Map<string, boolean> = new Map();

  constructor(config?: Partial<TimeoutConfig>) {
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      deadline: config?.deadline ?? null,
      propagate: config?.propagate ?? true,
      adaptiveEnabled: config?.adaptiveEnabled ?? false,
      adaptiveMultiplier: config?.adaptiveMultiplier ?? 3,
    };
  }

  // Execute a function with timeout
  async executeWithTimeout<T>(
    operation: string,
    fn: (ctx: TimeoutContext) => Promise<T>,
    timeoutMs?: number,
    parentContext?: TimeoutContext,
  ): Promise<TimeoutResult<T>> {
    this.totalExecutions++;
    const effectiveTimeout = this.getEffectiveTimeout(operation, timeoutMs, parentContext);
    const startTime = Date.now();
    const deadline = startTime + effectiveTimeout;

    const context: TimeoutContext = {
      startTime,
      deadline,
      remaining: effectiveTimeout,
      operation,
      parent: parentContext || null,
    };

    const contextId = `${operation}_${startTime}_${Math.random().toString(36).substr(2, 6)}`;
    this.activeContexts.set(contextId, context);
    this.cancelTokens.set(contextId, false);

    try {
      const result = await this.race(fn, context, contextId, effectiveTimeout);
      const elapsed = Date.now() - startTime;

      // Record latency for adaptive timeout
      this.recordLatency(operation, elapsed);
      this.activeContexts.delete(contextId);
      this.cancelTokens.delete(contextId);

      return {
        value: result,
        timedOut: false,
        elapsed,
        operation,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.activeContexts.delete(contextId);
      this.cancelTokens.delete(contextId);

      if (error instanceof TimeoutError) {
        this.totalTimeouts++;
        if (this.onTimeoutCallback) {
          this.onTimeoutCallback(operation, elapsed, effectiveTimeout);
        }
        return {
          timedOut: true,
          elapsed,
          operation,
        };
      }
      throw error;
    }
  }

  // Race between function execution and timeout
  private async race<T>(
    fn: (ctx: TimeoutContext) => Promise<T>,
    context: TimeoutContext,
    contextId: string,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.cancelTokens.set(contextId, true);
          reject(
            new TimeoutError(
              `Operation '${context.operation}' timed out after ${timeoutMs}ms`,
              context.operation,
              timeoutMs,
              Date.now() - context.startTime,
            ),
          );
        }
      }, timeoutMs);

      fn(context)
        .then((result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        });
    });
  }

  // Get effective timeout considering policies, adaptive, and parent context
  private getEffectiveTimeout(
    operation: string,
    overrideMs?: number,
    parentContext?: TimeoutContext,
  ): number {
    // Priority: override > adaptive > policy > default
    let timeout: number;

    if (overrideMs !== undefined) {
      timeout = overrideMs;
    } else if (this.config.adaptiveEnabled && this.adaptiveTimeouts.has(operation)) {
      timeout = this.adaptiveTimeouts.get(operation)!;
    } else if (this.policies.has(operation)) {
      timeout = this.policies.get(operation)!.timeout;
    } else {
      timeout = this.config.defaultTimeout;
    }

    // Propagate: constrain by parent remaining time
    if (this.config.propagate && parentContext) {
      const parentRemaining = parentContext.deadline - Date.now();
      timeout = Math.min(timeout, Math.max(0, parentRemaining));
    }

    // Constrain by global deadline
    if (this.config.deadline !== null) {
      timeout = Math.min(timeout, this.config.deadline);
    }

    return timeout;
  }

  // Record latency observation
  private recordLatency(operation: string, duration: number): void {
    if (!this.latencyHistory.has(operation)) {
      this.latencyHistory.set(operation, []);
    }
    const history = this.latencyHistory.get(operation)!;
    history.push({ duration, timestamp: Date.now() });

    // Keep last 100 observations
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    // Update adaptive timeout
    if (this.config.adaptiveEnabled) {
      this.updateAdaptiveTimeout(operation);
    }
  }

  // Update adaptive timeout based on p99 latency
  private updateAdaptiveTimeout(operation: string): void {
    const history = this.latencyHistory.get(operation);
    if (!history || history.length < 10) return;

    const sorted = [...history].map((h) => h.duration).sort((a, b) => a - b);
    const p99Index = Math.ceil(sorted.length * 0.99) - 1;
    const p99 = sorted[Math.max(0, p99Index)]!;

    // Adaptive timeout = p99 * multiplier
    const adaptiveTimeout = Math.ceil(p99 * this.config.adaptiveMultiplier);
    this.adaptiveTimeouts.set(operation, adaptiveTimeout);
  }

  // Register a timeout policy for an operation
  registerPolicy(operation: string, timeout: number, adaptiveEnabled?: boolean): void {
    this.policies.set(operation, {
      operation,
      timeout,
      adaptiveEnabled: adaptiveEnabled ?? this.config.adaptiveEnabled,
    });
  }

  // Remove a policy
  removePolicy(operation: string): void {
    this.policies.delete(operation);
  }

  // Create a child timeout context
  createChildContext(
    operation: string,
    parentContext: TimeoutContext,
    timeoutMs?: number,
  ): TimeoutContext {
    const parentRemaining = parentContext.deadline - Date.now();
    const childTimeout =
      timeoutMs !== undefined ? Math.min(timeoutMs, parentRemaining) : parentRemaining;

    return {
      startTime: Date.now(),
      deadline: Date.now() + Math.max(0, childTimeout),
      remaining: Math.max(0, childTimeout),
      operation,
      parent: parentContext,
    };
  }

  // Get remaining budget for a context
  getRemainingBudget(context: TimeoutContext): number {
    return Math.max(0, context.deadline - Date.now());
  }

  // Check if a context has expired
  isExpired(context: TimeoutContext): boolean {
    return Date.now() >= context.deadline;
  }

  // Check if cancellation was requested
  isCancelled(contextId: string): boolean {
    return this.cancelTokens.get(contextId) ?? false;
  }

  // Set timeout callback
  setOnTimeoutCallback(callback: TimeoutCallback): void {
    this.onTimeoutCallback = callback;
  }

  // Get adaptive timeout for an operation
  getAdaptiveTimeout(operation: string): number | null {
    return this.adaptiveTimeouts.get(operation) || null;
  }

  // Get latency p99 for an operation
  getLatencyP99(operation: string): number | null {
    const history = this.latencyHistory.get(operation);
    if (!history || history.length === 0) return null;

    const sorted = [...history].map((h) => h.duration).sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[Math.max(0, index)]!;
  }

  // Get latency statistics for an operation
  getLatencyStats(
    operation: string,
  ): { count: number; min: number; max: number; avg: number; p50: number; p99: number } | null {
    const history = this.latencyHistory.get(operation);
    if (!history || history.length === 0) return null;

    const sorted = [...history].map((h) => h.duration).sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      avg: sum / sorted.length,
      p50: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
      p99: sorted[Math.ceil(sorted.length * 0.99) - 1]!,
    };
  }

  // Get active contexts
  getActiveContexts(): TimeoutContext[] {
    return Array.from(this.activeContexts.values());
  }

  // Get registered policies
  getPolicies(): TimeoutPolicy[] {
    return Array.from(this.policies.values());
  }

  // Get timeout rate
  getTimeoutRate(): number {
    if (this.totalExecutions === 0) return 0;
    return this.totalTimeouts / this.totalExecutions;
  }

  // Get stats
  getStats(): {
    totalExecutions: number;
    totalTimeouts: number;
    timeoutRate: number;
    activeContexts: number;
    policies: number;
  } {
    return {
      totalExecutions: this.totalExecutions,
      totalTimeouts: this.totalTimeouts,
      timeoutRate: this.getTimeoutRate(),
      activeContexts: this.activeContexts.size,
      policies: this.policies.size,
    };
  }

  // Update config
  updateConfig(config: Partial<TimeoutConfig>): void {
    Object.assign(this.config, config);
  }

  // Get config
  getConfig(): TimeoutConfig {
    return { ...this.config };
  }

  // Reset
  reset(): void {
    this.activeContexts.clear();
    this.latencyHistory.clear();
    this.adaptiveTimeouts.clear();
    this.cancelTokens.clear();
    this.totalTimeouts = 0;
    this.totalExecutions = 0;
  }
}

// Custom timeout error with enriched information
export class TimeoutError extends Error {
  public operation: string;
  public configuredTimeout: number;
  public elapsed: number;

  constructor(message: string, operation: string, configuredTimeout: number, elapsed: number) {
    super(message);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.configuredTimeout = configuredTimeout;
    this.elapsed = elapsed;
  }
}
