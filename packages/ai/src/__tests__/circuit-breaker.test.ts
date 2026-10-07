import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerRegistry } from '../core/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('openai', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenMaxAttempts: 2,
    });
  });

  describe('initial state', () => {
    it('starts in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('reports as available', () => {
      expect(breaker.isAvailable()).toBe(true);
    });
  });

  describe('closed state', () => {
    it('executes functions successfully', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('stays closed after a single failure', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        /* expected */
      }
      expect(breaker.getState()).toBe('closed');
    });

    it('transitions to open after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('open state', () => {
    beforeEach(async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
    });

    it('rejects calls immediately', async () => {
      await expect(breaker.execute(async () => 'should not execute')).rejects.toThrow(
        'Circuit breaker is open',
      );
    });

    it('reports as unavailable', () => {
      expect(breaker.isAvailable()).toBe(false);
    });

    it('transitions to half-open after reset timeout', async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);
      expect(breaker.getState()).toBe('half-open');
      vi.useRealTimers();
    });
  });

  describe('half-open state', () => {
    beforeEach(async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      // Advance time to transition to half-open
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows limited requests through', async () => {
      const result = await breaker.execute(async () => 'test');
      expect(result).toBe('test');
    });

    it('transitions to closed on success', async () => {
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('closed');
    });

    it('transitions back to open on failure', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail again');
        });
      } catch {
        /* expected */
      }
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('resets to closed state', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      expect(breaker.getState()).toBe('open');
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('health reporting', () => {
    it('reports health status correctly', async () => {
      await breaker.execute(async () => 'ok');
      const health = breaker.getHealth();
      expect(health.provider).toBe('openai');
      expect(health.state).toBe('closed');
      expect(health.failureCount).toBe(0);
      expect(health.lastSuccessAt).not.toBeNull();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates and retrieves breakers by provider', () => {
    const registry = new CircuitBreakerRegistry();
    const breaker1 = registry.getBreaker('openai');
    const breaker2 = registry.getBreaker('openai');
    expect(breaker1).toBe(breaker2);
  });

  it('creates separate breakers for different providers', () => {
    const registry = new CircuitBreakerRegistry();
    const openai = registry.getBreaker('openai');
    const anthropic = registry.getBreaker('anthropic');
    expect(openai).not.toBe(anthropic);
  });

  it('resets all breakers', async () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 });
    const breaker = registry.getBreaker('openai');
    try {
      await breaker.execute(async () => {
        throw new Error('fail');
      });
    } catch {
      /* expected */
    }
    expect(breaker.getState()).toBe('open');
    registry.resetAll();
    expect(breaker.getState()).toBe('closed');
  });
});
