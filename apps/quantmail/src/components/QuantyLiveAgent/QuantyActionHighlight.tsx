'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface QuantyActionHighlightProps {
  /**
   * CSS selector of the element Quanty is acting on, e.g.
   * '[data-thread-id="abc"]'. Re-evaluated whenever `targetKey` changes.
   */
  selector?: string;
  /** Direct element alternative to `selector`. */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Change to re-run the lookup (e.g. the running step's id). */
  targetKey?: string | number;
  /** Action label in the pill, e.g. "5 emails archive kar raha...". */
  label?: string;
  /** Show the spotlight. */
  active?: boolean;
  tone?: 'amber' | 'sky' | 'emerald' | 'red';
  className?: string;
}

const TONE_RING: Record<NonNullable<QuantyActionHighlightProps['tone']>, string> = {
  amber: 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.55)]',
  sky: 'border-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.55)]',
  emerald: 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.55)]',
  red: 'border-red-400 shadow-[0_0_24px_rgba(248,113,113,0.55)]',
};

const TONE_PILL: Record<NonNullable<QuantyActionHighlightProps['tone']>, string> = {
  amber: 'bg-amber-500 text-black',
  sky: 'bg-sky-500 text-black',
  emerald: 'bg-emerald-500 text-black',
  red: 'bg-red-500 text-white',
};

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The visible spotlight: a glowing pulse ring that lands on the UI element
 * Quanty is about to act on — the user SEES the email row highlight before
 * it gets selected and archived, instead of the list silently changing.
 *
 * Lifecycle: fade in → pulse while the action runs → fade out when `active`
 * flips false. Renders nothing when the target can't be found (graceful) or
 * during SSR.
 *
 * `position: fixed` is viewport-relative, so no portal is needed — mount it
 * anywhere in the tree.
 */
export function QuantyActionHighlight({
  selector,
  targetRef,
  targetKey,
  label,
  active = false,
  tone = 'amber',
  className = '',
}: QuantyActionHighlightProps) {
  const reduceMotion = useReducedMotion();
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || typeof document === 'undefined') {
      setRect(null);
      return;
    }

    const measure = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        let el: Element | null = null;
        if (targetRef?.current) {
          el = targetRef.current;
        } else if (selector) {
          try {
            el = document.querySelector(selector);
          } catch {
            el = null; // invalid selector — stay silent, never crash
          }
        }
        if (!el) {
          setRect(null);
          return;
        }
        const r = el.getBoundingClientRect();
        // Ignore zero-area or off-viewport targets.
        if (r.width === 0 && r.height === 0) {
          setRect(null);
          return;
        }
        setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
      });
    };

    measure();
    // The list may scroll under the agent while it works — track it.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selector, targetKey]);

  const show = active && rect !== null;
  // Label pill goes above the target unless there's no room, then below.
  const labelAbove = rect !== null && rect.top > 64;

  return (
    <AnimatePresence>
      {show && rect && (
        <motion.div
          key={`quanty-highlight-${String(targetKey ?? 'x')}`}
          aria-hidden="true"
          className={`pointer-events-none fixed left-0 top-0 z-[80] ${className}`}
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Pulse ring */}
          <motion.div
            className={`absolute rounded-2xl border-[3px] ${TONE_RING[tone]}`}
            style={{
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }}
            animate={reduceMotion ? undefined : { scale: [1, 1.03, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Action label pill */}
          {label && (
            <motion.div
              className={`absolute whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shadow-lg ${TONE_PILL[tone]}`}
              style={{
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)),
                top: labelAbove ? rect.top - 44 : rect.top + rect.height + 10,
              }}
              initial={reduceMotion ? undefined : { opacity: 0, y: labelAbove ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              {label}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
