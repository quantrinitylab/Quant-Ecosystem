// ============================================================================
// AI Core - Circuit Breaker
// ============================================================================

import type {
  CircuitBreakerState,
  CircuitBreakerConfig,
  ProviderHealth,
  AIProvider,
} from '../types';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
};

/**
 * Circuit Breaker
 *
 * Prevents cascading failures by tracking provider health and
 * temporarily disabling providers that are failing.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: provider is failing, requests are rejected immediately
 * - half-open: testing if provider has recovered
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private openedAt: number | null = null;
  private halfOpenAttempts: number = 0;
  private config: CircuitBreakerConfig;
  private provider: string;

  constructor(provider: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if reset timeout has elapsed
      if (this.openedAt && Date.now() - this.openedAt >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      } else {
        throw new Error(`Circuit breaker is open for provider: ${this.provider}`);
      }
    }

    if (this.state === 'half-open') {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.transitionTo('open');
        throw new Error(`Circuit breaker is open for provider: ${this.provider}`);
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;
    this.lastSuccessAt = Date.now();

    if (this.state === 'half-open') {
      this.transitionTo('closed');
    }
  }

  /**
   * Record a failed call
   */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * Get the current state
   */
  getState(): CircuitBreakerState {
    // Auto-transition from open to half-open if timeout has passed
    if (this.state === 'open' && this.openedAt) {
      if (Date.now() - this.openedAt >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state;
  }

  /**
   * Get health status
   */
  getHealth(): ProviderHealth {
    return {
      provider: this.provider as AIProvider,
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = null;
  }

  /**
   * Check if provider is available (not open)
   */
  isAvailable(): boolean {
    const currentState = this.getState();
    return currentState !== 'open';
  }

  private transitionTo(newState: CircuitBreakerState): void {
    this.state = newState;
    if (newState === 'open') {
      this.openedAt = Date.now();
      this.halfOpenAttempts = 0;
    } else if (newState === 'closed') {
      this.failureCount = 0;
      this.halfOpenAttempts = 0;
      this.openedAt = null;
    } else if (newState === 'half-open') {
      this.halfOpenAttempts = 0;
    }
  }
}

/**
 * Circuit Breaker Registry
 *
 * Manages circuit breakers for multiple providers.
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private config: Partial<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = config;
  }

  /**
   * Get or create a circuit breaker for a provider
   */
  getBreaker(provider: string): CircuitBreaker {
    let breaker = this.breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker(provider, this.config);
      this.breakers.set(provider, breaker);
    }
    return breaker;
  }

  /**
   * Get health of all providers
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.breakers.values()).map((b) => b.getHealth());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
