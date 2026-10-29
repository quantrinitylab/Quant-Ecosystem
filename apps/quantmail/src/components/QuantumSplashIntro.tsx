'use client';

/**
 * The once-per-session brand hold: the QuantWorkplace revolving splash for a
 * short beat while the shell hydrates, then a quick fade.
 *
 * It used to be a 70-particle canvas vortex held for 1.45s, then a mark and
 * wordmark with a progress bar held for 0.85s. It now shows the same revolving
 * splash AuthGuard paints while the session loads, and it keeps the short hold:
 * 0.85s is already a long time to stand between someone and their mail.
 *
 * It does not replay straight after AuthGuard's splash. On a hard load of a
 * signed-in route the guard has just shown the splash for as long as the
 * session took to restore, so a second hold here would be the same screen
 * twice in a row, restarting the animation. The two share one "already shown"
 * flag (lib/splash-session); this hold is for the other way into the shell,
 * a soft navigation straight after sign-in.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { QuantWorkplaceRevolvingSplash } from './workplace/QuantWorkplaceRevolvingSplash';
import { hasSplashBeenShown, markSplashShown } from '../lib/splash-session';

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
    // brand hold there is pure delay. Also skipped when AuthGuard's splash has
    // already been painted for this page load.
    if (hasSplashBeenShown()) {
      onComplete?.();
      return;
    }
    markSplashShown();

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
        className="fixed inset-0 z-[99999]"
      >
        <QuantWorkplaceRevolvingSplash message="Loading QuantWorkplace" onClick={dismiss} />
      </motion.div>
    </AnimatePresence>
  );
}
