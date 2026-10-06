import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  CalendarWeekView,
  weekStartOf,
  minutesToTop,
  minutesToTimeLabel,
  layoutDayEvents,
  WEEK_HOUR_HEIGHT,
} from '../app/calendar/components/CalendarWeekView';
import type { CalendarEventLike } from '../app/calendar/types';

const noop = () => {};

function makeEvent(over: Partial<CalendarEventLike> = {}): CalendarEventLike {
  return {
    id: 'ev-test',
    title: 'Test Event',
    startTime: new Date(2026, 9, 7, 10, 0).toISOString(),
    endTime: new Date(2026, 9, 7, 11, 0).toISOString(),
    ...over,
  };
}

describe('weekStartOf', () => {
  it('returns Monday for a Wednesday input (default Monday-first)', () => {
    // 2026-10-07 is a Wednesday
    const start = weekStartOf(new Date(2026, 9, 7));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(5);
  });

  it('returns Sunday for Sunday-first mode', () => {
    const start = weekStartOf(new Date(2026, 9, 7), 0);
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(4);
  });

  it('returns the same day when input is already the week start', () => {
    const monday = new Date(2026, 9, 5); // Monday
    const start = weekStartOf(monday);
    expect(start.getDate()).toBe(5);
    expect(start.getMonth()).toBe(9);
  });
});

describe('minutesToTop / minutesToTimeLabel', () => {
  it('maps 60 minutes to one hour height', () => {
    expect(minutesToTop(60)).toBe(WEEK_HOUR_HEIGHT);
    expect(minutesToTop(0)).toBe(0);
    expect(minutesToTop(90)).toBe(WEEK_HOUR_HEIGHT * 1.5);
  });

  it('formats labels as HH:MM', () => {
    expect(minutesToTimeLabel(0)).toBe('00:00');
    expect(minutesToTimeLabel(630)).toBe('10:30');
    expect(minutesToTimeLabel(1439)).toBe('23:59');
  });
});

describe('layoutDayEvents', () => {
  it('places non-overlapping events in a single column', () => {
    const ev1 = makeEvent({ id: 'a' });
    const ev2 = makeEvent({ id: 'b', startTime: new Date(2026, 9, 7, 12, 0).toISOString(), endTime: new Date(2026, 9, 7, 13, 0).toISOString() });
    const out = layoutDayEvents([
      { event: ev1, startMin: 600, endMin: 660 },
      { event: ev2, startMin: 720, endMin: 780 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].col).toBe(0);
    expect(out[1].col).toBe(0);
    expect(out[0].colCount).toBe(1);
  });

  it('places overlapping events side-by-side', () => {
    const ev1 = makeEvent({ id: 'a' });
    const ev2 = makeEvent({ id: 'b' });
    const out = layoutDayEvents([
      { event: ev1, startMin: 600, endMin: 660 },
      { event: ev2, startMin: 630, endMin: 690 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].col).toBe(0);
    expect(out[1].col).toBe(1);
    expect(out[0].colCount).toBe(2);
    expect(out[1].colCount).toBe(2);
  });

  it('handles three-way overlap', () => {
    const mk = (id: string) => makeEvent({ id });
    const out = layoutDayEvents([
      { event: mk('a'), startMin: 600, endMin: 700 },
      { event: mk('b'), startMin: 620, endMin: 680 },
      { event: mk('c'), startMin: 640, endMin: 720 },
    ]);
    expect(out.every((p) => p.colCount === 3)).toBe(true);
    const cols = out.map((p) => p.col).sort();
    expect(cols).toEqual([0, 1, 2]);
  });

  it('resets columns after a gap (separate clusters)', () => {
    const mk = (id: string) => makeEvent({ id });
    const out = layoutDayEvents([
      { event: mk('a'), startMin: 600, endMin: 660 },
      { event: mk('b'), startMin: 620, endMin: 680 },
      { event: mk('c'), startMin: 900, endMin: 960 },
    ]);
    const c = out.find((p) => p.event.id === 'c')!;
    expect(c.col).toBe(0);
    expect(c.colCount).toBe(1);
  });

  it('computes top/height from minutes', () => {
    const out = layoutDayEvents([{ event: makeEvent(), startMin: 600, endMin: 660 }]);
    expect(out[0].top).toBe(minutesToTop(600));
    expect(out[0].height).toBe(minutesToTop(60));
  });
});

describe('CalendarWeekView', () => {
  const baseProps = {
    events: [] as CalendarEventLike[],
    selectedDate: new Date(2026, 9, 7), // Wednesday
    onSelectDate: noop,
    openDedicatedSheet: noop as any,
    onSelectEvent: noop,
  };

  it('renders 7 day headers Monday-first by default', () => {
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} />);
    expect(html).toContain('data-testid="calendar-week-view"');
    for (let i = 0; i < 7; i++) {
      expect(html).toContain(`week-day-header-${i}`);
    }
    // Monday 2026-10-05 .. Sunday 2026-10-11
    expect(html).toContain('Oct 5 – 11, 2026');
  });

  it('renders 24 hour rows in the grid body', () => {
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} />);
    expect(html).toContain('week-grid-body');
    // 7 day columns
    for (let i = 0; i < 7; i++) {
      expect(html).toContain(`week-day-column-${i}`);
    }
  });

  it('positions a timed event at the correct offset', () => {
    const ev = makeEvent({
      id: 'ev-10am',
      title: 'Morning Sync',
      startTime: new Date(2026, 9, 7, 10, 0).toISOString(),
      endTime: new Date(2026, 9, 7, 11, 30).toISOString(),
      color: '#3FB950',
    });
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} events={[ev]} />);
    expect(html).toContain('week-event-ev-10am');
    expect(html).toContain('Morning Sync');
    // 10:00 -> top = 10 * 56 = 560
    expect(html).toContain('top:561px');
  });

  it('renders all-day events in the all-day row, not the grid', () => {
    const ev = makeEvent({
      id: 'ev-allday',
      title: 'Holiday Break',
      allDay: true,
    });
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} events={[ev]} />);
    expect(html).toContain('Holiday Break');
    expect(html).not.toContain('week-event-ev-allday');
  });

  it('highlights today in the day headers', () => {
    const now = new Date();
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} selectedDate={now} />);
    // Today circle uses the accent background class
    expect(html).toContain('bg-[#F59E0B] text-black');
  });

  it('shows a current-time line in the today column', () => {
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} />);
    expect(html).toContain('week-now-line');
  });

  it('renders toolbar with prev/next/today controls and range label', () => {
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} />);
    expect(html).toContain('data-testid="week-prev"');
    expect(html).toContain('data-testid="week-next"');
    expect(html).toContain('data-testid="week-today"');
    expect(html).toContain('week-range-label');
  });

  it('supports Sunday-first ordering', () => {
    const html = renderToStaticMarkup(<CalendarWeekView {...baseProps} weekStartsOn={0} />);
    // Sunday 2026-10-04 .. Saturday 2026-10-10
    expect(html).toContain('Oct 4 – 10, 2026');
  });
});
