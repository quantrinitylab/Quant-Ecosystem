'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * What a floating piece of app chrome needs to know about the shell it sits in.
 *
 * There is exactly one fact here so far, and it earned its way in: whether the
 * mobile navigation drawer is on screen. `AppShell` used to keep that to itself
 * and guard its own create button with it inline, so any route that mounted its
 * own — `/calendar` did — got a 56px button that stayed clickable on top of a
 * modal drawer, opened a dial the drawer half-covered, and moved focus out of an
 * `aria-modal="true"` region to do it. Publishing the flag is what lets the
 * primitive own the rule instead of every caller re-deriving it.
 *
 * The default is `false`, so a `QuantFab` mounted outside any shell keeps
 * working exactly as it does today rather than silently never rendering.
 */
interface ShellChrome {
  /**
   * True while the drawer is *presented*, not merely open. Those differ: the
   * drawer is `md:hidden` while the rail is pinned, so `isSidebarOpen` can be
   * true for a panel nobody can see.
   */
  isDrawerPresented: boolean;
}

const ShellChromeContext = createContext<ShellChrome>({ isDrawerPresented: false });

export function ShellChromeProvider({
  isDrawerPresented,
  children,
}: {
  isDrawerPresented: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ isDrawerPresented }), [isDrawerPresented]);
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome(): ShellChrome {
  return useContext(ShellChromeContext);
}
