'use client';

import React from 'react';
import {
  FolderIcon,
  PadlockIcon,
  DriveFeedIcon,
  AiMemoryBrainIcon,
} from './DriveIcons';

export type DriveSubTab =
  | 'home'
  | 'feed'
  | 'aimemory'
  | 'vault'
  | 'files'
  | 'shared'
  | 'starred'
  | 'cleaner';

export interface DriveContextTabsHeaderProps {
  activeTab: DriveSubTab;
  onTabChange: (tab: DriveSubTab) => void;
  sharedCount?: number;
  starredCount?: number;
}

interface TabDef {
  id: DriveSubTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeText?: string;
  badgeCount?: number;
  ariaLabel: string;
}

export function DriveContextTabsHeader({
  activeTab,
  onTabChange,
  sharedCount = 0,
  starredCount = 0,
}: DriveContextTabsHeaderProps) {
  const tabs: TabDef[] = [
    {
      id: 'home',
      label: 'Home',
      shortLabel: 'Home',
      icon: FolderIcon,
      ariaLabel: 'QuantDrive Home view with 8 category cards and single storage gauge',
    },
    {
      id: 'feed',
      label: 'Feed',
      shortLabel: 'Feed',
      icon: DriveFeedIcon,
      ariaLabel: 'Chronological visual media feed of recent photos, videos, and media',
    },
    {
      id: 'aimemory',
      label: 'AI Memory',
      shortLabel: 'AI Memory',
      icon: AiMemoryBrainIcon,
      badgeText: 'AI',
      ariaLabel: 'Cross-App Relational AI Memory Vault',
    },
    {
      id: 'vault',
      label: 'Sovereign Vault',
      shortLabel: 'Vault',
      icon: PadlockIcon,
      badgeText: 'E2EE',
      ariaLabel: 'AES-256 E2EE Sovereign Cryptographic Vault',
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Drive Context Sub-Navigation"
      // Desktop-only: on mobile the shell renders a single top sub-tab strip
      // (<MobileSubTabStrip />) for drive's tabs, so a mid-page duplicate row
      // is the exact double-stack the mobile QA shots flagged.
      // `hidden md:flex` keeps the desktop layout pixel-identical.
      className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2.5 px-4 sm:px-8 border-b border-[#232938] bg-[#090A0E]/95 backdrop-blur-md sticky top-0 z-20"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id || (tab.id === 'home' && activeTab === 'files');

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.ariaLabel}
            id={`drive-tab-${tab.id}`}
            aria-controls={`drive-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] select-none ${
              isActive
                ? 'bg-[#12151E] text-[#38BDF8] border border-[#38BDF8]/40 shadow-[0_0_16px_rgba(56,189,248,0.12),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                : 'bg-transparent text-[#94A3B8] border border-transparent hover:bg-[#12151E]/60 hover:text-[#F8FAFC] hover:border-[#232938]'
            }`}
          >
            <Icon
              className={`size-4 shrink-0 transition-colors ${
                isActive ? 'text-[#38BDF8]' : 'text-[#64748B] group-hover:text-[#94A3B8]'
              }`}
            />
            <span className="hidden md:inline">{tab.label}</span>
            <span className="inline md:hidden">{tab.shortLabel}</span>

            {tab.badgeText && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono tracking-wider uppercase font-semibold ${
                  isActive
                    ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                    : 'bg-[#1E293B] text-[#94A3B8] border border-[#334155]'
                }`}
              >
                {tab.badgeText}
              </span>
            )}

            {tab.badgeCount !== undefined && (
              <span
                className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  isActive
                    ? 'bg-[#38BDF8] text-[#090A0E]'
                    : 'bg-[#334155] text-[#E2E8F0]'
                }`}
              >
                {tab.badgeCount}
              </span>
            )}
          </button>
        );
      })}
      {/* Trailing spacer: padding-right collapses inside overflow-x-auto, so
          without this the last tab ("Cleaner") renders flush-cut at the edge
          on narrow screens — the "St..." clipping from the mobile QA shots. */}
      <div aria-hidden="true" className="shrink-0 w-4" />
    </div>
  );
}
