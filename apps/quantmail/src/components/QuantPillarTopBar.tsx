'use client';

// ============================================================================
// QuantMail — Super-App 5-Pillar Top Squircle Switcher (Flipkart & Amazon Paradigm)
// Molten Amber Mail, Sunset Gold Calendar, Sovereign Cyan Drive,
// Emerald Matrix Contacts, Obsidian Purple QuantGit.
// Pillar tiles mount the REAL approved app marks (canvas-painted, 28px) —
// strictly ZERO generic glyphs and ZERO raw Unicode emojis.
// ============================================================================

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';
import { QuantGitUserIdModal } from './QuantGitUserIdModal';
import { useAuth } from '../providers/auth-provider';

// Safe auth hook that returns null user when outside AuthProvider (tests, SSR edge cases)
// This keeps the component resilient — the profile avatar just shows a fallback initial.
function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return { user: null } as { user: null };
  }
}

export type PillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface PillarTile {
  id: PillarId;
  label: string;
  path: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  searchPlaceholder: string;
  /** Swiggy-style per-pillar app theme: background tint shown when this pillar is active */
  themeBg: string;
  themeGlow: string;
  icon: (props: { className?: string; active?: boolean }) => React.ReactNode;
}

export interface PillarLens {
  id: string;
  label: string;
  /**
   * Badge shown next to the lens label. Only static string labels belong in the
   * pillar config (e.g. `'E2EE'`); numeric counts are NEVER hardcoded here —
   * they arrive per-render through the `lensCounts` prop, computed from the
   * data actually loaded. A lens with no supplied count shows no badge.
   */
  badge?: number | string;
  queryParam?: { key: string; value: string };
}

// ============================================================================
// Legacy generic mark icons — kept exported for backward compatibility only.
// PILLAR_TILES no longer uses these: the tiles mount the real approved app
// marks (MailLogoIcon et al. above). Do not wire these back into the dock.
// ============================================================================

export function MailMarkIcon({ className }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function CalendarMarkIcon({ className }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function DriveMarkIcon({ className }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

export function ContactsMarkIcon({ className }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 5" />
    </svg>
  );
}

export function QuantGitMarkIcon({ className }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
    </svg>
  );
}

export function SearchMagnifierIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

export function LightningSpeedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3'}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function ClearSearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ============================================================================
// Real approved app marks for the pillar tiles — NO generic glyphs.
//
// QuantMail, QuantCalendar and QuantContacts are the user-approved finals, so
// they mount here exactly as approved. QuantDrive (v3 lava palette) and
// QuantGit are NOT final-approved yet: they mount the best-available mark so
// the dock never falls back to a generic icon, and each carries a
// TODO(LOGO-PENDING) marker so the pending swap is greppable.
// The marks are canvas-painted and supersampled from a 100-unit buffer, so
// they stay crisp at the 28px tile size; each tile button already carries an
// aria-label, so the marks mount decoratively (QuantMailLogo interactive=false).
// ============================================================================

function MailLogoIcon() {
  return <QuantMailLogo size={28} interactive={false} showBadge={false} />;
}

function CalendarLogoIcon() {
  return <QuantCalendarLogo size={28} />;
}

// TODO(LOGO-PENDING): QuantDrive's v3 lava-palette mark is not final-approved
// yet — this is the best-available QuantDriveLogo. Swap in the approved final
// the moment design signs it off; never fall back to the generic folder glyph.
function DriveLogoIcon() {
  return <QuantDriveLogo size={28} />;
}

function ContactsLogoIcon() {
  return <QuantContactsLogo size={28} />;
}

// TODO(LOGO-PENDING): QuantGit's mark is not final-approved yet — this is the
// best-available QuantGitLogo. Swap in the approved final when it lands; never
// fall back to the generic code-brackets glyph.
function QuantGitLogoIcon() {
  return <QuantGitLogo size={28} />;
}

/**
 * Haptic-feel micro-interaction for pillar taps.
 *
 * `navigator.vibrate` only exists on supporting platforms (Android Chrome);
 * everywhere else — desktop, iOS Safari — the guard makes this a silent no-op
 * instead of a throw. It must be called synchronously inside the tap's gesture
 * handler; browsers ignore vibrate() issued outside one.
 *
 * Returns whatever the platform reported, or false when haptics are absent.
 */
export function triggerHapticTap(pattern: number | number[] = 10): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch {
    /* haptics unsupported — silent fallback */
  }
  return false;
}

// ============================================================================
// 5 Pillar Configurations (Flipkart & Amazon Super-App Paradigm)
// ============================================================================

export const PILLAR_TILES: PillarTile[] = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    accentColor: '#FF6B35',
    borderColor: 'border-[#FF6B35]/50',
    glowColor: 'shadow-[0_0_12px_rgba(255,107,53,0.18)]',
    searchPlaceholder: 'Search emails, senders, keywords… <5ms',
    themeBg: 'linear-gradient(180deg, rgba(255,107,53,0.08) 0%, transparent 40%)',
    themeGlow: 'rgba(255,107,53,0.15)',
    icon: MailLogoIcon,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    accentColor: '#4285F4',
    borderColor: 'border-[#4285F4]/50',
    glowColor: 'shadow-[0_0_12px_rgba(66,133,244,0.18)]',
    searchPlaceholder: 'Search events, meetings, attendees… <5ms',
    themeBg: 'linear-gradient(180deg, rgba(66,133,244,0.08) 0%, transparent 40%)',
    themeGlow: 'rgba(66,133,244,0.15)',
    icon: CalendarLogoIcon,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    accentColor: '#34A853',
    borderColor: 'border-[#34A853]/50',
    glowColor: 'shadow-[0_0_12px_rgba(52,168,83,0.18)]',
    searchPlaceholder: 'Search files, documents, FastCDC tags… <5ms',
    themeBg: 'linear-gradient(180deg, rgba(52,168,83,0.08) 0%, transparent 40%)',
    themeGlow: 'rgba(52,168,83,0.15)',
    icon: DriveLogoIcon,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    accentColor: '#8AB4F8',
    borderColor: 'border-[#8AB4F8]/50',
    glowColor: 'shadow-[0_0_12px_rgba(138,180,248,0.18)]',
    searchPlaceholder: 'Search VIPs, contacts, companies… <5ms',
    themeBg: 'linear-gradient(180deg, rgba(138,180,248,0.08) 0%, transparent 40%)',
    themeGlow: 'rgba(138,180,248,0.15)',
    icon: ContactsLogoIcon,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    accentColor: '#A855F7',
    borderColor: 'border-[#A855F7]/50',
    glowColor: 'shadow-[0_0_12px_rgba(168,85,247,0.18)]',
    searchPlaceholder: 'Search repositories, pull requests, commits… <5ms',
    themeBg: 'linear-gradient(180deg, rgba(168,85,247,0.08) 0%, transparent 40%)',
    themeGlow: 'rgba(168,85,247,0.15)',
    icon: QuantGitLogoIcon,
  },
];

export const PILLAR_LENSES: Record<PillarId, PillarLens[]> = {
  mail: [
    { id: 'all', label: 'All', queryParam: { key: 'lens', value: 'all' } },
    { id: 'important', label: 'Important', queryParam: { key: 'lens', value: 'important' } },
    { id: 'teams', label: 'Teams', queryParam: { key: 'lens', value: 'teams' } },
    { id: 'updates', label: 'Updates', queryParam: { key: 'lens', value: 'updates' } },
    { id: 'promos', label: 'Promos', queryParam: { key: 'lens', value: 'promos' } },
    { id: 'spam', label: 'Spam', queryParam: { key: 'lens', value: 'spam' } },
  ],
  calendar: [
    { id: 'today', label: 'Today', queryParam: { key: 'filter', value: 'today' } },
    { id: 'upcoming', label: 'Upcoming', queryParam: { key: 'filter', value: 'upcoming' } },
    { id: 'meetings', label: 'Meetings', queryParam: { key: 'filter', value: 'meetings' } },
    { id: 'reminders', label: 'Reminders', queryParam: { key: 'filter', value: 'reminders' } },
  ],
  drive: [
    { id: 'all-files', label: 'All Files', queryParam: { key: 'filter', value: 'all' } },
    { id: 'docs', label: 'Docs', queryParam: { key: 'filter', value: 'docs' } },
    { id: 'media', label: 'Media', queryParam: { key: 'filter', value: 'media' } },
    { id: 'vault', label: 'Vault', badge: 'E2EE', queryParam: { key: 'filter', value: 'vault' } },
    { id: 'cleaner', label: 'FastCDC Clean', queryParam: { key: 'filter', value: 'cleaner' } },
  ],
  contacts: [
    { id: 'all-contacts', label: 'All', queryParam: { key: 'filter', value: 'all' } },
    { id: 'vips', label: 'VIPs', queryParam: { key: 'filter', value: 'vips' } },
    { id: 'teams', label: 'Teams', queryParam: { key: 'filter', value: 'teams' } },
    { id: 'dedup', label: 'AI Dedup', queryParam: { key: 'filter', value: 'dedup' } },
  ],
  quantgit: [
    { id: 'all-repos', label: 'All Repos', queryParam: { key: 'filter', value: 'repos' } },
    { id: 'open-prs', label: 'Open PRs', queryParam: { key: 'filter', value: 'prs' } },
    { id: 'issues', label: 'Issues', queryParam: { key: 'filter', value: 'issues' } },
    { id: 'ci-runs', label: 'CI Runs', queryParam: { key: 'filter', value: 'ci' } },
  ],
};

export interface QuantPillarTopBarProps {
  className?: string;
  searchValue?: string;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onSearchSubmit?: (val: string) => void;
  onSearchClear?: () => void;
  searchPlaceholder?: string;
  /**
   * Hide the horizontal sub-category lens strip. Defaults to true for pillars
   * whose pages render their own richer filter rows (mail's inbox lenses,
   * calendar/drive/contacts chips) — the strip duplicated those rows with
   * different counts (e.g. Mail showed "All (11)" up top and "All (5)" below).
   * QuantGit has no page-level filter row, so it keeps the strip.
   */
  hideLensStrip?: boolean;
  activePillarOverride?: PillarId;
  activePillar?: PillarId;
  onPillarSelect?: (pillar: PillarId) => void;
  onPillarChange?: (pillar: PillarId, path: string) => void;
  activeLensOverride?: string;
  activeLens?: string;
  onLensSelect?: (lensId: string) => void;
  onLensChange?: (lensId: string, pillar: PillarId) => void;
  onQuantyClick?: () => void;
  onOpenCopilot?: () => void;
  aiLiveText?: string;
  onVoiceSearch?: (transcript: string) => void;
  unreadCounts?: Partial<Record<PillarId, number>>;
  /**
   * Real per-lens counts, keyed by pillar then lens id. Computed from the data
   * actually loaded (e.g. the shell's inbox query) and re-computed on every
   * render, so the strip can never show a stale or fabricated number. A lens
   * id absent from the map — or mapped to a non-positive value — renders no
   * badge at all.
   */
  lensCounts?: Partial<Record<PillarId, Partial<Record<string, number>>>>;
}

export function executePillarTileClick(
  tile: PillarTile,
  options: {
    pathname: string;
    router: { push: (path: string) => void };
    onPillarSelect?: (pillar: PillarId) => void;
    onPillarChange?: (pillar: PillarId, path: string) => void;
  },
) {
  options.onPillarSelect?.(tile.id);
  options.onPillarChange?.(tile.id, tile.path);

  // Haptic-feel micro-interaction: 10ms tap pulse on supporting platforms,
  // silent everywhere else. Called synchronously inside the tap gesture.
  triggerHapticTap(10);

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('quant:pillar-change', {
        detail: { pillar: tile.id, path: tile.path },
      }),
    );
  }

  if (options.pathname !== tile.path) {
    options.router.push(tile.path);
  } else {
    // Re-tap on the active pillar: refresh current app content.
    // Previously this was a no-op (nothing happened on re-tap).
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      window.dispatchEvent(
        new CustomEvent('quant:pillar-retap', { detail: { pillar: tile.id } }),
      );
    }
  }
}

export function executeLensClick(
  lens: PillarLens,
  currentPillar: PillarId,
  options: {
    pathname: string;
    router: { push: (path: string) => void };
    onLensSelect?: (lensId: string) => void;
    onLensChange?: (lensId: string, pillar: PillarId) => void;
  },
) {
  options.onLensSelect?.(lens.id);
  options.onLensChange?.(lens.id, currentPillar);

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('quant:lens-change', {
        detail: { pillar: currentPillar, lensId: lens.id },
      }),
    );
  }

  if (lens.queryParam) {
    const sep = options.pathname.includes('?') ? '&' : '?';
    options.router.push(`${options.pathname}${sep}${lens.queryParam.key}=${lens.queryParam.value}`);
  }
}

export function executeLiveCapsuleClick(options?: {
  onQuantyClick?: () => void;
  onOpenCopilot?: () => void;
}) {
  options?.onQuantyClick?.();
  options?.onOpenCopilot?.();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('quant:copilot:open'));
    window.dispatchEvent(new CustomEvent('quant:quanty:open'));
  }
}

export function executeVoiceMicClick(currentPillar: PillarId) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('quant:voice-search-start', {
        detail: { pillar: currentPillar },
      }),
    );
  }
}

export function executeSearchKeyDown(
  key: string,
  currentValue: string,
  callbacks: {
    onSearchSubmit?: (val: string) => void;
    onSearchClear?: () => void;
    onSearchChange?: (val: string) => void;
  },
) {
  if (key === 'Enter') {
    callbacks.onSearchSubmit?.(currentValue);
  } else if (key === 'Escape') {
    callbacks.onSearchChange?.('');
    callbacks.onSearchClear?.();
  }
}

export function QuantPillarTopBar({
  className = '',
  searchValue,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  searchPlaceholder,
  activePillarOverride,
  activePillar,
  onPillarSelect,
  onPillarChange,
  activeLensOverride,
  activeLens,
  onLensSelect,
  onLensChange,
  onQuantyClick,
  onOpenCopilot,
  aiLiveText,
  onVoiceSearch,
  unreadCounts,
  lensCounts,
  hideLensStrip,
}: QuantPillarTopBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { user } = useOptionalAuth();

  // Internal search state when not controlled
  const effectiveQuery = searchValue ?? searchQuery ?? '';
  const [internalSearch, setInternalSearch] = useState(effectiveQuery);

  useEffect(() => {
    setInternalSearch(effectiveQuery);
  }, [effectiveQuery]);

  // Active pillar detection: controlled props take precedence over pathname
  const currentPillar: PillarId =
    activePillarOverride ??
    activePillar ??
    (pathname.startsWith('/calendar')
      ? 'calendar'
      : pathname.startsWith('/drive')
        ? 'drive'
        : pathname.startsWith('/contacts')
          ? 'contacts'
          : pathname.startsWith('/quantgit')
            ? 'quantgit'
            : 'mail');

  const activeTile = PILLAR_TILES.find((t) => t.id === currentPillar) || PILLAR_TILES[0];
  const activeLenses = PILLAR_LENSES[currentPillar] || [];

  /*
   * The lens strip duplicates page-level filter rows on four of the five
   * pillars (mail's inbox lenses, calendar/drive/contacts chips) — same
   * labels, different counts. It stays visible only where the page has no
   * filter row of its own (QuantGit) or where the caller explicitly opts in.
   */
  const PILLARS_WITH_NATIVE_FILTERS: ReadonlySet<PillarId> = new Set([
    'mail',
    'calendar',
    'drive',
    'contacts',
  ]);
  const showLensStrip = !(hideLensStrip ?? PILLARS_WITH_NATIVE_FILTERS.has(currentPillar));

  // Active lens detection: controlled props take precedence
  const effectiveLensOverride = activeLensOverride ?? activeLens;
  const [selectedLens, setSelectedLens] = useState<string>(
    effectiveLensOverride || activeLenses[0]?.id || 'all',
  );

  useEffect(() => {
    if (effectiveLensOverride) {
      setSelectedLens(effectiveLensOverride);
    } else if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const lensParam = params.get('lens') || params.get('filter');
      if (lensParam) {
        setSelectedLens(lensParam);
      }
    }
  }, [effectiveLensOverride]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{
        pillar?: string;
        lensId?: string;
        tabId?: string;
        queryParam?: { key: string; value: string };
      }>;
      if (customEvent.detail?.lensId) {
        setSelectedLens(customEvent.detail.lensId);
      } else if (
        customEvent.detail?.queryParam?.key === 'lens' ||
        customEvent.detail?.queryParam?.key === 'filter'
      ) {
        setSelectedLens(customEvent.detail.queryParam.value);
      } else if (customEvent.detail?.tabId) {
        setSelectedLens(customEvent.detail.tabId);
      }
    };
    window.addEventListener('quant:lens-change', handleSync);
    window.addEventListener('quant:subtab-change', handleSync);
    return () => {
      window.removeEventListener('quant:lens-change', handleSync);
      window.removeEventListener('quant:subtab-change', handleSync);
    };
  }, []);

  // Voice speech recognition state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleMicClick = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionApi =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionApi) {
      try {
        const recognition = new SpeechRecognitionApi();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript || '';
          if (transcript) {
            setInternalSearch(transcript);
            onSearchChange?.(transcript);
            onVoiceSearch?.(transcript);
            onSearchSubmit?.(transcript);
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        setIsListening(false);
      }
    } else {
      // Dispatch custom event for voice search integration
      setIsListening((prev) => !prev);
      window.dispatchEvent(
        new CustomEvent('quant:voice-search-start', {
          detail: { pillar: currentPillar },
        }),
      );
    }
  }, [isListening, currentPillar, onSearchChange, onVoiceSearch, onSearchSubmit]);

  const handleTileClick = (tile: PillarTile) => {
    executePillarTileClick(tile, {
      pathname,
      router,
      onPillarSelect,
      onPillarChange,
    });
  };

  const handleLensClick = (lens: PillarLens) => {
    setSelectedLens(lens.id);
    executeLensClick(lens, currentPillar, {
      pathname,
      router,
      onLensSelect,
      onLensChange,
    });
  };

  const handleLiveCapsuleClick = () => {
    executeLiveCapsuleClick({
      onQuantyClick,
      onOpenCopilot,
    });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalSearch(val);
    onSearchChange?.(val);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    executeSearchKeyDown(e.key, internalSearch, {
      onSearchSubmit,
      onSearchClear: () => {
        setInternalSearch('');
        onSearchClear?.();
      },
      onSearchChange,
    });
  };

  const handleClearClick = () => {
    setInternalSearch('');
    onSearchChange?.('');
    onSearchClear?.();
  };

  // ==========================================================================
  // Super-App Switcher v2 (2026-10-06 UI/UX overhaul)
  // Sleek logo-only pill · hide-on-scroll (reappears ONLY at the very top) ·
  // Instagram-style active retap (scroll-to-top + refresh) · long-press labels
  // ==========================================================================
  const dockRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const innerHeaderRef = useRef<HTMLElement>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState<number | undefined>(undefined);
  // Sliding LINE indicator (Swiggy-style): wraps the active tab, animates
  // from center-expand then slides with spring physics. Replaces the old dot.
  const [lineLeft, setLineLeft] = useState(0);
  const [lineWidth, setLineWidth] = useState(0);
  const [spinningPillar, setSpinningPillar] = useState<PillarId | null>(null);
  const [tooltipPillar, setTooltipPillar] = useState<PillarId | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Search bar shrink state: when scrolled, search compacts and Quant AI appears beside it
  const [searchCompact, setSearchCompact] = useState(false);
  // Quant AI live capsule dismissal — remembered in local component state for
  // the current live text. A new aiLiveText value resets it (new status, new look).
  const [aiPillDismissed, setAiPillDismissed] = useState(false);
  useEffect(() => {
    setAiPillDismissed(false);
  }, [aiLiveText]);
  // QuantGit User ID modal state
  const [quantGitIdModalOpen, setQuantGitIdModalOpen] = useState(false);
  const [quantGitUserId, setQuantGitUserId] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const tooltipTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const spinTimer = useRef<number | null>(null);

  // Measure the active tab's bounds for the sliding LINE indicator.
  // The line wraps the active tab (Swiggy-style), expanding from center.
  const measureLine = useCallback(() => {
    const idx = PILLAR_TILES.findIndex((t) => t.id === currentPillar);
    const tab = tabRefs.current[idx];
    const dock = dockRef.current;
    if (tab && dock) {
      const dockRect = dock.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      if (tabRect.width > 0) {
        setLineLeft(tabRect.left - dockRect.left);
        setLineWidth(tabRect.width);
      }
    }
  }, [currentPillar]);

  useLayoutEffect(() => {
    measureLine();
  }, [measureLine]);

  useEffect(() => {
    window.addEventListener('resize', measureLine);
    // Re-measure after layout settles (canvas-painted marks load async).
    const t = window.setTimeout(measureLine, 300);
    return () => {
      window.removeEventListener('resize', measureLine);
      window.clearTimeout(t);
    };
  }, [measureLine]);

  // Keep the collapse wrapper's height synced with the real header height
  // (the lens strip shows/hides per pillar; breakpoints change layout).
  useEffect(() => {
    const el = innerHeaderRef.current;
    if (!el) return;
    const sync = () => setHeaderHeight(el.offsetHeight || undefined);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showLensStrip, currentPillar]);

  // Hide-on-scroll: Swiggy-smooth, GPU-composited.
  //
  // The old implementation animated `height` (0 <-> measured), which forces a
  // layout reflow on every frame — that is the jank the user saw. This version
  // keeps the wrapper at a constant measured height and slides the header with
  // `transform: translateY`, which the compositor handles without touching
  // layout: 60fps, zero jank.
  //
  // Reveal policy: hide on DELIBERATE scroll-down (delta > 8px, past 120px —
  // tiny jitters never hide it); reveal on scroll-UP (delta < -12px) or at the
  // absolute top. The search bar below is separate and never hides.
  //
  // Scroll events are coalesced through requestAnimationFrame: a fast fling
  // fires dozens of events per frame, and running the WeakMap bookkeeping on
  // every one was measurable in profiles.
  useEffect(() => {
    const positions = new WeakMap<object, number>();
    let rafId: number | null = null;
    let pendingTarget: EventTarget | null = null;

    const processScroll = () => {
      rafId = null;
      const target = pendingTarget;
      pendingTarget = null;
      if (!target) return;
      let key: object | null = null;
      let scrollTop = 0;
      if (target === document || target === document.documentElement) {
        key = document;
        scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      } else if (target instanceof HTMLElement) {
        if (target.scrollHeight <= target.clientHeight + 40) return;
        key = target;
        scrollTop = target.scrollTop;
      }
      if (!key) return;
      const last = positions.get(key) ?? 0;
      const delta = scrollTop - last;
      positions.set(key, scrollTop);
      // The scroller that fired must be at 0 while the DOCUMENT itself is also
      // at 0 — otherwise a nested container hitting 0 mid-page would wrongly
      // reveal the switcher while the page is still scrolled.
      const docTop = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollTop === 0 && docTop === 0) {
        setHeaderHidden(false);
        setSearchCompact(false);
      } else if (delta > 8 && scrollTop > 120) {
        setHeaderHidden(true);
        setSearchCompact(true);
      } else if (delta < -12) {
        // Scroll-up reveals the switcher (it no longer waits for the top).
        setHeaderHidden(false);
      } else if (scrollTop > 0 && scrollTop <= 120) {
        // Small scroll: keep switcher visible but compact the search
        setSearchCompact(true);
      }
    };

    const onScroll = (e: Event) => {
      pendingTarget = e.target;
      if (rafId === null) {
        rafId = requestAnimationFrame(processScroll);
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // New pillar = fresh content at the top → always reveal the switcher.
  useEffect(() => {
    setHeaderHidden(false);
  }, [currentPillar]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 1800);
  }, []);

  // Instagram-style: retapping the ACTIVE pillar scrolls every scroller to
  // the top, fires the global refresh, spins the logo, and toasts.
  const handleActivePillarRetap = useCallback(
    (tile: PillarTile) => {
      triggerHapticTap(10);
      setSpinningPillar(tile.id);
      if (spinTimer.current) window.clearTimeout(spinTimer.current);
      spinTimer.current = window.setTimeout(() => setSpinningPillar(null), 650);

      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        /* older webviews — ignore */
      }
      // Pages with custom scroll containers listen for this as well.
      window.dispatchEvent(new CustomEvent('quant:pillar-retap', { detail: { pillar: tile.id } }));
      // Best-effort: smooth-scroll any vertically-scrolled inner container.
      try {
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          if (el.scrollTop > 10 && el.scrollHeight > el.clientHeight + 40) {
            try {
              el.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {
              el.scrollTop = 0;
            }
          }
        });
      } catch {
        /* ignore */
      }

      window.dispatchEvent(new CustomEvent('quant:refresh'));
      showToast('Refreshed just now');
    },
    [showToast],
  );

  const startLongPress = useCallback((tile: PillarTile) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setTooltipPillar(tile.id);
      triggerHapticTap([10, 40, 10]);
      if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = window.setTimeout(() => setTooltipPillar(null), 1300);
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => {
      [longPressTimer, tooltipTimer, toastTimer, spinTimer].forEach((r) => {
        if (r.current) window.clearTimeout(r.current);
      });
    };
  }, []);

  const handleTileClickWithRetap = (tile: PillarTile) => {
    if (tile.id === currentPillar) {
      handleActivePillarRetap(tile);
      return;
    }
    handleTileClick(tile);
  };

  // User profile avatar: initial from email/username, gradient background
  const userInitial = (user?.displayName?.[0] || user?.username?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const userName = user?.displayName || user?.username || user?.email?.split('@')[0] || 'User';

  return (
    <>
    {/*
      STRUCTURE (v3.1 — P1-F single sticky bar):
      - ONE sticky header bar holds both the switcher and the search field.
      - Switcher pill section: hides on scroll down, reappears ONLY at
        scrollY === 0 (unchanged hide-on-scroll behavior).
      - Search bar: same sticky bar, NEVER hides, compacts on scroll.
    */}
    <div
      className="sticky top-0 z-30 w-full"
      style={{
        background: 'rgba(13,13,18,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
    <div
      aria-hidden={headerHidden}
      style={{
        // Constant measured height — never animated. The header slides inside
        // it with a GPU-composited transform (see below): no layout reflow,
        // no jank. `overflow: hidden` clips the slide.
        height: headerHeight ?? 'auto',
        overflow: 'hidden',
      }}
    >
    <header
      ref={innerHeaderRef}
      className={`w-full flex flex-col gap-2 px-3 pt-2.5 pb-2 select-none ${className}`}
      aria-label="Super-App 5-Pillar Navigation Bar"
      style={{
        // Swiggy-grade slide: spring cubic-bezier, ~320ms, transform+opacity
        // only (compositor thread). translateY(-105%) fully clears the
        // wrapper; opacity avoids a ghost edge mid-slide.
        transform: headerHidden ? 'translateY(-105%)' : 'translateY(0)',
        opacity: headerHidden ? 0 : 1,
        transition:
          'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.28s ease-out',
        willChange: 'transform, opacity',
        // PROFESSIONAL: subtle, minimal — no flashy gradients.
        // Clean enterprise feel like Gmail/Outlook, not a game.
        // Background lives on the sticky bar above; this keeps the hairline
        // separating the switcher from the search row.
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/*
        Super-App Switcher — sleek logo pill, Swiggy-grade.
        - Logos LEFT-aligned, user profile avatar on the RIGHT
        - Sliding LINE indicator wraps active tab (NO dot!)
        - 56px, subtle professional styling
      */}
      <div className="w-full flex justify-center">
        <div
          ref={dockRef}
          role="tablist"
          aria-label="Application Suites"
          className="relative flex items-center w-full max-w-5xl px-2"
          style={{
            height: 56,
            background: 'rgba(19,20,26,0.9)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
            borderRadius: 16,
          }}
        >
          {/* Logos: LEFT-aligned group */}
          <div className="flex items-center gap-0.5 flex-1">
          {PILLAR_TILES.map((tile, idx) => {
            const isActive = tile.id === currentPillar;
            const IconComp = tile.icon;
            const badgeCount = unreadCounts?.[tile.id];
            const isSpinning = spinningPillar === tile.id;

            return (
              <button
                key={tile.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                data-testid={`pillar-tile-${tile.id}`}
                aria-selected={isActive}
                aria-label={tile.label}
                title={tile.label}
                onClick={() => handleTileClickWithRetap(tile)}
                onPointerDown={() => startLongPress(tile)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                className="relative flex flex-col items-center justify-center w-12 h-12 min-[400px]:w-14 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] shrink-0 transition-transform duration-150 ease-out active:scale-110"
                style={{
                  animation: `quantStaggerIn 0.4s cubic-bezier(0.22,1,0.36,1) ${idx * 0.05}s both`,
                  transition: 'transform 200ms ease-out',
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className={isSpinning ? 'animate-[quantLogoSpin_0.6s_ease-in-out]' : undefined}
                  style={{
                    display: 'block',
                    // Per-app theme glow (NOT all orange!) — each logo glows its own color
                    filter: isActive ? `drop-shadow(0 0 6px ${tile.accentColor}66)` : undefined,
                    transition: 'transform 200ms ease-out, filter 0.2s ease-out',
                    opacity: isActive ? 1 : 0.75,
                  }}
                >
                  <IconComp active={isActive} />
                </span>

                {badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className="absolute top-0.5 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none text-black shadow"
                    style={{ backgroundColor: tile.accentColor }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}

                {/* Long-press tooltip with the app name */}
                {tooltipPillar === tile.id && (
                  <span
                    role="tooltip"
                    className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[11px] font-medium text-white whitespace-nowrap pointer-events-none animate-[quantTooltipIn_0.2s_ease-out]"
                    style={{
                      background: 'rgba(26,29,36,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}
                  >
                    {tile.label}
                  </span>
                )}
              </button>
            );
          })}
          </div>

          {/* User profile avatar: RIGHT side of the pill (NOT Quant AI!) */}
          <button
            type="button"
            onClick={() => {
              triggerHapticTap(10);
              router.push('/settings');
            }}
            className="relative flex items-center justify-center w-10 h-10 rounded-full shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] transition-transform duration-150 hover:scale-105 active:scale-95 ml-1"
            aria-label={`${userName} — open settings`}
            title={userName}
            style={{
              background: 'linear-gradient(135deg, #FF6B35 0%, #A78BFA 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span className="text-sm font-bold text-white">{userInitial}</span>
          </button>

          {/*
            Sliding LINE indicator — Swiggy-style.
            A rounded line that WRAPS the active tab, animating with spring
            physics: expands from center, then slides. NO dot!
          */}
          <span
            aria-hidden="true"
            className="absolute bottom-[6px] pointer-events-none"
            style={{
              left: lineLeft,
              width: lineWidth,
              transition: 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <span
              key={currentPillar}
              className="block mx-auto rounded-full animate-[quantLineExpand_0.35s_cubic-bezier(0.34,1.56,0.64,1)]"
              style={{
                width: '60%',
                height: 3,
                background: `linear-gradient(90deg, ${activeTile.accentColor}, ${activeTile.accentColor}CC)`,
                boxShadow: `0 0 8px ${activeTile.accentColor}66`,
              }}
            />
          </span>
        </div>
      </div>

      <style>{`
        @keyframes quantLineExpand {
          0% { transform: scaleX(0.2); opacity: 0.3; }
          60% { transform: scaleX(1.15); opacity: 1; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes quantLogoSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes quantTooltipIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.95); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes quantToastIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes quantStaggerIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </header>
    </div>

    {/*
      SEARCH BAR — pinned to the SAME sticky bar above, NEVER hides on scroll.
      Compacts (48px → 40px) when scrolled; Quant AI icon appears beside it.
    */}
    <div
      className="w-full px-3"
      style={{
        paddingTop: 8,
        paddingBottom: 8,
        transition: 'padding 0.25s ease-out',
      }}
    >
      <div className="flex items-center gap-2 w-full max-w-5xl mx-auto">
        <div
          className="relative flex items-center gap-2 px-3 rounded-xl bg-[#16181F] border border-[#232938] focus-within:border-[#FF8C42]/60 focus-within:ring-1 focus-within:ring-[#FF8C42]/30 transition-all shadow-inner flex-1"
          style={{
            height: searchCompact ? 40 : 48,
            transition: 'height 0.25s ease-out',
          }}
        >
          <SearchMagnifierIcon className="size-4 text-[#94A3B8] shrink-0" />
          <input
            type="search"
            value={internalSearch}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder || activeTile.searchPlaceholder}
            aria-label={searchPlaceholder || activeTile.searchPlaceholder}
            className="w-full bg-transparent text-xs text-white placeholder-[#64748B] focus:outline-none"
          />

          {internalSearch.length > 0 && (
            <button
              type="button"
              onClick={handleClearClick}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1F2430] transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <ClearSearchIcon className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleMicClick}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-lg transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#FF8C42] ${
              isListening
                ? 'text-red-400 bg-red-950/40 border border-red-500/50 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1F2430]'
            }`}
            title={isListening ? 'Stop Listening' : 'Voice Search'}
            aria-label={isListening ? 'Stop Listening' : 'Voice Search'}
            aria-pressed={isListening}
          >
            <MicrophoneIcon className="size-4" />
          </button>
        </div>

        {/* Quant AI quick-access: appears when search compacts on scroll */}
        <button
          type="button"
          onClick={handleLiveCapsuleClick}
          className="flex items-center justify-center rounded-xl shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            width: searchCompact ? 40 : 0,
            height: searchCompact ? 40 : 0,
            opacity: searchCompact ? 1 : 0,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(167,139,250,0.15))',
            border: '1px solid rgba(255,140,66,0.3)',
            transition: 'width 0.25s ease-out, height 0.25s ease-out, opacity 0.2s ease-out',
          }}
          title="Open Quant AI Assistant"
          aria-label="Open Quant AI Assistant"
        >
          <SparklesIcon className="size-4 text-[#FF8C42]" />
        </button>
      </div>
    </div>
    {/* End of the single merged sticky bar (switcher + search). */}
    </div>

    {/* Quant AI live capsule — below the sticky bar, collapsible, dismissible.
        Only rendered when a real live status string is supplied; never
        fabricate a status when none exists. Dismissal is remembered in local
        state; a new aiLiveText value resets it (new status, new look). */}
    {!headerHidden && !!aiLiveText && !aiPillDismissed && (
    <div className="w-full px-3 pt-1">
      <div className="flex items-center justify-between gap-2 w-full max-w-5xl mx-auto">
        <button
          type="button"
          onClick={handleLiveCapsuleClick}
          className="group flex items-center gap-2 px-3 py-1 rounded-full bg-[#111318]/90 border border-[#232938] hover:border-[#FF8C42]/50 hover:bg-[#161922] transition-all duration-200 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Open Quant AI Assistant"
          aria-label="Open Quant AI Assistant"
        >
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8C42] opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#FF8C42] shadow-[0_0_6px_#FF8C42]" />
          </span>

          <SparklesIcon className="size-3.5 text-[#FF8C42] group-hover:scale-110 transition-transform" />

          <span className="text-[11px] font-medium tracking-tight text-[#E2E8F0] group-hover:text-white truncate">
            <span>{aiLiveText}</span>
          </span>

          <ChevronRightIcon className="size-3 text-[#64748B] group-hover:text-[#FF8C42] group-hover:translate-x-0.5 transition-all" />
        </button>

        {/* Dismiss the capsule — it must never push content down once the
            reader has seen it. Remembered in local state (see above). */}
        <button
          type="button"
          onClick={() => setAiPillDismissed(true)}
          className="p-1.5 rounded-full text-[#64748B] hover:text-white hover:bg-[#1F2430] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Dismiss"
          aria-label="Dismiss Quant AI status"
        >
          <ClearSearchIcon className="size-3.5" />
        </button>

        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#12151E] border border-[#232938] text-[10px] font-mono text-emerald-400">
          <LightningSpeedIcon className="size-2.5 text-emerald-400" />
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>&lt;5ms LIVE</span>
        </div>
      </div>
    </div>
    )}

    {/* Lens strip — below search */}
    {showLensStrip && (
      <div className="w-full px-3 pt-2">
      <div
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 w-full max-w-5xl mx-auto"
        role="tablist"
        aria-label="Sub-category lenses"
      >
        {activeLenses.map((lens) => {
          const isSelected = selectedLens === lens.id;
          const liveCount = lensCounts?.[currentPillar]?.[lens.id];
          const lensBadge: number | string | undefined =
            typeof liveCount === 'number' && Number.isFinite(liveCount) && liveCount > 0
              ? liveCount
              : typeof lens.badge === 'string'
                ? lens.badge
                : undefined;
          return (
            <button
              key={lens.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleLensClick(lens)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-medium shrink-0 transition-all outline-none focus-visible:ring-1 focus-visible:ring-[#FF8C42] ${
                isSelected
                  ? 'text-white font-semibold shadow-sm'
                  : 'bg-[#111318] text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#161922] border border-[#232938]'
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      border: `1px solid ${activeTile.accentColor}80`,
                      boxShadow: `0 0 8px ${activeTile.accentColor}25`,
                    }
                  : undefined
              }
            >
              <span>{lens.label}</span>
              {lensBadge !== undefined && (
                <span
                  className="px-1 py-px rounded-full text-[9px] font-bold leading-none font-mono"
                  style={
                    isSelected
                      ? {
                          backgroundColor: activeTile.accentColor,
                          color: '#000000',
                        }
                      : {
                          backgroundColor: '#232938',
                          color: '#CBD5E1',
                        }
                  }
                >
                  {lensBadge}
                </span>
              )}
            </button>
          );
        })}
        <div aria-hidden="true" className="shrink-0 w-1" />
      </div>
      </div>
    )}

    {/* "Refreshed just now" toast — fixed, above the single bottom nav */}
    {toastMsg && (
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 z-[100] px-3.5 py-2 rounded-full text-xs font-medium text-white whitespace-nowrap animate-[quantToastIn_0.25s_ease-out] bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)]"
        style={{
          background: 'rgba(26,29,36,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {toastMsg}
      </div>
    )}

    {/* QuantGit "Create User ID" button — appears when QuantGit pillar is active.
        Sits ABOVE the single h-16 bottom bar with safe-area clearance (the old
        bottom-20 overlapped the bar on notched phones), compact so it never
        covers content or the nav. */}
    {currentPillar === 'quantgit' && (
      <button
        type="button"
        onClick={() => setQuantGitIdModalOpen(true)}
        className="fixed right-4 z-[90] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 max-w-[calc(100vw-2rem)] bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)]"
        style={{
          background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
          boxShadow: '0 8px 24px rgba(168,85,247,0.4)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
        aria-label={quantGitUserId ? `QuantGit ID: @${quantGitUserId} — manage` : 'Create QuantGit User ID'}
        title={quantGitUserId ? `@${quantGitUserId}` : 'Create your QuantGit User ID'}
      >
        <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        {quantGitUserId ? `@${quantGitUserId}` : 'Create User ID'}
      </button>
    )}

    {/* QuantGit User ID creation modal */}
    <QuantGitUserIdModal
      isOpen={quantGitIdModalOpen}
      onClose={() => setQuantGitIdModalOpen(false)}
      currentUserId={quantGitUserId}
      onCreate={(newId) => {
        setQuantGitUserId(newId);
        setToastMsg(`QuantGit ID @${newId} created!`);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToastMsg(null), 3000);
      }}
    />
    </>
  );
}

export default QuantPillarTopBar;
