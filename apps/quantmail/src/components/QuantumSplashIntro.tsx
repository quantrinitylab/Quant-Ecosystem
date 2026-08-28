'use client';

/**
 * The first thing anyone sees: a short brand hold while the shell hydrates.
 *
 * It used to be a 70-particle canvas vortex in five colours gravitating toward a
 * 24rem blurred orange blob, ringed by three neon `0 0 30px` glows and held for
 * 1.45s. Three problems, in order of how much they cost: the glow is the exact
 * "AI template" look the product is defined against; a `requestAnimationFrame`
 * loop competing with hydration is the slowest possible first paint for an app
 * whose pitch is speed; and 1.45s is a long time to stand between someone and
 * their mail, every session.
 *
 * What replaced it says the same thing with the design system's own vocabulary —
 * the mark, the wordmark, and a determinate bar that runs for exactly as long as
 * the hold, so the wait is legible rather than decorative.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BrandWordmark } from './BrandWordmark';

/** How long the hold lasts, and how long it takes to fade out. */
const HOLD_MS = 850;
const FADE_MS = 260;

export function QuantumSplashIntro({ onComplete }: { onComplete?: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  /*
   * Held in a ref so the dismiss path can be called from a click, a key and a
   * timer without any of them racing to fire `onComplete` twice — the shell reads
   * that callback as "the splash is gone", and calling it again after the element
   * has unmounted would re-run whatever the host does on completion.
   */
  const finishedRef = useRef(false);

  useEffect(() => {
    // Once per session: on a second navigation the shell is already warm, and a
    // brand hold there is pure delay.
    try {
      if (sessionStorage.getItem('quant_splash_shown')) {
        onComplete?.();
        return;
      }
      sessionStorage.setItem('quant_splash_shown', 'true');
    } catch {
      // Private-mode or blocked storage: show it, just don't remember.
    }

    setIsVisible(true);
  }, [onComplete]);

  useEffect(() => {
    if (!isVisible) return;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setIsLeaving(true);
      window.setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, FADE_MS);
    };

    const hold = window.setTimeout(finish, HOLD_MS);
    // Escape dismisses it, because a full-screen overlay that only answers to a
    // mouse click is a trap for anyone driving the app from the keyboard.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') finish();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(hold);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  const dismiss = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsVisible(false);
    onComplete?.();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
        animate={{ opacity: isLeaving ? 0 : 1 }}
        transition={{ duration: FADE_MS / 1000, ease: 'easeOut' }}
        onClick={dismiss}
        className="fixed inset-0 z-[99999] flex select-none flex-col items-center justify-center gap-6 bg-[#090A0C]"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex flex-col items-center gap-5"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl border border-[#282C35] bg-[#111318] shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
            <svg
              className="size-8 text-[#FF8C42]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
              <path d="M3 5.5 12 13l9-7.5" />
            </svg>
          </div>

          <BrandWordmark app="mail" size="text-2xl" />
        </motion.div>

        {/*
          A determinate bar, not a spinner: the hold is a known length, so the
          honest signal is how much of it is left. Fixed width rather than a
          percentage so it reads the same on a phone and a monitor.
        */}
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-[#282C35]" aria-hidden="true">
          <motion.div
            className="h-full rounded-full bg-[#FF8C42]"
            initial={{ width: prefersReducedMotion ? '100%' : '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: prefersReducedMotion ? 0 : HOLD_MS / 1000, ease: 'linear' }}
          />
        </div>

        <span className="sr-only">Loading QuantMail</span>
      </motion.div>
    </AnimatePresence>
  );
}
