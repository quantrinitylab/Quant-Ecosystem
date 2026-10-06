'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export type QuantyChooserSelection = 'chat' | 'voice';

export interface QuantyModeChooserProps {
  /** Whether the chooser popup is visible. */
  open?: boolean;
  /** Fires with the picked mode. 'chat' keeps existing behavior; 'voice' starts the live-agent session. */
  onSelect?: (mode: QuantyChooserSelection) => void;
  /** Fires when the user dismisses without picking (backdrop / Escape / X). */
  onClose?: () => void;
  className?: string;
}

/**
 * The mode chooser: tapping the existing Quanty AI button/pill opens this
 * small popup instead of jumping straight into chat.
 *
 * - Chat: the existing Quanty assistant behavior (handled by the parent).
 * - Voice Live Agent: the new agentic mode — the avatar animates in at the
 *   front-camera position and the voice session starts. Tapping the avatar
 *   afterwards opens the 5-tab inspector popup.
 *
 * Icons are inline SVG per the codebase convention (no emoji, no icon font).
 * Dismisses on backdrop tap, Escape, or the X button. Focus moves to the
 * first option when opened.
 */
export function QuantyModeChooser({ open = false, onSelect, onClose, className = '' }: QuantyModeChooserProps) {
  const reduceMotion = useReducedMotion();
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstOptionRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="chooser-backdrop"
            aria-hidden="true"
            className="fixed inset-0 z-[68] bg-black/50 backdrop-blur-[2px]"
            initial={reduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          {/* Popup */}
          <motion.div
            key="chooser-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Quanty mode chunein"
            className={`fixed inset-x-0 top-[88px] z-[69] mx-auto w-full max-w-xs ${className}`}
            initial={reduceMotion ? undefined : { opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -14, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="flex items-center justify-between px-5 pb-1 pt-4">
                <p className="text-sm font-semibold text-zinc-100">Quanty kaise help kare?</p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Band karein"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-2 p-3">
                {/* Chat — existing behavior */}
                <button
                  ref={firstOptionRef}
                  type="button"
                  onClick={() => onSelect?.('chat')}
                  className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/15 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M17 11.5a5.5 5.5 0 01-5.5 5.5H4l-1.5 1.5v-1.6A5.5 5.5 0 012.5 11.5v-3A5.5 5.5 0 018 3h3.5A5.5 5.5 0 0117 8.5v3z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                      />
                      <circle cx="7.5" cy="9" r="1.1" fill="currentColor" />
                      <circle cx="11" cy="9" r="1.1" fill="currentColor" />
                      <circle cx="14.5" cy="9" r="1.1" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-zinc-100">Chat</span>
                    <span className="block truncate text-xs text-zinc-500">
                      Likho aur baat karo — pehle jaisa
                    </span>
                  </span>
                </button>

                {/* Voice Live Agent — new agentic mode */}
                <button
                  type="button"
                  onClick={() => onSelect?.('voice')}
                  className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] px-4 py-3 text-left transition hover:border-amber-400/50 hover:bg-amber-500/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                      <path
                        d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5M7.5 17.5h5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-100">
                      Voice Live Agent
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Naya
                      </span>
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      Bolo — Quanty live kaam karega, tum dekhoge
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
