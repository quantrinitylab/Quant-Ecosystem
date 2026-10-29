'use client';

import { useSyncExternalStore } from 'react';

/**
 * Shared scroll-chrome visibility for the mobile shell.
 *
 * The bottom contextual nav AND the compose FAB must hide/show in perfect sync
 * on scroll — two independent listeners with slightly different thresholds
 * drift apart and the FAB ends up floating over the void where the bar was.
 * One module-level store, one scroll listener, every consumer reads the same
 * boolean via `useChromeVisible()`.
 *
 * Behavior: visible at the top (<40px). Hides on deliberate scroll-down
 * (delta > 12px), reveals on scroll-up (delta < -12px). Tiny jitters are
 * ignored so the chrome never flickers.
 *
 * Route-change reset: the store is module-level, so it OUTLIVES navigation —
 * AppShell mounts once for the whole suite. Without a reset, scrolling down
 * on the inbox (chrome hidden) and switching to /drive leaves the fresh
 * pillar's FAB hidden on first paint until some scroll event re-evaluates,
 * and a page whose container never scrolls never fires one. AppShell calls
 * `resetChromeVisible()` on every pathname change so each route starts
 * from the fresh-load state: visible, lastY 0.
 */

let chromeVisible = true;
const listeners = new Set<() => void>();
let lastY = 0;
let listenerAttached = false;

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a dead consumer must not break the rest */
    }
  });
}

function onScroll(e: Event) {
  if (typeof window === 'undefined') return;
  const target = e?.target as (HTMLElement | Document) | null;
  let currentY = window.scrollY || 0;
  if (target && 'scrollTop' in target && typeof target.scrollTop === 'number') {
    currentY = target.scrollTop;
  }

  if (currentY < 40) {
    if (!chromeVisible) {
      chromeVisible = true;
      emit();
    }
  } else {
    const diff = currentY - lastY;
    if (diff > 12 && chromeVisible) {
      chromeVisible = false;
      emit();
    } else if (diff < -12 && !chromeVisible) {
      chromeVisible = true;
      emit();
    }
  }
  lastY = currentY;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!listenerAttached && typeof window !== 'undefined') {
    listenerAttached = true;
    // Capture phase: pages scroll inside nested containers, not the window.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return chromeVisible;
}

function getServerSnapshot() {
  return true;
}

/**
 * Route-change reset for the module-level store (see header comment).
 *
 * Restores the fresh-load state: chrome visible, scroll baseline 0. Emits
 * only when the value actually flips, so a reset on an already-visible
 * chrome is a silent no-op. `lastY` MUST reset alongside the boolean —
 * otherwise the new page's first scroll event is differenced against the
 * old page's scroll depth and can hide (or reveal) the chrome before the
 * user has scrolled anywhere on the new route.
 */
export function resetChromeVisible(): void {
  lastY = 0;
  if (!chromeVisible) {
    chromeVisible = true;
    emit();
  }
}

/**
 * Returns true while the mobile bottom chrome (contextual nav + FAB) should
 * be visible. Stable across all consumers — one scroll listener total.
 */
export function useChromeVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
