'use client';

import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';

/**
 * Invisible provider that registers global keyboard shortcuts.
 * Rendered inside AuthGuard so shortcuts only work when authenticated.
 */
export function GlobalShortcutsProvider({ children }: { children: React.ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}
