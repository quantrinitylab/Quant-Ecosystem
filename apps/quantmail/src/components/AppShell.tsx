'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
// Type only: the shell renders per-app SVG marks itself.
import { type LogoAppType } from './Interactive3DLogo';
import { QuantumSplashIntro } from './QuantumSplashIntro';
import { useInbox } from '../hooks/useInbox';
import { SearchClearButton } from './SearchClearButton';
import { QuantFab, type FabAction } from './QuantFab';
import { ShellChromeProvider } from './ShellChromeContext';

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
  /**
   * Accessible name for the create button when `onFabClick` is supplied. The
   * inbox swaps its action by lens, so the name has to be able to follow it —
   * without this the Groups lens announced "Compose email" and then opened the
   * group dialog.
   */
  fabLabel?: string;
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
  fabLabel,
  'aria-label': ariaLabel = 'Application shell',
}: AppShellProps) {
  const drawerId = useId();
  const mobileSearchId = useId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  /*
   * The mobile search row, which the shell owns rather than each route.
   *
   * The desktop bar below is `hidden md:flex`, so until now a phone had no
   * search in any app: Drive, Contacts and Calendar all passed
   * `onSearchChange` and all three rendered a field nobody could reach under
   * 768px. The inbox had hand-rolled its own sheet, which is the pattern this
   * lifts — one row here serves every route that can search, and the inbox
   * drops its copy.
   */
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
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

  /*
   * `/` focuses the search field on a route that has one.
   *
   * The chord was NOT unbound — `KeyboardProvider`'s command registry has always
   * claimed it for `nav.search`, which navigates to `/search`. So the `<kbd>/</kbd>`
   * pill in the bar below was telling the truth about the key and lying about
   * where it goes: on the four routes that filter in place (inbox, calendar,
   * contacts, drive) pressing `/` left the list you were reading and loaded a
   * different page, with the pill for it sitting inside the field it skipped.
   *
   * Two bindings, layered rather than fought over. This one is tried first and
   * declines by returning `false` when there is nothing to focus, which is the
   * engine's documented hand-off (`engine.ts:391-400`) — so `/` still reaches
   * `/search` on the eighteen routes with no field, and stops short at the
   * nearest one on the four that have it. That is how `/` behaves in vim, Gmail,
   * GitHub and Linear: search here, not search somewhere else.
   *
   * `priority` is load-bearing. Ranking is scope depth, then priority, then
   * registration recency — and `KeyboardProvider` is this component's *parent*,
   * so React runs its effect last and it would otherwise always be the more
   * recent binding.
   *
   * `preventDefault` matters twice over: Chrome and Firefox both take `/` for
   * find-in-page, and without it the slash lands in the field it just focused.
   * Not `allowInInput`, so `/` stays typeable inside the search box and every
   * other field.
   */
  const focusSearch = useCallback(() => {
    // `false` is not "nothing happened" — it hands the key press to the next
    // binding in the ranking, which is the command registry's `/search` jump.
    if (!onSearchChange) return false;
    const desktop = desktopSearchRef.current;
    // `offsetParent` is null exactly when an ancestor is `display: none` — which
    // is how the desktop bar hides below `md`. Cheaper and more honest than
    // re-deriving the breakpoint with `matchMedia`.
    if (desktop && desktop.offsetParent !== null) {
      desktop.focus();
      desktop.select();
      return true;
    }
    setIsMobileSearchOpen(true);
    return true;
  }, [onSearchChange]);

  useShortcut('/', focusSearch, {
    label: 'Search this view',
    preventDefault: true,
    priority: 10,
    enabled: () => Boolean(onSearchChange),
  });

  /*
   * The row stays mounted so it can animate, so opening it has to move focus
   * explicitly — `autoFocus` fires once at mount and never again. One frame of
   * delay lets the row have a height before the caret lands in it; focusing into
   * a zero-height box scrolls the header out of view on iOS.
   */
  useEffect(() => {
    if (!isMobileSearchOpen) return;
    const frame = requestAnimationFrame(() => mobileSearchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isMobileSearchOpen]);

  /*
   * A route change closes the row. Its query belongs to the route that owns
   * `searchValue`, so leaving it open across a navigation would show a filter
   * bar acting on a list that is no longer there.
   */
  useEffect(() => {
    setIsMobileSearchOpen(false);
  }, [pathname]);

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

  /*
   * What the shell's create button does, per route. `QuantFab` renders nothing
   * for an empty list, so this table is also the opt-out list:
   *
   *  - `/calendar` mounts its own `QuantFab` with four entries. Two of these in
   *    the same corner at the same z-index is the stacking bug that used to make
   *    a 48px circle sit on top of a 56px one, so the shell stays out of its way.
   *  - `/compose`, `/thread` and any nested `settings` screen have nothing to create.
   *  - `/codehub` dispatched `quant:codehub:create`, which nothing in the repo
   *    has ever listened for. That button rendered a `+` and did nothing at all,
   *    so it is gone rather than left there lying.
   *  - Everything else has exactly one create action, so the `+` fires it on the
   *    first tap. Drive's New Folder already has a mobile home in the toolbar and
   *    group creation lives in the inbox's Groups lens; neither needs a dial.
   */
  const fabActions: FabAction[] = useMemo(() => {
    if (
      pathname.startsWith('/calendar') ||
      pathname.startsWith('/compose') ||
      pathname.startsWith('/thread') ||
      pathname.startsWith('/codehub') ||
      pathname.includes('/settings')
    ) {
      return [];
    }
    if (onFabClick) {
      return [{ id: 'primary', label: fabLabel ?? 'Compose email', onSelect: onFabClick }];
    }
    if (pathname.startsWith('/drive')) {
      return [
        {
          id: 'upload',
          label: 'Upload files',
          onSelect: () => window.dispatchEvent(new CustomEvent('quant:drive:upload')),
        },
      ];
    }
    if (pathname.startsWith('/contacts')) {
      return [
        {
          id: 'contact',
          label: 'New contact',
          onSelect: () => window.dispatchEvent(new CustomEvent('quant:contacts:create')),
        },
      ];
    }
    return [{ id: 'compose', label: 'Compose email', onSelect: () => router.push('/compose') }];
  }, [pathname, onFabClick, fabLabel, router]);

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
      {/*
        Everything modal about the drawer hangs off `isDrawerPresented`, and the
        floating create button is modal-adjacent: it must not be hittable over a
        backdrop. Publishing the flag here rather than guarding `<QuantFab>`
        inline is what makes that true for the copy `/calendar` mounts inside
        `{children}` as well as for the shell's own.
      */}
      <ShellChromeProvider isDrawerPresented={isDrawerPresented}>
        {sidebar && (
          <>
            {/* Backdrop for overlay drawer */}
            <button
              type="button"
              className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
                isDrawerPresented
                  ? 'visible opacity-100'
                  : 'invisible opacity-0 pointer-events-none'
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
                </div>

                {/*
                Center: the live search bar, on a pointer.

                A route that cannot search collapses this to `display: none` — the
                slot takes no width, so the brand and the actions sit at the
                header's two edges. What used to fill the `else` was a `div`
                styled exactly like the field: same surface, same border, same
                magnifier, the text "Search in QuantGit…". It took no focus and no
                input. `/codehub`, `/settings` and `/workspaces` all shipped it,
                so three of QuantMail's surfaces offered a search box that was a
                picture of one.
              */}
                <div
                  className={`flex-1 max-w-xl mx-4 ${onSearchChange ? 'hidden md:flex' : 'hidden'}`}
                >
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
                        ref={desktopSearchRef}
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
                      {searchValue && <SearchClearButton onClear={() => onSearchChange('')} />}
                      {/*
                      The pill now describes the field it sits in. `/` was always
                      bound — to `nav.search`, which navigated to `/search` — so on
                      this route the hint pointed at a key that left the page. The
                      shadowing binding above puts the caret here instead; see the
                      comment on `focusSearch`.
                    */}
                      <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-[#282C35] text-[10px] font-mono text-[#6B6E76] border border-[#3A404D]/60 shrink-0">
                        /
                      </kbd>
                    </div>
                  ) : null}
                </div>

                {/* Right: Mobile Title / Actions */}
                <div className="flex items-center gap-2">
                  {mobileTitle && <div className="md:hidden">{mobileTitle}</div>}
                  {/*
                  The phone's way into search. Before the header, so it reads
                  left-to-right as the same control the desktop bar is — and
                  before `mobileActions`, which is where the inbox used to keep
                  its own copy of this button, so the order on that route is
                  unchanged now that it no longer has one.
                */}
                  {onSearchChange && (
                    <button
                      type="button"
                      className={`md:hidden inline-flex size-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                        isMobileSearchOpen
                          ? 'bg-[#282C35] text-[#FF8C42]'
                          : 'text-[#A1A4AC] hover:bg-[#282C35] hover:text-white'
                      }`}
                      onClick={() => {
                        // Closing discards the query. A collapsed row that is still
                        // filtering the list behind it is a filter with no visible
                        // cause, and the only way back to everything would be to
                        // reopen the row to clear it.
                        if (isMobileSearchOpen) onSearchChange('');
                        setIsMobileSearchOpen((open) => !open);
                      }}
                      aria-expanded={isMobileSearchOpen}
                      aria-controls={mobileSearchId}
                      aria-label={isMobileSearchOpen ? 'Close search' : 'Search'}
                    >
                      <svg
                        className="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-4-4" />
                      </svg>
                    </button>
                  )}
                  {mobileActions}
                </div>
              </header>
            ))}

          {/*
          The mobile search row.

          Below the header rather than inside it, because at 375px a 44px field
          and a Cancel button cannot share a 56px bar with the brand and the
          actions — every phone mail client that tries ends up with a 28px field.
          Animated with `grid-template-rows` instead of framer-motion: the shell
          is on every route, and one collapsing row is not worth putting an
          animation library in the first chunk. The row stays mounted so it can
          animate both ways, and `inert` keeps a collapsed field out of the tab
          order and out of the accessibility tree while it is closed.
        */}
          {sidebar && !customHeader && onSearchChange && (
            <div
              id={mobileSearchId}
              inert={!isMobileSearchOpen}
              className={`md:hidden grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                isMobileSearchOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[#282C35]/80 bg-[#090A0C] px-3 py-2.5 sm:px-4">
                  <div className="flex min-h-touch flex-1 items-center gap-2 rounded-xl border border-[#3A404D]/80 bg-[#111318]/90 px-3 shadow-inner focus-within:border-[#FF8C42]/60 focus-within:ring-1 focus-within:ring-[#FF8C42]/30">
                    <svg
                      className="size-4 shrink-0 text-[#A1A4AC]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <input
                      ref={mobileSearchRef}
                      id="app-shell-mobile-search-input"
                      name="searchQuery"
                      type="search"
                      value={searchValue ?? ''}
                      onChange={(e) => onSearchChange(e.target.value)}
                      onKeyDown={(event) => {
                        // Escape closes the row from inside the field, which is
                        // where the user is. The engine's Escape binding is scoped
                        // to the drawer, so it never sees this.
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          onSearchChange('');
                          setIsMobileSearchOpen(false);
                        }
                      }}
                      aria-label="Search"
                      placeholder={
                        searchPlaceholder ||
                        (currentApp === 'mail'
                          ? 'Search messages, contacts, keywords…'
                          : `Search in ${appDisplayName(currentApp)}…`)
                      }
                      className="h-11 w-full bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none"
                    />
                    {searchValue && <SearchClearButton onClear={() => onSearchChange('')} />}
                  </div>
                  {/*
                  A real 44px button, not a 26px line of text. Clear empties the
                  field and keeps it; Cancel puts the row away — two different
                  intentions, so two controls.
                */}
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange('');
                      setIsMobileSearchOpen(false);
                    }}
                    className="inline-flex min-h-touch items-center justify-center rounded-lg px-3 text-xs font-medium text-[#A1A4AC] transition-colors hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {topBar}

          {/*
          The app's only `<main>`, and the target of the root layout's skip link.
          `tabIndex={-1}` is what makes that link work: without it the fragment
          jump scrolls but leaves `document.activeElement` on `BODY`, so the next
          Tab starts from the top of the page again — the header and the drawer
          the link was meant to skip. A programmatic focus on a `tabindex="-1"`
          element does not match `:focus-visible`, so this draws no ring.
        */}
          <main
            id="main-content"
            tabIndex={-1}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {animated ? <PageTransition>{children}</PageTransition> : children}
          </main>
        </div>

        <QuantFab actions={fabActions} />

        {/* Mobile Bottom Navigation — strictly md:hidden */}
        <MobileBottomNav />

        {/* Cinematic Quantum Ignition Startup Intro */}
        <QuantumSplashIntro />
      </ShellChromeProvider>
    </section>
  );
}
