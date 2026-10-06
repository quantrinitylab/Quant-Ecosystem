'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { QuantyTask } from './types';

export interface QuantyResultCardProps {
  task: QuantyTask;
  /** Reverses the task's effects when reversible. */
  onUndo?: (taskId: string) => void;
  /** Retries a failed task with the same command. */
  onRetry?: (command: string) => void;
  /** Dismisses the card. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * The completion card: success summary with Undo, or a failure state with
 * Retry. Hinglish copy throughout — "Ho gaya!" not "Task completed".
 */
export function QuantyResultCard({ task, onUndo, onRetry, onDismiss, className = '' }: QuantyResultCardProps) {
  const reduceMotion = useReducedMotion();
  const isSuccess = task.status === 'done';
  const isFailure = task.status === 'failed';

  if (!isSuccess && !isFailure) return null;

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      role="status"
      aria-live="polite"
      className={`overflow-hidden rounded-2xl border backdrop-blur-xl ${
        isSuccess
          ? 'border-emerald-500/25 bg-emerald-950/60'
          : 'border-red-500/25 bg-red-950/60'
      } shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${className}`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isSuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {isSuccess ? (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 4v4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-semibold ${isSuccess ? 'text-emerald-100' : 'text-red-100'}`}>
            {isSuccess ? 'Ho gaya!' : 'Arre, ruk gaya'}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-zinc-300">
            {isSuccess
              ? (task.resultSummary ?? `"${task.command}" poora hua.`)
              : (task.error ?? 'Pata nahi kya hua — dobara try karo.')}
          </p>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {isSuccess && task.reversible && onUndo && (
              <button
                type="button"
                onClick={() => onUndo(task.id)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-medium text-zinc-100 transition hover:bg-white/15 active:scale-95"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6.5 3.5L3 7l3.5 3.5M3 7h6.5a3.5 3.5 0 010 7H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-1.5)" />
                </svg>
                Undo karo
              </button>
            )}
            {isFailure && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(task.command)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-black transition hover:bg-amber-400 active:scale-95"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Dobara try karo
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Result band karein"
                className="flex h-9 items-center rounded-xl px-3 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                Theek hai
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
