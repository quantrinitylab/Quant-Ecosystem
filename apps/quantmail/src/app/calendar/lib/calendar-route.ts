import type { CalendarContextTab, CalendarView } from '../types';

const CONTEXT_TABS: ReadonlySet<string> = new Set<CalendarContextTab>([
  'feed',
  'month',
  'events',
  'schedule',
  'agenda',
  'booking',
  'quantmeet',
  'reminders',
]);

/**
 * The (contextTab, view) a `?tab=` value opens. No/unknown tab opens the
 * real Day view — the approved structure (2026-10-09) is Day · Week · Month,
 * and the bottom nav already highlighted "Day" for a bare /calendar while
 * the page rendered the multi-day feed underneath it.
 */
export function calendarRouteForTab(tab: string | null | undefined): {
  contextTab: CalendarContextTab;
  view: CalendarView;
} {
  if (tab === 'week') return { contextTab: 'agenda', view: 'week' };
  if (tab === 'month') return { contextTab: 'month', view: 'month' };
  if (tab && tab !== 'day' && CONTEXT_TABS.has(tab)) {
    return { contextTab: tab as CalendarContextTab, view: 'agenda' };
  }
  return { contextTab: 'agenda', view: 'day' };
}
