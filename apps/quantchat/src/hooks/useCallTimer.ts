'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Format elapsed seconds into a human-readable timer string.
 * - If < 1 hour: MM:SS (e.g., "5:23")
 * - If >= 1 hour: H:MM:SS (e.g., "1:05:23")
 */
export function formatCallDuration(elapsedSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

export interface UseCallTimerReturn {
  /** Elapsed seconds since the timer started */
  elapsedSeconds: number;
  /** Formatted string (MM:SS or H:MM:SS) */
  formatted: string;
  /** Start the timer (from connection time) */
  start: () => void;
  /** Stop the timer */
  stop: () => void;
  /** Reset the timer back to 0 */
  reset: () => void;
  /** Whether the timer is currently running */
  isRunning: boolean;
}

/**
 * useCallTimer hook - starts counting from connection time,
 * updates every second. Displays MM:SS or H:MM:SS.
 */
export function useCallTimer(): UseCallTimerReturn {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    startTimeRef.current = Date.now();
    setIsRunning(true);
    setElapsedSeconds(0);

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
    setElapsedSeconds(0);
    setIsRunning(false);
  }, []);

  return {
    elapsedSeconds,
    formatted: formatCallDuration(elapsedSeconds),
    start,
    stop,
    reset,
    isRunning,
  };
}
