'use client';

import React from 'react';
import {
  FolderIcon,
  PadlockIcon,
  DriveFeedIcon,
  AiMemoryBrainIcon,
  HardDriveIcon,
  SharedUsersIcon,
  StarIcon,
  CleanerSparkleIcon,
} from './DriveIcons';
import type { DriveSubTab } from './DriveContextTabsHeader';

export interface DriveMobileTabStripProps {
  activeTab: DriveSubTab;
  onTabChange: (tab: DriveSubTab) => void;
  sharedCount?: number;
  starredCount?: number;
}

interface MobileTabDef {
  id: DriveSubTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeText?: string;
  badgeCount?: number;
  ariaLabel: string;
}

/**
 * Mobile-only Drive tab strip (QM-UIUX-019).
 *
 * The desktop `DriveContextTabsHeader` is `hidden md:flex`, and the old
 * mobile `MobileSubTabStrip` was deleted — so without this component,
 * 7 of 8 Drive surfaces were unreachable on phones.
 *
 * Visual language mirrors the desktop tab header (blue #38BDF8 accent on
 * dark) rendered as horizontally scrollable pills, following the pill
 * patterns already used elsewhere in the Drive page (filter pills).
 * `md:hidden` keeps the desktop layout pixel-identical.
 */
export function DriveMobileTabStrip({
  activeTab,
  onTabChange,
  sharedCount = 0,
  starredCount = 0,
}: DriveMobileTabStripProps) {
  const tabs: MobileTabDef[] = [
    { id: 'home', label: 'Home', icon: FolderIcon, ariaLabel: 'Drive Home' },
    { id: 'feed', label: 'Feed', icon: DriveFeedIcon, ariaLabel: 'Media feed' },
    {
      id: 'aimemory',
      label: 'AI Memory',
      icon: AiMemoryBrainIcon,
      badgeText: 'AI',
      ariaLabel: 'AI Memory',
    },
    {
      id: 'vault',
      label: 'Vault',
      icon: PadlockIcon,
      // NOTE: the E2EE badge matches the desktop header. Its removal is
      // tracked separately as QM-UIUX-022 (unverified security claim).
      badgeText: 'E2EE',
      ariaLabel: 'Encrypted vault',
    },
    { id: 'files', label: 'Files', icon: HardDriveIcon, ariaLabel: 'All files' },
    {
      id: 'shared',
      label: 'Shared',
      icon: SharedUsersIcon,
      badgeCount: sharedCount,
      ariaLabel: 'Shared with me',
    },
    {
      id: 'starred',
      label: 'Starred',
      icon: StarIcon,
      badgeCount: starredCount,
      ariaLabel: 'Starred files',
    },
    {
      id: 'cleaner',
      label: 'Cleaner',
      icon: CleanerSparkleIcon,
      ariaLabel: 'Duplicate cleaner',
    },
  ];

  return (
    <div className="relative md:hidden border-b border-[#232938] bg-[#090A0E]/95 backdrop-blur-md sticky top-0 z-20">
      <div
        role="tablist"
        aria-label="Drive sections"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 py-2"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              id={`drive-mobile-tab-${tab.id}`}
              aria-controls={`drive-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                isActive
                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/40 font-semibold'
                  : 'border border-white/[0.08] bg-white/[0.03] text-[#A1A4AC] hover:text-[#F8FAFC] hover:bg-white/[0.06] hover:border-white/[0.14]'
              }`}
            >
              <Icon
                className={`size-4 shrink-0 ${isActive ? 'text-[#38BDF8]' : 'text-[#64748B]'}`}
              />
              <span>{tab.label}</span>

              {tab.badgeText && (
                <span
                  className={`ml-0.5 px-1.5 py-px rounded text-[10px] font-mono tracking-wider uppercase font-semibold ${
                    isActive
                      ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                      : 'bg-[#1E293B] text-[#94A3B8] border border-[#334155]'
                  }`}
                >
                  {tab.badgeText}
                </span>
              )}

              {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                <span
                  className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isActive ? 'bg-[#38BDF8] text-[#090A0E]' : 'bg-[#334155] text-[#E2E8F0]'
                  }`}
                >
                  {tab.badgeCount}
                </span>
              )}
            </button>
          );
        })}
        {/* Trailing spacer: padding-right collapses inside overflow-x-auto, so
            without this the last pill ("Cleaner") renders flush-cut at the edge
            on narrow screens. */}
        <div aria-hidden="true" className="shrink-0 w-1" />
      </div>
      {/* Right-edge fade: scroll affordance for the overflowing pill row. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#090A0E] to-transparent"
      />
    </div>
  );
}
