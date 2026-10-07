import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and passes calls through', async () => {
    const breaker = new CircuitBreaker({ name: 'dep' });
    expect(breaker.currentState).toBe('closed');
    expect(await breaker.execute(async () => 'ok')).toBe('ok');
    expect(breaker.currentState).toBe('closed');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = new CircuitBreaker({ name: 'dep', failureThreshold: 3 });
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      expect(breaker.currentState).toBe('closed');
    }
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.currentState).toBe('open');
  });

  it('fails fast with CircuitOpenError while open, without calling fn', async () => {
    const breaker = new CircuitBreaker({ name: 'dep', failureThreshold: 1 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const fn = vi.fn(async () => 'never');
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
    expect(breaker.snapshot().lastError).toContain('boom');
  });

  it('transitions open -> half-open after resetTimeoutMs and closes on success', async () => {
    const breaker = new CircuitBreaker({
      name: 'dep',
      failureThreshold: 1,
      resetTimeoutMs: 1_000,
    });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(breaker.currentState).toBe('open');

    vi.advanceTimersByTime(999);
    expect(breaker.currentState).toBe('open');

    vi.advanceTimersByTime(1);
    expect(breaker.currentState).toBe('half-open');

    expect(await breaker.execute(async () => 'recovered')).toBe('recovered');
    expect(breaker.currentState).toBe('closed');
  });

  it('re-opens when the half-open trial fails', async () => {
    const breaker = new CircuitBreaker({
      name: 'dep',
      failureThreshold: 2,
      resetTimeoutMs: 500,
    });
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    }
    expect(breaker.currentState).toBe('open');
    vi.advanceTimersByTime(500);
    expect(breaker.currentState).toBe('half-open');
    await expect(breaker.execute(async () => { throw new Error('still down'); })).rejects.toThrow('still down');
    expect(breaker.currentState).toBe('open');
  });

  it('a success resets the consecutive failure count while closed', async () => {
    const breaker = new CircuitBreaker({ name: 'dep', failureThreshold: 3 });
    await expect(breaker.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    await breaker.execute(async () => 'ok');
    await expect(breaker.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    // Only 2 consecutive failures after the success — still closed.
    expect(breaker.currentState).toBe('closed');
  });

  it('reset() manually closes the breaker', async () => {
    const breaker = new CircuitBreaker({ name: 'dep', failureThreshold: 1, resetTimeoutMs: 60_000 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(breaker.currentState).toBe('open');
    breaker.reset();
    expect(breaker.currentState).toBe('closed');
    expect(await breaker.execute(async () => 'ok')).toBe('ok');
  });

  it('recordSuccess/recordFailure work without execute()', () => {
    const breaker = new CircuitBreaker({ name: 'dep', failureThreshold: 2 });
    breaker.recordFailure(new Error('a'));
    breaker.recordFailure(new Error('b'));
    expect(breaker.currentState).toBe('open');
    expect(breaker.snapshot().consecutiveFailures).toBe(2);
  });
});
