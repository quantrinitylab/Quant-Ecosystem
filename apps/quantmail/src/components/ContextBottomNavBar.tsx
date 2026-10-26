'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Quanty } from './Quanty';
import { LiquidTrack } from './workplace/LiquidTrack';
import { triggerHapticTap } from './QuantPillarTopBar';
// QM-UIUX-037: single accent-color source of truth (mobile values canonical).
// NOTE: Tailwind arbitrary-value classes below MUST stay literal strings so
// the JIT compiler can detect them — do not interpolate PILLAR_ACCENTS here.
import { PILLAR_ACCENTS } from './pillar-accents';

// ============================================================================
// QuantMail — Contextual Bottom Navigation (mobile)
// ============================================================================
//
// REVERSED PR #531 per explicit user decision (2026-10-07): the mobile bottom
// bar is the CONTEXTUAL per-app tab bar again. The 5-app switcher lives exactly
// ONCE at the top (<QuantPillarTopBar />); the bottom duplicate
// (<MobilePillarBottomNav />) was removed. The top strip (<MobileSubTabStrip />)
// was removed as redundant.
//
// Tab sets below are the user-approved structure (2026-10-09):
//   Mail: Inbox (/), Sent (/sent), Archive (/archive)
//   Calendar: Day, Week, Month (?tab=day|week|month — real view modes)
//   Drive: My Drive, Recent, Starred (?tab=home|recent|starred)
//   Contacts: All, Favorites (?tab=all|favorites)
//   QuantGit: Repositories (/quantgit/repositories), Overview (/quantgit)
//
// Every tab navigates to a REAL existing view — no fake tabs. The active tab
// carries the same swoosh/glow language as the top switcher (accent-colored),
// and the tab set cross-fades in sync with the switcher's swoosh slide so the
// bottom bar feels CONNECTED to the active app.
//
// Badges: REAL counts only, wired via the `badgeOverrides` prop from AppShell.
// Never hardcode badge numbers in this file.
//
// Strictly ZERO raw Unicode emojis. Strictly ZERO generic glyphs.
// ============================================================================

export type ProductivityPillar = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface ContextSubTab {
  id: string;
  label: string;
  icon: (props: { className?: string; active?: boolean }) => React.ReactNode;
  /** Logo-only tab (Quanty AI): renders the Quanty mark with no text label. */
  logoOnly?: boolean;
  /** When true, tapping opens the Quanty AI cockpit instead of navigating. */
  opensQuanty?: boolean;
  badgeCount?: number;
  badgeText?: string;
  targetPath?: string;
  queryParam?: { key: string; value: string };
  ariaLabel?: string;
  description?: string;
  /**
   * Quant Workplace bottom bar: the tab stays in the config (and in the
   * drawer + desktop nav) but is not one of the bar's primary slots. It joins
   * the bar only while it is the active view, so the bar never lies about
   * where the user is.
   */
  mobileOverflow?: boolean;
}

export interface PillarContextConfig {
  pillar: ProductivityPillar;
  name: string;
  accentColor: string;
  activeContainerStyle: string;
  activeTextStyle: string;
  badgeStyle: string;
  tabs: ContextSubTab[];
}

// ============================================================================
// SVG Vector Icons — strictly ZERO raw Unicode emojis
// ============================================================================

function InboxIcon({ className }: { className?: string; active?: boolean }) {
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
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function SentIcon({ className }: { className?: string; active?: boolean }) {
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
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string; active?: boolean }) {
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
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

// SIA-P1-5: folder icons matching the drawer glyph set, same 1.8 stroke.
function DraftsIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

// QM-SCHEDULED: clock glyph for the Scheduled folder.
function ScheduledIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 13.5" />
    </svg>
  );
}

function SpamIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M12 2 2 12l10 10 10-10L12 2z" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

// Calendar icons

function MonthGridIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

function WeekGridIcon({ className }: { className?: string; active?: boolean }) {
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
      <line x1="9" y1="4" x2="9" y2="22" />
      <line x1="15" y1="4" x2="15" y2="22" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function DayAgendaIcon({ className }: { className?: string; active?: boolean }) {
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
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function RecentClockIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function OverviewGridIcon({ className }: { className?: string; active?: boolean }) {
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
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

// Drive icons
function FolderFilesIcon({ className }: { className?: string; active?: boolean }) {
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

function StarredIcon({ className }: { className?: string; active?: boolean }) {
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
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// Contacts icons
function ContactsDirectoryIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M16 2v2M8 2v2" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <circle cx="12" cy="11" r="3" />
      <path d="M6 18c0-2 2.5-3 6-3s6 1 6 3" />
    </svg>
  );
}

// QuantGit icons
function RepositoriesIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h7" />
    </svg>
  );
}

function PullRequestsIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IssuesIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ActionsCiCdIcon({ className }: { className?: string; active?: boolean }) {
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
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function CopilotQuantyIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4Z" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <line x1="10" y1="17" x2="14" y2="17" />
    </svg>
  );
}

// Fallback icon for the logo-only Quanty tab. The render path draws the real
// Quanty ghost mark instead (tab.logoOnly), so this never paints — it only
// satisfies the required `icon` field with an honest AI-spark glyph.
function QuantyTabIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  );
}

// RESTORED 2026-10-19: these five icon components were removed by PR #1394 as
// "unused", but PR #1392 (merged between #1394's gate run and its merge)
// added references to them in the mobileOverflow tab configs below. Restoring
// them verbatim so the bottom-nav typechecks again.

function AgendaTimelineIcon({ className }: { className?: string; active?: boolean }) {
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
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function CalendarEventsTrackerIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M4.5 12h3l2-5 4 10 2-5h4" />
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="8" y1="2" x2="8" y2="4" />
      <line x1="16" y1="2" x2="16" y2="4" />
    </svg>
  );
}

function ScheduleClockIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 16 14" />
      <path d="M19 19l2 2" />
    </svg>
  );
}

function DriveFeedIcon({ className }: { className?: string; active?: boolean }) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
      <path d="m14 14 3-3 4 4" />
    </svg>
  );
}

function AiMemoryBrainIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M12 2a4.5 4.5 0 0 0-4.5 4.5c0 .77.2 1.5.54 2.14A5.5 5.5 0 0 0 4 14a5.5 5.5 0 0 0 4.5 5.41v1.59a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-1.59A5.5 5.5 0 0 0 20 14a5.5 5.5 0 0 0-4.04-5.36c.34-.64.54-1.37.54-2.14A4.5 4.5 0 0 0 12 2Z" />
      <path d="M12 7v5" />
      <path d="M9.5 12h5" />
      <path d="M9 16h6" />
    </svg>
  );
}

function SharedFolderIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function VaultLockIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" />
      <path d="M12 12.5v2.5" />
    </svg>
  );
}

function FastCdcCleanerIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function CirclesNetworkIcon({ className }: { className?: string; active?: boolean }) {
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
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
      <circle cx="19" cy="8" r="1.5" fill="currentColor" />
      <circle cx="5" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CompanyBuildingIcon({ className }: { className?: string; active?: boolean }) {
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
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="6" x2="9.01" y2="6" strokeWidth="2.5" />
      <line x1="15" y1="6" x2="15.01" y2="6" strokeWidth="2.5" />
      <line x1="9" y1="10" x2="9.01" y2="10" strokeWidth="2.5" />
      <line x1="15" y1="10" x2="15.01" y2="10" strokeWidth="2.5" />
      <line x1="9" y1="14" x2="9.01" y2="14" strokeWidth="2.5" />
      <line x1="15" y1="14" x2="15.01" y2="14" strokeWidth="2.5" />
      <path d="M10 22v-4h4v4" />
    </svg>
  );
}

function DedupWandIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="m15 4 5 5-11 11H4v-5l11-11Z" />
      <line x1="18.5" y1="7.5" x2="14.5" y2="3.5" />
      <path d="M9 3v2M12 5V3M3 12h2M5 9H3" />
    </svg>
  );
}

// ============================================================================
// 5 Sovereign Pillar Sub-Navigation Configs
// ============================================================================

export const PILLAR_SUB_CONFIGS: Record<ProductivityPillar, PillarContextConfig> = {
  mail: {
    pillar: 'mail',
    name: 'Mail',
    accentColor: PILLAR_ACCENTS.mail,
    activeContainerStyle: 'bg-[#FF6B35]/15 border-[#FF6B35]/40',
    activeTextStyle: 'text-[#FF6B35]',
    badgeStyle: 'bg-[#FF6B35] text-black',
    tabs: [
      {
        id: 'inbox',
        label: 'Inbox',
        icon: InboxIcon,
        targetPath: '/',
      },
      {
        // QM-MOBILE-QUANTY-TAB (competitor-gap 2026-10-12): Gmail's 2026
        // mobile bar gives its AI inbox a first-class tab; the logoOnly
        // Quanty slot in this file had an interface + render path but no
        // pillar config used it, so mobile had zero one-tap Quanty access.
        // This wires the slot: the Quanty ghost mark renders alone (no
        // text), and tapping opens the Quanty cockpit via `onQuantyOpen` —
        // it never navigates (same `opensQuanty` pattern as the desktop
        // quantgit tab in desktopContextTabs.tsx).
        id: 'quanty',
        label: 'Quanty',
        ariaLabel: 'Open Quanty AI',
        icon: QuantyTabIcon,
        logoOnly: true,
        opensQuanty: true,
      },
      {
        // QM-UIUX-082: Sent was missing from the mobile Mail tabs (only
        // Inbox/Archive), mirroring the desktop left nav. `/sent` is the
        // real page backed by `GET /emails?folderType=SENT` (`isSent`);
        // `resolveActiveTab` already mapped `/sent` → 'sent' and
        // `SentIcon` was defined but never used.
        id: 'sent',
        label: 'Sent',
        icon: SentIcon,
        targetPath: '/sent',
      },
      {
        // QM-SCHEDULED: `/scheduled` is the real page backed by
        // `GET /emails?folderType=SCHEDULED` — queued future sends with
        // per-row cancel/edit.
        id: 'scheduled',
        mobileOverflow: true,
        label: 'Scheduled',
        icon: ScheduledIcon,
        targetPath: '/scheduled',
      },
      {
        // SIA-P1-5: one folder list everywhere — Inbox, Sent, Drafts,
        // Archive, Spam, Trash — matching the drawer and desktop nav.
        id: 'drafts',
        label: 'Drafts',
        icon: DraftsIcon,
        targetPath: '/drafts',
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: ArchiveIcon,
        targetPath: '/archive',
      },
      {
        id: 'spam',
        mobileOverflow: true,
        label: 'Spam',
        icon: SpamIcon,
        targetPath: '/',
        queryParam: { key: 'lens', value: 'spam' },
      },
      {
        // QM-IMPORTANT-LENS-ACTIVE-TAB: `/?lens=important` is a real inbox
        // view (page.tsx `important` lens, high-priority/starred mail), but
        // `resolveActiveTab` mapped it to phantom id 'priority' — no mail
        // tab had that id, so the bar highlighted the wrong slot (index-0
        // fallback) while the desktop sidebar highlighted nothing. This
        // overflow slot mirrors the Spam lens tab: it joins the bar only
        // while Important is the active view, and StarredIcon is the
        // existing star mark (Important = high-priority or starred mail).
        id: 'important',
        mobileOverflow: true,
        label: 'Important',
        icon: StarredIcon,
        targetPath: '/',
        queryParam: { key: 'lens', value: 'important' },
      },
      {
        id: 'trash',
        mobileOverflow: true,
        label: 'Trash',
        icon: TrashIcon,
        targetPath: '/trash',
      },
    ],
  },
  calendar: {
    pillar: 'calendar',
    name: 'Calendar',
    accentColor: PILLAR_ACCENTS.calendar,
    activeContainerStyle: 'bg-[#4285F4]/15 border-[#4285F4]/40',
    activeTextStyle: 'text-[#4285F4]',
    badgeStyle: 'bg-[#4285F4] text-black',
    tabs: [
      {
        id: 'day',
        label: 'Day',
        icon: DayAgendaIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'day' },
        description: 'Single-day agenda view',
      },
      {
        id: 'week',
        label: 'Week',
        icon: WeekGridIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'week' },
        description: '7-day time grid',
      },
      {
        id: 'month',
        label: 'Month',
        icon: MonthGridIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'month' },
        description: 'Month calendar',
      },
      {
        // QM-BOTTOM-NAV-SUBVIEWS (2026-10-19): /calendar's real subviews
        // (?tab=feed|events|schedule — backed by isValidContextTab in
        // calendar/page.tsx and resolveActiveTab below) had IDs but no
        // bottom-nav entry, so zero aria-current while the user was in them.
        // These mobileOverflow tabs join the bar only while active (same
        // pattern as the mail Scheduled/Spam/Trash overflow tabs), so the
        // bar never lies about where the user is. Labels/icons mirror the
        // desktop calendar config in desktopContextTabs.tsx.
        id: 'feed',
        label: 'Feed',
        icon: AgendaTimelineIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'feed' },
        description: 'Upcoming events, milestones & tracker dates',
        mobileOverflow: true,
      },
      {
        id: 'events',
        label: 'Trackers',
        icon: CalendarEventsTrackerIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'events' },
        description: 'Trackers hub: Period, Health & Life trackers',
        mobileOverflow: true,
      },
      {
        id: 'schedule',
        label: 'Schedule',
        icon: ScheduleClockIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'schedule' },
        description: 'Meetings, Clock & Reminders',
        mobileOverflow: true,
      },
    ],
  },
  drive: {
    pillar: 'drive',
    name: 'Drive',
    accentColor: PILLAR_ACCENTS.drive,
    activeContainerStyle: 'bg-[#34A853]/15 border-[#34A853]/40',
    activeTextStyle: 'text-[#34A853]',
    badgeStyle: 'bg-[#34A853] text-black',
    tabs: [
      {
        id: 'home',
        label: 'My Drive',
        icon: FolderFilesIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'home' },
      },
      {
        id: 'recent',
        label: 'Recent',
        icon: RecentClockIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'recent' },
      },
      {
        id: 'starred',
        label: 'Starred',
        icon: StarredIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'starred' },
      },
      {
        // QM-BOTTOM-NAV-SUBVIEWS (2026-10-19): /drive's real subviews
        // (?tab=feed|aimemory|vault|shared|cleaner — normalizeTab in
        // drive/page.tsx) had resolveActiveTab IDs but no bottom-nav entry,
        // so zero aria-current while the user was in them. mobileOverflow
        // tabs join the bar only while active. Labels/icons mirror the
        // desktop drive config in desktopContextTabs.tsx (vault: no
        // encryption badge — none is implemented, see that file's note).
        id: 'feed',
        label: 'Feed',
        icon: DriveFeedIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'feed' },
        mobileOverflow: true,
      },
      {
        id: 'aimemory',
        label: 'AI Memory',
        icon: AiMemoryBrainIcon,
        badgeText: 'AI',
        ariaLabel: 'AI Memory (Cross-App Relational Vault)',
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'aimemory' },
        mobileOverflow: true,
      },
      {
        id: 'vault',
        label: 'Vault',
        icon: VaultLockIcon,
        ariaLabel: 'Vault',
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'vault' },
        mobileOverflow: true,
      },
      {
        id: 'shared',
        label: 'Shared',
        icon: SharedFolderIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'shared' },
        mobileOverflow: true,
      },
      {
        id: 'cleaner',
        label: 'Cleaner',
        icon: FastCdcCleanerIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'cleaner' },
        mobileOverflow: true,
      },
    ],
  },
  contacts: {
    pillar: 'contacts',
    name: 'Contacts',
    accentColor: PILLAR_ACCENTS.contacts,
    activeContainerStyle: 'bg-[#F59E0B]/15 border-[#F59E0B]/40',
    activeTextStyle: 'text-[#F59E0B]',
    badgeStyle: 'bg-[#F59E0B] text-black',
    tabs: [
      {
        id: 'all',
        label: 'All',
        ariaLabel: 'All contacts',
        icon: ContactsDirectoryIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'all' },
      },
      {
        id: 'favorites',
        label: 'Favorites',
        ariaLabel: 'Favorites (Starred Contacts)',
        icon: StarredIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'favorites' },
      },
      {
        // QM-BOTTOM-NAV-SUBVIEWS (2026-10-19): /contacts' real subviews
        // (?tab=groups|companies|dedup — SUBVIEW_TABS in contacts/page.tsx)
        // had resolveActiveTab IDs but no bottom-nav entry, so zero
        // aria-current while the user was in them. mobileOverflow tabs join
        // the bar only while active. Labels/icons mirror the desktop
        // contacts config in desktopContextTabs.tsx.
        id: 'groups',
        label: 'Groups',
        ariaLabel: 'Groups (New Group)',
        icon: CirclesNetworkIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'groups' },
        mobileOverflow: true,
      },
      {
        id: 'companies',
        label: 'Companies',
        icon: CompanyBuildingIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'companies' },
        mobileOverflow: true,
      },
      {
        id: 'dedup',
        label: 'Dedup',
        icon: DedupWandIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'dedup' },
        mobileOverflow: true,
      },
    ],
  },
  quantgit: {
    pillar: 'quantgit',
    name: 'QuantGit',
    accentColor: PILLAR_ACCENTS.quantgit,
    activeContainerStyle: 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40',
    activeTextStyle: 'text-[#8B5CF6]',
    badgeStyle: 'bg-[#8B5CF6] text-black',
    // User-approved 2026-10-09: Repositories + Overview only. Every tab maps
    // to a real existing route — no fake tabs.
    tabs: [
      {
        id: 'repositories',
        label: 'Repositories',
        icon: RepositoriesIcon,
        targetPath: '/quantgit/repositories',
        description: 'All repositories',
      },
      {
        id: 'overview',
        label: 'Overview',
        icon: OverviewGridIcon,
        targetPath: '/quantgit',
        description: 'QuantGit overview',
      },
    ],
  },
};

export interface ContextBottomNavBarProps {
  className?: string;
  activePillarOverride?: ProductivityPillar;
  activeTabOverride?: string;
  onTabChange?: (tabId: string, pillar: ProductivityPillar) => void;
  /** Opens the Quanty AI cockpit (AppShell's live-agent surface). */
  onQuantyOpen?: () => void;
  /** Real badge counts keyed by tab id. Missing/zero/undefined = no badge. */
  badgeOverrides?: Record<string, number | undefined>;
}

export function resolveActiveTab(
  pillar: ProductivityPillar,
  pathname: string,
  searchParams?: { get: (k: string) => string | null } | null,
  activeTabOverride?: string,
  activeTabState?: string | null,
): string {
  if (activeTabOverride) return activeTabOverride;
  if (activeTabState) return activeTabState;

  const tabParam = searchParams?.get('tab');
  const lensParam = searchParams?.get('lens');

  if (pillar === 'mail') {
    if (pathname.startsWith('/sent') || tabParam === 'sent') return 'sent';
    if (pathname.startsWith('/scheduled')) return 'scheduled';
    if (pathname.startsWith('/archive') || tabParam === 'archive') return 'archive';
    if (pathname.startsWith('/drafts') || tabParam === 'drafts') return 'drafts';
    if (pathname.startsWith('/trash') || tabParam === 'trash') return 'trash';
    if (lensParam === 'spam') return 'spam';
    // QM-IMPORTANT-LENS-ACTIVE-TAB: 'priority' was a phantom id — no mail
    // tab carried it, so the resolvers returned an unhighlightable tab.
    // The Important lens now has its own 'important' tab (above); the
    // legacy ?tab=priority alias collapses onto it instead of stranding
    // the nav with no active tab.
    if (lensParam === 'important' || tabParam === 'priority') return 'important';
    return 'inbox';
  }

  if (pillar === 'calendar') {
    if (tabParam === 'day') return 'day';
    if (tabParam === 'month') return 'month';
    if (tabParam === 'week') return 'week';
    if (tabParam === 'events') return 'events';
    if (
      tabParam === 'schedule' ||
      tabParam === 'reminders' ||
      tabParam === 'booking' ||
      tabParam === 'quantmeet'
    ) {
      return 'schedule';
    }
    if (tabParam === 'feed' || tabParam === 'agenda') return 'feed';
    // Bare /calendar opens the Day view (calendar-route.ts).
    return 'day';
  }

  if (pillar === 'drive') {
    if (tabParam === 'recent') return 'recent';
    if (tabParam === 'starred') return 'starred';
    if (tabParam === 'feed') return 'feed';
    if (tabParam === 'aimemory' || tabParam === 'memory') return 'aimemory';
    if (tabParam === 'vault') return 'vault';
    if (tabParam === 'shared') return 'shared';
    if (tabParam === 'cleaner') return 'cleaner';
    if (tabParam === 'home' || tabParam === 'files') return 'home';
    return 'home';
  }

  if (pillar === 'contacts') {
    if (tabParam === 'favorites' || tabParam === 'vips' || activeTabOverride === 'favorites') return 'favorites';
    if (tabParam === 'groups' || tabParam === 'circles' || activeTabOverride === 'groups') return 'groups';
    if (tabParam === 'companies' || activeTabOverride === 'companies') return 'companies';
    if (tabParam === 'dedup' || activeTabOverride === 'dedup') return 'dedup';
    return 'all';
  }

  if (pillar === 'quantgit') {
    // Path-based (user-approved 2026-10-09): /quantgit/repositories vs /quantgit.
    if (pathname.startsWith('/quantgit/repositories')) return 'repositories';
    return 'overview';
  }

  return 'default';
}

export function executeContextTabClick(
  tab: ContextSubTab,
  pillar: ProductivityPillar,
  options: {
    pathname: string;
    /** Current query string WITH the leading `?` (e.g. `?lens=spam`), or ''/omitted when unknown. */
    search?: string;
    router: { push: (path: string) => void };
    onTabChange?: (tabId: string, pillar: ProductivityPillar) => void;
    /** Opens the Quanty AI cockpit (AppShell's live-agent surface). */
    onQuantyOpen?: () => void;
  },
) {
  const canWindow = typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';

  // Haptic on every tab tap (#541 behavior, preserved from the pillar nav).
  triggerHapticTap(10);

  // Quanty AI tab (logo-only): opens the Quanty cockpit, never navigates.
  // Mirrors desktopContextTabs.executeContextTabClick's `opensQuanty` arm.
  if (tab.opensQuanty) {
    options.onQuantyOpen?.();
    if (canWindow) {
      window.dispatchEvent(new CustomEvent('quant:quanty:open'));
      window.dispatchEvent(new CustomEvent('quant:copilot:open'));
    }
    return;
  }

  // Quanty AI logo tab: open the autonomous developer cockpit. The quantgit
  // page opens its copilot view on `quant:copilot:open`; navigating with
  // ?tab=copilot covers the not-yet-on-quantgit case via initialSubTab.
  if (tab.id === 'quanty' && pillar === 'quantgit') {
    if (canWindow) {
      window.dispatchEvent(new CustomEvent('quant:copilot:open'));
      window.dispatchEvent(new CustomEvent('quant:quanty:open'));
    }
  }

  if (canWindow) {
    window.dispatchEvent(
      new CustomEvent('quant:subtab-change', {
        detail: { pillar, tabId: tab.id, queryParam: tab.queryParam },
      }),
    );
  }

  options.onTabChange?.(tab.id, pillar);

  const targetBase = tab.targetPath || (pillar === 'mail' ? '/' : `/${pillar}`);
  let targetUrl = targetBase;
  if (tab.queryParam) {
    const sep = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${sep}${tab.queryParam.key}=${tab.queryParam.value}`;
  }

  // QM-DEAD-INBOX-TAB-SPAM-LENS (2026-10-16): compare the FULL current URL
  // (path + query) against the target URL, not just the pathname.
  // `usePathname()` strips the query, so on `/?lens=spam` a queryParam-less
  // tab like Inbox compared pathname ('/') === targetBase ('/') and skipped
  // navigation — the bar stayed on the spam view and lied about the active
  // view. With the search string, Inbox's target '/' differs from
  // '/?lens=spam', so it pushes; re-tapping the actually-active tab still
  // reaches the scroll-to-top + refresh branch.
  const currentUrl = options.pathname + (options.search ?? '');
  if (currentUrl !== targetUrl) {
    options.router.push(targetUrl);
  } else {
    // Re-tap on the ACTIVE sub-tab (Instagram-style): smooth-scroll to top,
    // haptic already fired above, then refresh current view content.
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* older webviews — ignore */
    }
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
    if (canWindow) {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
    }
  }
}

export function ContextBottomNavBar({
  className = '',
  activePillarOverride,
  activeTabOverride,
  onTabChange,
  onQuantyOpen,
  badgeOverrides,
}: ContextBottomNavBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  // Determine active pillar
  const pillar: ProductivityPillar = activePillarOverride ?? (
    pathname.startsWith('/calendar')
      ? 'calendar'
      : pathname.startsWith('/drive')
        ? 'drive'
        : pathname.startsWith('/contacts')
          ? 'contacts'
          : pathname.startsWith('/quantgit') ||
              pathname.startsWith('/pipelines')
            ? 'quantgit'
            : 'mail'
  );

  const pillarConfig = PILLAR_SUB_CONFIGS[pillar];

  // Listen for external tab synchronization events
  const [activeTabState, setActiveTabState] = useState<string | null>(null);

  useEffect(() => {
    const handleSubtabSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ pillar?: string; tabId?: string }>;
      if (customEvent.detail?.tabId && customEvent.detail?.pillar === pillar) {
        setActiveTabState(customEvent.detail.tabId);
      }
    };
    window.addEventListener('quant:subtab-change', handleSubtabSync);
    return () => window.removeEventListener('quant:subtab-change', handleSubtabSync);
  }, [pillar]);

  // Compute active tab ID
  const computeActiveTab = useCallback((): string => {
    return resolveActiveTab(
      pillar,
      pathname,
      searchParams,
      activeTabOverride,
      activeTabState,
    );
  }, [activeTabOverride, activeTabState, searchParams, pillar, pathname]);

  const activeTabId = computeActiveTab();

  // Hide on deep thread chat views or individual compose screens
  if (pathname.startsWith('/thread') || pathname.startsWith('/compose')) {
    return null;
  }

  const handleTabClick = (tab: ContextSubTab) => {
    // The Quanty tab opens a cockpit overlay, not a view: it must not steal
    // the active slot, so the bar keeps telling the truth about where the
    // user is while the drawer is open.
    if (!tab.opensQuanty) setActiveTabState(tab.id);
    executeContextTabClick(tab, pillar, {
      pathname,
      search: searchParams?.toString() ? `?${searchParams.toString()}` : undefined,
      router,
      onTabChange,
      onQuantyOpen,
    });
  };

  // Quant Workplace bar: the primary slots, plus the active overflow view
  // (Scheduled / Spam / Trash) while the user is on it.
  const primaryTabs = pillarConfig.tabs.filter((t) => !t.mobileOverflow);
  const activeOverflow = pillarConfig.tabs.find((t) => t.mobileOverflow && t.id === activeTabId);
  const visibleTabs = activeOverflow ? [...primaryTabs, activeOverflow] : primaryTabs;
  // A view with no slot of its own (a custom folder lens, say) lives
  // under the first tab, so the raised tab still says where the user is.
  const foundIndex = visibleTabs.findIndex((t) => t.id === activeTabId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;

  return (
    <div
      className={`md:hidden flex-none ${className}`}
    >
      <nav
        key={pillar}
        className="h-full px-3 pt-2 pb-[env(safe-area-inset-bottom,0px)] bg-transparent"
        aria-label={`${pillarConfig.name} contextual navigation`}
        data-testid="context-bottom-nav"
      >
        <div
          className="qw-bar qw-bar-h mb-1.5"
          style={{ height: 60, ['--lq-accent' as string]: pillarConfig.accentColor }}
        >
          <LiquidTrack
            orient="h"
            count={visibleTabs.length}
            index={activeIndex}
            thickness={60}
            radius={22}
            lift={6}
            pad={6}
            top={0.34}
            flare={0.26}
            flareMax={24}
            testId="context-bottom-nav-liquid"
          />
          <div className="qw-segs qw-tabs-in">
            {visibleTabs.map((tab, idx) => {
              const isActive = idx === activeIndex;
              const IconComponent = tab.icon;
              const currentBadgeCount = badgeOverrides?.[tab.id];

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  data-testid={`context-tab-${tab.id}`}
                  className="qw-tab select-none"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={
                    tab.ariaLabel ||
                    `${tab.label}${
                      currentBadgeCount ? `, ${currentBadgeCount} unread` : ''
                    }`
                  }
                >
                  <span className="qw-tab-ic relative">
                    {tab.logoOnly ? (
                      <Quanty size={26} expression="idle" bob={false} />
                    ) : (
                      <IconComponent className="size-[22px]" active={isActive} />
                    )}

                    {/* Number Badge */}
                    {currentBadgeCount !== undefined && currentBadgeCount > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-3.5 flex min-w-[16px] h-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none shadow-sm ${
                          isActive
                            ? pillarConfig.badgeStyle
                            : 'bg-[var(--quant-surface-elevated)] text-[#E2E8F0] border border-[#3A404D]'
                        }`}
                      >
                        {currentBadgeCount > 99 ? '99+' : currentBadgeCount}
                      </span>
                    )}

                    {/* Text Badge (e.g. E2EE, CDC, CI/CD) */}
                    {tab.badgeText && (
                      <span className="absolute -top-1.5 -right-4 flex h-[13px] items-center justify-center rounded px-1 text-[10px] font-extrabold uppercase tracking-tight leading-none border bg-[var(--quant-surface)] text-[#94A3B8] border-[#232938]">
                        {tab.badgeText}
                      </span>
                    )}
                  </span>

                  {/* Tab Label (logo-only tabs show the mark alone, no text) */}
                  {!tab.logoOnly && <span className="qw-tab-label">{tab.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default ContextBottomNavBar;
