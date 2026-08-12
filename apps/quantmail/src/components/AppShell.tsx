'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PageTransition } from '@quant/shared-ui';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../brand/theme';

export interface AppShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
  topBar?: ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  mobileTitle?: ReactNode;
  mobileActions?: ReactNode;
  'aria-label'?: string;
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PIN_STORAGE_KEY = 'quant.shell.sidebarPinned';

export function AppShell({
  children,
  sidebar,
  topBar,
  theme = 'light',
  className = '',
  animated = true,
  mobileTitle,
  mobileActions,
  'aria-label': ariaLabel = 'Application shell',
}: AppShellProps) {
  const drawerId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Sidebar is an overlay by default on every breakpoint (GitHub-style):
  // the canvas is full-screen until the user opens or pins navigation.
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    try {
      setIsPinned(window.localStorage.getItem(PIN_STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable — keep the overlay default */
    }
  }, []);

  const closeSidebar = useCallback((restoreFocus = true) => {
    setIsSidebarOpen(false);
    if (restoreFocus) menuTriggerRef.current?.focus();
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (next) setIsSidebarOpen(false);
      return next;
    });
  }, []);

  const isOverlayVisible = isSidebarOpen && !isPinned;

  useEffect(() => {
    if (!isOverlayVisible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSidebar();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSidebar, isOverlayVisible]);

  const semanticTheme = theme === 'dark' ? quantMailDarkSemanticTheme : undefined;

  return (
    <section
      className={`flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] ${className}`}
      aria-label={ariaLabel}
      data-theme={theme}
      data-quant-theme={theme === 'dark' ? quantMailDarkSemanticThemeName : undefined}
      style={semanticTheme}
      role="application"
    >
      {sidebar && (
        <>
          {!isPinned && (
            <button
              type="button"
              className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity motion-reduce:transition-none ${
                isSidebarOpen ? 'visible opacity-100' : 'invisible opacity-0'
              }`}
              aria-label="Close navigation menu"
              onClick={() => closeSidebar()}
            />
          )}
          <aside
            ref={drawerRef}
            id={drawerId}
            className={
              isPinned
                ? 'relative flex flex-none bg-[var(--surface)]'
                : `fixed inset-y-0 left-0 z-50 flex max-w-[calc(100vw-3rem)] flex-none bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
                    isSidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
                  }`
            }
            aria-label="Sidebar"
            aria-hidden={!isPinned && !isSidebarOpen}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('.sidebar-nav-item, .sidebar-compose')) {
                closeSidebar(false);
              }
            }}
          >
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
              <button
                type="button"
                className="hidden size-9 items-center justify-center rounded-md text-[var(--foreground)]/70 outline-none hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:inline-flex"
                aria-label={isPinned ? 'Unpin navigation' : 'Pin navigation'}
                aria-pressed={isPinned}
                onClick={togglePinned}
              >
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                  <path
                    d="M9 4h6l-1 6 4 4H6l4-4-1-6Zm3 10v6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
              {!isPinned && (
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-md text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  aria-label="Close navigation menu"
                  onClick={() => closeSidebar()}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              )}
            </div>
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {sidebar && (
          <header className="flex min-h-14 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">
            <button
              ref={menuTriggerRef}
              type="button"
              className="inline-flex size-10 flex-none items-center justify-center rounded-md outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label={
                isPinned
                  ? 'Hide navigation menu'
                  : isSidebarOpen
                    ? 'Close navigation menu'
                    : 'Open navigation menu'
              }
              aria-controls={drawerId}
              aria-expanded={isPinned || isSidebarOpen}
              onClick={() => {
                if (isPinned) {
                  togglePinned();
                  return;
                }
                setIsSidebarOpen((open) => !open);
              }}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
            {mobileTitle && (
              <div className="min-w-0 flex-1 truncate font-semibold">{mobileTitle}</div>
            )}
            {mobileActions && (
              <div className="ml-auto flex items-center gap-1">{mobileActions}</div>
            )}
          </header>
        )}

        {topBar && (
          <header className="flex-none border-b border-[var(--border)] bg-[var(--surface)]">
            {topBar}
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {animated ? <PageTransition>{children}</PageTransition> : children}
        </main>
      </div>
    </section>
  );
}
