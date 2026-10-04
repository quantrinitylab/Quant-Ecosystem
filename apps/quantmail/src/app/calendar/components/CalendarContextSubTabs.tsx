'use client';

import React from 'react';
import type { CalendarContextTab, CalendarView } from '../types';

/*
 * The ONE calendar tab row.
 *
 * There used to be two competing rows: the header's view switcher
 * (Agenda/Week/Day/Month) and this strip (Agenda/Month/Booking/QuantMeet/
 * Reminders). Both claimed "Agenda" and both claimed "Month", so the screen
 * showed the double stack from the mobile QA screenshots and tapping "Month"
 * in one row fought the other. They are merged here — one row, seven tabs,
 * zero redundancy.
 *
 * What each tab drives (the row that "really" does something is this one —
 * the context tab picks the sub-view, the view only shapes the agenda):
 *   agenda / week / day -> the agenda sub-view, shaped as timeline / week / day
 *   month              -> the month grid sub-view
 *   booking            -> booking-links sub-view (+ opens the links sheet)
 *   quantmeet          -> QuantMeet sub-view
 *   reminders          -> reminders sub-view
 */

export type CalendarMergedTab =
  | 'agenda'
  | 'week'
  | 'day'
  | 'month'
  | 'booking'
  | 'quantmeet'
  | 'reminders';

export interface CalendarContextSubTabsProps {
  activeTab: CalendarMergedTab;
  onSelectTab: (tab: CalendarMergedTab) => void;
  className?: string;
}

/**
 * Pure: which merged tab is active for a (contextTab, view) pair.
 * Week/Day only exist as agenda shapes, so they surface only when the agenda
 * sub-view is showing; anything else falls back to the context tab itself.
 */
export function resolveMergedTab(
  contextTab: CalendarContextTab,
  view: CalendarView,
): CalendarMergedTab {
  if (contextTab === 'agenda' && (view === 'week' || view === 'day')) return view;
  if (contextTab === 'agenda') return 'agenda';
  return contextTab;
}

/**
 * Pure: the (contextTab, view) pair a merged tab selection must produce.
 * Week/Day keep the agenda sub-view and reshape it; month/agenda go through
 * the normal context-tab path (which also syncs the URL).
 */
export function mergedTabTargets(tab: CalendarMergedTab): {
  contextTab: CalendarContextTab;
  view: CalendarView;
} {
  switch (tab) {
    case 'week':
      return { contextTab: 'agenda', view: 'week' };
    case 'day':
      return { contextTab: 'agenda', view: 'day' };
    case 'agenda':
      return { contextTab: 'agenda', view: 'agenda' };
    case 'month':
      return { contextTab: 'month', view: 'month' };
    case 'booking':
      return { contextTab: 'booking', view: 'agenda' };
    case 'quantmeet':
      return { contextTab: 'quantmeet', view: 'agenda' };
    case 'reminders':
      return { contextTab: 'reminders', view: 'agenda' };
  }
}

function AgendaIcon({ className }: { className?: string }) {
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

function WeekIcon({ className }: { className?: string }) {
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

function DayIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MonthIcon({ className }: { className?: string }) {
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

function BookingIcon({ className }: { className?: string }) {
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

function QuantMeetIcon({ className }: { className?: string }) {
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

function RemindersIcon({ className }: { className?: string }) {
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

const TAB_ICONS: Record<CalendarMergedTab, (props: { className?: string }) => React.ReactNode> = {
  agenda: AgendaIcon,
  week: WeekIcon,
  day: DayIcon,
  month: MonthIcon,
  booking: BookingIcon,
  quantmeet: QuantMeetIcon,
  reminders: RemindersIcon,
};

const MERGED_TABS: ReadonlyArray<{ key: CalendarMergedTab; label: string }> = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'month', label: 'Month' },
  { key: 'booking', label: 'Booking' },
  { key: 'quantmeet', label: 'QuantMeet' },
  { key: 'reminders', label: 'Reminders' },
];

export function CalendarContextSubTabs({
  activeTab,
  onSelectTab,
  className = '',
}: CalendarContextSubTabsProps) {
  return (
    <nav
      className={`border-b border-[#232938] bg-[#0c0c10] px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar select-none ${className}`}
      aria-label="Calendar views"
      role="tablist"
    >
      <div className="flex items-center gap-1.5 min-w-max">
        {MERGED_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const IconComp = TAB_ICONS[tab.key];

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`subview-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => onSelectTab(tab.key)}
              data-testid={`calendar-tab-${tab.key}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] ${
                isActive
                  ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40 shadow-[0_0_12px_rgba(245,158,11,0.15)] font-semibold'
                  : 'text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#161822] border border-transparent'
              }`}
            >
              <IconComp className={`size-3.5 ${isActive ? 'text-[#F59E0B]' : 'text-[#A1A4AC]'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <span
                  className="size-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
