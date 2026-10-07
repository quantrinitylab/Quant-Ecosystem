// @vitest-environment jsdom
// ============================================================================
// Shared UI - useOptimisticAction Hook Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOptimisticAction } from '../useOptimisticAction';

describe('useOptimisticAction', () => {
  it('starts in idle state', () => {
    const action = vi.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useOptimisticAction(action));
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.rollbackClass).toBe('');
  });

  it('sets isPending immediately on execute', async () => {
    let resolve: (value: string) => void;
    const action = () =>
      new Promise<string>((r) => {
        resolve = r;
      });
    const { result } = renderHook(() => useOptimisticAction(action));

    let executePromise: Promise<void>;
    act(() => {
      executePromise = result.current.execute();
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isSuccess).toBe(false);

    await act(async () => {
      resolve!('done');
      await executePromise!;
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(true);
  });

  it('sets isSuccess on successful action', async () => {
    const action = vi.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useOptimisticAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.rollbackClass).toBe('');
  });

  it('sets isError and rollbackClass on failure', async () => {
    const error = new Error('Network error');
    const action = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useOptimisticAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(error);
    expect(result.current.rollbackClass).toBe('animate-shake');
  });

  it('handles non-Error thrown values', async () => {
    const action = vi.fn().mockRejectedValue('string error');
    const { result } = renderHook(() => useOptimisticAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('string error');
  });

  it('resets state with reset()', async () => {
    const action = vi.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useOptimisticAction(action));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isSuccess).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('can execute multiple times', async () => {
    const action = vi.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useOptimisticAction(action));

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.isSuccess).toBe(true);

    // Execute again - should reset and succeed again
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.isSuccess).toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
