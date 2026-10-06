'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BubbleAvatar } from '@quant/shared-ui';
import {
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
  TASK_STATUS_TO_BUBBLE,
  type QuantyTaskStatus,
} from './types';

export interface QuantyAvatarProps {
  /**
   * Whether the voice live-agent session is active. The avatar is purely
   * contextual — it renders nothing at all until the user picks
   * "Voice Live Agent" from the mode chooser.
   */
  active?: boolean;
  /** Current task status driving the face, ring and dot. */
  status?: QuantyTaskStatus;
  /**
   * Live action line shown in the pill under the avatar, e.g.
   * "5 emails archive kar raha...". Falls back to the status label.
   */
  actionLabel?: string;
  /** Tapping the avatar opens the 5-tab inspector popup. */
  onToggle?: () => void;
  /** Pixel size of the bubble. Defaults to 56 (thumb-friendly). */
  size?: number;
  className?: string;
}

/**
 * The floating Quanty presence — parked top-center like the front camera,
 * but ONLY while a voice live-agent session is active. It animates in
 * (scale + fade from top) when the session starts and animates out when it
 * ends; otherwise it renders nothing.
 *
 * Tapping the avatar opens the 5-tab inspector popup (Activity / Approvals /
 * Browser / Schedule / Identity) — the avatar stays visible behind it.
 *
 * Motion language while visible:
 * - idle: gentle vertical float (breathing)
 * - thinking: soft pulse
 * - working: spinning conic ring around the bubble
 * - waiting-confirm: amber ring pulse (needs the user)
 * - done: checkmark badge pops in
 * - failed: red dot + shake
 *
 * Everything respects `prefers-reduced-motion`.
 */
export function QuantyAvatar({
  active = false,
  status = 'idle',
  actionLabel,
  onToggle,
  size = 56,
  className = '',
}: QuantyAvatarProps) {
  const reduceMotion = useReducedMotion();
  const bubbleState = TASK_STATUS_TO_BUBBLE[status];
  const dotColor = TASK_STATUS_DOT[status];

  const isWorking = status === 'working' || status === 'thinking';
  const needsConfirm = status === 'waiting-confirm';
  const caption = actionLabel ?? TASK_STATUS_LABEL[status];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="quanty-avatar"
          className={`pointer-events-none fixed inset-x-0 top-2 z-[70] flex flex-col items-center ${className}`}
          aria-live="polite"
          initial={reduceMotion ? undefined : { opacity: 0, scale: 0.6, y: -24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6, y: -24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        >
          <motion.button
            type="button"
            onClick={onToggle}
            aria-label={`Quanty — ${caption}. Tap karke details dekhein.`}
            title={`Quanty — ${caption}`}
            className="pointer-events-auto relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            animate={
              reduceMotion
                ? undefined
                : status === 'idle'
                  ? { y: [0, -4, 0] }
                  : status === 'failed'
                    ? { x: [0, -4, 4, -2, 2, 0] }
                    : { y: 0, x: 0 }
            }
            transition={
              status === 'idle'
                ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
                : status === 'failed'
                  ? { duration: 0.4 }
                  : { duration: 0.25 }
            }
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          >
            {/* Working ring — spinning conic gradient */}
            {isWorking && (
              <motion.span
                aria-hidden="true"
                className="absolute -inset-1.5 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0deg, #38bdf8 90deg, transparent 180deg, #38bdf8 270deg, transparent 360deg)',
                  filter: 'blur(1px)',
                }}
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              />
            )}

            {/* Waiting-confirm ring — amber pulse */}
            {needsConfirm && (
              <motion.span
                aria-hidden="true"
                className="absolute -inset-1.5 rounded-full border-2 border-amber-400"
                animate={reduceMotion ? undefined : { opacity: [1, 0.35, 1], scale: [1, 1.06, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            {/* Thinking pulse halo */}
            {status === 'thinking' && (
              <motion.span
                aria-hidden="true"
                className="absolute -inset-1 rounded-full bg-sky-400/25"
                animate={reduceMotion ? undefined : { opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            {/* The bubble itself */}
            <span className="relative block overflow-hidden rounded-full bg-[#14100b] shadow-[0_8px_30px_rgba(255,170,60,0.35)] ring-1 ring-amber-400/40">
              <BubbleAvatar state={bubbleState} size={size} title="Quanty" />
            </span>

            {/* Status dot */}
            <span
              aria-hidden="true"
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black ${dotColor}`}
            />

            {/* Done checkmark pop */}
            {status === 'done' && (
              <motion.span
                aria-hidden="true"
                initial={reduceMotion ? undefined : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8.5l3.2 3.2L13 5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.span>
            )}

          </motion.button>

          {/* Status caption */}
          <span className="mt-4 select-none rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 backdrop-blur-md">
            {caption}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
