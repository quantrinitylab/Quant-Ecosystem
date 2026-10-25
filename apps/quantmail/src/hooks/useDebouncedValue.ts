'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDebouncedSetter } from '../lib/debounce';

// ============================================================================
// useDebouncedValue — trailing-edge debounce for a changing value.
//
// The search page drives as-you-type results off this: keystrokes settle
// 300ms after the last one, so the backend is not hammered per keystroke.
// flush() settles the latest value immediately — explicit submit (Enter /
// the Search button / picking a suggestion) must never wait out the delay.
// settleNow(v) cancels any pending window and pins the debounced value to v
// right away — the clear (✕) button uses it so stale results never linger
// for one more window after the field is emptied.
// ============================================================================

const DEFAULT_DELAY_MS = 300;

export interface DebouncedValue<T> {
  debounced: T;
  flush: () => void;
  settleNow: (value: T) => void;
}

export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_DELAY_MS): DebouncedValue<T> {
  const [debounced, setDebounced] = useState(value);
  // setDebounced is stable, so the setter can be built once per delay.
  const setterRef = useRef(createDebouncedSetter<T>(delayMs, setDebounced));

  useEffect(() => {
    setterRef.current = createDebouncedSetter<T>(delayMs, setDebounced);
    return () => {
      setterRef.current.cancel();
    };
  }, [delayMs]);

  useEffect(() => {
    setterRef.current.push(value);
  }, [value]);

  // A settle landing after unmount is a state update on an unmounted
  // component — React drops it, but cancelling keeps the intent explicit.
  useEffect(
    () => () => {
      setterRef.current.cancel();
    },
    [],
  );

  const flush = useCallback(() => {
    setterRef.current.flush();
  }, []);

  const settleNow = useCallback((next: T) => {
    setterRef.current.cancel();
    setDebounced(next);
  }, []);

  return { debounced, flush, settleNow };
}
