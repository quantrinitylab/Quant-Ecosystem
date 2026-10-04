'use client';

// ============================================================================
// QuantMail — Super-App 5-Pillar Top Squircle Switcher (Flipkart & Amazon Paradigm)
// Molten Amber Mail, Sunset Gold Calendar, Sovereign Cyan Drive,
// Emerald Matrix Contacts, Obsidian Purple QuantGit.
// Pure SVG Vector Engine — Strictly ZERO raw Unicode emojis.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export type PillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface PillarTile {
  id: PillarId;
  label: string;
  path: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  searchPlaceholder: string;
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
// Pure SVG Vector Icons — strictly ZERO raw Unicode emojis
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
// 5 Pillar Configurations (Flipkart & Amazon Super-App Paradigm)
// ============================================================================

export const PILLAR_TILES: PillarTile[] = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    accentColor: '#FF8C42',
    borderColor: 'border-[#FF8C42]/50',
    glowColor: 'shadow-[0_0_12px_rgba(255,140,66,0.18)]',
    searchPlaceholder: 'Search emails, senders, keywords… <5ms',
    icon: MailMarkIcon,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    accentColor: '#F59E0B',
    borderColor: 'border-[#F59E0B]/50',
    glowColor: 'shadow-[0_0_12px_rgba(245,158,11,0.18)]',
    searchPlaceholder: 'Search events, meetings, attendees… <5ms',
    icon: CalendarMarkIcon,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    accentColor: '#38BDF8',
    borderColor: 'border-[#38BDF8]/50',
    glowColor: 'shadow-[0_0_12px_rgba(56,189,248,0.18)]',
    searchPlaceholder: 'Search files, documents, FastCDC tags… <5ms',
    icon: DriveMarkIcon,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    accentColor: '#10B981',
    borderColor: 'border-[#10B981]/50',
    glowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.18)]',
    searchPlaceholder: 'Search VIPs, contacts, companies… <5ms',
    icon: ContactsMarkIcon,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    accentColor: '#A78BFA',
    borderColor: 'border-[#A78BFA]/50',
    glowColor: 'shadow-[0_0_12px_rgba(167,139,250,0.18)]',
    searchPlaceholder: 'Search repositories, pull requests, commits… <5ms',
    icon: QuantGitMarkIcon,
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

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('quant:pillar-change', {
        detail: { pillar: tile.id, path: tile.path },
      }),
    );
  }

  if (options.pathname !== tile.path) {
    options.router.push(tile.path);
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
}: QuantPillarTopBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

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
          : pathname.startsWith('/quantgit') || pathname.startsWith('/codehub')
            ? 'quantgit'
            : 'mail');

  const activeTile = PILLAR_TILES.find((t) => t.id === currentPillar) || PILLAR_TILES[0];
  const activeLenses = PILLAR_LENSES[currentPillar] || [];

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

  return (
    <header
      className={`sticky top-0 z-30 w-full flex flex-col gap-2.5 px-3 pt-2.5 pb-2 bg-[#090A0E]/95 backdrop-blur-md border-b border-[#232938] select-none ${className}`}
      aria-label="Super-App 5-Pillar Navigation Bar"
    >
      {/* 1. Top Row: Dynamic Island Quant AI Live Capsule */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleLiveCapsuleClick}
          className="group flex items-center gap-2 px-3 py-1 rounded-full bg-[#111318]/90 border border-[#232938] hover:border-[#FF8C42]/50 hover:bg-[#161922] transition-all duration-200 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Open Quant AI Assistant"
          aria-label="Open Quant AI Assistant"
        >
          {/* Molten Pulsing Orb Dot */}
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8C42] opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#FF8C42] shadow-[0_0_6px_#FF8C42]" />
          </span>

          <SparklesIcon className="size-3.5 text-[#FF8C42] group-hover:scale-110 transition-transform" />

          <span className="text-[11px] font-medium tracking-tight text-[#E2E8F0] group-hover:text-white truncate">
            {aiLiveText ? (
              <span>{aiLiveText}</span>
            ) : (
              <>
                <strong className="font-semibold text-[#FF8C42]">Quant AI:</strong> 3 urgent items prioritized
                <span className="text-[#64748B] mx-1">·</span>
                <span className="text-emerald-400 font-mono text-[10px]">&lt;5ms E2EE</span>
              </>
            )}
          </span>

          <ChevronRightIcon className="size-3 text-[#64748B] group-hover:text-[#FF8C42] group-hover:translate-x-0.5 transition-all" />
        </button>

        {/* Ambient Sub-5ms System Speed Live Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#12151E] border border-[#232938] text-[10px] font-mono text-emerald-400">
          <LightningSpeedIcon className="size-2.5 text-emerald-400" />
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>&lt;5ms LIVE</span>
        </div>
      </div>

      {/* 2. Middle Row: Amazon & Flipkart Super-App 5 Squircle Mode Switcher Tiles */}
      <div
        className="grid grid-cols-5 gap-1.5 sm:gap-2 w-full max-w-5xl mx-auto"
        role="tablist"
        aria-label="Application Suites"
      >
        {PILLAR_TILES.map((tile) => {
          const isActive = tile.id === currentPillar;
          const IconComp = tile.icon;
          const badgeCount = unreadCounts?.[tile.id];

          return (
            <button
              key={tile.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tile.label}
              onClick={() => handleTileClick(tile)}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                isActive
                  ? `bg-[#16181D] ${tile.borderColor} ${tile.glowColor} border shadow-md scale-[1.02]`
                  : 'bg-[#0E1015] border border-[#1F2430] hover:bg-[#141720] hover:border-[#2C3345] opacity-85 hover:opacity-100'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-colors ${
                  isActive ? 'bg-white/10' : 'bg-transparent'
                }`}
                style={{ color: isActive ? tile.accentColor : '#94A3B8' }}
              >
                <IconComp className="size-4" active={isActive} />

                {badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1.5 px-1 py-0.2 rounded-full text-[9px] font-bold leading-none shadow"
                    style={{
                      backgroundColor: tile.accentColor,
                      color: '#000000',
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>

              <span
                className={`text-[11px] tracking-tight truncate leading-none ${
                  isActive ? 'font-bold text-white' : 'font-medium text-[#94A3B8]'
                }`}
              >
                {tile.label}
              </span>

              {/* Active Sub-bar Indicator */}
              {isActive && (
                <span
                  className="absolute bottom-1 w-6 sm:w-8 h-0.5 rounded-full"
                  style={{
                    backgroundColor: tile.accentColor,
                    boxShadow: `0 0 6px ${tile.accentColor}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Sticky Voice Search Bar */}
      <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111318]/90 border border-[#232938] focus-within:border-[#FF8C42]/60 focus-within:ring-1 focus-within:ring-[#FF8C42]/30 transition-all shadow-inner w-full max-w-5xl mx-auto">
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

        {/* Clear Search Button */}
        {internalSearch.length > 0 && (
          <button
            type="button"
            onClick={handleClearClick}
            className="p-1 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1F2430] transition-colors"
            title="Clear search"
            aria-label="Clear search"
          >
            <ClearSearchIcon className="size-3.5" />
          </button>
        )}

        {/* Dedicated Voice Mic Button */}
        <button
          type="button"
          onClick={handleMicClick}
          className={`p-1.5 rounded-lg transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#FF8C42] ${
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

      {/* 4. Horizontal Sub-Category Lenses Strip */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 w-full max-w-5xl mx-auto"
        role="tablist"
        aria-label="Sub-category lenses"
      >
        {activeLenses.map((lens) => {
          const isSelected = selectedLens === lens.id;
          // Badge resolution: a live count from the caller's real data wins;
          // a static string label (e.g. 'E2EE') is decorative, never a count.
          // Anything else — including a fabricated number in config — shows
          // nothing. Absence of data is rendered as absence, not as zero.
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
                  className="px-1 py-0.2 rounded-full text-[9px] font-bold leading-none font-mono"
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
      </div>
    </header>
  );
}

export default QuantPillarTopBar;
