// ============================================================================
// Shared UI - AppShell Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageTransition } from '../Motion';

export interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topBar?: React.ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  /**
   * When true (default), the sidebar is hidden for a full-screen canvas and
   * revealed as an overlay panel from the top-left trigger. Users can pin it
   * to keep it docked; the choice persists across sessions.
   */
  collapsibleSidebar?: boolean;
  'aria-label'?: string;
}

const PIN_STORAGE_KEY = 'quant.shell.sidebarPinned';

export const AppShell: React.FC<AppShellProps> = ({
  children,
  sidebar,
  topBar,
  theme = 'light',
  className = '',
  animated = true,
  collapsibleSidebar = true,
  'aria-label': ariaLabel = 'Application shell',
}) => {
  const themeStyles: Record<string, string> = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    neon: 'bg-gray-950 text-green-400',
  };

  const overlayMode = Boolean(sidebar) && collapsibleSidebar;
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overlayMode || typeof window === 'undefined') return;
    setPinned(window.localStorage.getItem(PIN_STORAGE_KEY) === '1');
  }, [overlayMode]);

  const setPinnedPersisted = useCallback((next: boolean) => {
    setPinned(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PIN_STORAGE_KEY, next ? '1' : '0');
    }
    if (next) setOpen(false);
  }, []);

  // Keyboard: "\" toggles the panel, Escape closes it.
  useEffect(() => {
    if (!overlayMode) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (!typing && event.key === '\\') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayMode]);

  // Reveal by pushing the pointer to the very left edge of the screen.
  useEffect(() => {
    if (!overlayMode || pinned) return;
    const onMove = (event: MouseEvent) => {
      if (event.clientX <= 3) setOpen(true);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [overlayMode, pinned]);

  const dockedSidebar = sidebar && (!overlayMode || pinned);

  return (
    <div
      className={`relative flex h-screen w-full overflow-hidden ${themeStyles[theme]} ${className}`}
      aria-label={ariaLabel}
      role="application"
      data-shell-fullscreen={overlayMode && !pinned ? 'true' : undefined}
    >
      {dockedSidebar && (
        <aside className="relative flex-shrink-0" aria-label="Sidebar">
          {sidebar}
          {overlayMode && (
            <button
              type="button"
              onClick={() => setPinnedPersisted(false)}
              className="quant-shell-unpin"
              aria-label="Hide sidebar for full-screen view"
              title="Hide sidebar (\\)"
            >
              <ChevronsLeftIcon />
            </button>
          )}
        </aside>
      )}

      {overlayMode && !pinned && (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="quant-shell-trigger"
            aria-label="Show navigation"
            aria-expanded={open}
            title="Navigation (\\)"
          >
            <MenuIcon />
          </button>

          <div
            className={`quant-shell-overlay ${open ? 'is-open' : ''}`}
            aria-hidden={!open}
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            className={`quant-shell-panel ${open ? 'is-open' : ''}`}
            aria-hidden={!open}
            onClick={(event) => {
              // Close after a navigation choice, keep open for in-panel controls.
              const el = (event.target as HTMLElement).closest(
                'a,button[data-nav],.sidebar-nav-item,.sidebar-compose',
              );
              if (el) setOpen(false);
            }}
          >
            {sidebar}
            <button
              type="button"
              onClick={() => setPinnedPersisted(true)}
              className="quant-shell-pin"
              aria-label="Keep sidebar docked"
              title="Pin sidebar"
            >
              <PinIcon />
            </button>
          </div>
        </>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {topBar && (
          <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            {topBar}
          </header>
        )}
        <main className="flex-1 overflow-y-auto">
          {animated ? <PageTransition>{children}</PageTransition> : children}
        </main>
      </div>
    </div>
  );
};

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" aria-hidden="true" className="h-[18px] w-[18px]">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function ChevronsLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M12 17v5M7 4h10l-1.5 6.5L19 14H5l3.5-3.5z" />
    </svg>
  );
}
