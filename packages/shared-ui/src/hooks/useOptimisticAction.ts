// ============================================================================
// Shared UI - useOptimisticAction Hook
// ============================================================================

import { useCallback, useRef, useState } from 'react';

export interface UseOptimisticActionReturn {
  execute: () => Promise<void>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
  rollbackClass: string;
}

/**
 * Hook for optimistic UI actions with rollback feedback.
 *
 * On execute: immediately sets isPending.
 * On success: sets isSuccess.
 * On failure: sets isError and provides a `rollbackClass` string ('animate-shake')
 * that consumers can apply to elements for visual feedback.
 */
export function useOptimisticAction<T>(action: () => Promise<T>): UseOptimisticActionReturn {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const reset = useCallback(() => {
    setIsPending(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
  }, []);

  const execute = useCallback(async () => {
    setIsPending(true);
    setIsSuccess(false);
    setIsError(false);
    setError(null);

    try {
      await actionRef.current();
      setIsPending(false);
      setIsSuccess(true);
    } catch (e) {
      setIsPending(false);
      setIsError(true);
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const rollbackClass = isError ? 'animate-shake' : '';

  return { execute, isPending, isSuccess, isError, error, reset, rollbackClass };
}
