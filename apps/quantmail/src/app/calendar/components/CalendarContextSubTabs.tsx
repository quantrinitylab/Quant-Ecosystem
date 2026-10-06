'use client';

import React from 'react';
import type { CalendarContextTab, CalendarView } from '../types';

export type CalendarMergedTab =
  | 'feed'
  | 'month'
  | 'events'
  | 'schedule'
  | 'agenda'
  | 'week'
  | 'day'
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
 */
export function resolveMergedTab(
  contextTab: CalendarContextTab,
  view: CalendarView,
): CalendarMergedTab {
  if (contextTab === 'feed' || contextTab === 'agenda') {
    if (view === 'week' || view === 'day') return view;
    return contextTab === 'agenda' ? 'agenda' : 'feed';
  }
  if (contextTab === 'month') return 'month';
  if (contextTab === 'events') return 'events';
  if (contextTab === 'schedule') return 'schedule';
  if (contextTab === 'booking') return 'booking';
  if (contextTab === 'quantmeet') return 'quantmeet';
  if (contextTab === 'reminders') return 'reminders';
  return contextTab;
}

/**
 * Pure: the (contextTab, view) pair a merged tab selection must produce.
 */
export function mergedTabTargets(tab: CalendarMergedTab): {
  contextTab: CalendarContextTab;
  view: CalendarView;
} {
  switch (tab) {
    case 'feed':
      return { contextTab: 'feed', view: 'agenda' };
    case 'events':
      return { contextTab: 'events', view: 'agenda' };
    case 'schedule':
      return { contextTab: 'schedule', view: 'agenda' };
    case 'month':
      return { contextTab: 'month', view: 'month' };
    case 'week':
      return { contextTab: 'agenda', view: 'week' };
    case 'day':
      return { contextTab: 'agenda', view: 'day' };
    case 'agenda':
      return { contextTab: 'agenda', view: 'agenda' };
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

function EventsTrackerIcon({ className }: { className?: string }) {
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

function ScheduleClockIcon({ className }: { className?: string }) {
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
  feed: AgendaIcon,
  month: MonthIcon,
  events: EventsTrackerIcon,
  schedule: ScheduleClockIcon,
  agenda: AgendaIcon,
  week: WeekIcon,
  day: DayIcon,
  booking: BookingIcon,
  quantmeet: QuantMeetIcon,
  reminders: RemindersIcon,
};

const MERGED_TABS: ReadonlyArray<{ key: CalendarMergedTab; label: string; isLegacy?: boolean }> = [
  { key: 'feed', label: 'Feed' },
  { key: 'month', label: 'Month' },
  { key: 'events', label: 'Events' },
  { key: 'schedule', label: 'Schedule' },
  // Legacy merged tabs supported for backward compatibility with existing tests and deep links
  { key: 'agenda', label: 'Agenda', isLegacy: true },
  { key: 'week', label: 'Week', isLegacy: true },
  { key: 'day', label: 'Day', isLegacy: true },
  { key: 'booking', label: 'Booking', isLegacy: true },
  { key: 'quantmeet', label: 'QuantMeet', isLegacy: true },
  { key: 'reminders', label: 'Reminders', isLegacy: true },
];

export function CalendarContextSubTabs({
  activeTab,
  onSelectTab,
  className = '',
}: CalendarContextSubTabsProps) {
  return (
    <nav
      className={`border-b border-[#232938] bg-[#0c0c10] px-4 py-1.5 hidden md:flex items-center justify-between gap-2 overflow-x-auto no-scrollbar select-none ${className}`}
      aria-label="Calendar views"
      role="tablist"
    >
      <div className="flex items-center gap-1.5 min-w-max">
        {MERGED_TABS.map((tab) => {
          const isActive =
            activeTab === tab.key ||
            (tab.key === 'feed' && activeTab === 'agenda') ||
            (tab.key === 'schedule' &&
              (activeTab === 'reminders' || activeTab === 'booking' || activeTab === 'quantmeet'));
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
              className={`${tab.isLegacy ? 'hidden' : 'flex'} items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] ${
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
