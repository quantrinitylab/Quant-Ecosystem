'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { PageTransition, useFocusTrap } from '@quant/shared-ui';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../brand/theme';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';
import { BrandWordmark, appDisplayName } from './BrandWordmark';
// Type only: the shell renders per-app SVG marks itself. The value import of
// `Interactive3DLogo` alongside it was unused — the switcher is its only caller.
import { type LogoAppType } from './Interactive3DLogo';
import { QuantumSplashIntro } from './QuantumSplashIntro';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { useInbox } from '../hooks/useInbox';

// The switcher pulls in `Interactive3DLogo` for five app marks, so it stays out
// of the shell's own chunk until the user first opens it.
const EcosystemWarpMatrix = dynamic(
  () => import('./EcosystemWarpMatrix').then((m) => m.EcosystemWarpMatrix),
  { ssr: false },
);

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
    label: 'Git',
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const switcherTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
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

  useEffect(() => {
    const handleOpen = () => setIsSwitcherOpen(true);
    // `close` is what the palette and shortcuts sheet fire before they open, so
    // two `aria-modal` dialogs are never on screen at once. It deliberately does
    // *not* restore focus the way Escape does: the surface that asked for this is
    // about to take focus itself.
    const handleClose = () => setIsSwitcherOpen(false);
    window.addEventListener('quant:switcher:open', handleOpen);
    window.addEventListener('quant:switcher:close', handleClose);
    return () => {
      window.removeEventListener('quant:switcher:open', handleOpen);
      window.removeEventListener('quant:switcher:close', handleClose);
    };
  }, []);

  const closeSidebar = useCallback((restoreFocus = true) => {
    setIsSidebarOpen(false);
    if (restoreFocus) menuTriggerRef.current?.focus();
  }, []);

  // Same contract as the drawer: closing hands focus back to the control that
  // opened it, so Escape does not drop the caret at the top of the document.
  const closeSwitcher = useCallback(() => {
    setIsSwitcherOpen(false);
    switcherTriggerRef.current?.focus();
  }, []);

  const showSwitcher = useDeferredMount(isSwitcherOpen);

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
   * The trap itself is the shared `useFocusTrap` — this file used to carry its own
   * copy, one of four in the repo, and its selector took `button`/`input` without
   * filtering on visibility, so a control hidden inside the collapsed drawer could
   * become the wrap target. Two options are deliberately off:
   *
   * - `autoFocus`, because the drawer animates in and the effect below waits a
   *   frame before focusing; taking focus on the same tick lands it on an element
   *   that is still off-screen.
   * - `restoreFocus`, because `closeSidebar(restoreFocus?)` already owns the
   *   return target and distinguishes the two cases the hook cannot: Escape goes
   *   back to the menu trigger, a route change does not.
   *
   * Escape is the keyboard engine's, registered above.
   */
  const drawerRef = useFocusTrap<HTMLElement>({
    active: isDrawerPresented,
    autoFocus: false,
    restoreFocus: false,
  });

  // Body scroll lock and initial focus. Not the trap's job: the lock is this
  // shell's, and the frame's delay exists because the drawer slides in.
  useEffect(() => {
    if (!isDrawerPresented) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerPresented, drawerRef]);

  // Contextual FAB Action Handler
  const handleFabClick = () => {
    if (onFabClick) {
      onFabClick();
      return;
    }
    if (pathname.startsWith('/drive')) {
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

                {/*
                  A real `button`, not a clickable `div`. As a div it was
                  unreachable by keyboard and had no focus ring, and because
                  `QuantMailLogo` also took `onClick={handleLogoClick}` while
                  itself dispatching `quant:refresh`, one click on the mail mark
                  fired the global refresh three times and `refetchInbox()`
                  twice. The mark is decoration inside the button now, so the
                  handler runs exactly once — and the wordmark is part of the
                  same target instead of a dead strip beside it.
                */}
                <button
                  type="button"
                  className="flex min-h-touch items-center gap-3 select-none group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  onClick={handleLogoClick}
                  title={`${appDisplayName(currentApp)} — Click to refresh`}
                  aria-label={`${appDisplayName(currentApp)} — refresh`}
                >
                  {currentApp === 'calendar' ? (
                    <QuantCalendarLogo size={36} />
                  ) : currentApp === 'drive' ? (
                    <QuantDriveLogo size={36} />
                  ) : currentApp === 'contacts' ? (
                    <QuantContactsLogo size={36} />
                  ) : currentApp === 'code' ? (
                    <QuantGitLogo size={36} />
                  ) : (
                    <QuantMailLogo size={38} unreadCount={unreadCount} interactive={false} />
                  )}

                  <BrandWordmark app={currentApp} size="text-xl" />
                </button>

                {/*
                  The app switcher. `EcosystemWarpMatrix` has been finished and
                  design-system compliant for a while but had no trigger at all
                  — imported and never rendered, which webpack simply tree-shook
                  away, so the whole overlay shipped as nothing.
                */}
                <button
                  ref={switcherTriggerRef}
                  type="button"
                  className="inline-flex size-11 sm:size-9 flex-none items-center justify-center rounded-lg outline-none hover:bg-[#282C35] text-[#A1A4AC] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  aria-label="Switch app"
                  aria-haspopup="dialog"
                  aria-expanded={isSwitcherOpen}
                  onClick={() => setIsSwitcherOpen((open) => !open)}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path
                      d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
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
                        // Every app name comes from `appDisplayName`, so a rename
                        // lands here too. The chain this replaced had no `code`
                        // case, so QuantGit's search bar read "Search in
                        // QuantMail (sender, subject, keyword)…".
                        (currentApp === 'mail'
                          ? 'Search in QuantMail (sender, subject, keyword)…'
                          : `Search in ${appDisplayName(currentApp)}…`)
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
                    <span>Search in {appDisplayName(currentApp)}…</span>
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

      {/*
        Floating action button.

        Not on the calendar: that page ships its own speed dial at the same
        `bottom-20 right-4`, and the two were stacking — a 48px circle sitting on top of
        a 56px one, both orange, one of them opening the plain Event sheet directly and
        the other offering Event / Task / Birthday / Cycle. Whichever the thumb landed
        on was luck. The speed dial is the one that can reach all four, so it stays and
        this one stands down there.
      */}
      {!isSidebarOpen &&
        !pathname.startsWith('/calendar') &&
        !pathname.startsWith('/compose') &&
        !pathname.startsWith('/thread') &&
        !pathname.includes('/settings') && (
          <button
            type="button"
            onClick={handleFabClick}
            className="fixed bottom-20 right-4 md:hidden z-40 size-12 rounded-full bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.6)] border border-[#FF9B5A]/30 flex items-center justify-center active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#FF8C42]/50"
            aria-label={
              pathname.startsWith('/drive')
                ? 'Upload files'
                : pathname.startsWith('/contacts')
                  ? 'New contact'
                  : pathname.startsWith('/codehub')
                    ? 'New repository'
                    : 'Compose email'
            }
          >
            {pathname.startsWith('/drive') ? (
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

      {/* One-tap gateway across the suite. Latched so the chunk is fetched on the
          first open and the overlay then stays mounted like every other one. */}
      {showSwitcher && (
        <EcosystemWarpMatrix
          isOpen={isSwitcherOpen}
          onClose={closeSwitcher}
          unreadCount={unreadCount}
          onRefresh={handleLogoClick}
        />
      )}

      {/* Cinematic Quantum Ignition Startup Intro */}
      <QuantumSplashIntro />
    </section>
  );
}
