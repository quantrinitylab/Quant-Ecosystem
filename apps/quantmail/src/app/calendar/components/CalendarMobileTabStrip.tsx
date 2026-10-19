'use client';

import React from 'react';
import {
  CALENDAR_PRIMARY_TABS,
  TAB_ICONS,
  isMergedTabActive,
  type CalendarMergedTab,
} from './CalendarContextSubTabs';

export interface CalendarMobileTabStripProps {
  activeTab: CalendarMergedTab;
  onSelectTab: (tab: CalendarMergedTab) => void;
}

/**
 * Mobile-only calendar view switcher (AUD-P0-C2).
 *
 * The desktop `CalendarContextSubTabs` is `hidden md:flex`, so without this
 * component the Month/Week/Trackers/Schedule views were unreachable on
 * phones. Same views, same icons, same `onSelectTab` wiring as desktop —
 * rendered as horizontally scrollable 44px-touch-target pills following the
 * established mobile pill pattern (DriveMobileTabStrip). `md:hidden` keeps
 * the desktop layout pixel-identical.
 */
export function CalendarMobileTabStrip({ activeTab, onSelectTab }: CalendarMobileTabStripProps) {
  return (
    <div className="md:hidden bg-black">
      <div
        role="tablist"
        aria-label="Calendar views"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 py-2"
      >
        {CALENDAR_PRIMARY_TABS.map((tab) => {
          const IconComp = TAB_ICONS[tab.key];
          const isActive = isMergedTabActive(activeTab, tab.key);

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`subview-${tab.key}`}
              id={`calendar-mobile-tab-${tab.key}`}
              data-testid={`calendar-mobile-tab-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelectTab(tab.key)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                isActive
                  ? 'bg-[var(--app-accent)]/15 text-[var(--app-accent)] border border-[var(--app-accent)]/40 font-semibold'
                  : 'border border-white/[0.08] bg-white/[0.03] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.06] hover:border-white/[0.14]'
              }`}
            >
              <IconComp
                className={`size-4 shrink-0 ${isActive ? 'text-[var(--app-accent)]' : 'text-[#64748B]'}`}
              />
              <span>{tab.label}</span>
              {isActive && (
                <span
                  className="size-1.5 rounded-full bg-[var(--app-accent)] shadow-[0_0_6px_var(--app-accent)]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
        {/* Trailing spacer: padding-right collapses inside overflow-x-auto, so
            without this the last pill renders flush-cut at the edge on narrow
            screens. */}
        <div aria-hidden="true" className="shrink-0 w-1" />
      </div>
    </div>
  );
}
