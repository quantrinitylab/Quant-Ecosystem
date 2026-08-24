'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageTransition } from '@quant/shared-ui';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../brand/theme';
import { CommandPalette } from './CommandPalette';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantCodeLogo } from './QuantCodeLogo';
import { BrandWordmark } from './BrandWordmark';
import { Interactive3DLogo, type LogoAppType } from './Interactive3DLogo';
import { EcosystemWarpMatrix } from './EcosystemWarpMatrix';
import { QuantumSplashIntro } from './QuantumSplashIntro';
import { useInbox } from '../hooks/useInbox';

export interface AppShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
  topBar?: ReactNode;
  customHeader?: ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  mobileTitle?: ReactNode;
  mobileActions?: ReactNode;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  onFabClick?: () => void;
  'aria-label'?: string;
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PIN_STORAGE_KEY = 'quant.shell.sidebarPinned';

/* Mobile bottom navigation — ONLY visible on mobile screens (md:hidden) — 100% SVG Vector Engine */
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      </svg>
    ),
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 5" />
      </svg>
    ),
  },
  {
    id: 'code',
    label: 'Code',
    path: '/codehub',
    icon: (
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
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

  // Do not render bottom mobile tab bar inside individual thread chat view or compose view
  if (pathname.startsWith('/thread') || pathname.startsWith('/compose')) {
    return null;
  }

  const isActive = (item: (typeof BOTTOM_NAV)[number]) => {
    if (item.path === '/') {
      return pathname === '/' || MAIL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    }
    return pathname.startsWith(item.path);
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 flex h-14 items-center justify-around border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-2 shadow-lg md:hidden"
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
              active ? 'text-[#ff9933] font-semibold' : 'text-zinc-400 hover:text-white'
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
  customHeader,
  theme = 'dark',
  className = '',
  animated = true,
  mobileTitle,
  mobileActions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onFabClick,
  'aria-label': ariaLabel = 'Application shell',
}: AppShellProps) {
  const drawerId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { data: inboxEmails, refetch: refetchInbox } = useInbox({ folderType: 'INBOX' });
  const unreadCount = inboxEmails?.filter((e) => !e.isRead).length ?? 0;

  const currentApp: LogoAppType = pathname.startsWith('/calendar')
    ? 'calendar'
    : pathname.startsWith('/drive')
      ? 'drive'
      : pathname.startsWith('/contacts')
        ? 'contacts'
        : pathname.startsWith('/codehub')
          ? 'code'
          : 'mail';

  const handleLogoClick = useCallback(() => {
    void refetchInbox();
    window.dispatchEvent(new CustomEvent('quant:refresh'));
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (pathname.startsWith('/calendar') && pathname !== '/calendar') router.push('/calendar');
    else if (pathname.startsWith('/drive') && pathname !== '/drive') router.push('/drive');
    else if (pathname.startsWith('/contacts') && pathname !== '/contacts') router.push('/contacts');
    else if (pathname.startsWith('/codehub') && pathname !== '/codehub') router.push('/codehub');
    else if (
      !pathname.startsWith('/calendar') &&
      !pathname.startsWith('/drive') &&
      !pathname.startsWith('/contacts') &&
      !pathname.startsWith('/codehub') &&
      pathname !== '/'
    ) {
      router.push('/');
    }
  }, [pathname, refetchInbox, router]);

  useEffect(() => {
    try {
      setIsPinned(window.localStorage.getItem(PIN_STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const handleClose = () => setIsSidebarOpen(false);
    window.addEventListener('quant:sidebar:close', handleClose);
    return () => window.removeEventListener('quant:sidebar:close', handleClose);
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
    if (onFabClick) {
      onFabClick();
      return;
    }
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
      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette />

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

          {/* Desktop Pinned Sidebar */}
          {isPinned && (
            <aside
              className="hidden md:relative md:flex flex-none bg-[var(--surface)] border-r border-[var(--border)]"
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
            } ${isPinned ? 'md:hidden' : ''}`}
            aria-label="Sidebar Drawer"
            aria-hidden={!isSidebarOpen}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('.sidebar-nav-item, .sidebar-compose')) {
                closeSidebar(false);
              }
            }}
          >
            {sidebar}
          </aside>
        </>
      )}

      <div
        className={`flex min-w-0 flex-1 flex-col ${pathname.startsWith('/thread') || pathname.startsWith('/compose') ? 'pb-0' : 'pb-14 md:pb-0'}`}
      >
        {/* Top Header bar with Logo + Search in QuantMail or Custom Header */}
        {sidebar &&
          (customHeader ? (
            customHeader
          ) : (
            <header
              className={`flex min-h-14 flex-none items-center justify-between gap-3 border-b border-[var(--border)] bg-zinc-950/90 backdrop-blur px-3 md:px-5 ${pathname.startsWith('/thread') || pathname.startsWith('/compose') ? 'hidden md:flex' : ''}`}
            >
              {/* Left: Menu trigger + Brand Logo & Title */}
              <div className="flex items-center gap-3">
                <button
                  ref={menuTriggerRef}
                  type="button"
                  className="inline-flex size-9 flex-none items-center justify-center rounded-lg outline-none hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
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

                <div
                  className="flex items-center gap-3 cursor-pointer select-none group"
                  onClick={handleLogoClick}
                  title={`Quant${currentApp.charAt(0).toUpperCase() + currentApp.slice(1)} — Click to refresh`}
                >
                  {currentApp === 'calendar' ? (
                    <QuantCalendarLogo size={36} />
                  ) : currentApp === 'drive' ? (
                    <QuantDriveLogo size={36} />
                  ) : currentApp === 'contacts' ? (
                    <QuantContactsLogo size={36} />
                  ) : currentApp === 'code' ? (
                    <QuantCodeLogo size={36} />
                  ) : (
                    <QuantMailLogo size={38} unreadCount={unreadCount} onClick={handleLogoClick} />
                  )}

                  <BrandWordmark app={currentApp} size="text-xl" />
                </div>
              </div>

              {/* Center: Real Contextual Live Search Bar (Desktop) */}
              <div className="hidden md:flex flex-1 max-w-xl mx-4">
                {onSearchChange ? (
                  <div className="w-full flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 focus-within:border-[#FF7A00]/60 focus-within:ring-1 focus-within:ring-[#FF7A00]/30 transition-all shadow-inner">
                    <svg
                      className="size-4 text-zinc-400 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <input
                      type="search"
                      value={searchValue ?? ''}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={
                        searchPlaceholder ||
                        (currentApp === 'calendar'
                          ? 'Search in QuantCalendar…'
                          : currentApp === 'drive'
                            ? 'Search in QuantDrive…'
                            : currentApp === 'contacts'
                              ? 'Search in QuantContacts…'
                              : 'Search in QuantMail (sender, subject, keyword)…')
                      }
                      className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                    {searchValue && (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="text-zinc-400 hover:text-white shrink-0 p-0.5"
                        title="Clear search"
                      >
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                    <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-500 border border-zinc-700/60 shrink-0">
                      /
                    </kbd>
                  </div>
                ) : (
                  <div className="w-full flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-400">
                    <svg
                      className="size-4 text-zinc-400 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <span>
                      Search in Quant{currentApp.charAt(0).toUpperCase() + currentApp.slice(1)}…
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Mobile Title / Actions */}
              <div className="flex items-center gap-2">
                {mobileTitle && <div className="md:hidden">{mobileTitle}</div>}
                {mobileActions}
              </div>
            </header>
          ))}

        {topBar}

        <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {animated ? <PageTransition>{children}</PageTransition> : children}
        </main>
      </div>

      {/* Floating Action Button (FAB) — Intelligent visibility (hidden on compose, reading view, settings, and drawer open) */}
      {!isSidebarOpen &&
        !pathname.startsWith('/compose') &&
        !pathname.startsWith('/calendar') &&
        !pathname.startsWith('/thread') &&
        !pathname.includes('/settings') && (
          <button
            type="button"
            onClick={handleFabClick}
            className="fixed bottom-20 right-4 md:hidden z-40 size-14 rounded-full bg-[#FF7A00] text-[#090A0C] font-bold shadow-[0_4px_16px_rgba(255,122,0,0.35)] flex items-center justify-center hover:bg-[#FFA800] active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#FF7A00]/40"
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
        )}

      {/* Mobile Bottom Navigation — strictly md:hidden */}
      <MobileBottomNav />

      {/* Cinematic Quantum Ignition Startup Intro */}
      <QuantumSplashIntro />
    </section>
  );
}
