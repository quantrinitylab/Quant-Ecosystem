'use client';

// ============================================================================
// QuantMail — Mobile Sub-Tab Strip (Gmail-style, single tab system per screen)
// ============================================================================
//
// When the ContextBottomNavBar double bar was removed, three pillars lost
// their ONLY mobile sub-tab switcher: calendar's CalendarContextSubTabs and
// drive's DriveContextTabsHeader are both `hidden md:flex` (desktop-only),
// and QuantGit's repos/prs/issues/actions/copilot sub-views had no other UI.
// Mail and Contacts keep their own native mobile tab rows (inbox lens
// tablist, contacts chips), so this strip renders ONLY for calendar, drive
// and quantgit — one horizontal scrollable pill strip directly under the app
// bar, Gmail-style. Never a second bottom bar.
//
// Wiring mirrors the pages' existing contract: `?tab=` query params plus the
// `quant:subtab-change` custom event, which calendar/drive/quantgit pages
// already listen for. No page changes needed.
// ============================================================================

import React, { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SubTabPillar = 'calendar' | 'drive' | 'quantgit';

export interface MobileSubTab {
  id: string;
  label: string;
  targetPath: string;
  queryParam: { key: string; value: string };
}

interface SubTabPillarConfig {
  name: string;
  accentColor: string;
  tabs: MobileSubTab[];
}

export const MOBILE_SUB_TAB_CONFIGS: Record<SubTabPillar, SubTabPillarConfig> = {
  calendar: {
    name: 'Calendar',
    accentColor: '#F59E0B',
    tabs: [
      { id: 'feed', label: 'Feed', targetPath: '/calendar', queryParam: { key: 'tab', value: 'feed' } },
      { id: 'month', label: 'Month', targetPath: '/calendar', queryParam: { key: 'tab', value: 'month' } },
      { id: 'week', label: 'Week', targetPath: '/calendar', queryParam: { key: 'tab', value: 'week' } },
      { id: 'events', label: 'Trackers', targetPath: '/calendar', queryParam: { key: 'tab', value: 'events' } },
      { id: 'schedule', label: 'Schedule', targetPath: '/calendar', queryParam: { key: 'tab', value: 'schedule' } },
    ],
  },
  drive: {
    name: 'Drive',
    accentColor: '#38BDF8',
    tabs: [
      { id: 'home', label: 'Home', targetPath: '/drive', queryParam: { key: 'tab', value: 'home' } },
      { id: 'feed', label: 'Feed', targetPath: '/drive', queryParam: { key: 'tab', value: 'feed' } },
      { id: 'aimemory', label: 'AI Memory', targetPath: '/drive', queryParam: { key: 'tab', value: 'aimemory' } },
      { id: 'vault', label: 'Vault', targetPath: '/drive', queryParam: { key: 'tab', value: 'vault' } },
    ],
  },
  quantgit: {
    name: 'QuantGit',
    accentColor: '#A78BFA',
    tabs: [
      { id: 'repos', label: 'Repos', targetPath: '/quantgit', queryParam: { key: 'tab', value: 'repos' } },
      { id: 'prs', label: 'PRs', targetPath: '/quantgit', queryParam: { key: 'tab', value: 'prs' } },
      { id: 'issues', label: 'Issues', targetPath: '/quantgit', queryParam: { key: 'tab', value: 'issues' } },
      { id: 'actions', label: 'Actions', targetPath: '/quantgit', queryParam: { key: 'tab', value: 'actions' } },
      { id: 'copilot', label: 'Copilot', targetPath: '/quantgit', queryParam: { key: 'tab', value: 'copilot' } },
    ],
  },
};

/** Which pillar (if any) needs the mobile sub-tab strip. */
export function subTabPillarForPath(pathname: string): SubTabPillar | null {
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/drive')) return 'drive';
  if (pathname.startsWith('/quantgit') || pathname.startsWith('/codehub')) return 'quantgit';
  return null;
}

/**
 * Pure: which sub-tab is active for a (pillar, pathname, searchParams) triple.
 * Mirrors the tab-resolution contract the pages already implement.
 */
export function resolveMobileSubTab(
  pillar: SubTabPillar,
  searchParams?: { get: (k: string) => string | null } | null,
): string {
  const tabParam = searchParams?.get('tab');

  if (pillar === 'calendar') {
    if (tabParam === 'month') return 'month';
    if (tabParam === 'week') return 'week';
    if (tabParam === 'events') return 'events';
    if (tabParam === 'schedule' || tabParam === 'reminders' || tabParam === 'booking' || tabParam === 'quantmeet') {
      return 'schedule';
    }
    return 'feed';
  }

  if (pillar === 'drive') {
    if (tabParam === 'feed') return 'feed';
    if (tabParam === 'aimemory' || tabParam === 'memory') return 'aimemory';
    if (tabParam === 'vault') return 'vault';
    return 'home';
  }

  // quantgit
  if (tabParam === 'prs') return 'prs';
  if (tabParam === 'issues') return 'issues';
  if (tabParam === 'actions') return 'actions';
  if (tabParam === 'copilot') return 'copilot';
  return 'repos';
}

/**
 * Pure click handler: dispatches the page sync event, then navigates.
 * Re-tapping the active pill refreshes the current view instead of
 * pushing an identical URL.
 */
export function executeMobileSubTabClick(
  tab: MobileSubTab,
  pillar: SubTabPillar,
  options: {
    pathname: string;
    router: { push: (path: string) => void };
    isActive: boolean;
  },
) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    if (options.isActive) {
      // Re-tap on the active sub-tab: refresh current view content.
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      return;
    }

    if (tab.id === 'copilot' && pillar === 'quantgit') {
      window.dispatchEvent(new CustomEvent('quant:copilot:open'));
      window.dispatchEvent(new CustomEvent('quant:agents:open'));
    }

    window.dispatchEvent(
      new CustomEvent('quant:subtab-change', {
        detail: { pillar, tabId: tab.id, queryParam: tab.queryParam },
      }),
    );
  }

  const targetUrl = `${tab.targetPath}?${tab.queryParam.key}=${tab.queryParam.value}`;
  options.router.push(targetUrl);
}

export function MobileSubTabStrip({ className = '' }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();

  const pillar = subTabPillarForPath(pathname);
  // Mail and Contacts render their own native mobile tab rows; thread/compose
  // are not suite routes. This strip is only the replacement for the removed
  // bottom bar's navigation on calendar, drive and quantgit.
  if (!pillar) return null;
  if (pathname.startsWith('/thread') || pathname.startsWith('/compose')) return null;

  const config = MOBILE_SUB_TAB_CONFIGS[pillar];
  const activeTabId = resolveMobileSubTab(pillar, searchParams);

  const handleTabClick = useCallback(
    (tab: MobileSubTab) => {
      executeMobileSubTabClick(tab, pillar, {
        pathname,
        router,
        isActive: tab.id === resolveMobileSubTab(pillar, searchParams),
      });
    },
    [pillar, pathname, router, searchParams],
  );

  return (
    <nav
      aria-label={`${config.name} sub-navigation`}
      className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-[#1F2430] bg-[#090A0E]/95 px-3 py-1.5 ${className}`}
    >
      {config.tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 select-none outline-none focus-visible:ring-2 ${
              isActive ? 'text-white shadow-sm' : 'text-[#94A3B8] hover:text-white hover:bg-[#161922]'
            }`}
            style={
              isActive
                ? {
                    backgroundColor: `${config.accentColor}26`,
                    color: config.accentColor,
                    boxShadow: `inset 0 0 0 1px ${config.accentColor}66`,
                  }
                : undefined
            }
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export default MobileSubTabStrip;
