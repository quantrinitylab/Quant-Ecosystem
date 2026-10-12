'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Offline indicator bar — shows at the top of the screen when connection is lost.
 * Gmail shows a subtle bar; we show a clear, actionable indicator.
 *
 * Animations are pure CSS (@keyframes `offline-bar-enter` / `offline-bar-exit`
 * in globals.css). This component renders unconditionally from the root layout
 * on EVERY route — including public /login — so it must not import framer-motion:
 * any JS animation runtime here lands in the shared layout chunk for all routes.
 * Exit motion is preserved by keeping the bar mounted with the
 * `.offline-bar--leaving` class for the 200ms keyframe duration before unmounting.
 */
type BarMode = 'offline' | 'online';

/** Must match the CSS keyframe duration (offline-bar-enter / offline-bar-exit). */
const EXIT_MS = 200;

export function OfflineBar() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [mode, setMode] = useState<BarMode | null>(null);
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const goOffline = () => { setIsOffline(true); setWasOffline(true); };
    const goOnline = () => { setIsOffline(false); };

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Auto-hide "back online" after 3 seconds
  useEffect(() => {
    if (!isOffline && wasOffline) {
      const timer = setTimeout(() => setWasOffline(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, wasOffline]);

  const target: BarMode | null = isOffline ? 'offline' : wasOffline ? 'online' : null;

  useEffect(() => {
    // Cancel any in-flight exit when the desired bar matches what's rendered
    // (e.g. offline again while the "back online" exit was playing).
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (target === mode) {
      if (leaving) setLeaving(false);
      return;
    }
    if (!mode) {
      // Nothing rendered: mount the new bar; the CSS enter keyframe runs on mount.
      setMode(target);
      return;
    }
    // A bar is rendered: play the CSS exit keyframe, then switch/unmount.
    setLeaving(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setLeaving(false);
      setMode(target);
    }, EXIT_MS);
  }, [target, mode, leaving]);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!mode) return null;

  const offline = mode === 'offline';
  return (
    <div
      className={`offline-bar offline-bar--${mode}${leaving ? ' offline-bar--leaving' : ''}`}
      role={offline ? 'alert' : 'status'}
      aria-live={offline ? 'assertive' : undefined}
    >
      <span className={offline ? 'offline-dot' : 'online-dot'} aria-hidden="true" />
      <span>{offline ? "You're offline. Some features may not work." : 'Back online'}</span>
    </div>
  );
}
