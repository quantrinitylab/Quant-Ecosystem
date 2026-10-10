'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, isValidElement, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { PageTransition, useFocusTrap } from '@quant/shared-ui';
import { quantMailDarkSemanticTheme, quantMailDarkSemanticThemeName } from '../brand/theme';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { appDisplayName } from './BrandWordmark';
// Type only: the shell renders per-app SVG marks itself.
import { type LogoAppType } from './Interactive3DLogo';
import { QuantumSplashIntro } from './QuantumSplashIntro';
import { useInbox } from '../hooks/useInbox';
import { useAuth } from '../providers/auth-provider';
import { groupEmailsIntoThreads } from '../lib/threading';
import type { Email } from '../types';
import { SearchClearButton } from './SearchClearButton';
import { QuantFab, type FabAction } from './QuantFab';
import { ShellChromeProvider } from './ShellChromeContext';
import { QuantyDrawerHost } from './QuantyLauncher';
import { DesktopContextSidebar } from './DesktopContextSidebar';
import type { QuantyLiveAgentHandle } from './QuantyLiveAgent';

/**
 * The live agentic surface (avatar, mode chooser, 5-tab inspector popup).
 * Loaded on demand like the drawer — framer-motion + the agent hooks stay out
 * of the first chunk until Quanty is actually asked for.
 */
const QuantyLiveAgent = dynamic(
  () => import('./QuantyLiveAgent').then((m) => m.QuantyLiveAgent),
  { ssr: false },
);
import { UndoSendProvider } from './UndoSendCountdownBar';
import { QuantPillarTopBar } from './QuantPillarTopBar';
import { ContextBottomNavBar } from './ContextBottomNavBar';
import { DesktopAppRail } from './DesktopAppRail';
import { pillarForApp } from './desktopContextTabs';
import { appThemeForPath } from '../lib/app-theme';

export interface AppShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
  topBar?: ReactNode;
  customHeader?: ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  /**
   * @deprecated The per-app mobile header was removed: on phones the screen
   * opens on the 5-pillar dock (switcher → AI capsule → content) and this
   * prop no longer renders anywhere. Kept in the interface so existing
   * callers (labels, pipelines) keep typechecking until they drop it.
   */
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
  /**
   * Told whenever the shell's Quanty drawer opens or closes.
   *
   * Only the calendar needs this, and it needs it for one honest reason: its
   * slide-up sheet guards Escape so a nested overlay closes alone instead of
   * taking the sheet with it, and Quanty is one of those overlays. The flag used
   * to be the page's own `useState` because the drawer was. Now that the shell
   * owns the drawer, the page cannot read that state — it renders `AppShell`,
   * so its own body sits outside any provider the shell could publish through.
   * A callback is the whole fix, and it is the same shape as `onSearchChange`.
   */
  onQuantyOpenChange?: (open: boolean) => void;
  'aria-label'?: string;
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PIN_STORAGE_KEY = 'quant.shell.sidebarPinned';

/* Mobile bottom navigation: exactly ONE bottom bar — <ContextBottomNavBar />,
   the contextual per-app tab bar (user decision 2026-10-07, reversing #531).
   The 5-app switcher lives exactly once at the top (<QuantPillarTopBar />);
   the bottom duplicate (<MobilePillarBottomNav />) and the top strip
   (<MobileSubTabStrip />) were removed. */

export function AppShell({
  children,
  sidebar,
  topBar,
  customHeader,
  theme = 'dark',
  className = '',
  animated = true,
  mobileActions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onFabClick,
  fabLabel,
  onQuantyOpenChange,
  'aria-label': ariaLabel = 'Application shell',
}: AppShellProps) {
  const drawerId = useId();
  const mobileSearchId = useId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // Dynamic theme engine with localStorage persistence (Task X20)
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark' | 'neon'>(theme);

  useEffect(() => {
    setEffectiveTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quant_theme') as 'light' | 'dark' | 'neon' | null;
      if (saved && (saved === 'light' || saved === 'dark' || saved === 'neon')) {
        setEffectiveTheme(saved);
      }
      const handleThemeChange = (e: Event) => {
        const customEvent = e as CustomEvent<{ theme?: 'light' | 'dark' | 'neon' }>;
        if (customEvent.detail?.theme) {
          setEffectiveTheme(customEvent.detail.theme);
        }
      };
      window.addEventListener('quant:theme-changed', handleThemeChange);
      return () => {
        window.removeEventListener('quant:theme-changed', handleThemeChange);
      };
    }
  }, []);
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
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { data: inboxEmails } = useInbox({ folderType: 'INBOX' });
  // Defensive: AppShell is normally inside AuthProvider (see app/layout.tsx),
  // but tests and some hosts render it standalone — useAuth() throws there.
  let currentEmail = '';
  try {
    const { user: currentUser } = useAuth();
    currentEmail = currentUser?.email || '';
  } catch {
    currentEmail = '';
  }
  /**
   * Unread badge counts unread CONVERSATIONS (threads), not raw emails — the
   * same definition the inbox page uses (`thread.isRead` = every message read
   * or sent by me). Counting raw `!e.isRead` emails disagreed with the lens
   * chips on the same screen (e.g. badge said "5 unread" while the All lens
   * said "0 unread, 5 total") because sent-mail copies are stored unread.
   */
  const unreadCount = useMemo(() => {
    if (!inboxEmails || inboxEmails.length === 0) return 0;
    const threads = groupEmailsIntoThreads(inboxEmails, currentEmail);
    return threads.filter((t) => !t.isRead).length;
  }, [inboxEmails, currentEmail]);

  /**
   * Real per-lens counts for the mail pillar's lens strip, measured on the
   * inbox rows actually loaded — never hardcoded. Definitions mirror the
   * inbox page's `matchesLens` so the badge on a lens always describes the
   * list that lens will open: `important` is high-priority or starred,
   * `teams` is a multi-recipient/group conversation, `promos` is the
   * promotions category.
   *
   * Each value prefers the unread count and falls back to the total, the same
   * precedence the inbox's own chips use; a lens with nothing in it maps to
   * `undefined` and renders no badge at all.
   */
  const mailLensCounts = useMemo(() => {
    const isImportantEmail = (e: Email) => e.priority === 'high' || e.isStarred;
    const isTeamEmail = (e: Email) => {
      if (e.category === 'forums') return true;
      const toCount = Array.isArray(e.to) ? e.to.length : 0;
      const ccCount = Array.isArray(e.cc) ? e.cc.length : 0;
      return toCount + ccCount > 1;
    };

    let allUnread = 0;
    let allTotal = 0;
    let importantUnread = 0;
    let importantTotal = 0;
    let teamsUnread = 0;
    let teamsTotal = 0;
    let updatesUnread = 0;
    let updatesTotal = 0;
    let promosUnread = 0;
    let promosTotal = 0;
    let spamUnread = 0;
    let spamTotal = 0;

    for (const e of inboxEmails ?? []) {
      allTotal += 1;
      const important = isImportantEmail(e);
      const team = isTeamEmail(e);
      if (important) importantTotal += 1;
      if (team) teamsTotal += 1;
      if (e.category === 'updates') updatesTotal += 1;
      if (e.category === 'promotions') promosTotal += 1;
      if (e.isSpam) spamTotal += 1;

      if (!e.isRead) {
        allUnread += 1;
        if (important) importantUnread += 1;
        if (team) teamsUnread += 1;
        if (e.category === 'updates') updatesUnread += 1;
        if (e.category === 'promotions') promosUnread += 1;
        if (e.isSpam) spamUnread += 1;
      }
    }

    const pick = (unread: number, total: number): number | undefined =>
      unread > 0 ? unread : total > 0 ? total : undefined;

    return {
      all: pick(allUnread, allTotal),
      important: pick(importantUnread, importantTotal),
      teams: pick(teamsUnread, teamsTotal),
      updates: pick(updatesUnread, updatesTotal),
      promos: pick(promosUnread, promosTotal),
      spam: pick(spamUnread, spamTotal),
    };
  }, [inboxEmails]);

  /**
   * Quanty, on every shell route rather than the two that hand-rolled it.
   *
   * `/thread` and `/compose` opt out because they already carry their own —
   * the thread view passes the open message, the composer passes the draft and
   * takes an action back to apply to it. Both are strictly more than a route
   * name, and the shell header is `hidden md:flex` on those two rather than
   * absent, so without this a desktop reader would see two Quanty buttons a few
   * hundred pixels apart opening two drawers with two separate conversations.
   */
  const hasOwnQuanty = pathname.startsWith('/thread') || pathname.startsWith('/compose');
  const [isQuantyOpen, setIsQuantyOpen] = useState(false);
  const setQuantyOpen = useCallback(
    (open: boolean) => {
      setIsQuantyOpen(open);
      onQuantyOpenChange?.(open);
    },
    [onQuantyOpenChange],
  );
  /**
   * The live agent surface. Tapping the Quanty button opens its mode
   * chooser ([Chat] [Voice Live Agent]) instead of the old drawer directly —
   * the drawer is now what "Chat" selects (see onChatSelect below).
   */
  const liveAgentRef = useRef<QuantyLiveAgentHandle>(null);
  const openQuanty = useCallback(() => liveAgentRef.current?.open(), []);
  const closeQuanty = useCallback(() => setQuantyOpen(false), [setQuantyOpen]);
  /** "Chat" in the mode chooser -> the existing Quanty copilot drawer. */
  const handleLiveAgentChatSelect = useCallback(() => setQuantyOpen(true), [setQuantyOpen]);

  const currentApp: LogoAppType = pathname.startsWith('/calendar')
    ? 'calendar'
    : pathname.startsWith('/drive')
      ? 'drive'
      : pathname.startsWith('/contacts')
        ? 'contacts'
        : pathname.startsWith('/quantgit')
          ? 'code'
          : 'mail';

  /*
   * The pinned desktop rail renders DesktopContextSidebar — the ONE desktop
   * left sidebar (2026-10-10: logo+name, search, per-app compose + contextual
   * tabs, Quanty, storage, profile). The `sidebar` prop still feeds the
   * mobile drawer untouched — only its `extra` slot is forwarded so routes
   * like Contacts keep their A–Z index on desktop too.
   */
  const desktopSidebarExtra = isValidElement(sidebar)
    ? (sidebar.props as { extra?: ReactNode }).extra
    : undefined;

  const isMainSuiteRoute =
    pathname === '/' ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/drive') ||
    pathname.startsWith('/contacts') ||
    pathname.startsWith('/quantgit');

  /*
   * SIA-P1-3: on mobile the pillar top bar below owns a pinned search field
   * wired to the same `onSearchChange` (see QuantPillarTopBar), so the shell's
   * collapsible mobile search row would be a second box doing the same job.
   * Desktop keeps the shell's center search (the pillar bar is `md:hidden`).
   */
  const pillarSearchVisible = topBar === undefined && isMainSuiteRoute && !customHeader;

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
      // The desktop rail is always pinned now — toggling there would hide the
      // rail with no way back (the hamburger is gone), so ignore it on wide
      // screens. The mobile drawer still toggles below `md`.
      if (isWide) return;
      setIsSidebarOpen((open) => {
        // Leaving focus on a node inside a drawer that is about to go
        // `aria-hidden` strands the screen reader, so hand it back to the trigger.
        if (open) menuTriggerRef.current?.focus();
        return !open;
      });
    };
    window.addEventListener('quant:sidebar:toggle', handleToggle);
    return () => window.removeEventListener('quant:sidebar:toggle', handleToggle);
  }, [isWide]);

  /**
   * Whether the drawer is actually on screen.
   *
   * `isSidebarOpen` alone is not enough: the drawer is `md:hidden` while the rail
   * is pinned, yet the hamburger stays clickable there, so the open state can be
   * true for a drawer nobody can see. Everything modal about the drawer — the
   * scroll lock, the focus trap, the keyboard mask — has to hang off this instead,
   * or a stray click locks the page with no visible cause.
   */
  const isDrawerPresented = isSidebarOpen && !(isPinned || isWide);

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
    // Desktop: the sidebar owns the search field now (the old header bar is
    // gone). The rail is `hidden md:flex`, so `offsetParent` is null exactly
    // when the sidebar is not on screen — cheaper and more honest than
    // re-deriving the breakpoint with `matchMedia`.
    const sidebar = sidebarSearchRef.current;
    if (sidebar && sidebar.offsetParent !== null) {
      sidebar.focus();
      sidebar.select();
      return true;
    }
    // SIA-P1-3: on mobile the pillar bar owns the search field (the shell's
    // collapsible row is suppressed there) — focus it directly.
    const pillarInput = document.getElementById('quant-pillar-search-input');
    if (pillarInput instanceof HTMLInputElement && pillarInput.offsetParent !== null) {
      pillarInput.focus();
      pillarInput.select();
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
      pathname.startsWith('/quantgit') ||
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

  const semanticTheme = effectiveTheme === 'dark' ? quantMailDarkSemanticTheme : undefined;

  // Perceived app-switch speed: prefetch every pillar shell on mount so a tap
  // never waits on the network for the route chunk. Next.js dedupes these.
  useEffect(() => {
    const pillars = ['/', '/calendar', '/drive', '/contacts', '/quantgit'];
    for (const route of pillars) {
      try {
        router.prefetch(route);
      } catch {
        /* prefetch is best-effort */
      }
    }
  }, [router]);

  // Swiggy-grade app-switch transition: a brief scale+fade on <main>
  // while the new pillar's route loads, so the switch feels instant and
  // premium instead of a hard cut. Fires on the same `quant:pillar-change`
  // event the top switcher already dispatches (detail carries the target path).
  //
  // Load-tied, not timer-tied (QM-UIUX-044): the transition lifts when the
  // target route has committed AND painted (double rAF after usePathname()
  // matches the target), so fast routes clear instantly and slow routes stay
  // covered until content is on screen. The 380ms timer is a max fallback
  // only — never the primary signal.
  const [isSwitching, setIsSwitching] = useState(false);
  const switchTimer = useRef<number | null>(null);
  const pendingPath = useRef<string | null>(null);
  const clearSwitching = useCallback(() => {
    if (switchTimer.current) window.clearTimeout(switchTimer.current);
    switchTimer.current = null;
    pendingPath.current = null;
    setIsSwitching(false);
  }, []);
  useEffect(() => {
    const onPillarChange = (event: Event) => {
      const targetPath =
        (event as CustomEvent<{ path?: string }>).detail?.path ?? null;
      pendingPath.current = targetPath;
      setIsSwitching(true);
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
      // Max fallback: never leave the UI dimmed if the route never settles
      // (blocked navigation, redirect away from target, unmounted, etc.).
      switchTimer.current = window.setTimeout(clearSwitching, 380);
    };
    window.addEventListener('quant:pillar-change', onPillarChange);
    return () => {
      window.removeEventListener('quant:pillar-change', onPillarChange);
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
    };
  }, [clearSwitching]);

  // Lift the transition once the target route has committed and painted.
  // Same-path re-tap (refresh, no navigation) clears on the next paint.
  useEffect(() => {
    if (!isSwitching) return;
    const target = pendingPath.current;
    if (!target || pathname === target) {
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(clearSwitching);
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }
  }, [isSwitching, pathname, clearSwitching]);

  // Per-app color theming: the whole UI's accent color animates smoothly
  // when switching apps (user-locked 2026-10-09: Mail=orange, Calendar=blue,
  // Drive=green, Contacts=amber, QuantGit=purple).
  const appTheme = appThemeForPath(pathname ?? '/');
  const appThemeStyle = {
    '--app-accent': appTheme.accent,
    '--app-accent-hover': `color-mix(in srgb, ${appTheme.accent}, white 14%)`,
    '--app-accent-pressed': `color-mix(in srgb, ${appTheme.accent}, black 16%)`,
    '--app-accent-soft': `color-mix(in srgb, ${appTheme.accent} 14%, transparent)`,
    '--app-glow': appTheme.glow,
    '--app-ring': appTheme.ring,
  } as React.CSSProperties;

  return (
    <UndoSendProvider>
      <section
        className={`relative flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] ${className}`}
        aria-label={ariaLabel}
        data-theme={effectiveTheme}
        data-app-theme={appTheme.id}
        data-quant-theme={effectiveTheme === 'dark' ? quantMailDarkSemanticThemeName : undefined}
        style={{ ...semanticTheme, ...appThemeStyle }}
        /*
        No `role="application"`. It used to sit here, presumably talked into
        place by the default `aria-label` of 'Application shell', and it was the
        single most expensive attribute in the app: ARIA scopes that role to one
        widget with its own keyboard model, so NVDA and JAWS leave browse mode
        the moment focus enters it — across every route, because every route
        renders inside this element. A reader could not arrow through an email
        body. The keyboard engine never needed it either; `engine.ts` binds
        `keydown` on the document. A `<section>` with a name is a `region`, which
        is what the label was for.
      */
      >
        {/* Per-app theme wash: subtle accent gradient cross-fading on app switch */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: appTheme.bgWash,
            transition: 'background 0.6s ease-in-out',
          }}
        />
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

              {/* Desktop Pinned Sidebar — the ONE desktop left sidebar
                  (2026-10-10 redesign): logo+name, search, per-app compose +
                  contextual tabs, Quanty, storage, profile.
                  The mobile drawer below keeps rendering the old sidebar untouched. */}
              {(isPinned || isWide) && (
                <aside
                  className="hidden md:relative md:flex flex-none bg-[var(--surface)] border-r border-[var(--border)]"
                  aria-label="Sidebar"
                >
                  <DesktopContextSidebar
                    extra={desktopSidebarExtra}
                    onQuantyOpen={openQuanty}
                    pillar={pillarForApp(currentApp)}
                    composeAction={
                      fabActions[0]
                        ? { label: fabActions[0].label, onSelect: fabActions[0].onSelect }
                        : null
                    }
                    badgeCounts={{ inbox: unreadCount, teams: mailLensCounts.teams }}
                    searchValue={searchValue}
                    onSearchChange={onSearchChange}
                    searchPlaceholder={searchPlaceholder}
                    searchInputRef={sidebarSearchRef}
                  />
                </aside>
              )}

              {/* Mobile & Unpinned Overlay Drawer */}
              <aside
                ref={drawerRef}
                id={drawerId}
                className={`fixed inset-y-0 left-0 z-50 flex max-w-[calc(100vw-3rem)] flex-none bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  isSidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
                } ${isPinned || isWide ? 'md:hidden' : ''}`}
                // A backdrop, a locked page and a focus trap already make this a modal
                // dialog; saying so lets a screen reader announce the boundary instead
                // of presenting it as one more complementary region on the page.
                role="dialog"
                aria-modal={isDrawerPresented || undefined}
                aria-label="Navigation"
                aria-hidden={!isDrawerPresented}
                inert={!isDrawerPresented}
                onClickCapture={(event) => {
                  if (
                    (event.target as HTMLElement).closest('.sidebar-nav-item, .sidebar-compose')
                  ) {
                    closeSidebar(false);
                  }
                }}
              >
                {sidebar}
              </aside>
            </>
          )}

          {/* The column carries no bottom padding: <main> below reserves no room
              either — the contextual bottom bar is an in-flow flex child whose
              height collapses to 0 on scroll, so padding reservations here
              would stack dead space (black-void fix). */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/*
              The old desktop header bar (app logo + global search) is gone
              (2026-10-10): both now live in the desktop sidebar. Only a
              page-provided `customHeader` (e.g. the selection action bar)
              renders here — real functionality that must keep working.

              On a phone the top of the screen belongs to the 5-pillar dock
              (`QuantPillarTopBar` below): switcher first, then the Quant AI
              capsule, then content. Mobile search still works: the pillar bar
              owns a search field wired to the same `onSearchChange`, and the
              `/` shortcut focuses the sidebar field on desktop / the
              collapsible row on mobile.
            */}
            {sidebar && (customHeader ? customHeader : null)}

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
            {sidebar && !customHeader && onSearchChange && !pillarSearchVisible && (
              <div
                id={mobileSearchId}
                inert={!isMobileSearchOpen}
                className={`md:hidden grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                  isMobileSearchOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-[var(--quant-surface-elevated)]/80 bg-[var(--quant-background)] px-3 py-2.5 sm:px-4">
                    <div className="flex min-h-touch flex-1 items-center gap-2 rounded-xl border border-[#3A404D]/80 bg-[var(--quant-surface)]/90 px-3 shadow-inner focus-within:border-[var(--quant-primary)]/60 focus-within:ring-1 focus-within:ring-[var(--quant-primary)]/30">
                      <svg
                        className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
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
                        className="h-11 w-full bg-transparent text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded"
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
                      className="inline-flex min-h-touch items-center justify-center rounded-lg px-3 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Super-App 5-Pillar Top Switcher or custom topBar (mobile only — desktop uses the left context sidebar + right app rail) */}
            {topBar !== undefined ? (
              topBar
            ) : isMainSuiteRoute && !customHeader ? (
              <div className="md:hidden">
                <QuantPillarTopBar
                  searchValue={searchValue}
                  onSearchChange={onSearchChange}
                  searchPlaceholder={searchPlaceholder}
                  onQuantyClick={openQuanty}
                  unreadCounts={{ mail: unreadCount }}
                  lensCounts={{ mail: mailLensCounts }}
                />
              </div>
            ) : null}

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
              style={{
                // App-switch transition: brief scale+fade while the new pillar
                // settles. transform + opacity are GPU-composited; a
                // filter: blur() on the full <main> is NOT — it repaints the
                // whole list every frame — so it stays off this element.
                transform: isSwitching ? 'scale(0.985)' : 'scale(1)',
                opacity: isSwitching ? 0.65 : 1,
                transition: isSwitching
                  ? 'transform 0.18s ease-out, opacity 0.18s ease-out'
                  : 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.32s ease-out',
              }}
            >
              {animated ? <PageTransition>{children}</PageTransition> : children}
            </main>

            {/*
              Mobile Contextual Bottom Navigation — the ONE bottom bar.
              In-flow flex child (NOT fixed): when scroll hides it, its height
              collapses to 0 and <main> expands to reclaim the space — the
              black-void bug is structurally impossible. See ContextBottomNavBar.
            */}
            {isMainSuiteRoute && (
              <ContextBottomNavBar
                badgeOverrides={{
                  inbox: unreadCount > 0 ? unreadCount : undefined,
                  teams: mailLensCounts.teams,
                }}
              />
            )}
          </div>

          {/*
            Desktop right app rail: slim 5-app switcher (Mail/Calendar/Drive/
            Contacts/QuantGit), Gmail's Google-apps-rail style. Desktop only.
          */}
          {isMainSuiteRoute && (
            <DesktopAppRail
              currentPillar={
                currentApp === 'calendar'
                  ? 'calendar'
                  : currentApp === 'drive'
                    ? 'drive'
                    : currentApp === 'contacts'
                      ? 'contacts'
                      : currentApp === 'code'
                        ? 'quantgit'
                        : 'mail'
              }
              unreadCounts={{ mail: unreadCount }}
            />
          )}

          <QuantFab actions={fabActions} />

          {/*
        Out here rather than in the header on purpose: `customHeader` replaces
        that whole element, and the inbox swaps it in the moment a message is
        selected. A drawer mounted inside the header would be unmounted by that
        swap and take the conversation with it.
      */}
          {!hasOwnQuanty && <QuantyDrawerHost isOpen={isQuantyOpen} onClose={closeQuanty} />}
          {/* Live agentic surface: mounted once at shell top level (next to the
              drawer, never inside the header) so a task survives route/header
              swaps while Quanty works. */}
          {!hasOwnQuanty && (
            <QuantyLiveAgent ref={liveAgentRef} onChatSelect={handleLiveAgentChatSelect} />
          )}

          {/* Mobile bottom nav now lives in-flow inside the column above —
              it collapses to height 0 on scroll so content reclaims the space. */}

          {/* Cinematic Quantum Ignition Startup Intro */}
          <QuantumSplashIntro />
        </ShellChromeProvider>
      </section>
    </UndoSendProvider>
  );
}
