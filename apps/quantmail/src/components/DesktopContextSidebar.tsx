'use client';

// ============================================================================
// QuantMail — Desktop Context Sidebar (the ONE desktop left sidebar)
// ============================================================================
// Desktop-only (`hidden md:flex`). The full sidebar, top to bottom:
//   1. current app's logo + name
//   2. search field (expands inline, wired to the shell's `onSearchChange`)
//   3. per-app compose action + the current app's contextual tabs (vertical,
//      icon + label + REAL count badge, from `PILLAR_SUB_CONFIGS` — the same
//      config the mobile `ContextBottomNavBar` uses, so navigation stays one
//      system across viewports)
//   4. big Quanty avatar + "Ask Quanty"
//   5. real storage readout
//   6. profile + name
//
// The mobile drawer keeps rendering the old `AppSidebar` untouched.
// ============================================================================

import type { ReactNode, Ref } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  PILLAR_SUB_CONFIGS,
  executeContextTabClick,
  resolveContextTab,
  type ContextSubTab,
  type ProductivityPillar,
} from './desktopContextTabs';
import { triggerHapticTap } from './QuantPillarTopBar';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';
import { BrandWordmark, appDisplayName } from './BrandWordmark';
import { AccountBadge } from './AccountBadge';
import { Quanty } from './Quanty';
import { SidebarStorage } from './AppSidebar';
import { SearchClearButton } from './SearchClearButton';
import type { LogoAppType } from './Interactive3DLogo';

function ComposePencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function SearchGlyph({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

/** Same route → app mapping as AppShell's `currentApp`. */
function appForPathname(pathname: string): LogoAppType {
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/drive')) return 'drive';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/quantgit')) return 'code';
  return 'mail';
}

function AppMark({ app }: { app: LogoAppType }) {
  switch (app) {
    case 'calendar':
      return <QuantCalendarLogo size={36} />;
    case 'drive':
      return <QuantDriveLogo size={36} />;
    case 'contacts':
      return <QuantContactsLogo size={36} />;
    case 'code':
      return <QuantGitLogo size={36} />;
    case 'mail':
    default:
      return <QuantMailLogo size={36} showBadge={false} interactive={false} />;
  }
}

export interface DesktopContextSidebarProps {
  pillar: ProductivityPillar;
  /** Primary create action for the current app (mirrors the FAB). Hidden when null. */
  composeAction?: { label: string; onSelect: () => void } | null;
  /** Real badge counts keyed by tab id. No entry (or 0) => no badge. */
  badgeCounts?: Record<string, number | undefined>;
  onTabChange?: (tabId: string, pillar: ProductivityPillar) => void;
  onQuantyOpen?: () => void;
  /** Rendered inside the scroll region, after the nav tabs (e.g. Contacts A–Z index). */
  extra?: ReactNode;
  /** Global search, wired exactly like the old desktop header search. */
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  /** The shell's `/` shortcut focuses the field through this ref. */
  searchInputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function DesktopContextSidebar({
  pillar,
  composeAction,
  badgeCounts,
  onTabChange,
  onQuantyOpen,
  extra,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchInputRef,
  className = '',
}: DesktopContextSidebarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const app = appForPathname(pathname);
  const [activeTabState, setActiveTabState] = useState<string | null>(null);

  const config = PILLAR_SUB_CONFIGS[pillar];

  // Keep in sync with tab changes dispatched from elsewhere (pages, strips).
  useEffect(() => {
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent<{ pillar?: string; tabId?: string }>).detail;
      if (detail?.tabId && detail?.pillar === pillar) {
        setActiveTabState(detail.tabId);
      }
    };
    window.addEventListener('quant:subtab-change', handleSync);
    return () => window.removeEventListener('quant:subtab-change', handleSync);
  }, [pillar]);

  // Reset local override when switching apps.
  useEffect(() => {
    setActiveTabState(null);
  }, [pillar]);

  const activeTabId = resolveContextTab(pillar, pathname, searchParams, undefined, activeTabState);

  const handleTabClick = (tab: ContextSubTab) => {
    const isActive = tab.id === activeTabId && !tab.opensQuanty;
    // Active-tab re-tap: haptic + refresh, matching the mobile behavior.
    if (isActive) {
      triggerHapticTap(10);
    }
    setActiveTabState(tab.id);
    executeContextTabClick(tab, pillar, {
      pathname,
      router,
      onTabChange,
      onQuantyOpen,
    });
  };

  return (
    <aside
      aria-label={`${appDisplayName(app)} navigation`}
      data-testid="desktop-context-sidebar"
      className={`hidden md:flex w-60 flex-none flex-col bg-black py-4 z-30 select-none desktop-sidebar ${className}`}
    >
      {/* 1 — current app's logo + name */}
      <div className="sidebar-brand">
        <button
          type="button"
          className="flex items-center gap-2.5 select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          onClick={() => router.push('/')}
          title={`${appDisplayName(app)} — Go to Inbox`}
          aria-label={`${appDisplayName(app)} — Go to Inbox`}
        >
          <AppMark app={app} />
          <BrandWordmark app={app} size="text-lg" />
        </button>
      </div>

      {/* 2 — search: expands inline, filters exactly like the old header search.
          Rendered only on pages that pass `onSearchChange`. */}
      {onSearchChange && (
        <div className="sidebar-search-wrap">
          <label className={`sidebar-search-field${searchValue ? ' is-open' : ''}`}>
            <SearchGlyph />
            <input
              ref={searchInputRef}
              id="app-shell-search-input"
              type="search"
              aria-label="Search"
              autoComplete="off"
              placeholder={searchPlaceholder ?? 'Search'}
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  onSearchChange('');
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            {searchValue ? (
              <SearchClearButton onClear={() => onSearchChange('')} />
            ) : (
              <kbd className="sidebar-search-kbd" aria-hidden="true">
                /
              </kbd>
            )}
          </label>
        </div>
      )}

      {/* 3a — per-app compose action (mirrors the FAB; hidden when null) */}
      {composeAction && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={composeAction.onSelect}
            data-testid="desktop-context-compose"
            className="group flex h-12 w-fit items-center gap-3 rounded-2xl bg-[#1A1E28] border border-[#2A3144] pl-4 pr-5 text-sm font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition-all duration-200 hover:bg-[#232938] hover:border-[#3A4358] hover:shadow-[0_4px_16px_rgba(0,0,0,0.55)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            <ComposePencilIcon className="size-5 text-[var(--quant-primary)] transition-transform duration-200 group-hover:-rotate-12" />
            {composeAction.label}
          </button>
        </div>
      )}

      {/* 3b — the current app's contextual tabs, vertical */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav aria-label={`${config.name} sections`} className="flex flex-col gap-0.5 px-2.5">
          {config.tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;
            const badge = badgeCounts?.[tab.id];

            // Quanty AI: logo-only tab (Gemini-approved, no text label).
            if (tab.opensQuanty) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  aria-label={tab.ariaLabel || 'Quanty AI'}
                  title={tab.ariaLabel || 'Quanty AI'}
                  data-testid="desktop-context-tab-quanty"
                  className="group mb-1 flex items-center justify-center rounded-xl border border-[#2A3144] bg-gradient-to-b from-[#181C28] to-[#0F121C] py-2.5 transition-all duration-200 hover:border-[#A78BFA]/60 hover:shadow-[0_0_16px_rgba(167,139,250,0.25)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
                >
                  <Icon className="size-5 text-[#A78BFA] transition-transform duration-200 group-hover:scale-110" />
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.ariaLabel || `${tab.label}${badge ? `, ${badge} unread` : ''}`}
                data-testid={`desktop-context-tab-${tab.id}`}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                  isActive ? 'font-semibold border' : 'font-medium border border-transparent text-[#94A3B8] hover:text-white hover:bg-[var(--quant-surface-elevated)]'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: `${config.accentColor}1F`,
                        borderColor: `${config.accentColor}59`,
                        color: config.accentColor,
                        boxShadow: `0 0 16px ${config.accentColor}22`,
                      }
                    : undefined
                }
              >
                <Icon
                  className={`size-[18px] flex-none transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                  active={isActive}
                />
                <span className="flex-1 truncate text-left">{tab.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none text-black"
                    style={{ backgroundColor: config.accentColor }}
                    aria-hidden="true"
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {tab.badgeText && (
                  <span
                    className="flex h-[16px] items-center rounded border border-[#2A3144] bg-[var(--quant-surface-elevated)] px-1.5 text-[var(--q-type-xs)] font-extrabold uppercase tracking-tight text-[#94A3B8]"
                    aria-hidden="true"
                  >
                    {tab.badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {extra}

        {/* 4 — the empty area: big Quanty avatar + Ask Quanty */}
        <section aria-label="Ask Quanty" className="sidebar-quanty">
          <Quanty expression="greeting" size={76} />
          <button
            type="button"
            onClick={() => onQuantyOpen?.()}
            className="sidebar-quanty-cta"
          >
            Ask Quanty
          </button>
        </section>
      </div>

      {/* 5 — storage readout (real data) */}
      <SidebarStorage />

      {/* 6 — profile + name at the very bottom */}
      <AccountBadge />
    </aside>
  );
}

export default DesktopContextSidebar;
