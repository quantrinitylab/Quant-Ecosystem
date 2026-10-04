'use client';

// ============================================================================
// QuantMail — Amazon/Flipkart-Class Super-App Command Header
// Pure SVG Vector Engine — Strictly 100% ZERO raw Unicode emojis.
// Obsidian/Slate Palette: #090A0E, #12151E, #1E222A.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { quantSymbolDark } from '@quant/brand';

// ============================================================================
// Types & Contracts
// ============================================================================

export type SuperAppPillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface SuperAppPillar {
  id: SuperAppPillarId;
  label: string;
  path: string;
  badge?: string | number;
  badgeTone?: 'primary' | 'amber' | 'cyan' | 'emerald' | 'purple' | 'slate';
  accentColor: string;
  glowColor: string;
  icon: (props: { className?: string; active?: boolean }) => React.ReactNode;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  email: string;
  active?: boolean;
}

export interface QuantMailSuperAppHeaderProps {
  /** Currently active pillar. If omitted, infers from pathname */
  activePillar?: SuperAppPillarId;
  /** Callback when a pillar is clicked */
  onPillarSelect?: (pillar: SuperAppPillarId) => void;
  /** Active workspace display name */
  workspaceName?: string;
  /** Active user email */
  userEmail?: string;
  /** Available workspaces for switcher */
  workspaces?: WorkspaceItem[];
  /** Callback when workspace is changed */
  onWorkspaceChange?: (workspaceId: string) => void;
  /** Current search query */
  searchValue?: string;
  /** Search value change callback */
  onSearchChange?: (val: string) => void;
  /** Search submit callback */
  onSearchSubmit?: (query: string) => void;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Unread notifications count */
  unreadNotifications?: number;
  /** Quant Credits balance */
  quantCredits?: number | string;
  /** User initials */
  userInitials?: string;
  /** User full name */
  userName?: string;
  /** Priority mail unread count */
  priorityMailCount?: number;
  /** Priority mail latest subject */
  priorityMailSubject?: string;
  /** Next meeting title */
  nextMeetingTitle?: string;
  /** Next meeting countdown/time */
  nextMeetingTime?: string;
  /** 1-tap join meeting callback */
  onJoinMeeting?: () => void;
  /** QuantDrive storage used in GB */
  storageUsedGB?: number;
  /** QuantDrive total storage quota in GB */
  storageTotalGB?: number;
  /** Quick action callback */
  onQuickAction?: (action: 'compose' | 'event' | 'upload' | 'repo') => void;
  /** Custom wrapper className */
  className?: string;
}

// ============================================================================
// Pure SVG Vector Icons — strictly 100% ZERO raw Unicode emojis
// ============================================================================

export function QuantMonogramSvg({ className = 'size-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="14" r="10" stroke="#818CF8" strokeWidth="2.8" fill="none" />
      <line x1="22" y1="20" x2="28" y2="28" stroke="#818CF8" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="16" cy="14" r="3.2" fill="#6366F1" />
    </svg>
  );
}

export function MailPillarSvg({ className = 'size-4' }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className}
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

export function CalendarPillarSvg({ className = 'size-4' }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className}
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

export function DrivePillarSvg({ className = 'size-4' }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className}
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

export function ContactsPillarSvg({ className = 'size-4' }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className}
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

export function QuantGitPillarSvg({ className = 'size-4' }: { className?: string; active?: boolean }) {
  return (
    <svg
      className={className}
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

export function SearchMagnifierSvg({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
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

export function MicrophoneSvg({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
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

export function ScanBarcodeLensSvg({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="7" y1="12" x2="7.01" y2="12" strokeWidth="2.5" />
      <line x1="17" y1="12" x2="17.01" y2="12" strokeWidth="2.5" />
    </svg>
  );
}

export function BellNotificationSvg({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function ZapCreditsSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function ChevronDownSvg({ className = 'size-3' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function CheckMarkSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PlusSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function VideoCallSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export function StarFilledSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function HardDriveQuotaSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="12" x2="2" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" y1="16" x2="6.01" y2="16" strokeWidth="2.5" />
      <line x1="10" y1="16" x2="10.01" y2="16" strokeWidth="2.5" />
    </svg>
  );
}

export function CrossSvg({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
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

// ============================================================================
// 5 Pillar Configurations (Flipkart & Amazon Super-App Paradigm)
// ============================================================================

export const SUPER_APP_PILLARS: SuperAppPillar[] = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    badge: 12,
    badgeTone: 'amber',
    accentColor: '#FF8C42',
    glowColor: 'rgba(255, 140, 66, 0.25)',
    icon: MailPillarSvg,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    badge: 2,
    badgeTone: 'amber',
    accentColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    icon: CalendarPillarSvg,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    badge: 'E2EE',
    badgeTone: 'cyan',
    accentColor: '#38BDF8',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    icon: DrivePillarSvg,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    badge: 8,
    badgeTone: 'emerald',
    accentColor: '#10B981',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    icon: ContactsPillarSvg,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    badge: 1,
    badgeTone: 'purple',
    accentColor: '#A78BFA',
    glowColor: 'rgba(167, 139, 250, 0.25)',
    icon: QuantGitPillarSvg,
  },
];

// ============================================================================
// Main Component
// ============================================================================

export function QuantMailSuperAppHeader({
  activePillar: propActivePillar,
  onPillarSelect,
  workspaceName = 'Quant Trinity Lab',
  userEmail = 'user@quantmail.in',
  workspaces = [
    { id: 'ws-trinity', name: 'Quant Trinity Lab', email: 'user@quantmail.in', active: true },
    { id: 'ws-prod', name: 'Enterprise Production', email: 'dev@quantmail.in', active: false },
    { id: 'ws-staging', name: 'OSS Staging EKS', email: 'sentinel@quantmail.in', active: false },
  ],
  onWorkspaceChange,
  searchValue = '',
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search across Mail, Calendar, Drive, Contacts, QuantGit… (<5ms FTS5)',
  unreadNotifications = 3,
  quantCredits = '1,250 QC',
  userInitials = 'QT',
  userName = 'Trinity Admin',
  priorityMailCount = 3,
  priorityMailSubject = 'Security Audit PR #298: 20/20 Pods Green',
  nextMeetingTitle = 'Architecture Review & Staging Sign-Off',
  nextMeetingTime = 'In 14 mins · Staging Sync',
  onJoinMeeting,
  storageUsedGB = 14.2,
  storageTotalGB = 50.0,
  onQuickAction,
  className = '',
}: QuantMailSuperAppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Internal state
  const [internalSearch, setInternalSearch] = useState(searchValue);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    workspaces.find((w) => w.active)?.id || workspaces[0]?.id || 'ws-trinity'
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Determine current pillar
  const currentPillar: SuperAppPillarId = propActivePillar || (() => {
    if (!pathname) return 'mail';
    if (pathname.startsWith('/calendar')) return 'calendar';
    if (pathname.startsWith('/drive')) return 'drive';
    if (pathname.startsWith('/contacts')) return 'contacts';
    if (pathname.startsWith('/quantgit') || pathname.startsWith('/codehub') || pathname.startsWith('/repos')) {
      return 'quantgit';
    }
    return 'mail';
  })();

  // Keep internal search in sync with prop
  useEffect(() => {
    setInternalSearch(searchValue);
  }, [searchValue]);

  // Global Ctrl+K / Cmd+K search focus shortcut
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsWorkspaceDropdownOpen(false);
      }
    };
    if (isWorkspaceDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWorkspaceDropdownOpen]);

  const handlePillarClick = (pillar: SuperAppPillar) => {
    if (onPillarSelect) {
      onPillarSelect(pillar.id);
    }
    router.push(pillar.path);
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalSearch(val);
    onSearchChange?.(val);
  };

  const handleClearSearch = () => {
    setInternalSearch('');
    onSearchChange?.('');
    searchInputRef.current?.focus();
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchSubmit) {
      onSearchSubmit(internalSearch);
    } else if (internalSearch.trim()) {
      router.push(`/search?q=${encodeURIComponent(internalSearch.trim())}`);
    }
  };

  const handleVoiceToggle = () => {
    setIsVoiceListening((prev) => !prev);
  };

  const handleWorkspaceSelect = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    setIsWorkspaceDropdownOpen(false);
    onWorkspaceChange?.(wsId);
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || {
    id: activeWorkspaceId,
    name: workspaceName,
    email: userEmail,
  };

  const storagePercentage = Math.min(100, Math.round((storageUsedGB / storageTotalGB) * 100));

  return (
    <header
      className={`w-full bg-[#090A0E] text-[#F1F5F9] border-b border-[#1E222A] select-none font-sans ${className}`}
      data-testid="quantmail-superapp-header"
      role="banner"
    >
      {/* ================================================================== */}
      {/* TIER 1: Amazon-Class Top Command Bar                              */}
      {/* ================================================================== */}
      <div className="max-w-[1720px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-3 min-h-[56px]">
        {/* Left: Brand Monogram + Title + Workspace Switcher */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Canonical Quant Monogram & Brand Lockup */}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-[#12151E] transition-all group focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="QuantMail Home"
            title="QuantMail — High-Performance Sovereign Inbox"
          >
            <div className="relative flex items-center justify-center p-1 rounded-lg bg-[#12151E] border border-[#1E222A] group-hover:border-indigo-500/50 transition-colors shadow-sm">
              <QuantMonogramSvg className="size-6 text-indigo-400 group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors">
                  QuantMail
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  SUPER-APP
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#64748B] tracking-tight -mt-0.5">
                By Quantrinity Lab
              </span>
            </div>
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-[#1E222A] hidden sm:block" aria-hidden="true" />

          {/* Workspace / Account Switcher Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isWorkspaceDropdownOpen}
              aria-label={`Current Workspace: ${activeWorkspace.name} · ${activeWorkspace.email}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#12151E] border border-[#1E222A] hover:border-[#282E3E] hover:bg-[#161B26] transition-all text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-left max-w-[240px] sm:max-w-[280px]"
            >
              <div className="size-2 rounded-full bg-emerald-400 shrink-0 ring-4 ring-emerald-400/10" />
              <div className="truncate flex-1">
                <span className="font-semibold text-slate-200 truncate block">
                  {activeWorkspace.name}
                </span>
                <span className="text-[10px] text-[#64748B] truncate block">
                  {activeWorkspace.email}
                </span>
              </div>
              <ChevronDownSvg
                className={`size-3 text-[#64748B] shrink-0 transition-transform duration-200 ${
                  isWorkspaceDropdownOpen ? 'rotate-180 text-indigo-400' : ''
                }`}
              />
            </button>

            {/* Workspace Dropdown Menu */}
            {isWorkspaceDropdownOpen && (
              <div
                role="listbox"
                aria-label="Select Workspace"
                className="absolute top-full left-0 mt-1.5 w-72 rounded-xl bg-[#12151E] border border-[#1E222A] shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Active Workspaces
                </div>
                <div className="space-y-1">
                  {workspaces.map((ws) => {
                    const isSelected = ws.id === activeWorkspaceId;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleWorkspaceSelect(ws.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                          isSelected
                            ? 'bg-indigo-600/15 text-indigo-300 font-semibold border border-indigo-500/30'
                            : 'text-slate-300 hover:bg-[#1A202C] hover:text-white'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="truncate">{ws.name}</div>
                          <div className="text-[10px] text-[#64748B] truncate">{ws.email}</div>
                        </div>
                        {isSelected && <CheckMarkSvg className="size-3.5 text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="my-1.5 border-t border-[#1E222A]" />

                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceDropdownOpen(false);
                    router.push('/workspaces?action=create');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors"
                >
                  <PlusSvg className="size-3.5" />
                  <span>Add Workspace</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center: Wide Global Command Search Bar (Amazon / Superhuman) */}
        <div className="flex-1 max-w-2xl mx-2 hidden md:block">
          <form onSubmit={handleSearchFormSubmit} className="relative w-full">
            <div className="relative flex items-center w-full rounded-xl bg-[#12151E] border border-[#1E222A] focus-within:border-indigo-500/80 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner">
              {/* Search Magnifier SVG */}
              <div className="pl-3.5 pr-2 text-[#64748B] flex items-center pointer-events-none">
                <SearchMagnifierSvg className="size-4" />
              </div>

              {/* Main Search Input */}
              <input
                ref={searchInputRef}
                type="text"
                value={internalSearch}
                onChange={handleSearchInputChange}
                placeholder={searchPlaceholder}
                aria-label="Global Super-App Search"
                className="w-full py-2 bg-transparent text-xs text-white placeholder-[#64748B] focus:outline-none"
              />

              {/* Clear button when input has text */}
              {internalSearch && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="p-1 mr-1 text-[#64748B] hover:text-white rounded-md transition-colors"
                  aria-label="Clear search query"
                  title="Clear search"
                >
                  <CrossSvg className="size-3.5" />
                </button>
              )}

              {/* Voice Search Button */}
              <button
                type="button"
                onClick={handleVoiceToggle}
                className={`p-1.5 rounded-md transition-colors mr-1 ${
                  isVoiceListening
                    ? 'text-rose-400 bg-rose-500/10 animate-pulse'
                    : 'text-[#64748B] hover:text-slate-200 hover:bg-[#1E222A]'
                }`}
                aria-label="Voice Search"
                title="Voice Search"
              >
                <MicrophoneSvg className="size-4" />
              </button>

              {/* Scan Barcode / Lens Button */}
              <button
                type="button"
                onClick={() => router.push('/search?mode=scan')}
                className="p-1.5 rounded-md text-[#64748B] hover:text-slate-200 hover:bg-[#1E222A] transition-colors mr-2"
                aria-label="Scan Document or QR"
                title="Scan Document or QR"
              >
                <ScanBarcodeLensSvg className="size-4" />
              </button>

              {/* Keyboard shortcut hint */}
              <div className="pr-3 hidden lg:flex items-center">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono tracking-wider text-[#64748B] bg-[#1E222A] rounded border border-[#282E3E]">
                  Ctrl+K
                </kbd>
              </div>
            </div>
          </form>
        </div>

        {/* Right: Utility Hub (Notifications, Credits Chip, Profile Avatar) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Notification Bell with live count badge */}
          <button
            type="button"
            onClick={() => router.push('/notifications')}
            className="relative p-2 rounded-xl bg-[#12151E] border border-[#1E222A] text-slate-300 hover:text-white hover:border-[#282E3E] transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label={`Notifications: ${unreadNotifications} unread`}
            title="Notifications"
          >
            <BellNotificationSvg className="size-4 text-slate-300" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-rose-600 rounded-full shadow-sm animate-in zoom-in">
                {unreadNotifications}
              </span>
            )}
          </button>

          {/* Quant Credits Chip (ZERO raw emojis! Pure SVG lightning bolt) */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12151E] border border-[#1E222A] text-xs font-semibold text-amber-400 shadow-sm"
            title="Quant Credits Balance"
          >
            <ZapCreditsSvg className="size-3.5 text-amber-400 shrink-0" />
            <span className="tracking-tight">{quantCredits}</span>
          </div>

          {/* Profile Avatar */}
          <button
            type="button"
            onClick={() => router.push('/settings/profile')}
            className="relative flex items-center justify-center size-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-xs text-white ring-2 ring-[#1E222A] hover:ring-indigo-500/50 transition-all focus:outline-none"
            aria-label={`User Profile: ${userName}`}
            title={`${userName} (${userEmail})`}
          >
            <span>{userInitials}</span>
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[#090A0E]"
              aria-label="Online status"
            />
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TIER 2: 5-Pillar Horizontal Mini-App Rail (Flipkart category strip)*/}
      {/* ================================================================== */}
      <div className="w-full bg-[#0D0F16] border-t border-[#1E222A]/80">
        <div className="max-w-[1720px] mx-auto px-2 sm:px-4">
          <nav
            role="tablist"
            aria-label="Productivity Pillars"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1"
          >
            {SUPER_APP_PILLARS.map((pillar) => {
              const isActive = currentPillar === pillar.id;
              const IconComponent = pillar.icon;

              return (
                <button
                  key={pillar.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${pillar.label} Pillar${pillar.badge ? ` (${pillar.badge})` : ''}`}
                  onClick={() => handlePillarClick(pillar)}
                  className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all shrink-0 focus:outline-none ${
                    isActive
                      ? 'bg-[#161B26] text-white shadow-sm font-semibold'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#12151E]'
                  }`}
                >
                  {/* Pillar SVG Icon */}
                  <div
                    className={`transition-transform duration-150 group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-[#64748B] group-hover:text-slate-300'
                    }`}
                    style={isActive ? { color: pillar.accentColor } : undefined}
                  >
                    <IconComponent className="size-4" active={isActive} />
                  </div>

                  {/* Pillar Label */}
                  <span className="tracking-tight">{pillar.label}</span>

                  {/* Live Badge */}
                  {pillar.badge !== undefined && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-[#1E222A] text-[#94A3B8] group-hover:text-slate-200'
                      }`}
                    >
                      {pillar.badge}
                    </span>
                  )}

                  {/* Active Underline Indicator Bar */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                      style={{
                        backgroundColor: pillar.accentColor,
                        boxShadow: `0 0 8px ${pillar.glowColor}`,
                      }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TIER 3: Executive Quick-Glance Widget Tiles                        */}
      {/* ================================================================== */}
      <div className="w-full bg-[#090A0E] border-t border-[#1E222A]/60 py-2">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Tile 1: Priority Mail */}
            <div
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#12151E] border border-[#1E222A] hover:border-[#282E3E] transition-all cursor-pointer group"
              onClick={() => router.push('/?lens=important')}
              role="button"
              tabIndex={0}
              aria-label={`Priority Mail: ${priorityMailCount} Unread`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                  <StarFilledSvg className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-200">Priority Mail</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      {priorityMailCount} Unread
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] truncate max-w-[190px]">
                    {priorityMailSubject}
                  </p>
                </div>
              </div>
            </div>

            {/* Tile 2: Next Meeting with 1-Tap Join */}
            <div
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#12151E] border border-[#1E222A] hover:border-[#282E3E] transition-all"
              aria-label={`Next Meeting: ${nextMeetingTitle}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <VideoCallSvg className="size-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-200 block truncate">
                    {nextMeetingTitle}
                  </span>
                  <p className="text-[11px] text-[#64748B] truncate">
                    {nextMeetingTime}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onJoinMeeting) {
                    onJoinMeeting();
                  } else {
                    router.push('/meet/staging-sync');
                  }
                }}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm ml-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                aria-label="1-Tap Join Meeting"
              >
                <VideoCallSvg className="size-3.5" />
                <span>Join Meet</span>
              </button>
            </div>

            {/* Tile 3: Storage Quota (QuantDrive) */}
            <div
              className="flex flex-col justify-center p-2.5 rounded-xl bg-[#12151E] border border-[#1E222A] hover:border-[#282E3E] transition-all cursor-pointer"
              onClick={() => router.push('/drive')}
              role="button"
              tabIndex={0}
              aria-label={`QuantDrive Quota: ${storageUsedGB} GB of ${storageTotalGB} GB used (${storagePercentage}%)`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                  <HardDriveQuotaSvg className="size-3.5 text-sky-400" />
                  <span>Drive Quota</span>
                </div>
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  {storageUsedGB} / {storageTotalGB} GB
                </span>
              </div>
              <div className="w-full bg-[#1E222A] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-sky-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${storagePercentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#64748B] mt-1">
                <span>{storagePercentage}% capacity used</span>
                <span className="text-sky-400 font-medium">FastCDC E2EE</span>
              </div>
            </div>

            {/* Tile 4: Executive Quick Actions */}
            <div
              className="flex items-center justify-between p-2 rounded-xl bg-[#12151E] border border-[#1E222A]"
              aria-label="Executive Quick Actions"
            >
              <div className="grid grid-cols-2 gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() =>
                    onQuickAction ? onQuickAction('compose') : router.push('/compose')
                  }
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-[#161B26] hover:bg-[#1E222A] text-slate-300 hover:text-white text-[11px] font-medium border border-[#1E222A] transition-colors"
                >
                  <PlusSvg className="size-3 text-indigo-400" />
                  <span>+ New Email</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQuickAction ? onQuickAction('event') : router.push('/calendar?new=1')
                  }
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-[#161B26] hover:bg-[#1E222A] text-slate-300 hover:text-white text-[11px] font-medium border border-[#1E222A] transition-colors"
                >
                  <PlusSvg className="size-3 text-amber-400" />
                  <span>+ New Event</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQuickAction ? onQuickAction('upload') : router.push('/drive?action=upload')
                  }
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-[#161B26] hover:bg-[#1E222A] text-slate-300 hover:text-white text-[11px] font-medium border border-[#1E222A] transition-colors"
                >
                  <PlusSvg className="size-3 text-sky-400" />
                  <span>+ Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQuickAction ? onQuickAction('repo') : router.push('/quantgit/new')
                  }
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-[#161B26] hover:bg-[#1E222A] text-slate-300 hover:text-white text-[11px] font-medium border border-[#1E222A] transition-colors"
                >
                  <PlusSvg className="size-3 text-purple-400" />
                  <span>+ New Repo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
export default QuantMailSuperAppHeader;
