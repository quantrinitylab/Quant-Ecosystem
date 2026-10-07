// @vitest-environment node
// ============================================================================
// K10 / M09 — Calendar event-detail screen: sections render from the real
// backend DTO; loading, error, and not-found states are all covered.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'evt-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="sidebar" />,
}));

const mockUseCalendarEvent = vi.fn();
const mockUseRsvpEvent = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));
const mockUseUpdateEvent = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));
const mockUseDeleteEvent = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('../hooks/useCalendarEvent', () => ({
  useCalendarEvent: () => mockUseCalendarEvent(),
  useRsvpEvent: () => mockUseRsvpEvent(),
}));

vi.mock('../hooks/useCalendar', () => ({
  useUpdateEvent: () => mockUseUpdateEvent(),
  useDeleteEvent: () => mockUseDeleteEvent(),
}));

import CalendarEventDetailPage from '../app/calendar/event/[id]/page';

const EVENT = {
  id: 'evt-1',
  title: 'Design review',
  description: 'Walk through the new inbox.',
  startTime: '2026-10-08T09:00:00.000Z',
  endTime: '2026-10-08T10:00:00.000Z',
  allDay: false,
  location: 'https://meet.quantmail.in/abc',
  status: 'confirmed',
  timeZone: 'UTC',
  attendees: [
    { email: 'ada@x.co', name: 'Ada', status: 'accepted' },
    { email: 'bob@x.co', name: '', status: 'pending' },
  ],
  reminders: ['30 minutes before'],
  recurrence: 'FREQ=WEEKLY',
};

function loaded(event: unknown) {
  mockUseCalendarEvent.mockReturnValue({
    data: event,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('Calendar event-detail screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the event sections from the backend DTO', () => {
    loaded(EVENT);
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('Design review');
    expect(html).toContain('When');
    expect(html).toContain('Where');
    expect(html).toContain('Join meeting');
    expect(html).toContain('Attendees (2)');
    expect(html).toContain('Ada');
    expect(html).toContain('bob@x.co');
    expect(html).toContain('Accepted');
    expect(html).toContain('No response');
    expect(html).toContain('Recurrence');
    expect(html).toContain('Weekly');
    expect(html).toContain('Reminders');
    expect(html).toContain('30 minutes before');
    expect(html).toContain('Description');
  });

  it('renders RSVP actions and edit/delete controls', () => {
    loaded(EVENT);
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('Your response');
    expect(html).toContain('Maybe');
    expect(html).toContain('Edit');
    expect(html).toContain('Delete event');
  });

  it('shows a plain location when it is not a URL', () => {
    loaded({ ...EVENT, location: 'Room 4B' });
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('Room 4B');
    expect(html).not.toContain('Join meeting');
  });

  it('says just-you when there are no attendees', () => {
    loaded({ ...EVENT, attendees: [] });
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('No attendees — just you.');
  });

  it('renders an honest not-found state instead of a fake event', () => {
    loaded(null);
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('Event not found');
    expect(html).not.toContain('Design review');
  });

  it('renders an error state with retry when the backend fails', () => {
    mockUseCalendarEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('backend down'),
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('backend down');
  });

  it('renders skeletons while loading', () => {
    mockUseCalendarEvent.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<CalendarEventDetailPage />);
    expect(html).toContain('Loading event');
  });
});
