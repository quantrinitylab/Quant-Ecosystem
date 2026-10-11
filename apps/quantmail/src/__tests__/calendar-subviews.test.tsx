import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Components under test
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
    color: 'var(--quant-warning)',
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
  // 2. Sub-View: `quantmeet`
  // ==========================================================================
  describe('Sub-View: `quantmeet` (CalendarQuantMeetView)', () => {
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
  // 3. Sub-View: `reminders`
  // ==========================================================================
  describe('Sub-View: `reminders` (CalendarRemindersView)', () => {
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
  // 4. Context Sub-Tabs Selector Component (CalendarContextSubTabs)
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
  // 5. Zero Raw Unicode Emojis Invariant
  // ==========================================================================
  describe('Zero Raw Unicode Emojis Invariant', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

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

  });

  // ==========================================================================
  // 6. Orphan-removal guard: CalendarBookingView stays deleted
  //    (fake hardcoded booking flow was removed; regression = it creeping back)
  // ==========================================================================
  describe('Orphan-removal guard: CalendarBookingView', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const componentsDir = join(thisDir, '..', 'app', 'calendar', 'components');
    const srcDir = join(thisDir, '..');

    function walkSourceFiles(dir: string, acc: string[] = []): string[] {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          // Skip test directories — they legitimately discuss removed views.
          if (entry === '__tests__') continue;
          walkSourceFiles(full, acc);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
          acc.push(full);
        }
      }
      return acc;
    }

    it('CalendarBookingView.tsx file does not exist', () => {
      expect(existsSync(join(componentsDir, 'CalendarBookingView.tsx'))).toBe(false);
    });

    it('no source file (outside __tests__) imports or references CalendarBookingView', () => {
      const offenders = walkSourceFiles(srcDir).filter((file) => {
        const content = readFileSync(file, 'utf8');
        return /CalendarBookingView/.test(content);
      });
      expect(offenders).toEqual([]);
    });
  });
});
