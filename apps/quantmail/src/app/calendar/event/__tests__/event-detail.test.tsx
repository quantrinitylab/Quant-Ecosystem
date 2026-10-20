// @vitest-environment jsdom
// ============================================================================
// Calendar event-detail page — RSVP widget gating + edit timezone (lane-1
// QM-SCREEN-009 fix).
//
// Renders the REAL page with the data layer mocked at the hook boundary:
//
//   * "Your response" RSVP buttons render only when the backend DTO says
//     viewerIsAttendee — otherwise the button always 403s, so the affordance
//     itself was wrong.
//   * The inline edit form seeds its wall-clock inputs in the event's own
//     timezone, offers a timezone selector (TIMEZONES), and PUTs the chosen
//     timezone — saving an event stored in another zone must not move it.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion's useReducedMotion (used by Skeleton) reads matchMedia, which
// jsdom does not implement. The shim is a test-environment concern, not product
// behaviour: reduced-motion is off so skeletons render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// The page-under-test reads this at render time, so tests set it before
// rendering. (vitest only allows `mock`-prefixed names inside mock factories.)
let mockEvent: Record<string, unknown> | null = null;
const mockUpdateMutate = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'e1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('../../../../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));

vi.mock('../../../../hooks/useCalendarEvent', () => ({
  useCalendarEvent: () => ({
    data: mockEvent,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useRsvpEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../../hooks/useCalendar', () => ({
  useUpdateEvent: () => ({ mutateAsync: mockUpdateMutate, isPending: false }),
  useDeleteEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Static import: the page module is compiled once at collection time (its
// graph is heavy — shared-ui/framer-motion), and the hook mocks above read
// `mockEvent` lazily at render time, so per-test fixtures still apply.
import CalendarEventDetailPage from '../[id]/page';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function baseEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    title: 'Design review',
    description: 'agenda lives in the doc',
    startTime: '2026-10-11T10:00:00.000Z',
    endTime: '2026-10-11T11:00:00.000Z',
    allDay: false,
    location: '',
    status: 'confirmed',
    timeZone: 'America/New_York',
    attendees: [{ email: 'me@quantmail.in', name: 'Me', status: 'accepted' }],
    reminders: [],
    recurrence: null,
    ...over,
  };
}

function renderPage(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<CalendarEventDetailPage />);
  });
  return host!;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function clickAsync(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
  mockEvent = null;
  mockUpdateMutate.mockClear();
  mockRefetch.mockClear();
});

describe('RSVP widget gating', () => {
  it('hides "Your response" when the viewer is not an attendee', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    expect(el.textContent).not.toContain('Your response');
    expect(el.querySelector('[aria-label="Respond Accepted"]')).toBeNull();
  });

  it('hides "Your response" when the DTO carries no viewer flag', async () => {
    mockEvent = baseEvent();
    const el = renderPage();
    expect(el.textContent).not.toContain('Your response');
  });

  it('shows "Your response" when the viewer is an attendee', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: true });
    const el = renderPage();
    expect(el.textContent).toContain('Your response');
    expect(el.querySelector('[aria-label="Respond Accepted"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Respond Maybe"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Respond Declined"]')).not.toBeNull();
  });
});

describe('edit/delete gating for invited guests', () => {
  // The backend now lets a non-owner attendee read the detail (read-only).
  // The page must not offer them Edit/Delete: PUT/DELETE stay owner-only, so
  // the buttons would only 404.
  it('hides Edit and Delete when the viewer is not the owner', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: true, viewerIsOwner: false });
    const el = renderPage();
    expect(el.querySelector('[aria-label="Edit event"]')).toBeNull();
    expect(el.querySelector('[aria-label="Delete event"]')).toBeNull();
    // The guest still sees the event and their RSVP widget.
    expect(el.textContent).toContain('Your response');
  });

  it('shows Edit and Delete when the viewer is the owner', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false, viewerIsOwner: true });
    const el = renderPage();
    expect(el.querySelector('[aria-label="Edit event"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Delete event"]')).not.toBeNull();
  });

  it('shows Edit and Delete when the DTO carries no owner flag', async () => {
    // Back-compat: an older/partial DTO keeps the pre-existing behaviour.
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    expect(el.querySelector('[aria-label="Edit event"]')).not.toBeNull();
  });
});

describe('edit form timezone', () => {
  it('seeds wall-clock inputs and the selector in the event timezone', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    click(el.querySelector('[aria-label="Edit event"]')!);

    // Stored 10:00Z in America/New_York is 06:00 wall time — NOT the browser's
    // local rendering of the same instant.
    const start = el.querySelector('[aria-label="Event start"]') as HTMLInputElement;
    const end = el.querySelector('[aria-label="Event end"]') as HTMLInputElement;
    expect(start.value).toBe('2026-10-11T06:00');
    expect(end.value).toBe('2026-10-11T07:00');
    const tz = el.querySelector('[aria-label="Event time zone"]') as HTMLSelectElement;
    expect(tz.value).toBe('America/New_York');
  });

  it('saving without changes preserves the stored instant and sends the timezone', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    click(el.querySelector('[aria-label="Edit event"]')!);

    // The primary button in the edit panel is "Save changes". The event has a
    // guest, so the save asks "Send update to guests?" first (Gmail parity).
    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    )!;
    await clickAsync(save);
    expect(el.textContent).toContain('Send update to guests?');

    // "Don't send" completes the save without the guest email.
    const dontSend = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes("Don't send"),
    )!;
    await clickAsync(dontSend);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const payload = mockUpdateMutate.mock.calls[0]![0] as {
      id: string;
      data: Record<string, unknown>;
    };
    expect(payload.id).toBe('e1');
    // No silent shift: the stored instant survives a no-op edit.
    expect(payload.data.startTime).toBe('2026-10-11T10:00:00.000Z');
    expect(payload.data.endTime).toBe('2026-10-11T11:00:00.000Z');
    expect(payload.data.timezone).toBe('America/New_York');
    // The user chose not to notify: no sendUpdate flag on the PUT.
    expect(payload.data.sendUpdate).toBeUndefined();
  });

  it('sending the update passes sendUpdate: true on the PUT', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    click(el.querySelector('[aria-label="Edit event"]')!);

    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    )!;
    await clickAsync(save);
    const sendUpdate = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Send update'),
    )!;
    await clickAsync(sendUpdate);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const payload = mockUpdateMutate.mock.calls[0]![0] as {
      id: string;
      data: Record<string, unknown>;
    };
    expect(payload.data.sendUpdate).toBe(true);
  });

  it('an event with no guests saves without the prompt', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false, attendees: [] });
    const el = renderPage();
    click(el.querySelector('[aria-label="Edit event"]')!);

    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    )!;
    await clickAsync(save);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('Send update to guests?');
  });

  it('switching the timezone keeps the same instant', async () => {
    mockEvent = baseEvent({ viewerIsAttendee: false });
    const el = renderPage();
    click(el.querySelector('[aria-label="Edit event"]')!);

    const tz = el.querySelector('[aria-label="Event time zone"]') as HTMLSelectElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!
        .set!;
      setter.call(tz, 'Asia/Kolkata');
      tz.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Same instant (10:00Z), re-rendered as Kolkata wall time.
    const start = el.querySelector('[aria-label="Event start"]') as HTMLInputElement;
    expect(start.value).toBe('2026-10-11T15:30');
    expect((el.querySelector('[aria-label="Event time zone"]') as HTMLSelectElement).value).toBe(
      'Asia/Kolkata',
    );
  });
});

describe('attendee list dividers', () => {
  // User-locked rule: pure-black, no divider lines. The attendee list must be
  // spacing-only rows — a `divide-y` regressing here shows a visible divider
  // line between every attendee row.
  it('renders attendee rows with spacing only, no divide-* divider classes', () => {
    mockEvent = baseEvent({
      viewerIsAttendee: false,
      attendees: [
        { email: 'a@quantmail.in', name: 'Alice', status: 'accepted' },
        { email: 'b@quantmail.in', name: 'Bob', status: 'tentative' },
        { email: 'c@quantmail.in', status: 'declined' },
      ],
    });
    const el = renderPage();
    const section = Array.from(el.querySelectorAll('section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes('Attendees'),
    )!;
    const ul = section.querySelector('ul')!;
    const classes = ul.className.split(/\s+/);
    expect(classes.some((c) => c.startsWith('divide-'))).toBe(false);
    expect(classes).toContain('space-y-1');
    // All three attendees still render as rows.
    expect(ul.querySelectorAll('li').length).toBe(3);
    expect(ul.textContent).toContain('Alice');
    expect(ul.textContent).toContain('b@quantmail.in');
  });
});
