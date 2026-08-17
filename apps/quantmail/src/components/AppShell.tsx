'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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

/* Mobile bottom navigation — Outlook/Instagram-style icon bar */
const BOTTOM_NAV: Array<{ id: string; label: string; path: string; icon: ReactNode }> = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M3 7h7l2 2h9v10H3z" />
        <path d="M3 7v12" />
      </svg>
    ),
  },
  {
    id: 'contacts',
    label: 'People',
    path: '/contacts',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 5" />
      </svg>
    ),
  },
  {
    id: 'codehub',
    label: 'CodeHub',
    path: '/codehub',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
      </svg>
    ),
  },
];

const MAIL_PREFIXES = [
  '/thread',
  '/sent',
  '/drafts',
  '/archive',
  '/spam',
  '/trash',
  '/snoozed',
  '/starred',
  '/search',
  '/labels',
  '/compose',
];

function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const isActive = (item: (typeof BOTTOM_NAV)[number]) => {
    if (item.path === '/') {
      return pathname === '/' || MAIL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    }
    return pathname.startsWith(item.path);
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 flex h-14 items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-surface)]/95 backdrop-blur-md px-2 shadow-lg lg:hidden"
      aria-label="Mobile primary navigation"
    >
      {BOTTOM_NAV.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => router.push(item.path)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[10px] font-medium transition-colors ${
              active
                ? 'text-[#ff9933] font-semibold'
                : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  sidebar,
  topBar,
  theme = 'dark',
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
  const [isPinned, setIsPinned] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    try {
      setIsPinned(window.localStorage.getItem(PIN_STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable */
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

  // Keyboard navigation & accessibility for mobile drawer
  useEffect(() => {
    if (!isSidebarOpen) return;

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
  }, [closeSidebar, isSidebarOpen]);

  // Contextual FAB Action Handler
  const handleFabClick = () => {
    if (pathname.startsWith('/calendar')) {
      window.dispatchEvent(new CustomEvent('quant:calendar:create'));
    } else if (pathname.startsWith('/drive')) {
      window.dispatchEvent(new CustomEvent('quant:drive:upload'));
    } else if (pathname.startsWith('/contacts')) {
      window.dispatchEvent(new CustomEvent('quant:contacts:create'));
    } else if (pathname.startsWith('/codehub')) {
      window.dispatchEvent(new CustomEvent('quant:codehub:create'));
    } else {
      router.push('/compose');
    }
  };

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
          {/* Backdrop for overlay drawer */}
          <button
            type="button"
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
              isSidebarOpen ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
            }`}
            aria-label="Close navigation menu"
            onClick={() => closeSidebar()}
          />

          {/* Desktop Pinned Sidebar — Only visible on lg (desktop) screens */}
          {isPinned && (
            <aside
              className="hidden lg:relative lg:flex flex-none bg-[var(--surface)] border-r border-[var(--border)]"
              aria-label="Sidebar"
            >
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                <button
                  type="button"
                  className="size-9 inline-flex items-center justify-center rounded-md text-[var(--foreground)]/70 outline-none hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="Unpin navigation"
                  aria-pressed={true}
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
              </div>
              {sidebar}
            </aside>
          )}

          {/* Mobile & Unpinned Overlay Drawer */}
          <aside
            ref={drawerRef}
            id={drawerId}
            className={`fixed inset-y-0 left-0 z-50 flex max-w-[calc(100vw-3rem)] flex-none bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
              isSidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
            } ${isPinned ? 'lg:hidden' : ''}`}
            aria-label="Sidebar Drawer"
            aria-hidden={!isSidebarOpen}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('.sidebar-nav-item, .sidebar-compose')) {
                closeSidebar(false);
              }
            }}
          >
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
              <button
                type="button"
                className="hidden size-9 items-center justify-center rounded-md text-[var(--foreground)]/70 outline-none hover:bg-[var(--muted)] hover:text-[var(--foreground)] lg:inline-flex"
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
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-md text-[var(--foreground)] outline-none hover:bg-[var(--muted)]"
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
            </div>
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col pb-14 lg:pb-0">
        {/* Top Header bar with menu trigger & actions */}
        {sidebar && (
          <header className="flex min-h-14 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">
            <button
              ref={menuTriggerRef}
              type="button"
              className="inline-flex size-10 flex-none items-center justify-center rounded-md outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setIsSidebarOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </button>

            {mobileTitle ? (
              <div className="min-w-0 flex-1">{mobileTitle}</div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}

            {mobileActions}
          </header>
        )}

        {topBar}

        <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {animated ? <PageTransition>{children}</PageTransition> : children}
        </main>
      </div>

      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        onClick={handleFabClick}
        className="fixed bottom-18 right-4 lg:bottom-6 lg:right-6 z-30 size-14 rounded-full bg-gradient-to-r from-[#ff9933] to-[#ffaa4d] text-[#191008] font-bold shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#ff9933]/40"
        aria-label="Create new item"
      >
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </section>
  );
}
