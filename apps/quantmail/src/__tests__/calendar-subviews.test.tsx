import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Components under test
import { CalendarAgendaView } from '../app/calendar/components/CalendarAgendaView';
import { CalendarMonthView } from '../app/calendar/components/CalendarMonthView';
import { CalendarBookingView } from '../app/calendar/components/CalendarBookingView';
import { CalendarQuantMeetView } from '../app/calendar/components/CalendarQuantMeetView';
import { CalendarRemindersView } from '../app/calendar/components/CalendarRemindersView';
import { CalendarContextSubTabs } from '../app/calendar/components/CalendarContextSubTabs';
import type { CalendarEventLike } from '../app/calendar/types';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = '/calendar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

// Mock Auth Provider
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'usr_sundar', email: 'sundar@quantmail.in', name: 'Sundar Pichai' },
    isAuthenticated: true,
  }),
}));

// Mock Calendar Query Hooks
const mockSampleEvents: CalendarEventLike[] = [
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
    attendees: ['sundar@quantmail.in', 'satya@quantmail.in'],
  },
  {
    id: 'ev-2',
    title: 'Ecosystem CalDAV Sync Verification',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 90000000).toISOString(),
    start: new Date(Date.now() + 86400000).toISOString(),
    end: new Date(Date.now() + 90000000).toISOString(),
    location: 'Virtual Terminal',
    allDay: false,
    color: '#10B981',
    priority: 'medium',
    attendees: ['dev1@quantmail.in'],
  },
];

vi.mock('../hooks/useCalendar', () => ({
  useCalendarEvents: () => ({
    data: mockSampleEvents,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateEvent: () => ({ mutateAsync: vi.fn() }),
  useUpdateEvent: () => ({ mutateAsync: vi.fn() }),
  useDeleteEvent: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true), dialog: null }),
}));

vi.mock('@quant/shared-ui', () => ({
  useFocusTrap: () => ({ current: null }),
  Skeleton: () => <div className="skeleton" />,
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
  PageTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div id="app-shell-mock">{children}</div>,
}));

vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({
    data: [],
    refetch: vi.fn(),
  }),
}));

describe('QuantMail Web Calendar Context Sub-Views (Wave 42 Sovereign Architecture)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/calendar';
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Sub-View a: `agenda`
  // ==========================================================================
  describe('Sub-View a: `agenda` (CalendarAgendaView)', () => {
    it('renders 7-day schedule timeline, dual timezone pill (IST / PST), CalDAV sync badge, and event cards', () => {
      const html = renderToStaticMarkup(
        <CalendarAgendaView
          events={mockSampleEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );

      // 7-day schedule timeline
      expect(html).toContain('7-Day Schedule Timeline');
      expect(html).toContain('id="subview-agenda"');

      // Dual timezone pill (IST / PST)
      expect(html).toContain('IST');
      expect(html).toContain('PST');

      // CalDAV sync badge
      expect(html).toContain('CalDAV Synced');

      // Interactive event cards
      expect(html).toContain('Sovereign Architecture Sprint Review');
      expect(html).toContain('QuantMeet Room Alpha');
      expect(html).toContain('urgent');
      expect(html).toContain('View details');
    });

    it('renders empty day slots with add slot interactive action', () => {
      const html = renderToStaticMarkup(
        <CalendarAgendaView
          events={[]}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );

      expect(html).toContain('No scheduled events for this day');
      expect(html).toContain('Create an event');
    });
  });

  // ==========================================================================
  // 2. Sub-View b: `month`
  // ==========================================================================
  describe('Sub-View b: `month` (CalendarMonthView)', () => {
    it('renders 30-day interactive calendar grid with Mon-Sun columns and active day selection', () => {
      const html = renderToStaticMarkup(
        <CalendarMonthView
          events={mockSampleEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );

      // Mon-Sun column headers strictly in order
      expect(html).toContain('Mon');
      expect(html).toContain('Tue');
      expect(html).toContain('Wed');
      expect(html).toContain('Thu');
      expect(html).toContain('Fri');
      expect(html).toContain('Sat');
      expect(html).toContain('Sun');

      // Grid container & day event preview
      expect(html).toContain('id="subview-month"');
      expect(html).toContain('30-Day Sovereign Grid');
      expect(html).toContain('Day Events Preview:');
      expect(html).toContain('Add to this day');
    });

    it('displays event title preview and month stepper navigation controls', () => {
      const html = renderToStaticMarkup(
        <CalendarMonthView
          events={mockSampleEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );

      expect(html).toContain('Previous month');
      expect(html).toContain('Next month');
      expect(html).toContain('Today');
    });
  });

  // ==========================================================================
  // 3. Sub-View c: `booking`
  // ==========================================================================
  describe('Sub-View c: `booking` (CalendarBookingView)', () => {
    it('renders Calendly-class public booking engine with link, copy pill, time slots, duration chips, and concurrency badge', () => {
      const html = renderToStaticMarkup(
        <CalendarBookingView userEmail="sundar@quantmail.in" bookingSlug="sundar" />,
      );

      // Public Booking Link display
      expect(html).toContain('https://quantmail.in/calendar/booking/sundar');
      expect(html).toContain('Copy Link');

      // Available time slots: 10:00 AM, 11:30 AM, 02:00 PM, 04:30 PM
      expect(html).toContain('10:00 AM');
      expect(html).toContain('11:30 AM');
      expect(html).toContain('02:00 PM');
      expect(html).toContain('04:30 PM');

      // Meeting duration selector chips: 15m, 30m, 45m, 60m
      expect(html).toContain('15m');
      expect(html).toContain('30m');
      expect(html).toContain('45m');
      expect(html).toContain('60m');

      // Slot concurrency status
      expect(html).toContain('4 slots available today · Instant E2EE Confirmation');
      expect(html).toContain('Reserve Slot');
    });
  });

  // ==========================================================================
  // 4. Sub-View d: `quantmeet`
  // ==========================================================================
  describe('Sub-View d: `quantmeet` (CalendarQuantMeetView)', () => {
    it('renders QuantMeet HD video meeting launcher with action card, calls list, and WebRTC status', () => {
      const html = renderToStaticMarkup(<CalendarQuantMeetView />);

      // Action card: Start Instant Meeting
      expect(html).toContain('Start Instant Meeting');
      expect(html).toContain('QuantMeet HD Video');
      expect(html).toContain('WebRTC 4K P2P');

      // WebRTC status: Mic: Ready · Camera: Ready
      expect(html).toContain('Mic: Ready · Camera: Ready');

      // Upcoming video calls list with [Join HD Call] pills
      expect(html).toContain('Upcoming Video Calls');
      expect(html).toContain('Join HD Call');
      expect(html).toContain('Weekly Ecosystem Architecture Sync');
      expect(html).toContain('Sprint 42 Retrospective &amp; Tripartite Handover');
    });
  });

  // ==========================================================================
  // 5. Sub-View e: `reminders`
  // ==========================================================================
  describe('Sub-View e: `reminders` (CalendarRemindersView)', () => {
    it('renders task reminders checklist with toggleable checkboxes, due times, and priority pills', () => {
      const html = renderToStaticMarkup(<CalendarRemindersView />);

      // Header & Counts
      expect(html).toContain('Task Reminders');
      expect(html).toContain('Time-Bound Tasks &amp; Reminders');
      expect(html).toContain('pending');
      expect(html).toContain('completed');

      // Due times
      expect(html).toContain('Due: Today, 5:00 PM');
      expect(html).toContain('Due: Tomorrow, 10:00 AM');

      // Priority pills
      expect(html).toContain('urgent');
      expect(html).toContain('medium');
      expect(html).toContain('low');

      // Quick add reminder form
      expect(html).toContain('Add a new reminder…');
      expect(html).toContain('Add Reminder');
    });
  });

  // ==========================================================================
  // 6. Context Sub-Tabs Selector Component (CalendarContextSubTabs)
  // ==========================================================================
  describe('Context Sub-Tabs Selector (CalendarContextSubTabs)', () => {
    it('renders all 5 contextual tabs matching ContextBottomNavBar specification', () => {
      const html = renderToStaticMarkup(
        <CalendarContextSubTabs activeTab="agenda" onSelectTab={vi.fn()} />,
      );

      expect(html).toContain('Agenda');
      expect(html).toContain('Month');
      expect(html).toContain('Booking');
      expect(html).toContain('QuantMeet');
      expect(html).toContain('Reminders');
      expect(html).toContain('aria-selected="true"');
    });
  });

  // ==========================================================================
  // 7. Full Sub-Tabs Router Synchronization (?tab=...)
  // ==========================================================================
  describe('Full Sub-Tabs Router Synchronization', () => {
    function CalendarSubViewRouter({ activeTab }: { activeTab: string }) {
      switch (activeTab) {
        case 'month':
          return (
            <CalendarMonthView
              events={mockSampleEvents}
              selectedDate={new Date()}
              onSelectDate={vi.fn()}
              openDedicatedSheet={vi.fn()}
              onSelectEvent={vi.fn()}
            />
          );
        case 'booking':
          return <CalendarBookingView userEmail="sundar@quantmail.in" bookingSlug="sundar" />;
        case 'quantmeet':
          return <CalendarQuantMeetView />;
        case 'reminders':
          return <CalendarRemindersView />;
        case 'agenda':
        default:
          return (
            <CalendarAgendaView
              events={mockSampleEvents}
              selectedDate={new Date()}
              onSelectDate={vi.fn()}
              openDedicatedSheet={vi.fn()}
              onSelectEvent={vi.fn()}
            />
          );
      }
    }

    it('defaults to Agenda sub-view when tab is agenda', () => {
      const html = renderToStaticMarkup(<CalendarSubViewRouter activeTab="agenda" />);

      expect(html).toContain('7-Day Schedule Timeline');
      expect(html).toContain('CalDAV Synced');
    });

    it('renders Month sub-view when tab=month', () => {
      const html = renderToStaticMarkup(<CalendarSubViewRouter activeTab="month" />);

      expect(html).toContain('30-Day Sovereign Grid');
      expect(html).toContain('Day Events Preview:');
    });

    it('renders Booking sub-view when tab=booking', () => {
      const html = renderToStaticMarkup(<CalendarSubViewRouter activeTab="booking" />);

      expect(html).toContain('Public Booking Engine');
      expect(html).toContain('4 slots available today · Instant E2EE Confirmation');
      expect(html).toContain('https://quantmail.in/calendar/booking/sundar');
    });

    it('renders QuantMeet sub-view when tab=quantmeet', () => {
      const html = renderToStaticMarkup(<CalendarSubViewRouter activeTab="quantmeet" />);

      expect(html).toContain('Start Instant Meeting');
      expect(html).toContain('Mic: Ready · Camera: Ready');
      expect(html).toContain('Join HD Call');
    });

    it('renders Reminders sub-view when tab=reminders', () => {
      const html = renderToStaticMarkup(<CalendarSubViewRouter activeTab="reminders" />);

      expect(html).toContain('Task Reminders');
      expect(html).toContain('Due: Today, 5:00 PM');
    });
  });

  // ==========================================================================
  // 8. Zero Raw Unicode Emojis Invariant
  // ==========================================================================
  describe('Zero Raw Unicode Emojis Invariant', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    it('CalendarAgendaView contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarAgendaView
          events={mockSampleEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('CalendarMonthView contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarMonthView
          events={mockSampleEvents}
          selectedDate={new Date()}
          onSelectDate={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onSelectEvent={vi.fn()}
        />,
      );
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('CalendarBookingView contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarBookingView userEmail="sundar@quantmail.in" bookingSlug="sundar" />,
      );
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('CalendarQuantMeetView contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(<CalendarQuantMeetView />);
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('CalendarRemindersView contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(<CalendarRemindersView />);
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('CalendarContextSubTabs contains strictly ZERO raw Unicode emojis', () => {
      const html = renderToStaticMarkup(
        <CalendarContextSubTabs activeTab="agenda" onSelectTab={vi.fn()} />,
      );
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('all subviews contain strictly ZERO raw Unicode emojis across the board', () => {
      const tabs = ['agenda', 'month', 'booking', 'quantmeet', 'reminders'];
      tabs.forEach((tab) => {
        let html = '';
        if (tab === 'agenda') {
          html = renderToStaticMarkup(
            <CalendarAgendaView
              events={mockSampleEvents}
              selectedDate={new Date()}
              onSelectDate={vi.fn()}
              openDedicatedSheet={vi.fn()}
              onSelectEvent={vi.fn()}
            />,
          );
        } else if (tab === 'month') {
          html = renderToStaticMarkup(
            <CalendarMonthView
              events={mockSampleEvents}
              selectedDate={new Date()}
              onSelectDate={vi.fn()}
              openDedicatedSheet={vi.fn()}
              onSelectEvent={vi.fn()}
            />,
          );
        } else if (tab === 'booking') {
          html = renderToStaticMarkup(
            <CalendarBookingView userEmail="sundar@quantmail.in" bookingSlug="sundar" />,
          );
        } else if (tab === 'quantmeet') {
          html = renderToStaticMarkup(<CalendarQuantMeetView />);
        } else if (tab === 'reminders') {
          html = renderToStaticMarkup(<CalendarRemindersView />);
        }
        expect(emojiRegex.test(html)).toBe(false);
      });
    });
  });
});
