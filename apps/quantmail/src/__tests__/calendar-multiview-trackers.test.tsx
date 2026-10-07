import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Components & Config under test: the calendar's OWN merged tab engine
// (the shell's old ContextBottomNavBar was removed — its helpers are gone).
import {
  resolveMergedTab,
  mergedTabTargets,
} from '../app/calendar/components/CalendarContextSubTabs';
import { CalendarHeader } from '../app/calendar/components/CalendarHeader';
import {
  CalendarFeedSubView,
  CalendarMonthSubView,
  CalendarTrackersSubView,
  CalendarScheduleSubView,
} from '../components/CalendarSubViews';
import type { CalendarEventLike } from '../app/calendar/types';

// Mock sample events
const mockEvents: CalendarEventLike[] = [
  {
    id: 'ev-1',
    title: 'Sovereign Architecture Sprint Review',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
    location: 'QuantMeet Room Alpha',
    allDay: false,
    color: '#F59E0B',
    priority: 'urgent',
    attendees: ['sundar@quantmail.in'],
  },
  {
    id: 'ev-2',
    title: 'CalDAV Protocol Verification Task',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    start: new Date(Date.now() + 86400000).toISOString(),
    end: new Date(Date.now() + 90000000).toISOString(),
    location: 'Virtual Lab',
    allDay: false,
    type: 'task',
    color: '#10B981',
    priority: 'medium',
  },
];

const mockHolidays = {
  [new Date().toISOString().slice(0, 10)]: [
    { name: 'Sovereign Independence Day', date: new Date().toISOString().slice(0, 10) },
  ],
};

// Strict emoji detection regex: checks for Unicode emojis, symbols, and pictographs
const RAW_EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

describe('QuantCalendar Multi-View & Trackers Suite', () => {
  // ==========================================================================
  // 1. CALENDAR SUB-TABS CONFIGURATION (CalendarContextSubTabs.tsx)
  //
  // The shell's old ContextBottomNavBar config was removed; the calendar's
  // sub-tabs are owned by its own merged tab engine now. These tests pin the
  // engine's contract: (contextTab, view) <-> single merged tab.
  // ==========================================================================
  describe('1. Calendar Sub-Tabs Configuration', () => {
    it('resolveMergedTab collapses (contextTab, view) pairs to one merged tab', () => {
      expect(resolveMergedTab('feed', 'agenda')).toBe('feed');
      expect(resolveMergedTab('agenda', 'agenda')).toBe('agenda');
      expect(resolveMergedTab('month', 'month')).toBe('month');
      expect(resolveMergedTab('events', 'agenda')).toBe('events');
      expect(resolveMergedTab('schedule', 'agenda')).toBe('schedule');
      expect(resolveMergedTab('booking', 'agenda')).toBe('booking');
      expect(resolveMergedTab('quantmeet', 'agenda')).toBe('quantmeet');
      expect(resolveMergedTab('reminders', 'agenda')).toBe('reminders');
    });

    it('resolveMergedTab merges the agenda context with the week/day grid views', () => {
      expect(resolveMergedTab('agenda', 'week')).toBe('week');
      expect(resolveMergedTab('agenda', 'day')).toBe('day');
      expect(resolveMergedTab('feed', 'week')).toBe('week');
    });

    it('mergedTabTargets maps every merged tab back to its (contextTab, view) pair', () => {
      expect(mergedTabTargets('feed')).toEqual({ contextTab: 'feed', view: 'agenda' });
      expect(mergedTabTargets('month')).toEqual({ contextTab: 'month', view: 'month' });
      expect(mergedTabTargets('week')).toEqual({ contextTab: 'agenda', view: 'week' });
      expect(mergedTabTargets('events')).toEqual({ contextTab: 'events', view: 'agenda' });
      expect(mergedTabTargets('schedule')).toEqual({ contextTab: 'schedule', view: 'agenda' });
      expect(mergedTabTargets('booking')).toEqual({ contextTab: 'booking', view: 'agenda' });
      expect(mergedTabTargets('quantmeet')).toEqual({ contextTab: 'quantmeet', view: 'agenda' });
      expect(mergedTabTargets('reminders')).toEqual({ contextTab: 'reminders', view: 'agenda' });
    });

    it('mergedTabTargets round-trips through resolveMergedTab', () => {
      const tabs = ['feed', 'month', 'week', 'events', 'schedule', 'agenda', 'day', 'booking', 'quantmeet', 'reminders'] as const;
      for (const tab of tabs) {
        const { contextTab, view } = mergedTabTargets(tab);
        expect(resolveMergedTab(contextTab, view)).toBe(tab);
      }
    });
  });


  // ==========================================================================
  // 2. HEADER & BUTTON CONSOLIDATION (CalendarHeader.tsx)
  // ==========================================================================
  describe('2. Header & Button Consolidation', () => {
    it('consolidates duplicate New Event buttons into a single sleek action button in top-right', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="October"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
        />,
      );

      // Desktop has "New Event"
      expect(html).toContain('New Event');

      // Verify no duplicate dropdown selects in the header
      expect(html).not.toContain('<select');
    });

    it('renders single clean live IST/PST pill and removes duplicate timezone displays', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="October"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
        />,
      );

      // Contains live dual timezone pill — Pacific code is DST-aware (PDT in Oct 2026, not hardcoded PST)
      expect(html).toContain('IST');
      expect(html).toMatch(/PD[TS]/);
      expect(html).toContain('Live Dual World Clocks');
    });

    it('collapses mobile header into clean 2-row layout', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="October"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onOpenBookingLinks={vi.fn()}
        />,
      );

      // Has md:hidden mobile container
      expect(html).toContain('md:hidden');
      // Has desktop container
      expect(html).toContain('hidden md:flex');
      // Contains Month, Year, Today in mobile row
      expect(html).toContain('October');
      expect(html).toContain('2026');
      expect(html).toContain('Today');
    });
  });

  // ==========================================================================
  // 3. THE 4 CALENDAR SUB-VIEWS (CalendarSubViews.tsx)
  // ==========================================================================
  describe('3. The 4 Calendar Sub-Views', () => {
    // ------------------------------------------------------------------------
    // Sub-View 1: Feed (CalendarFeedSubView)
    // ------------------------------------------------------------------------
    describe('Sub-View 1: Feed (CalendarFeedSubView)', () => {
      it('renders chronological date feed with upcoming meetings and tasks (no synthetic milestones)', () => {
        const html = renderToStaticMarkup(
          <CalendarFeedSubView
            events={mockEvents}
            holidaysByDay={mockHolidays as any}
            selectedDate={new Date()}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );

        expect(html).toContain('Chronological Feed');
        expect(html).toContain('Sovereign Architecture Sprint Review');
        expect(html).toContain('CalDAV Protocol Verification Task');
        // Synthetic feed milestones were removed — never fabricate them
        expect(html).not.toContain('Daily Wellness &amp; Steps Milestone');
        expect(html).not.toContain('Predicted Cycle Phase');
        expect(html).not.toContain('Quarterly Passport / Visa Audit');
      });

      it('renders filter pills for feed categories', () => {
        const html = renderToStaticMarkup(
          <CalendarFeedSubView
            events={mockEvents}
            selectedDate={new Date()}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );

        expect(html).toContain('All');
        expect(html).toContain('Meetings');
        expect(html).toContain('Tasks');
        expect(html).toContain('Trackers');
        expect(html).toContain('Holidays');
      });
    });

    // ------------------------------------------------------------------------
    // Sub-View 2: Month (CalendarMonthSubView)
    // ------------------------------------------------------------------------
    describe('Sub-View 2: Month (CalendarMonthSubView)', () => {
      it('renders continuous scroll calendar with week-by-week sliding navigation and active day highlight', () => {
        const html = renderToStaticMarkup(
          <CalendarMonthSubView
            events={mockEvents}
            selectedDate={new Date()}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );

        expect(html).toContain('Prev Week');
        expect(html).toContain('Next Week');
        expect(html).toContain('Selected Date Inspector');
        expect(html).toContain('Mon');
        expect(html).toContain('Sun');
      });
    });

    // ------------------------------------------------------------------------
    // Sub-View 3: Events & Trackers Hub (CalendarTrackersSubView)
    // ------------------------------------------------------------------------
    describe('Sub-View 3: Events & Trackers Hub (CalendarTrackersSubView)', () => {
      it('renders Period Tracker card with cycle prediction, fertile window, and discrete toggle', () => {
        const html = renderToStaticMarkup(
          <CalendarTrackersSubView
            events={mockEvents}
            openDedicatedSheet={vi.fn()}
          />,
        );

        expect(html).toContain('Period');
        expect(html).toContain('Cycle');
        expect(html).toContain('Discreet');
        expect(html).toContain('Fertile Window');
        expect(html).toContain('Log Cycle Symptoms');
      });

      it('renders Health Tracker card with sleep, water quick-log, and vitals', () => {
        const html = renderToStaticMarkup(
          <CalendarTrackersSubView
            events={mockEvents}
            openDedicatedSheet={vi.fn()}
          />,
        );

        expect(html).toContain('Health');
        expect(html).toContain('Vitals');
        expect(html).toContain('Water Intake');
        expect(html).toContain('Quick Log +250ml Water');
        expect(html).toContain('Sleep');
        expect(html).toContain('Resting HR');
      });

      it('renders Custom Life Event Tracker card with + Add Tracker button', () => {
        const html = renderToStaticMarkup(
          <CalendarTrackersSubView
            events={mockEvents}
            openDedicatedSheet={vi.fn()}
          />,
        );

        expect(html).toContain('Life Event Trackers');
        expect(html).toContain('+ Add Tracker');
        expect(html).toContain('Annual Full Body Health Checkup');
        expect(html).toContain('Passport');
      });
    });

    // ------------------------------------------------------------------------
    // Sub-View 4: Schedule (CalendarScheduleSubView)
    // ------------------------------------------------------------------------
    describe('Sub-View 4: Schedule (CalendarScheduleSubView)', () => {
      it('renders segmented sub-tabs for Clock and Reminders', () => {
        const html = renderToStaticMarkup(
          <CalendarScheduleSubView
            events={mockEvents}
            selectedDate={new Date()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );

        expect(html).toContain('Time Blocking');
        expect(html).toContain('Reminders');
      });

      it('renders live world clocks (IST, PST, EST, GMT) and hourly time blocking in Clock view', () => {
        const html = renderToStaticMarkup(
          <CalendarScheduleSubView
            events={mockEvents}
            selectedDate={new Date()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );

        // Zone codes are DST-aware (computed via Intl): Oct 2026 -> PDT/EDT,
        // Asia/Kolkata -> GMT+5:30 style code, London -> GMT+1 style code
        expect(html).toContain('IST');
        expect(html).toContain('UTC+5:30');
        expect(html).toContain('PDT');
        expect(html).toContain('EDT');
        expect(html).toContain('UTC+1');
        expect(html).toContain('Hourly Time Blocking Schedule');
      });
    });
  });

  // ==========================================================================
  // 4. INVARIANT: Strictly ZERO Raw Unicode Emojis
  // ==========================================================================
  describe('4. Invariant: Strictly ZERO raw Unicode emojis', () => {
    it('CalendarHeader contains zero emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="October"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
        />,
      );
      expect(RAW_EMOJI_REGEX.test(html)).toBe(false);
    });

    it('CalendarFeedSubView contains zero emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarFeedSubView
          events={mockEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );
      expect(RAW_EMOJI_REGEX.test(html)).toBe(false);
    });

    it('CalendarMonthSubView contains zero emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarMonthSubView
          events={mockEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );
      expect(RAW_EMOJI_REGEX.test(html)).toBe(false);
    });

    it('CalendarTrackersSubView contains zero emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarTrackersSubView
          events={mockEvents}
          openDedicatedSheet={vi.fn()}
        />,
      );
      expect(RAW_EMOJI_REGEX.test(html)).toBe(false);
    });

    it('CalendarScheduleSubView contains zero emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarScheduleSubView
          events={mockEvents}
          selectedDate={new Date()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );
      expect(RAW_EMOJI_REGEX.test(html)).toBe(false);
    });
  });

    // ------------------------------------------------------------------------
    // Regression: nav unification + drag-to-create + upcoming events
    // ------------------------------------------------------------------------
    describe('Calendar nav unification & drag-to-create (fix-calendar-nav-drag)', () => {
      it('month toolbar follows the controlled viewDate (single source of truth)', () => {
        const controlled = new Date(2026, 10, 1); // November 2026
        const html = renderToStaticMarkup(
          <CalendarMonthSubView
            events={mockEvents}
            selectedDate={new Date(2026, 9, 15)}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
            viewDate={controlled}
            onPrevMonth={vi.fn()}
            onNextMonth={vi.fn()}
            onGoToday={vi.fn()}
          />,
        );
        // Toolbar title must reflect the controlled month, not selectedDate's month
        expect(html).toContain('November');
        expect(html).toContain('2026');
      });

      it('falls back to internal month state when uncontrolled (back-compat)', () => {
        const html = renderToStaticMarkup(
          <CalendarMonthSubView
            events={mockEvents}
            selectedDate={new Date(2026, 9, 15)}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );
        expect(html).toContain('October');
      });

      it('exposes drag-to-create affordance: day cells carry data-day-key and a hint', () => {
        const html = renderToStaticMarkup(
          <CalendarMonthSubView
            events={mockEvents}
            selectedDate={new Date()}
            onSelectDate={vi.fn()}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );
        expect(html).toContain('data-day-key');
        expect(html).toContain('drag across days');
      });

      it('trackers view renders upcoming real calendar events', () => {
        const html = renderToStaticMarkup(
          <CalendarTrackersSubView
            events={mockEvents}
            openDedicatedSheet={vi.fn()}
            onSelectEvent={vi.fn()}
          />,
        );
        expect(html).toContain('Upcoming Events');
        expect(html).toContain('Sovereign Architecture Sprint Review');
      });
    });

});
