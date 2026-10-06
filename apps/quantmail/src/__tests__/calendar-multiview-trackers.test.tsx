import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Components & Config under test
import {
  PILLAR_SUB_CONFIGS,
  resolveActiveTab,
} from '../components/ContextBottomNavBar';
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
  // 1. CALENDAR SUB-TABS CONFIGURATION (ContextBottomNavBar.tsx)
  // ==========================================================================
  describe('1. Calendar Sub-Tabs Configuration', () => {
    it('configures exactly the 4 required calendar sub-tabs', () => {
      const calConfig = PILLAR_SUB_CONFIGS.calendar;
      expect(calConfig).toBeDefined();
      expect(calConfig.tabs).toHaveLength(4);

      const tabIds = calConfig.tabs.map((t) => t.id);
      expect(tabIds).toEqual(['feed', 'month', 'events', 'schedule']);

      const tabLabels = calConfig.tabs.map((t) => t.label);
      expect(tabLabels).toEqual(['Feed', 'Month', 'Events', 'Schedule']);
    });

    it('matches exact specifications for Feed, Month, Events, and Schedule tabs', () => {
      const tabs = PILLAR_SUB_CONFIGS.calendar.tabs;

      // 1. Feed
      expect(tabs[0]).toMatchObject({
        id: 'feed',
        label: 'Feed',
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'feed' },
        description: 'Upcoming events, milestones & tracker dates',
      });

      // 2. Month
      expect(tabs[1]).toMatchObject({
        id: 'month',
        label: 'Month',
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'month' },
        description: 'Continuous scroll month calendar',
      });

      // 3. Events
      expect(tabs[2]).toMatchObject({
        id: 'events',
        label: 'Events',
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'events' },
        description: 'Trackers hub: Period, Health & Life trackers',
      });

      // 4. Schedule
      expect(tabs[3]).toMatchObject({
        id: 'schedule',
        label: 'Schedule',
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'schedule' },
        description: 'Meetings, Clock & Reminders',
      });
    });

    it('resolveActiveTab resolves feed, month, events, schedule and legacy routes correctly', () => {
      // feed or default -> feed
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=feed'))).toBe('feed');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams(''))).toBe('feed');
      expect(resolveActiveTab('calendar', '/calendar', null)).toBe('feed');

      // month -> month
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=month'))).toBe('month');

      // events -> events
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=events'))).toBe('events');

      // schedule or reminders or booking or quantmeet -> schedule
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=schedule'))).toBe('schedule');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=reminders'))).toBe('schedule');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=booking'))).toBe('schedule');
      expect(resolveActiveTab('calendar', '/calendar', new URLSearchParams('tab=quantmeet'))).toBe('schedule');
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

      // Contains live dual timezone pill
      expect(html).toContain('IST');
      expect(html).toContain('PST');
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
      it('renders chronological date feed with upcoming meetings, tasks, and tracker milestones', () => {
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
        expect(html).toContain('Milestone');
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

        expect(html).toContain('IST');
        expect(html).toContain('PST');
        expect(html).toContain('EST');
        expect(html).toContain('GMT');
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
});
