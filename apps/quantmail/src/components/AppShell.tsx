'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageTransition } from '@quant/shared-ui';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../brand/theme';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
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
      className="fixed bottom-0 inset-x-0 z-30 flex h-14 items-center justify-around border-t border-[#282C35] bg-[#090A0C]/95 backdrop-blur-md px-2 shadow-lg md:hidden"
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
              active ? 'text-[#FF8C42] font-semibold' : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className={`transition-transform duration-200 ${active ? 'scale-105' : ''}`}>
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

  /**
   * Tracks Tailwind's `md` breakpoint, because whether the drawer is the primary
   * navigation or a redundant copy of a pinned rail is a purely visual fact that
   * the keyboard and focus code still has to know about.
   *
   * Starts `false` so the server render and the first client render agree; the
   * subscription corrects it before paint.
   */
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  /**
   * The `[` command's other half.
   *
   * `KeyboardProvider` dispatches `quant:sidebar:toggle`, but until now only
   * `quant:sidebar:close` was ever listened for — so the shortcut was advertised
   * in the palette and the help sheet while doing nothing at all.
   */
  useEffect(() => {
    const handleToggle = () => {
      // On a wide screen the pinned rail *is* the sidebar, so "hide it" means
      // unpin. Toggling the drawer there would be worse than a no-op: the drawer
      // is `md:hidden` while pinned, so it would lock the page and capture the
      // keyboard behind something the user cannot see.
      if (isPinned && isWide) {
        togglePinned();
        return;
      }
      setIsSidebarOpen((open) => {
        // Leaving focus on a node inside a drawer that is about to go
        // `aria-hidden` strands the screen reader, so hand it back to the trigger.
        if (open) menuTriggerRef.current?.focus();
        return !open;
      });
    };
    window.addEventListener('quant:sidebar:toggle', handleToggle);
    return () => window.removeEventListener('quant:sidebar:toggle', handleToggle);
  }, [isPinned, isWide, togglePinned]);

  /**
   * Whether the drawer is actually on screen.
   *
   * `isSidebarOpen` alone is not enough: the drawer is `md:hidden` while the rail
   * is pinned, yet the hamburger stays clickable there, so the open state can be
   * true for a drawer nobody can see. Everything modal about the drawer — the
   * scroll lock, the focus trap, the keyboard mask — has to hang off this instead,
   * or a stray click locks the page with no visible cause.
   */
  const isDrawerPresented = isSidebarOpen && !(isPinned && isWide);

  /**
   * The drawer is modal — backdrop, locked body scroll, focus trap — so while it
   * is open it masks every shallower binding. That is what stops `j`/`k`/`e` from
   * walking the conversation list the user cannot see behind it.
   */
  useKeyboardScope('sidebar-drawer', { active: isDrawerPresented, exclusive: true });

  useShortcut('escape', () => closeSidebar(), {
    scope: 'sidebar-drawer',
    label: 'Close navigation',
    // Escape has to work from the search field inside the drawer too, which is
    // exactly where a user who opened the wrong panel is likely to be.
    allowInInput: true,
  });

  /**
   * Focus containment for the drawer.
   *
   * Tab stays a raw listener: the engine resolves *commands*, and a focus trap is
   * not a command — it has no label, belongs in no palette, and needs to inspect
   * `document.activeElement` against a live DOM query on every press.
   */
  useEffect(() => {
    if (!isDrawerPresented) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [isDrawerPresented]);

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
      {sidebar && (
        <>
          {/* Backdrop for overlay drawer */}
          <button
            type="button"
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
              isDrawerPresented ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
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
            // A backdrop, a locked page and a focus trap already make this a modal
            // dialog; saying so lets a screen reader announce the boundary instead
            // of presenting it as one more complementary region on the page.
            role="dialog"
            aria-modal={isDrawerPresented || undefined}
            aria-label="Navigation"
            aria-hidden={!isDrawerPresented}
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
              className={`flex min-h-14 flex-none items-center justify-between gap-3 border-b border-[var(--border)] bg-[#090A0C]/90 backdrop-blur px-3 md:px-5 ${pathname.startsWith('/thread') || pathname.startsWith('/compose') ? 'hidden md:flex' : ''}`}
            >
              {/* Left: Menu trigger + Brand Logo & Title */}
              <div className="flex items-center gap-3">
                <button
                  ref={menuTriggerRef}
                  type="button"
                  // Hidden once the rail is pinned on a wide screen: the drawer it
                  // opens is `md:hidden` there, so the control had nothing to show.
                  className={`inline-flex size-11 sm:size-9 flex-none items-center justify-center rounded-lg outline-none hover:bg-[#282C35] text-[#A1A4AC] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${isPinned ? 'md:hidden' : ''}`}
                  aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={isDrawerPresented}
                  aria-controls={drawerId}
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
                  /*
                   * The vertical padding is on the input, not on this wrapper. With
                   * `py-1.5` here the box looked 34px tall but the field that
                   * actually took the click was the 16px line of text inside it, so
                   * a click aimed at the top or bottom of the search bar did
                   * nothing. `min-h` keeps the box the same size it looked before.
                   */
                  <div className="w-full flex min-h-[38px] items-center gap-2.5 px-3.5 rounded-xl bg-[#111318]/90 border border-[#282C35] focus-within:border-[#FF8C42]/60 focus-within:ring-1 focus-within:ring-[#FF8C42]/30 transition-all shadow-inner">
                    <svg
                      className="size-4 text-[#A1A4AC] shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <input
                      id="app-shell-search-input"
                      name="searchQuery"
                      type="search"
                      value={searchValue ?? ''}
                      onChange={(e) => onSearchChange(e.target.value)}
                      // The placeholder says what is searchable, which is context,
                      // not a name — and it is gone the moment anyone types.
                      aria-label="Search"
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
                      className="w-full self-stretch bg-transparent text-[13px] text-white placeholder-[#A1A4AC] focus:outline-none"
                    />
                    {searchValue && (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="shrink-0 rounded p-0.5 text-[#A1A4AC] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                    <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-[#282C35] text-[10px] font-mono text-[#6B6E76] border border-[#3A404D]/60 shrink-0">
                      /
                    </kbd>
                  </div>
                ) : (
                  <div className="w-full flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#111318]/90 border border-[#282C35] text-xs text-[#A1A4AC]">
                    <svg
                      className="size-4 text-[#A1A4AC] shrink-0"
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

      {/* Floating Action Button (FAB) — Contextual & Clean */}
      {!isSidebarOpen &&
        !pathname.startsWith('/compose') &&
        !pathname.startsWith('/thread') &&
        !pathname.includes('/settings') && (
          <button
            type="button"
            onClick={handleFabClick}
            className="fixed bottom-20 right-4 md:hidden z-40 size-12 rounded-full bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.6)] border border-[#FF9B5A]/30 flex items-center justify-center active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#FF8C42]/50"
            aria-label={
              pathname.startsWith('/calendar')
                ? 'Create event'
                : pathname.startsWith('/drive')
                  ? 'Upload files'
                  : pathname.startsWith('/contacts')
                    ? 'New contact'
                    : pathname.startsWith('/codehub')
                      ? 'New repository'
                      : 'Compose email'
            }
          >
            {pathname.startsWith('/calendar') ? (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="10" y1="16" x2="14" y2="16" />
              </svg>
            ) : pathname.startsWith('/drive') ? (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            ) : pathname.startsWith('/contacts') ? (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            ) : pathname.startsWith('/codehub') ? (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ) : (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </button>
        )}

      {/* Mobile Bottom Navigation — strictly md:hidden */}
      <MobileBottomNav />

      {/* Cinematic Quantum Ignition Startup Intro */}
      <QuantumSplashIntro />
    </section>
  );
}
