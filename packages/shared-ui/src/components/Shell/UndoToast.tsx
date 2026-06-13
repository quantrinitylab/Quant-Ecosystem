'use client';

// ============================================================================
// Shared UI - Undo Toast Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export interface UndoToastProps {
  message: string;
  duration?: number;
  isVisible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  message,
  duration = 5000,
  isVisible,
  onUndo,
  onDismiss,
}) => {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Start countdown when visible
  useEffect(() => {
    if (!isVisible) {
      setRemaining(duration);
      return;
    }

    startTimeRef.current = Date.now();
    setRemaining(duration);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);

      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onDismiss();
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isVisible, duration, onDismiss]);

  const handleUndo = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onUndo();
  }, [onUndo]);

  if (!isVisible) return null;

  const progress = remaining / duration;

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px]"
      style={{
        background: 'var(--quant-surface, #1f2937)',
        border: '1px solid var(--quant-border, #374151)',
        color: 'var(--quant-text, #f9fafb)',
      }}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      <span className="flex-1 text-sm">{message}</span>
      <button
        onClick={handleUndo}
        className="text-sm font-semibold text-blue-400 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
        aria-label="Undo action"
      >
        Undo
      </button>
      {/* Countdown indicator */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-blue-500 rounded-b-lg transition-all"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
    </motion.div>
  );
};
