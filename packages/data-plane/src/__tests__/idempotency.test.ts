// ============================================================================
// Idempotency Key Store - Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdempotencyKeyStore, withIdempotency } from '../idempotency';

describe('IdempotencyKeyStore', () => {
  let store: IdempotencyKeyStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new IdempotencyKeyStore();
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
  });

  describe('set/get', () => {
    it('should store and retrieve a result', () => {
      store.set('key-1', { status: 'ok', id: 123 });
      const result = store.get('key-1');
      expect(result).toEqual({ status: 'ok', id: 123 });
    });

    it('should return null for non-existent key', () => {
      const result = store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should store null values as a result', () => {
      store.set('key-null', null);
      // has() differentiates stored null from not-found
      expect(store.has('key-null')).toBe(true);
    });
  });

  describe('lookup', () => {
    it('should return found:true with result for existing key', () => {
      store.set('key-1', { status: 'ok' });
      const lookup = store.lookup('key-1');
      expect(lookup.found).toBe(true);
      expect(lookup.result).toEqual({ status: 'ok' });
    });

    it('should return found:false for non-existent key', () => {
      const lookup = store.lookup('nonexistent');
      expect(lookup.found).toBe(false);
      expect(lookup.result).toBeUndefined();
    });

    it('should return found:true for stored null (no ambiguity)', () => {
      store.set('key-null', null);
      const lookup = store.lookup('key-null');
      expect(lookup.found).toBe(true);
      expect(lookup.result).toBeNull();
    });

    it('should return found:true for stored undefined', () => {
      store.set('key-undef', undefined);
      const lookup = store.lookup('key-undef');
      expect(lookup.found).toBe(true);
      expect(lookup.result).toBeUndefined();
    });

    it('should return found:false for expired key', () => {
      store.set('key-1', 'value', 5000);
      vi.advanceTimersByTime(5001);
      const lookup = store.lookup('key-1');
      expect(lookup.found).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      store.set('key-1', 'value');
      expect(store.has('key-1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(store.has('nonexistent')).toBe(false);
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', () => {
      store.set('key-1', 'value', 5000);

      expect(store.has('key-1')).toBe(true);

      vi.advanceTimersByTime(5001);

      expect(store.has('key-1')).toBe(false);
      expect(store.get('key-1')).toBeNull();
    });

    it('should not expire entries before TTL', () => {
      store.set('key-1', 'value', 10000);

      vi.advanceTimersByTime(9999);

      expect(store.has('key-1')).toBe(true);
      expect(store.get('key-1')).toBe('value');
    });

    it('should use default TTL when not specified', () => {
      const customStore = new IdempotencyKeyStore(1000);
      customStore.set('key-1', 'value');

      expect(customStore.has('key-1')).toBe(true);

      vi.advanceTimersByTime(1001);

      expect(customStore.has('key-1')).toBe(false);
      customStore.destroy();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      store.set('key-1', 'value1');
      store.set('key-2', 'value2');

      store.clear();

      expect(store.has('key-1')).toBe(false);
      expect(store.has('key-2')).toBe(false);
      expect(store.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return the number of entries', () => {
      expect(store.size()).toBe(0);

      store.set('key-1', 'value1');
      expect(store.size()).toBe(1);

      store.set('key-2', 'value2');
      expect(store.size()).toBe(2);
    });
  });
});

describe('withIdempotency', () => {
  let store: IdempotencyKeyStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new IdempotencyKeyStore();
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
  });

  it('should execute operation on first call', async () => {
    const operation = vi.fn().mockResolvedValue({ id: 'result-1' });

    const result = await withIdempotency(store, 'op-1', 5000, operation);

    expect(result).toEqual({ id: 'result-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should return cached result on subsequent calls', async () => {
    const operation = vi.fn().mockResolvedValue({ id: 'result-1' });

    await withIdempotency(store, 'op-1', 5000, operation);
    const result = await withIdempotency(store, 'op-1', 5000, operation);

    expect(result).toEqual({ id: 'result-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should re-execute operation after TTL expires', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ id: 'result-1' })
      .mockResolvedValueOnce({ id: 'result-2' });

    await withIdempotency(store, 'op-1', 5000, operation);

    vi.advanceTimersByTime(5001);

    const result = await withIdempotency(store, 'op-1', 5000, operation);

    expect(result).toEqual({ id: 'result-2' });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle different keys independently', async () => {
    const op1 = vi.fn().mockResolvedValue('result-a');
    const op2 = vi.fn().mockResolvedValue('result-b');

    const result1 = await withIdempotency(store, 'key-a', 5000, op1);
    const result2 = await withIdempotency(store, 'key-b', 5000, op2);

    expect(result1).toBe('result-a');
    expect(result2).toBe('result-b');
    expect(op1).toHaveBeenCalledTimes(1);
    expect(op2).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate concurrent calls with the same key', async () => {
    let resolveOp: (value: string) => void;
    const operationPromise = new Promise<string>((resolve) => {
      resolveOp = resolve;
    });
    const operation = vi.fn().mockReturnValue(operationPromise);

    // Start two concurrent calls with the same key
    const promise1 = withIdempotency(store, 'concurrent-key', 5000, operation);
    const promise2 = withIdempotency(store, 'concurrent-key', 5000, operation);

    // Resolve the operation
    resolveOp!('shared-result');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Both calls should get the same result
    expect(result1).toBe('shared-result');
    expect(result2).toBe('shared-result');
    // But the operation should only have been called once
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should handle null result without ambiguity', async () => {
    const operation = vi.fn().mockResolvedValue(null);

    const result1 = await withIdempotency(store, 'null-key', 5000, operation);
    const result2 = await withIdempotency(store, 'null-key', 5000, operation);

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    // Operation should only execute once even though result is null
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should not cache failed operations', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    await expect(withIdempotency(store, 'fail-key', 5000, operation)).rejects.toThrow('fail');

    // Second call should retry since first failed
    const result = await withIdempotency(store, 'fail-key', 5000, operation);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should propagate error to all concurrent waiters on failure', async () => {
    let rejectOp: (error: Error) => void;
    const operationPromise = new Promise<string>((_, reject) => {
      rejectOp = reject;
    });
    const operation = vi.fn().mockReturnValue(operationPromise);

    const promise1 = withIdempotency(store, 'error-key', 5000, operation);
    const promise2 = withIdempotency(store, 'error-key', 5000, operation);

    rejectOp!(new Error('shared failure'));

    await expect(promise1).rejects.toThrow('shared failure');
    await expect(promise2).rejects.toThrow('shared failure');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
