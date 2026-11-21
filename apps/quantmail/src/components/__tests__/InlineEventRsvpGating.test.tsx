// @vitest-environment jsdom
// ============================================================================
// Inline RSVP — METHOD:REQUEST gating + rerender-immediate-click contract
// (fix/qm-inline-rsvp-v4, CODEX follow-up).
//
// The card may ONLY appear for a genuine METHOD:REQUEST invitation whose
// UID maps to a QuantMail event the viewer is invited to. Every other
// shape — CANCEL, REPLY, PUBLISH, a missing METHOD, a foreign-calendar
// UID, unreadable ICS bytes, an attachment with no byte source, the
// organizer's own sent copy, a non-attendee viewer, a missing event —
// must render NO chips, never a fake RSVP affordance.
//
// These are live-container tests (jsdom + createRoot + act), not SSR:
// the byte-loading effect runs for real against `data:` ICS URLs, and
// the calendar/RSVP hooks are the only mocks (the backend itself is
// covered by the event-page contract; no live DB exists in this VM).
//
// The rerender test mounts with one invitation, rerenders with a
// DIFFERENT invitation, and clicks a chip IMMEDIATELY on the new card's
// first render — no extra tick/wait — proving the click handler is bound
// to the current invitation (no stale handler, no stale event id).
// ============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InlineEventRsvp } from '../InlineEventRsvp';
import type { Email } from '../../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const state = vi.hoisted(() => ({
  events: {} as Record<string, Record<string, unknown> | undefined>,
  calls: [] as Array<{ id: string; status: string }>,
  deferred: null as { promise: Promise<unknown>; resolve: (value: unknown) => void } | null,
}));

vi.mock('../../hooks/useCalendarEvent', () => ({
  useCalendarEvent: (id: string | null) => ({
    data: id ? state.events[id] : undefined,
  }),
  useRsvpEvent: () => ({
    isPending: false,
    mutateAsync: async ({ id, status }: { id: string; status: string }) => {
      state.calls.push({ id, status });
      if (state.deferred) return state.deferred.promise;
      return {};
    },
  }),
}));

const VIEWER = 'bob@quantmail.in';

function icsText(method: string | null, uid: string): string {
  const methodLine = method === null ? '' : `METHOD:${method}\r\n`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuantMail//Calendar//EN',
    methodLine,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20261018T120000Z',
    'DTSTART:20261024T100000Z',
    'DTEND:20261024T110000Z',
    'SUMMARY:Team sync',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function dataUrl(text: string): string {
  return `data:text/calendar;base64,${Buffer.from(text, 'utf-8').toString('base64')}`;
}

function messageWithIcs(id: string, method: string | null, uid: string): Email {
  return {
    id,
    attachments: [
      { filename: 'invite.ics', mimeType: 'text/calendar', url: dataUrl(icsText(method, uid)), id: null },
    ],
  } as unknown as Email;
}

function eventFixture(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: id === 'evt_B' ? 'Beta sync' : 'Alpha sync',
    startTime: '2026-10-24T10:00:00.000Z',
    endTime: '2026-10-24T11:00:00.000Z',
    allDay: false,
    isAllDay: false,
    location: 'Room 4B',
    timeZone: 'UTC',
    recurrence: null,
    viewerIsAttendee: true,
    viewerIsOwner: false,
    attendees: [{ email: VIEWER, rsvp: 'pending' }],
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(ui: React.ReactNode): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root!.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

function rerender(ui: React.ReactNode): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root!.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

async function flush(): Promise<void> {
  // The ICS byte load is a promise chain (decode -> parse -> setState);
  // a few microtask rounds inside act flush it without any timer/wait.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function chipLabels(): string[] {
  if (!container) return [];
  return [...container.querySelectorAll('button')].map(
    (b) => (b.textContent ?? '').trim(),
  );
}

function buttonByLabel(label: string): HTMLButtonElement {
  const found = [...(container as HTMLDivElement).querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!found) throw new Error(`button "${label}" not found; rendered: ${container?.innerHTML}`);
  return found as HTMLButtonElement;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  state.events = {};
  state.calls = [];
  state.deferred = null;
});

describe('InlineEventRsvp container gating (no chips unless genuine REQUEST)', () => {
  it('shows Yes / No / Maybe for a genuine METHOD:REQUEST invitation to an attendee', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual(['Yes', 'No', 'Maybe']);
    expect(container?.textContent).toContain('Alpha sync');
  });

  it('renders no chips for METHOD:CANCEL', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'CANCEL', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips for METHOD:REPLY (an attendee reply is not an invitation to answer)', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REPLY', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips for METHOD:PUBLISH and for a missing METHOD', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'PUBLISH', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
    if (root) act(() => root!.unmount());
    container?.remove();
    state.events['evt_A'] = eventFixture('evt_A');
    mount(<InlineEventRsvp message={messageWithIcs('m2', null, 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips for a foreign-calendar UID', async () => {
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'xyz789@google.com')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips for unreadable ICS bytes (bad base64) and for no byte source', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    const badBase64 = {
      id: 'm1',
      attachments: [
        { filename: 'invite.ics', mimeType: 'text/calendar', url: 'data:text/calendar;base64,!!!not-base64!!!', id: null },
      ],
    } as unknown as Email;
    mount(<InlineEventRsvp message={badBase64} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
    if (root) act(() => root!.unmount());
    container?.remove();
    const noSource = {
      id: 'm2',
      attachments: [{ filename: 'invite.ics', mimeType: 'text/calendar', url: null, id: null }],
    } as unknown as Email;
    mount(<InlineEventRsvp message={noSource} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it("renders no chips for the organizer's own sent copy (viewerIsOwner)", async () => {
    state.events['evt_A'] = eventFixture('evt_A', { viewerIsOwner: true });
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips for a non-attendee viewer', async () => {
    state.events['evt_A'] = eventFixture('evt_A', { viewerIsAttendee: false });
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });

  it('renders no chips when the event does not resolve (missing event)', async () => {
    // state.events intentionally left empty: GET returns nothing.
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual([]);
  });
});

describe('InlineEventRsvp rerender (no stale handler, no stale event id)', () => {
  it('clicks the CURRENT invitation immediately after rerender — POST goes to the new event only', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    state.events['evt_B'] = eventFixture('evt_B');
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(chipLabels()).toEqual(['Yes', 'No', 'Maybe']);
    expect(container?.textContent).toContain('Alpha sync');

    // Rerender the SAME component slot with a different invitation, then
    // click IMMEDIATELY on the new card's first render: no extra tick,
    // no waitFor, no polling — the handler must already be bound to B.
    rerender(<InlineEventRsvp message={messageWithIcs('m2', 'REQUEST', 'evt_B@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(container?.textContent).toContain('Beta sync');
    expect(chipLabels()).toEqual(['Yes', 'No', 'Maybe']);
    act(() => {
      buttonByLabel('Yes').click();
    });
    // The POST is recorded synchronously by the click (no await after it).
    expect(state.calls).toEqual([{ id: 'evt_B', status: 'accepted' }]);
    // Let the POST settle: its confirmation must land on B's card too.
    await flush();
    expect(container?.textContent).toContain('Accepted — recorded for this event.');
  });

  it('a previous invitation’s late-settling RSVP never paints onto the new card', async () => {
    state.events['evt_A'] = eventFixture('evt_A');
    state.events['evt_B'] = eventFixture('evt_B');
    let resolveA!: (value: unknown) => void;
    state.deferred = {
      promise: new Promise<unknown>((resolve) => {
        resolveA = resolve;
      }),
      resolve: resolveA,
    };
    mount(<InlineEventRsvp message={messageWithIcs('m1', 'REQUEST', 'evt_A@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    act(() => {
      buttonByLabel('Yes').click();
    });
    expect(state.calls).toEqual([{ id: 'evt_A', status: 'accepted' }]);

    // Move on to invitation B while A's POST is still in flight, then let
    // A's POST settle. B's card must show no confirmation from A's click.
    rerender(<InlineEventRsvp message={messageWithIcs('m2', 'REQUEST', 'evt_B@quantmail.in')} viewerEmail={VIEWER} />);
    await flush();
    expect(container?.textContent).toContain('Beta sync');
    await act(async () => {
      resolveA({});
    });
    await flush();
    expect(container?.textContent).toContain('Beta sync');
    expect(container?.textContent).not.toContain('Accepted — recorded');
    expect(container?.querySelector('[role="alert"]')).toBeNull();
    expect(state.calls).toEqual([{ id: 'evt_A', status: 'accepted' }]);
  });
});
