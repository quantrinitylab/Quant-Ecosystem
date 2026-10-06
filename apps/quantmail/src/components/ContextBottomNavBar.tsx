'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ProductivityPillar = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface ContextSubTab {
  id: string;
  label: string;
  icon: (props: { className?: string; active?: boolean }) => React.ReactNode;
  badgeCount?: number;
  badgeText?: string;
  targetPath?: string;
  queryParam?: { key: string; value: string };
  ariaLabel?: string;
  description?: string;
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

function PriorityRadarIcon({ className }: { className?: string; active?: boolean }) {
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
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function SwarmAgentIcon({ className }: { className?: string; active?: boolean }) {
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
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

// Calendar icons
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

function BookingLinkIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function QuantMeetVideoIcon({ className }: { className?: string; active?: boolean }) {
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function RemindersIcon({ className }: { className?: string; active?: boolean }) {
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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

function VipCrownIcon({ className }: { className?: string; active?: boolean }) {
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
      <polygon points="12 4 15 10 21 6 19 18 5 18 3 6 9 10 12 4" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
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

// ============================================================================
// 5 Sovereign Pillar Sub-Navigation Configs
// ============================================================================

export const PILLAR_SUB_CONFIGS: Record<ProductivityPillar, PillarContextConfig> = {
  mail: {
    pillar: 'mail',
    name: 'Mail',
    accentColor: '#FF8C42',
    activeContainerStyle: 'bg-[#FF8C42]/15 border-[#FF8C42]/40',
    activeTextStyle: 'text-[#FF8C42]',
    badgeStyle: 'bg-[#FF8C42] text-black',
    tabs: [
      {
        id: 'inbox',
        label: 'Inbox',
        icon: InboxIcon,
        badgeCount: 12,
        targetPath: '/',
        queryParam: { key: 'lens', value: 'all' },
      },
      {
        id: 'teams',
        label: 'Teams',
        icon: TeamsIcon,
        badgeCount: 3,
        description: 'Workspaces & Teams collaboration',
        targetPath: '/',
        queryParam: { key: 'tab', value: 'teams' },
      },
      {
        id: 'agents',
        label: 'Agents',
        icon: CopilotQuantyIcon,
        badgeText: 'AI',
        description: 'QuantGit Swarm Agent Access Panel',
        targetPath: '/',
        queryParam: { key: 'tab', value: 'agents' },
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: ArchiveIcon,
        targetPath: '/archive',
        queryParam: { key: 'tab', value: 'archive' },
      },
    ],
  },
  calendar: {
    pillar: 'calendar',
    name: 'Calendar',
    accentColor: '#F59E0B',
    activeContainerStyle: 'bg-[#F59E0B]/15 border-[#F59E0B]/40',
    activeTextStyle: 'text-[#F59E0B]',
    badgeStyle: 'bg-[#F59E0B] text-black',
    tabs: [
      {
        id: 'feed',
        label: 'Feed',
        icon: AgendaTimelineIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'feed' },
        description: 'Upcoming events, milestones & tracker dates',
      },
      {
        id: 'month',
        label: 'Month',
        icon: MonthGridIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'month' },
        description: 'Continuous scroll month calendar',
      },
      {
        id: 'week',
        label: 'Week',
        icon: WeekGridIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'week' },
        description: '7-day time grid with drag-to-create',
      },
      {
        id: 'events',
        label: 'Trackers',
        icon: CalendarEventsTrackerIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'events' },
        description: 'Trackers hub: Period, Health & Life trackers',
      },
      {
        id: 'schedule',
        label: 'Schedule',
        icon: ScheduleClockIcon,
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'schedule' },
        description: 'Meetings, Clock & Reminders',
      },
    ],
  },
  drive: {
    pillar: 'drive',
    name: 'Drive',
    accentColor: '#38BDF8',
    activeContainerStyle: 'bg-[#38BDF8]/15 border-[#38BDF8]/40',
    activeTextStyle: 'text-[#38BDF8]',
    badgeStyle: 'bg-[#38BDF8] text-black',
    tabs: [
      {
        id: 'home',
        label: 'Home',
        icon: FolderFilesIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'home' },
      },
      {
        id: 'feed',
        label: 'Feed',
        icon: DriveFeedIcon,
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'feed' },
      },
      {
        id: 'aimemory',
        label: 'AI Memory',
        icon: AiMemoryBrainIcon,
        badgeText: 'AI',
        ariaLabel: 'AI Memory (Cross-App Relational Vault)',
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'aimemory' },
      },
      {
        id: 'vault',
        label: 'Vault',
        icon: VaultLockIcon,
        badgeText: 'E2EE',
        ariaLabel: 'Vault (AES-256 E2EE)',
        targetPath: '/drive',
        queryParam: { key: 'tab', value: 'vault' },
      },
    ],
  },
  contacts: {
    pillar: 'contacts',
    name: 'Contacts',
    accentColor: '#10B981',
    activeContainerStyle: 'bg-[#10B981]/15 border-[#10B981]/40',
    activeTextStyle: 'text-[#10B981]',
    badgeStyle: 'bg-[#10B981] text-black',
    tabs: [
      {
        id: 'home',
        label: 'Home',
        ariaLabel: 'Home (All Contacts)',
        icon: ContactsDirectoryIcon,
        badgeCount: 8,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'home' },
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
        id: 'groups',
        label: 'Groups',
        ariaLabel: 'Groups (Add Folder / Add Group)',
        icon: CirclesNetworkIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'groups' },
      },
      {
        id: 'companies',
        label: 'Companies',
        icon: CompanyBuildingIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'companies' },
      },
      {
        id: 'dedup',
        label: 'AI Dedup',
        icon: DedupWandIcon,
        targetPath: '/contacts',
        queryParam: { key: 'tab', value: 'dedup' },
      },
    ],
  },
  quantgit: {
    pillar: 'quantgit',
    name: 'QuantGit',
    accentColor: '#A78BFA',
    activeContainerStyle: 'bg-[#A78BFA]/15 border-[#A78BFA]/40',
    activeTextStyle: 'text-[#A78BFA]',
    badgeStyle: 'bg-[#A78BFA] text-black',
    tabs: [
      {
        id: 'repos',
        label: 'Repos',
        icon: RepositoriesIcon,
        targetPath: '/quantgit',
        queryParam: { key: 'tab', value: 'repos' },
      },
      {
        id: 'prs',
        label: 'PRs',
        icon: PullRequestsIcon,
        badgeCount: 1,
        targetPath: '/quantgit',
        queryParam: { key: 'tab', value: 'prs' },
      },
      {
        id: 'issues',
        label: 'Issues',
        icon: IssuesIcon,
        targetPath: '/quantgit',
        queryParam: { key: 'tab', value: 'issues' },
      },
      {
        id: 'actions',
        label: 'Actions',
        icon: ActionsCiCdIcon,
        badgeText: 'CI/CD',
        ariaLabel: 'Actions (CI/CD)',
        targetPath: '/quantgit',
        queryParam: { key: 'tab', value: 'actions' },
      },
      {
        id: 'copilot',
        label: 'Copilot',
        icon: CopilotQuantyIcon,
        targetPath: '/quantgit',
        queryParam: { key: 'tab', value: 'copilot' },
      },
    ],
  },
};

export interface ContextBottomNavBarProps {
  className?: string;
  activePillarOverride?: ProductivityPillar;
  activeTabOverride?: string;
  onTabChange?: (tabId: string, pillar: ProductivityPillar) => void;
  badgeOverrides?: Record<string, number>;
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
    if (pathname.startsWith('/archive') || tabParam === 'archive') return 'archive';
    if (tabParam === 'agents' || lensParam === 'agents') return 'agents';
    if (tabParam === 'teams' || lensParam === 'teams') return 'teams';
    if (lensParam === 'important' || tabParam === 'priority') return 'priority';
    return 'inbox';
  }

  if (pillar === 'calendar') {
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
    return 'feed';
  }

  if (pillar === 'drive') {
    if (tabParam === 'feed') return 'feed';
    if (tabParam === 'aimemory' || tabParam === 'memory') return 'aimemory';
    if (tabParam === 'vault') return 'vault';
    if (tabParam === 'home' || tabParam === 'files') return 'home';
    return 'home';
  }

  if (pillar === 'contacts') {
    if (tabParam === 'favorites' || tabParam === 'vips' || activeTabOverride === 'favorites') return 'favorites';
    if (tabParam === 'groups' || tabParam === 'circles' || activeTabOverride === 'groups') return 'groups';
    if (tabParam === 'companies' || activeTabOverride === 'companies') return 'companies';
    if (tabParam === 'dedup' || activeTabOverride === 'dedup') return 'dedup';
    return 'home';
  }

  if (pillar === 'quantgit') {
    if (tabParam === 'prs') return 'prs';
    if (tabParam === 'issues') return 'issues';
    if (tabParam === 'actions') return 'actions';
    if (tabParam === 'copilot') return 'copilot';
    return 'repos';
  }

  return 'default';
}

export function executeContextTabClick(
  tab: ContextSubTab,
  pillar: ProductivityPillar,
  options: {
    pathname: string;
    router: { push: (path: string) => void };
    onTabChange?: (tabId: string, pillar: ProductivityPillar) => void;
  },
) {
  if (
    (tab.id === 'copilot' && pillar === 'quantgit') ||
    (tab.id === 'agents' && pillar === 'mail')
  ) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('quant:copilot:open'));
      window.dispatchEvent(new CustomEvent('quant:agents:open'));
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
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

  if (options.pathname !== targetBase || tab.queryParam) {
    options.router.push(targetUrl);
  }
}

export function ContextBottomNavBar({
  className = '',
  activePillarOverride,
  activeTabOverride,
  onTabChange,
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
              pathname.startsWith('/codehub') ||
              pathname.startsWith('/repos') ||
              pathname.startsWith('/pipelines')
            ? 'quantgit'
            : 'mail'
  );

  const pillarConfig = PILLAR_SUB_CONFIGS[pillar];

  // Auto-hide on scroll down, slide up on scroll up
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = (e?: Event) => {
      const target = e?.target as HTMLElement | Document | null;
      let currentY = window.scrollY;
      if (target && 'scrollTop' in target && typeof target.scrollTop === 'number') {
        currentY = target.scrollTop;
      }

      // Do not hide when near top
      if (currentY < 40) {
        setIsVisible(true);
        lastScrollYRef.current = currentY;
        return;
      }

      const diff = currentY - lastScrollYRef.current;
      if (diff > 12) {
        setIsVisible(false);
      } else if (diff < -12) {
        setIsVisible(true);
      }
      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

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
    setActiveTabState(tab.id);
    executeContextTabClick(tab, pillar, {
      pathname,
      router,
      onTabChange,
    });
  };

  return (
    <nav
      className={`fixed bottom-16 md:bottom-0 left-0 right-0 md:left-[68px] z-30 flex h-14 items-center justify-around border-t border-[#1F2430] bg-[#090A0E]/95 backdrop-blur-md px-2 pb-[env(safe-area-inset-bottom,0px)] shadow-2xl transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
        isVisible ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
      } ${className}`}
      aria-label={`${pillarConfig.name} contextual navigation`}
    >
      {pillarConfig.tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const IconComponent = tab.icon;
        const currentBadgeCount = badgeOverrides?.[tab.id] ?? tab.badgeCount;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab)}
            className={`group relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-xl transition-all duration-200 select-none ${
              isActive
                ? `${pillarConfig.activeContainerStyle} ${pillarConfig.activeTextStyle} font-bold border shadow-sm`
                : 'text-[#94A3B8] hover:text-[#F1F5F9] border border-transparent hover:bg-[#161922]/50 font-medium'
            }`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={
              tab.ariaLabel ||
              `${tab.label}${currentBadgeCount ? ` (${currentBadgeCount} unread)` : ''}${
                tab.badgeText ? ` (${tab.badgeText})` : ''
              }`
            }
          >
            {/* Tab Icon with badge indicator */}
            <div className="relative flex items-center justify-center">
              <IconComponent
                className={`size-4 transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'group-hover:scale-105'
                }`}
                active={isActive}
              />

              {/* Number Badge */}
              {currentBadgeCount !== undefined && currentBadgeCount > 0 && (
                <span
                  className={`absolute -top-1.5 -right-3.5 flex min-w-[15px] h-[15px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none shadow-sm transition-colors ${
                    isActive
                      ? pillarConfig.badgeStyle
                      : 'bg-[#282C35] text-[#E2E8F0] border border-[#3A404D]'
                  }`}
                >
                  {currentBadgeCount > 99 ? '99+' : currentBadgeCount}
                </span>
              )}

              {/* Text Badge (e.g. E2EE, CDC, CI/CD) */}
              {tab.badgeText && (
                <span
                  className={`absolute -top-1.5 -right-4 flex h-[13px] items-center justify-center rounded px-1 text-[7px] font-extrabold uppercase tracking-tight leading-none shadow-sm border transition-colors ${
                    isActive
                      ? `${pillarConfig.activeContainerStyle} ${pillarConfig.activeTextStyle}`
                      : 'bg-[#161922] text-[#94A3B8] border-[#232938]'
                  }`}
                >
                  {tab.badgeText}
                </span>
              )}
            </div>

            {/* Tab Label */}
            <span className="text-[10px] tracking-tight leading-tight truncate max-w-full">
              {tab.label}
            </span>

            {/* Active Pill Indicator Dot */}
            {isActive && (
              <span
                className="absolute bottom-0.5 w-1 h-1 rounded-full"
                style={{ backgroundColor: pillarConfig.accentColor }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default ContextBottomNavBar;
