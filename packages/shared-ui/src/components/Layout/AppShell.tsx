'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PageTransition } from '../Motion';

export interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topBar?: React.ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  mobileTitle?: React.ReactNode;
  mobileActions?: React.ReactNode;
  'aria-label'?: string;
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const AppShell: React.FC<AppShellProps> = ({
  children,
  sidebar,
  topBar,
  theme = 'light',
  className = '',
  animated = true,
  mobileTitle,
  mobileActions,
  'aria-label': ariaLabel = 'Application shell',
}) => {
  const drawerId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = useCallback((restoreFocus = true) => {
    setIsSidebarOpen(false);
    if (restoreFocus) {
      menuTriggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;

    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    if (desktopQuery.matches) {
      setIsSidebarOpen(false);
      return;
    }

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

    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeSidebar(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    desktopQuery.addEventListener('change', handleDesktopChange);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      desktopQuery.removeEventListener('change', handleDesktopChange);
    };
  }, [closeSidebar, isSidebarOpen]);

  const showMobileBar = Boolean(sidebar || mobileTitle || mobileActions);

  return (
    <section
      className={`flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] ${className}`}
      aria-label={ariaLabel}
      data-theme={theme}
    >
      {sidebar && (
        <>
          <button
            type="button"
            className={`fixed inset-0 z-40 bg-[var(--foreground)]/40 transition-opacity motion-reduce:transition-none lg:hidden ${
              isSidebarOpen ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
            aria-label="Close navigation menu"
            onClick={() => closeSidebar()}
          />
          <aside
            ref={drawerRef}
            id={drawerId}
            className={`fixed inset-y-0 left-0 z-50 flex max-w-[calc(100vw-3rem)] flex-none bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:visible lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none ${
              isSidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
            }`}
            aria-label="Sidebar"
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('a, button')) closeSidebar(false);
            }}
          >
            <button
              type="button"
              className="absolute right-2 top-2 z-10 inline-flex size-10 items-center justify-center rounded-md text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
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
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {showMobileBar && (
          <header className="flex min-h-14 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 lg:hidden">
            {sidebar && (
              <button
                ref={menuTriggerRef}
                type="button"
                className="inline-flex size-10 flex-none items-center justify-center rounded-md outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                aria-label="Open navigation menu"
                aria-controls={drawerId}
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen(true)}
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
            )}
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
};
