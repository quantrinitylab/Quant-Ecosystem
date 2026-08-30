'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { useKeyboardSurfaces } from './KeyboardProvider';

/**
 * Host for the two keyboard-driven overlays, so neither ships in the root chunk.
 *
 * `app/layout.tsx` mounted `<CommandPalette />` (323 lines, plus the command
 * registry and its icon set) and `<KeyboardShortcutsHelp />` (212 lines) directly.
 * The layout is a Server Component, so it cannot hold the open state needed to
 * defer them — hence this client host. Both surfaces only ever *render* their
 * open flag; `mod+k` and `?` are registered by `KeyboardProvider`, which stays
 * mounted, so nothing about opening them changes.
 *
 * The idle prefetch is not an optimisation, it is a correctness fix. The palette
 * claims an *exclusive* keyboard scope while open, which is what stops `e`/`s`/`j`
 * from archiving mail behind it. If its chunk only started downloading at the
 * moment the user hit `mod+k`, there would be a window where the overlay is
 * opening but nothing owns the keyboard yet. Warming both chunks once the browser
 * is idle closes that window while still keeping them out of the critical path.
 */

const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), {
  ssr: false,
});

const KeyboardShortcutsHelp = dynamic(
  () => import('./KeyboardShortcutsHelp').then((m) => m.KeyboardShortcutsHelp),
  { ssr: false },
);

/**
 * `requestIdleCallback` is still unimplemented in Safari, so fall back to a timer.
 *
 * The guard is a `typeof` check rather than `'requestIdleCallback' in window`:
 * lib.dom declares the method as non-optional, so the `in` form narrows the else
 * branch to `never` and `window.setTimeout` stops type-checking.
 */
function onIdle(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(run, 2000);
  return () => window.clearTimeout(handle);
}

export function KeyboardSurfaces() {
  const { isPaletteOpen, isHelpOpen } = useKeyboardSurfaces();

  const showPalette = useDeferredMount(isPaletteOpen);
  const showHelp = useDeferredMount(isHelpOpen);

  useEffect(
    () =>
      onIdle(() => {
        void import('./CommandPalette');
        void import('./KeyboardShortcutsHelp');
      }),
    [],
  );

  return (
    <>
      {showPalette && <CommandPalette />}
      {showHelp && <KeyboardShortcutsHelp />}
    </>
  );
}

export default KeyboardSurfaces;
