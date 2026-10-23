// ============================================================================
// Trailing-edge debouncer — framework-free timing primitive.
//
// Extracted from the React binding (hooks/useDebouncedValue) so the timing
// semantics are unit-testable without a DOM: push() restarts the window,
// flush() settles the latest value immediately (explicit submit must never
// wait out the delay), cancel() drops a pending settle (unmount / reset).
// ============================================================================

export interface DebouncedSetter<T> {
  /** Offer a new value; restarts the settle window. */
  push(value: T): void;
  /** Settle the latest pushed value right now; no-op when nothing is pending. */
  flush(): void;
  /** Drop any pending settle without calling onSettle. */
  cancel(): void;
  /** True between push() and the settle (or cancel). */
  readonly hasPending: boolean;
}

export function createDebouncedSetter<T>(
  delayMs: number,
  onSettle: (value: T) => void,
): DebouncedSetter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | undefined;
  let pendingFlag = false;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    push(value: T): void {
      pending = value;
      pendingFlag = true;
      clear();
      timer = setTimeout(() => {
        timer = null;
        pendingFlag = false;
        onSettle(value);
      }, delayMs);
    },

    flush(): void {
      if (!pendingFlag) return;
      const value = pending as T;
      clear();
      pendingFlag = false;
      onSettle(value);
    },

    cancel(): void {
      clear();
      pendingFlag = false;
    },

    get hasPending(): boolean {
      return pendingFlag;
    },
  };
}
