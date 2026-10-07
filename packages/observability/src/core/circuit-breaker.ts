// ============================================================================
// Circuit Breaker - Resilience Pattern for Fault Tolerance
// ============================================================================

import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerEvent,
} from '../types';

interface CallRecord {
  timestamp: number;
  success: boolean;
}

type EventListener = (event: CircuitBreakerEvent) => void;

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private config: CircuitBreakerConfig;
  private callHistory: CallRecord[] = [];
  private halfOpenSuccesses: number = 0;
  private halfOpenFailures: number = 0;
  private halfOpenAttempts: number = 0;
  private lastStateChange: number = Date.now();
  private openedAt: number | null = null;
  private metrics: CircuitBreakerMetrics;
  private listeners: Map<string, EventListener[]> = new Map();
  private fallbackFn: ((error: Error) => any) | null = null;
  private manualOverride: CircuitState | null = null;
  private events: CircuitBreakerEvent[] = [];

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      successThreshold: config?.successThreshold ?? 3,
      timeout: config?.timeout ?? 30000,
      halfOpenRequests: config?.halfOpenRequests ?? 3,
      windowSize: config?.windowSize ?? 60000,
      volumeThreshold: config?.volumeThreshold ?? 10,
    };

    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      rejectedCount: 0,
      stateTransitions: 0,
      lastFailure: null,
      lastSuccess: null,
    };
  }

  // Execute a function through the circuit breaker
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const effectiveState = this.getEffectiveState();

    // Check if circuit is open
    if (effectiveState === 'open') {
      // Check if timeout has elapsed -> transition to half-open
      if (this.shouldTransitionToHalfOpen()) {
        this.transitionTo('halfOpen');
      } else {
        this.metrics.rejectedCount++;
        this.metrics.totalCalls++;
        this.emitEvent('rejected');

        if (this.fallbackFn) {
          return this.fallbackFn(new Error('Circuit breaker is OPEN'));
        }
        throw new Error('Circuit breaker is OPEN - request rejected');
      }
    }

    // Check half-open request limit
    if (effectiveState === 'halfOpen' && this.halfOpenAttempts >= this.config.halfOpenRequests) {
      this.metrics.rejectedCount++;
      this.metrics.totalCalls++;
      this.emitEvent('rejected');

      if (this.fallbackFn) {
        return this.fallbackFn(new Error('Circuit breaker HALF_OPEN limit reached'));
      }
      throw new Error('Circuit breaker HALF_OPEN - max probe requests reached');
    }

    // Execute the function
    this.metrics.totalCalls++;
    if (effectiveState === 'halfOpen') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      if (this.fallbackFn) {
        return this.fallbackFn(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  // Record a successful call
  private recordSuccess(): void {
    const now = Date.now();
    this.metrics.successCount++;
    this.metrics.lastSuccess = now;
    this.callHistory.push({ timestamp: now, success: true });
    this.emitEvent('success');

    const effectiveState = this.getEffectiveState();

    if (effectiveState === 'halfOpen') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }

    this.pruneHistory();
  }

  // Record a failed call
  private recordFailure(): void {
    const now = Date.now();
    this.metrics.failureCount++;
    this.metrics.lastFailure = now;
    this.callHistory.push({ timestamp: now, success: false });
    this.emitEvent('failure');

    const effectiveState = this.getEffectiveState();

    if (effectiveState === 'halfOpen') {
      this.halfOpenFailures++;
      // Any failure in half-open immediately re-opens
      this.transitionTo('open');
    } else if (effectiveState === 'closed') {
      // Check if failure threshold is reached within window
      if (this.shouldOpen()) {
        this.transitionTo('open');
      }
    }

    this.pruneHistory();
  }

  // Check if circuit should open (closed -> open)
  private shouldOpen(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowSize;
    const recentCalls = this.callHistory.filter(c => c.timestamp >= windowStart);

    // Need minimum volume before opening
    if (recentCalls.length < this.config.volumeThreshold) return false;

    const failures = recentCalls.filter(c => !c.success).length;
    return failures >= this.config.failureThreshold;
  }

  // Check if timeout elapsed to transition from open -> half-open
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.openedAt) return false;
    return (Date.now() - this.openedAt) >= this.config.timeout;
  }

  // Transition to a new state
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    if (previousState === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();
    this.metrics.stateTransitions++;

    if (newState === 'open') {
      this.openedAt = Date.now();
    } else if (newState === 'halfOpen') {
      this.halfOpenSuccesses = 0;
      this.halfOpenFailures = 0;
      this.halfOpenAttempts = 0;
    } else if (newState === 'closed') {
      this.openedAt = null;
      this.callHistory = [];
    }

    // Emit state change event
    const event: CircuitBreakerEvent = {
      type: 'stateChange',
      timestamp: Date.now(),
      state: newState,
      previousState,
    };
    this.events.push(event);
    this.notifyListeners('stateChange', event);
  }

  // Get effective state (considering manual override)
  private getEffectiveState(): CircuitState {
    return this.manualOverride ?? this.state;
  }

  // Prune old history outside the window
  private pruneHistory(): void {
    const cutoff = Date.now() - this.config.windowSize;
    this.callHistory = this.callHistory.filter(c => c.timestamp >= cutoff);
  }

  // Emit an event
  private emitEvent(type: 'success' | 'failure' | 'rejected'): void {
    const event: CircuitBreakerEvent = {
      type,
      timestamp: Date.now(),
      state: this.getEffectiveState(),
    };
    this.events.push(event);
    this.notifyListeners(type, event);

    // Limit event history
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  // Notify event listeners
  private notifyListeners(type: string, event: CircuitBreakerEvent): void {
    const listeners = this.listeners.get(type) || [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (_) {
        // Ignore listener errors
      }
    }
  }

  // Register event listener
  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  // Remove event listener
  off(event: string, listener: EventListener): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  // Set fallback function
  setFallback(fn: (error: Error) => any): void {
    this.fallbackFn = fn;
  }

  // Remove fallback
  removeFallback(): void {
    this.fallbackFn = null;
  }

  // Manual override: force open
  forceOpen(): void {
    this.manualOverride = 'open';
    this.openedAt = Date.now();
  }

  // Manual override: force close
  forceClose(): void {
    this.manualOverride = 'closed';
    this.callHistory = [];
  }

  // Remove manual override
  clearOverride(): void {
    this.manualOverride = null;
  }

  // Get current state
  getState(): CircuitState {
    return this.getEffectiveState();
  }

  // Get metrics
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  // Get failure rate in current window
  getFailureRate(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowSize;
    const recentCalls = this.callHistory.filter(c => c.timestamp >= windowStart);
    if (recentCalls.length === 0) return 0;

    const failures = recentCalls.filter(c => !c.success).length;
    return failures / recentCalls.length;
  }

  // Get success rate in current window
  getSuccessRate(): number {
    return 1 - this.getFailureRate();
  }

  // Get time since last state change
  getTimeSinceLastTransition(): number {
    return Date.now() - this.lastStateChange;
  }

  // Get recent events
  getEvents(count?: number): CircuitBreakerEvent[] {
    const limit = count || this.events.length;
    return this.events.slice(-limit);
  }

  // Get config
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  // Update config
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    Object.assign(this.config, config);
  }

  // Check if circuit is allowing requests
  isCallPermitted(): boolean {
    const effectiveState = this.getEffectiveState();
    if (effectiveState === 'closed') return true;
    if (effectiveState === 'open') return this.shouldTransitionToHalfOpen();
    if (effectiveState === 'halfOpen') return this.halfOpenAttempts < this.config.halfOpenRequests;
    return false;
  }

  // Reset circuit breaker
  reset(): void {
    this.state = 'closed';
    this.callHistory = [];
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = null;
    this.manualOverride = null;
    this.lastStateChange = Date.now();
    this.events = [];
    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      rejectedCount: 0,
      stateTransitions: 0,
      lastFailure: null,
      lastSuccess: null,
    };
  }
}
