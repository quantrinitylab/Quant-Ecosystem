'use client';

import React, { useRef } from 'react';
import {
  FolderIcon,
  PadlockIcon,
  DriveFeedIcon,
  AiMemoryBrainIcon,
  ClockIcon,
  HardDriveIcon,
  SharedUsersIcon,
  StarIcon,
  CleanerSparkleIcon,
} from './DriveIcons';

export type DriveSubTab =
  | 'home'
  | 'recent'
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

/**
 * QM-FIX-*-desktop-orphans (tab↔panel contract) — single source of truth
 * for the tab↔panel ID mapping. Every tab `t` declares
 * aria-controls="drive-panel-t" on its tab button, so the rendered panel
 * MUST carry id="drive-panel-t" + aria-labelledby="drive-tab-t".
 * page.tsx uses this for the home/files/trash panels; the header uses it
 * for its own tab buttons. One definition — impossible to drift.
 */
export function drivePanelIdentity(tab: DriveSubTab): {
  panelId: string;
  labelledBy: string;
} {
  return { panelId: `drive-panel-${tab}`, labelledBy: `drive-tab-${tab}` };
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
      // QM-M39-002 — "Recent" (M39 screen 6): server-side recency-ordered file view.
      id: 'recent',
      label: 'Recent',
      shortLabel: 'Recent',
      icon: ClockIcon,
      ariaLabel: 'Recently opened or modified files, newest first',
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
      label: 'Vault',
      shortLabel: 'Vault',
      icon: PadlockIcon,
      ariaLabel: 'Vault — locked file storage',
    },
    // QM-FIX-*-desktop-orphans — parity with DriveMobileTabStrip: files,
    // shared, starred, and cleaner have full views in page.tsx but were
    // desktop-orphaned (reachable only via direct ?tab= URL). Files gets its
    // own tab (the old `activeTab === 'files'` fold-into-home special case is
    // gone); the trailing spacer comment below was already written for
    // Cleaner being last.
    {
      id: 'files',
      label: 'Files',
      shortLabel: 'Files',
      icon: HardDriveIcon,
      ariaLabel: 'All files',
    },
    {
      id: 'shared',
      label: 'Shared',
      shortLabel: 'Shared',
      icon: SharedUsersIcon,
      // QM-M39-001 — badges carry real backend counts; no badge when 0
      // (parity with the mobile strip's `badgeCount > 0` gate).
      badgeCount: sharedCount,
      ariaLabel: 'Shared with me',
    },
    {
      id: 'starred',
      label: 'Starred',
      shortLabel: 'Starred',
      icon: StarIcon,
      badgeCount: starredCount,
      ariaLabel: 'Starred files',
    },
    {
      id: 'cleaner',
      label: 'Cleaner',
      shortLabel: 'Cleaner',
      icon: CleanerSparkleIcon,
      ariaLabel: 'Duplicate cleaner',
    },
  ];

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabIds = tabs.map((t) => t.id);

  // QM-FIX-*-desktop-orphans (keyboard P2): WAI-ARIA tablist keyboard
  // contract — ArrowLeft/ArrowRight move between tabs, Home/End jump to
  // the first/last tab. Focus moves AND the tab activates (automatic
  // activation), matching the click behaviour. Roving tabindex is already
  // in place (active tab tabIndex=0, others -1).
  const activateTabAt = (index: number) => {
    const wrapped = (index + tabIds.length) % tabIds.length;
    const id = tabIds[wrapped];
    onTabChange(id);
    tabRefs.current[wrapped]?.focus();
  };

  const handleTabListKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabIds.indexOf(activeTab);
    if (currentIndex === -1) return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        activateTabAt(currentIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        activateTabAt(currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        activateTabAt(0);
        break;
      case 'End':
        e.preventDefault();
        activateTabAt(tabIds.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Drive Context Sub-Navigation"
      onKeyDown={handleTabListKeyDown}
      // Desktop-only: on mobile the shell renders a single top sub-tab strip
      // (<MobileSubTabStrip />) for drive's tabs, so a mid-page duplicate row
      // is the exact double-stack the mobile QA shots flagged.
      // `hidden md:flex` keeps the desktop layout pixel-identical.
      className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2.5 px-4 sm:px-8 bg-[var(--quant-background)]/95 backdrop-blur-md sticky top-0 z-20"
    >
      {tabs.map((tab, tabIndex) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const identity = drivePanelIdentity(tab.id);

        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tabIndex] = el;
            }}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.ariaLabel}
            id={identity.labelledBy}
            aria-controls={identity.panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] select-none ${
              isActive
                ? 'bg-[var(--quant-surface)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_12%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                : 'bg-transparent text-[#94A3B8] border hover:bg-[var(--quant-surface)]/60 hover:text-[#F8FAFC] hover:border-[var(--quant-border)]'
            }`}
          >
            <Icon
              className={`size-4 shrink-0 transition-colors ${
                isActive ? 'text-[var(--app-accent)]' : 'text-[#64748B] group-hover:text-[#94A3B8]'
              }`}
            />
            <span className="hidden md:inline">{tab.label}</span>
            <span className="inline md:hidden">{tab.shortLabel}</span>

            {tab.badgeText && (
              <span
                className={`ml-0.5 px-1.5 py-px rounded text-[10px] font-mono tracking-wider uppercase font-semibold ${
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]'
                    : 'bg-[var(--quant-surface-elevated)] text-[#94A3B8] border border-[#334155]'
                }`}
              >
                {tab.badgeText}
              </span>
            )}

            {/* QM-M39-001 honesty: badges show real counts and only when > 0 —
                a "0" pill is noise (parity with DriveMobileTabStrip). */}
            {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
              <span
                className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  isActive
                    ? 'bg-[var(--app-accent)] text-[var(--quant-background)]'
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
