'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { QuantyStep, QuantyStepStatus } from './types';

export interface QuantyActivityFeedProps {
  steps: QuantyStep[];
  /** True while the task is still running — shows the interrupt button. */
  running?: boolean;
  /** Collapsed shows only the latest step. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onInterrupt?: () => void;
  onConfirmStep?: (stepId: string) => void;
  onCancelStep?: (stepId: string) => void;
  /**
   * Tapping a step that acted on the UI re-shows the spotlight where it
   * acted (the step carries `targetSelector`). Steps without a selector
   * stay non-interactive.
   */
  onStepTap?: (step: QuantyStep) => void;
  className?: string;
}

const STEP_ICON: Record<QuantyStepStatus, React.ReactNode> = {
  pending: (
    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-zinc-600" />
  ),
  running: (
    <motion.span
      aria-hidden="true"
      className="h-4 w-4 rounded-full border-2 border-sky-400 border-t-transparent"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
    />
  ),
  done: (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ),
  error: (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-400">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  ),
  'waiting-confirm': (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 4.5V8l2 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  ),
  skipped: (
    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-zinc-700" />
  ),
};

const STEP_SR: Record<QuantyStepStatus, string> = {
  pending: 'baki hai',
  running: 'chal raha hai',
  done: 'ho gaya',
  error: 'fail hua',
  'waiting-confirm': 'permission chahiye',
  skipped: 'chhod diya',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The live progress feed: steps stream in as the agent works. Auto-scrolls to
 * the newest step, collapses to the latest when asked, and surfaces inline
 * Confirm/Cancel for destructive steps plus a big always-visible Interrupt.
 */
export function QuantyActivityFeed({
  steps,
  running = false,
  collapsed = false,
  onToggleCollapse,
  onInterrupt,
  onConfirmStep,
  onCancelStep,
  onStepTap,
  className = '',
}: QuantyActivityFeedProps) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleSteps = collapsed ? steps.slice(-1) : steps;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && !collapsed) {
      el.scrollTop = el.scrollHeight;
    }
  }, [steps.length, collapsed]);

  if (steps.length === 0) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-center ${className}`}>
        <p className="text-sm text-zinc-400">
          Upar command likho — Quanty kadam-dar-kadam kaam karega aur yahan dikhega.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Live progress
        </span>
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Saare steps dekhein' : 'Sirf latest step dekhein'}
              className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
          {running && onInterrupt && (
            <button
              type="button"
              onClick={onInterrupt}
              aria-label="Quanty ko turant rokein"
              className="flex h-9 items-center gap-1.5 rounded-xl bg-red-500/15 px-3 text-sm font-semibold text-red-400 ring-1 ring-red-500/40 transition hover:bg-red-500/25 active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
              </svg>
              Roko
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div ref={scrollRef} className="max-h-64 overflow-y-auto px-3 py-2" role="log" aria-label="Quanty activity">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step) => {
            const tappable = !!onStepTap && !!step.targetSelector;
            const ariaLabel = `${step.label} — ${STEP_SR[step.status]}${tappable ? ' — tap karke dekhein kahan kaam hua' : ''}`;
            const anim = {
              initial: reduceMotion ? undefined : { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.2 },
            };
            const cls = `flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left ${
              tappable ? 'cursor-pointer transition hover:bg-white/[0.04]' : ''
            }`;
            const inner = (
              <>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {STEP_ICON[step.status]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-zinc-100">{step.label}</p>
                  {step.detail && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{step.detail}</p>
                  )}
                  {step.status === 'waiting-confirm' && step.destructive && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onConfirmStep?.(step.id);
                        }}
                        className="flex h-9 items-center rounded-lg bg-amber-500 px-3 text-sm font-semibold text-black transition hover:bg-amber-400 active:scale-95"
                      >
                        Haan, karo
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelStep?.(step.id);
                        }}
                        className="flex h-9 items-center rounded-lg bg-white/10 px-3 text-sm font-medium text-zinc-200 transition hover:bg-white/15 active:scale-95"
                      >
                        Rehne do
                      </button>
                    </div>
                  )}
                </div>
                <time className="shrink-0 text-[10px] tabular-nums text-zinc-600">
                  {formatTime(step.updatedAt)}
                </time>
              </>
            );
            return tappable ? (
              <motion.button
                key={step.id}
                type="button"
                onClick={() => onStepTap(step)}
                className={cls}
                aria-label={ariaLabel}
                {...anim}
              >
                {inner}
              </motion.button>
            ) : (
              <motion.div key={step.id} className={cls} aria-label={ariaLabel} {...anim}>
                {inner}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
