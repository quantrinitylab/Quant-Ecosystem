// @vitest-environment jsdom
// ============================================================================
// Calendar — real Day view (default /calendar) + route defaults + copy helpers.
//
// The approved structure is Day · Week · Month. Before this change a bare
// /calendar highlighted "Day" in the bottom nav while rendering the
// multi-day feed. These tests render the REAL CalendarDayView and drive its
// REAL buttons: day stepping, the Mon–Sun strip, event rows ("Now" badge),
// the honest "Free day" empty state and the loading state (which must never
// claim a day is free before events have loaded).
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarDayView, eventsForDay } from '../app/calendar/components/CalendarDayView';
import { calendarRouteForTab } from '../app/calendar/lib/calendar-route';
import { plural, durationLabel, attendeeIdentity } from '../app/calendar/lib/calendar-copy';
import type { CalendarEventLike } from '../app/calendar/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Tuesday 13 Oct 2026, 10:30 local.
const NOW = new Date(2026, 9, 13, 10, 30);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

function ev(over: Partial<CalendarEventLike>): CalendarEventLike {
  return { id: 'e', title: 'Event', startTime: at(13, 9), endTime: at(13, 10), ...over };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
  return host;
}

function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  act(() => (el as HTMLElement).click());
}

const byLabel = (container: Element, label: string) =>
  container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

function renderDay(props: Partial<React.ComponentProps<typeof CalendarDayView>> = {}) {
  const handlers = {
    onSelectDate: vi.fn(),
    openDedicatedSheet: vi.fn(),
    onSelectEvent: vi.fn(),
  };
  const container = render(
    <CalendarDayView
      events={[]}
      selectedDate={new Date(2026, 9, 13)}
      {...handlers}
      {...props}
    />,
  );
  return { container, ...handlers };
}

describe('eventsForDay', () => {
  it('keeps events that start on or span the day, all-day first, then by start', () => {
    const list = [
      ev({ id: 'late', title: 'Late', startTime: at(13, 15), endTime: at(13, 16) }),
      ev({ id: 'early', title: 'Early', startTime: at(13, 8), endTime: at(13, 9) }),
      ev({ id: 'span', title: 'Overnight', startTime: at(12, 22), endTime: at(13, 2) }),
      ev({ id: 'allday', title: 'Offsite', startTime: at(13, 0), endTime: at(14, 0), allDay: true }),
      ev({ id: 'other', title: 'Tomorrow', startTime: at(14, 9), endTime: at(14, 10) }),
      ev({ id: 'bad', title: 'Broken', startTime: 'not-a-date', endTime: 'nope' }),
    ];
    expect(eventsForDay(list, new Date(2026, 9, 13)).map((e) => e.id)).toEqual([
      'allday',
      'span',
      'early',
      'late',
    ]);
  });
});

describe('CalendarDayView', () => {
  it('titles the day and summarises it relative to today', () => {
    const { container } = renderDay({
      events: [ev({ id: 'a' }), ev({ id: 'b', startTime: at(13, 14), endTime: at(13, 15) })],
    });
    expect(container.querySelector('[data-testid="calendar-day-title"]')?.textContent).toBe('Tuesday, Oct 13');
    expect(container.querySelector('[data-testid="calendar-day-summary"]')?.textContent).toBe('Today · 2 events');
    expect(container.querySelector('#subview-day')?.getAttribute('role')).toBe('tabpanel');
  });

  it('shows an honest "Free day" empty state whose CTA opens the event sheet for that day', () => {
    const { container, openDedicatedSheet } = renderDay();
    const empty = container.querySelector('[data-testid="calendar-day-empty"]');
    expect(empty?.textContent).toContain('Free day');
    const add = Array.from(empty!.querySelectorAll('button')).find((b) => b.textContent?.includes('Add event'));
    click(add);
    expect(openDedicatedSheet).toHaveBeenCalledTimes(1);
    const [type, date] = openDedicatedSheet.mock.calls[0]!;
    expect(type).toBe('event');
    expect((date as Date).getDate()).toBe(13);
  });

  it('never claims "Free day" while the first load is pending', () => {
    const { container } = renderDay({ isLoading: true });
    expect(container.querySelector('[data-testid="calendar-day-loading"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="calendar-day-empty"]')).toBeNull();
  });

  it('renders event rows, marks the one in progress as Now, and opens an event on click', () => {
    const current = ev({ id: 'now', title: 'QA sync', startTime: at(13, 10), endTime: at(13, 11) });
    const later = ev({ id: 'later', title: 'Design review', startTime: at(13, 14), endTime: at(13, 15) });
    const { container, onSelectEvent } = renderDay({ events: [later, current] });
    const rows = Array.from(container.querySelectorAll('[data-testid="calendar-day-event"]'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('aria-label')).toMatch(/^QA sync, .*happening now$/);
    expect(rows[0]!.getAttribute('data-now')).toBe('true');
    expect(rows[1]!.getAttribute('data-now')).toBeNull();
    click(rows[1]);
    expect(onSelectEvent).toHaveBeenCalledWith(later);
  });

  it('steps one day back / forward with 44px controls', () => {
    const { container, onSelectDate } = renderDay();
    const prev = byLabel(container, 'Previous day');
    const next = byLabel(container, 'Next day');
    expect(prev?.className).toContain('size-11');
    expect(next?.className).toContain('size-11');
    click(prev);
    click(next);
    expect((onSelectDate.mock.calls[0]![0] as Date).getDate()).toBe(12);
    expect((onSelectDate.mock.calls[1]![0] as Date).getDate()).toBe(14);
  });

  it('selects a day from the Mon–Sun strip and marks today / the selection', () => {
    const { container, onSelectDate } = renderDay({
      events: [ev({ id: 'w', startTime: at(14, 9), endTime: at(14, 10) })],
    });
    const strip = container.querySelector('[data-testid="calendar-day-strip"]')!;
    const buttons = Array.from(strip.querySelectorAll('button'));
    expect(buttons).toHaveLength(7);
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Monday, October 12');
    const today = buttons.find((b) => b.getAttribute('aria-current') === 'date');
    expect(today?.getAttribute('aria-pressed')).toBe('true');
    const wed = buttons.find((b) => b.getAttribute('aria-label') === 'Wednesday, October 14, 1 event');
    click(wed);
    expect((onSelectDate.mock.calls[0]![0] as Date).getDate()).toBe(14);
  });
});

describe('calendarRouteForTab', () => {
  it('opens the real Day view for a bare /calendar, ?tab=day and unknown tabs', () => {
    for (const tab of [null, undefined, '', 'day', 'bogus']) {
      expect(calendarRouteForTab(tab)).toEqual({ contextTab: 'agenda', view: 'day' });
    }
  });

  it('maps week / month / context tabs', () => {
    expect(calendarRouteForTab('week')).toEqual({ contextTab: 'agenda', view: 'week' });
    expect(calendarRouteForTab('month')).toEqual({ contextTab: 'month', view: 'month' });
    expect(calendarRouteForTab('feed')).toEqual({ contextTab: 'feed', view: 'agenda' });
    expect(calendarRouteForTab('schedule')).toEqual({ contextTab: 'schedule', view: 'agenda' });
  });
});

describe('calendar copy helpers', () => {
  it('pluralises counts', () => {
    expect(plural(1, 'event')).toBe('1 event');
    expect(plural(2, 'event')).toBe('2 events');
    expect(plural(0, 'entry', 'entries')).toBe('0 entries');
  });

  it('formats durations without seconds', () => {
    const s = new Date(2026, 9, 13, 10, 0);
    expect(durationLabel(s, new Date(2026, 9, 13, 10, 30))).toBe('30 min');
    expect(durationLabel(s, new Date(2026, 9, 13, 11, 0))).toBe('1 hr');
    expect(durationLabel(s, new Date(2026, 9, 13, 12, 15))).toBe('2 hrs 15 min');
    expect(durationLabel(s, s)).toBe('');
  });

  it('normalises backend attendee DTO objects and plain emails', () => {
    expect(attendeeIdentity({ email: 'priya@quantmail.in', name: 'Priya Peer', status: 'accepted' })).toMatchObject({
      email: 'priya@quantmail.in',
      label: 'Priya Peer',
      initials: 'PP',
    });
    expect(attendeeIdentity('sam@quantmail.in')?.email).toBe('sam@quantmail.in');
    expect(attendeeIdentity(null)).toBeNull();
  });
});
