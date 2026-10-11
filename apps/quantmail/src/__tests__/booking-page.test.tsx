import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The booking surfaces call the same-origin Next proxy via @quant/api-client.
// Stub it so these component tests run without the full workspace install and
// so the backend-sync outcome is controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import PublicBookingPage from '../app/calendar/booking/[slug]/page';
import {
  applyBookingLinkResponse,
  generateIcsContent,
  generateGoogleCalendarUrl,
  resolveBookingFailureMessage,
  resolveLinkLoadFailure,
  resolveSlotsResponse,
} from '../app/calendar/booking/[slug]/booking-utils';
import {
  BookingLinksModal,
  slugify,
  parseStoredBookingLinks,
  persistBookingLinkToServer,
  type BookingLinkItem,
} from '../app/calendar/components/BookingLinksModal';
import { CalendarHeader } from '../app/calendar/components/CalendarHeader';

describe('QuantCalendar Calendly-Class Public Booking Engine (Tasks W39-CAL01 & W39-CAL02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Public Booking Page: Calendly-Class 2-Column Layout
  // --------------------------------------------------------------------------
  describe('PublicBookingPage Component (/calendar/booking/[slug])', () => {
    it('renders the completely public booking page with 2-column layout (no auth gate required)', () => {
      const html = renderToStaticMarkup(
        <PublicBookingPage params={Promise.resolve({ slug: '30-min-strategy-session' })} />,
      );

      // Verify Brand & Public Header
      expect(html).toContain('QuantCalendar');
      expect(html).toContain('Sovereign Booking');
      // No false end-to-end-encryption claims: booking POSTs plain JSON.
      expect(html).not.toContain('End-to-End Encrypted Scheduling');

      // Verify Left Column: Host Details & Meeting Metadata
      expect(html).toContain('Host');
      // No fabricated host identity: the seed is an honest unknown until the
      // backend booking-link record supplies the real host name/email.
      expect(html).toContain('Unknown host');
      expect(html).not.toContain('Kundan Singh');
      expect(html).not.toContain('kundan@quantmail.in');
      expect(html).toContain('30 Min Strategy Session');
      expect(html).toContain('30 min duration');
      expect(html).toContain('QuantMeet Video Call');
      expect(html).toContain('Your Timezone');
      expect(html).toContain('Asia/Kolkata');
      expect(html).toContain('Powered by');

      // Verify Right Column Step 1: Date & Time Picker
      expect(html).toContain('Select a Date &amp; Time');
      expect(html).toContain('Available Slots');
      expect(html).toContain('Sun');
      expect(html).toContain('Mon');
      expect(html).toContain('Tue');
      expect(html).toContain('Wed');
      expect(html).toContain('Thu');
      expect(html).toContain('Fri');
      expect(html).toContain('Sat');
    });

    it('renders with Promise-based params for Next.js 15 dynamic routing compatibility', () => {
      const promiseParams = Promise.resolve({ slug: '60-min-deep-dive' });
      const html = renderToStaticMarkup(<PublicBookingPage params={promiseParams} />);

      expect(html).toContain('QuantCalendar');
      expect(html).toContain('Select a Date &amp; Time');
    });

    it('renders multiple timezone options in the timezone selector', () => {
      const html = renderToStaticMarkup(
        <PublicBookingPage params={Promise.resolve({ slug: 'strategy-session' })} />,
      );

      expect(html).toContain('Asia/Kolkata');
      expect(html).toContain('UTC');
      expect(html).toContain('America/New_York');
      expect(html).toContain('Europe/London');
    });
  });

  // --------------------------------------------------------------------------
  // 1b. Host identity merge rules: real host from backend, never fabricated
  // --------------------------------------------------------------------------
  describe('applyBookingLinkResponse host identity rules', () => {
    const seed = {
      slug: 'strategy-session',
      title: '30 Min Strategy Session',
      description: 'One-on-one session.',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3, 4, 5],
      hostName: '',
      hostEmail: '',
    };

    it('merges the real host name/email from the backend booking-link record', () => {
      const merged = applyBookingLinkResponse(seed, {
        slug: 'strategy-session',
        title: 'Strategy Session',
        hostName: 'Priya Nair',
        hostEmail: 'priya.nair@quantmail.in',
      });

      expect(merged.hostName).toBe('Priya Nair');
      expect(merged.hostEmail).toBe('priya.nair@quantmail.in');
      expect(merged.title).toBe('Strategy Session');
    });

    it('leaves host identity honestly unknown when the backend omits it (never invents one)', () => {
      const merged = applyBookingLinkResponse(seed, {
        slug: 'strategy-session',
        title: 'Strategy Session',
        duration: 45,
      });

      expect(merged.hostName).toBe('');
      expect(merged.hostEmail).toBe('');
      expect(merged.hostName).not.toContain('Kundan');
      expect(merged.hostEmail).not.toContain('kundan');
    });

    it('returns the previous details untouched when the response is missing', () => {
      expect(applyBookingLinkResponse(seed, null)).toBe(seed);
      expect(applyBookingLinkResponse(seed, undefined)).toBe(seed);
    });
  });

  describe('generateIcsContent host honesty', () => {
    const baseEvent = {
      title: '30 Min Strategy Session',
      startTime: new Date('2026-09-30T10:00:00.000Z'),
      endTime: new Date('2026-09-30T10:30:00.000Z'),
      attendeeName: 'Sarah Connor',
      attendeeEmail: 'sarah@example.com',
    };

    it('omits the ORGANIZER line when the host identity is unknown (never fabricates)', () => {
      const ics = generateIcsContent({ ...baseEvent, hostName: '', hostEmail: '' });

      expect(ics).not.toContain('ORGANIZER');
      expect(ics).not.toContain('Kundan Singh');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Sarah Connor:mailto:sarah@example.com',
      );
    });

    it('emits the real organizer when the backend supplied a host identity', () => {
      const ics = generateIcsContent({
        ...baseEvent,
        hostName: 'Priya Nair',
        hostEmail: 'priya.nair@quantmail.in',
      });

      expect(ics).toContain('ORGANIZER;CN=Priya Nair:mailto:priya.nair@quantmail.in');
    });
  });

  // --------------------------------------------------------------------------
  // 2. RFC 5545 ICS Calendar Invite Engine & Google Calendar Deep Link
  // --------------------------------------------------------------------------
  describe('RFC 5545 ICS Engine & Google Calendar Deep Links', () => {
    const sampleEvent = {
      title: '30 Min Strategy Session',
      description: 'Discussing Quant Architecture Roadmap',
      startTime: new Date('2026-09-30T10:00:00.000Z'),
      endTime: new Date('2026-09-30T10:30:00.000Z'),
      hostName: 'Kundan Singh',
      hostEmail: 'kundan@quantmail.in',
      attendeeName: 'Sarah Connor',
      attendeeEmail: 'sarah@example.com',
      uid: 'quant-test-uuid-12345@quantmail.in',
    };

    it('generates fully RFC 5545 compliant VCALENDAR and VEVENT structure', () => {
      const ics = generateIcsContent(sampleEvent);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//Quant Ecosystem//QuantCalendar Public Booking Engine//EN');
      expect(ics).toContain('CALSCALE:GREGORIAN');
      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:quant-test-uuid-12345@quantmail.in');
      expect(ics).toContain('DTSTART:20260930T100000Z');
      expect(ics).toContain('DTEND:20260930T103000Z');
      expect(ics).toContain('SUMMARY:30 Min Strategy Session');
      expect(ics).toContain('DESCRIPTION:Discussing Quant Architecture Roadmap');
      expect(ics).toContain('STATUS:CONFIRMED');
      expect(ics).toContain('ORGANIZER;CN=Kundan Singh:mailto:kundan@quantmail.in');
      expect(ics).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Sarah Connor:mailto:sarah@example.com',
      );
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('generates valid Google Calendar deep link with proper URL encoding', () => {
      const gcalUrl = generateGoogleCalendarUrl({
        title: sampleEvent.title,
        description: sampleEvent.description,
        startTime: sampleEvent.startTime,
        endTime: sampleEvent.endTime,
      });

      expect(gcalUrl).toContain('https://calendar.google.com/calendar/render?');
      expect(gcalUrl).toContain('action=TEMPLATE');
      expect(gcalUrl).toContain('text=30+Min+Strategy+Session');
      expect(gcalUrl).toContain('dates=20260930T100000Z%2F20260930T103000Z');
      expect(gcalUrl).toContain('details=Discussing+Quant+Architecture+Roadmap');
      expect(gcalUrl).toContain('location=QuantMeet+Video+Call');
    });
  });

  // --------------------------------------------------------------------------
  // 2b. Honest booking-failure copy (fix/qm-booking-fake-confirm):
  // a failed booking POST must never render a fake "Booking Confirmed!"
  // --------------------------------------------------------------------------
  describe('resolveBookingFailureMessage (honest errors, no fake confirmation)', () => {
    it('maps 409 slot-taken to an honest pick-another-time message', () => {
      // No backend message: the status-mapped copy is used.
      const msg = resolveBookingFailureMessage(409);
      expect(msg).toContain('taken');
      expect(msg).toContain('another time');
    });

    it('prefers the real backend message when the server supplies one', () => {
      expect(resolveBookingFailureMessage(409, 'Slot is no longer available')).toBe(
        'Slot is no longer available',
      );
      expect(resolveBookingFailureMessage(404, 'Booking link not found')).toBe(
        'Booking link not found',
      );
      expect(resolveBookingFailureMessage(410, 'Booking link is inactive')).toBe(
        'Booking link is inactive',
      );
      expect(resolveBookingFailureMessage(400, 'Invalid booking slot')).toBe(
        'Invalid booking slot',
      );
    });

    it('falls back to honest status copy when the backend sends no message', () => {
      expect(resolveBookingFailureMessage(404)).toContain('no longer exists');
      expect(resolveBookingFailureMessage(410)).toContain('no longer active');
      expect(resolveBookingFailureMessage(400)).toContain('invalid');
      expect(resolveBookingFailureMessage(418)).toBe('Booking could not be completed. Please try again.');
    });

    it('rate-limits and server errors ask for a retry, never confirm', () => {
      expect(resolveBookingFailureMessage(429)).toContain('wait a moment');
      expect(resolveBookingFailureMessage(500)).toContain('try again');
      expect(resolveBookingFailureMessage(502)).toContain('try again');
      expect(resolveBookingFailureMessage(503)).toContain('try again');
    });

    it('network failure (status 0) is honest about connectivity', () => {
      const msg = resolveBookingFailureMessage(0);
      expect(msg).toContain('Could not reach');
      expect(msg).toContain('try again');
    });

    it('never contains any confirmation language', () => {
      for (const status of [0, 400, 404, 409, 410, 429, 500, 502, 503, 504, 418]) {
        const msg = resolveBookingFailureMessage(status).toLowerCase();
        expect(msg).not.toContain('confirmed');
        expect(msg).not.toContain('success');
        expect(msg).not.toContain('scheduled for you');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2c. Honest dead-link load states (fix/qm-booking-deadlink-details):
  // a 404/410/failed booking-link GET must surface an honest "link not
  // found / inactive" state — never the seeded details as if real, and a
  // network failure must never invent a meeting title from the URL slug.
  // --------------------------------------------------------------------------
  describe('resolveLinkLoadFailure (honest dead-link states, no invented details)', () => {
    it('maps 404 BOOKING_LINK_NOT_FOUND to the not-found state', () => {
      const { status, message } = resolveLinkLoadFailure(404);
      expect(status).toBe('not-found');
      expect(message).toContain('no longer exists');
    });

    it('maps 410 BOOKING_LINK_INACTIVE to the inactive state', () => {
      const { status, message } = resolveLinkLoadFailure(410);
      expect(status).toBe('inactive');
      expect(message).toContain('no longer active');
    });

    it('prefers the real backend message when the server supplies one', () => {
      expect(resolveLinkLoadFailure(404, 'Booking link not found').message).toBe(
        'Booking link not found',
      );
      expect(resolveLinkLoadFailure(410, 'Booking link is inactive').message).toBe(
        'Booking link is inactive',
      );
    });

    it('maps network failure (status 0) to an honest connectivity error', () => {
      const { status, message } = resolveLinkLoadFailure(0);
      expect(status).toBe('error');
      expect(message).toContain('Could not reach');
      expect(message).toContain('try again');
    });

    it('maps server errors and unknown statuses to an honest retry error', () => {
      expect(resolveLinkLoadFailure(500).status).toBe('error');
      expect(resolveLinkLoadFailure(500).message).toContain('try again');
      expect(resolveLinkLoadFailure(418).status).toBe('error');
      expect(resolveLinkLoadFailure(400).message).toContain('invalid');
      expect(resolveLinkLoadFailure(429).message).toContain('wait a moment');
    });

    it('never invents meeting details: the mapper takes no slug and returns no title', () => {
      // The signature is (status, serverMessage?) — there is no slug input,
      // so nothing can be derived from it, and no status returns a title.
      for (const status of [0, 400, 404, 410, 429, 500, 418]) {
        const { message } = resolveLinkLoadFailure(status);
        expect(message).not.toContain('Strategy Session');
        expect(message).not.toContain('min');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2d. Empty backend availability is authoritative (fix/qm-booking-fullybooked-slots):
  // { success: true, data: [] } must surface as the honest "no slots" state —
  // never fall through to client-side slot generation, which invents bookable
  // slots the backend then rejects at submit with 409 SLOT_UNAVAILABLE.
  // --------------------------------------------------------------------------
  describe('resolveSlotsResponse (empty backend availability is authoritative)', () => {
    const slotPayload = (start: string, available?: boolean) => ({
      start,
      end: '2026-10-12T10:30:00.000Z',
      ...(available === undefined ? {} : { available }),
    });

    it('treats an empty data array as authoritative — returns [] instead of null', () => {
      // Regression: the old `json.data.length > 0` guard fell through to
      // generateSlotsForDate and rendered invented bookable slots.
      expect(resolveSlotsResponse({ success: true, data: [] })).toEqual([]);
    });

    it('maps real slots with formatted labels and preserves available:false', () => {
      const slots = resolveSlotsResponse({
        success: true,
        data: [
          slotPayload('2026-10-12T09:00:00.000Z', true),
          slotPayload('2026-10-12T09:30:00.000Z', false),
        ],
      });

      expect(slots).toHaveLength(2);
      expect(slots![0].start).toBeInstanceOf(Date);
      expect(slots![0].end).toBeInstanceOf(Date);
      expect(slots![0].timeLabel).toMatch(/^\d{2}:\d{2} (AM|PM)$/);
      expect(slots![0].available).toBe(true);
      // Fully-booked date: backend marks every slot unavailable — honored,
      // never dropped or flipped to bookable.
      expect(slots![1].available).toBe(false);
    });

    it('defaults available to true when the backend omits the flag', () => {
      const slots = resolveSlotsResponse({
        success: true,
        data: [slotPayload('2026-10-12T09:00:00.000Z')],
      });

      expect(slots).toHaveLength(1);
      expect(slots![0].available).toBe(true);
    });

    it('returns null for non-authoritative payloads so the caller takes the failure path', () => {
      expect(resolveSlotsResponse({ success: false, data: [] })).toBeNull();
      expect(resolveSlotsResponse({ success: true })).toBeNull();
      expect(resolveSlotsResponse({ success: true, data: 'nope' })).toBeNull();
      expect(resolveSlotsResponse({ success: true, data: null })).toBeNull();
      expect(resolveSlotsResponse(null)).toBeNull();
      expect(resolveSlotsResponse(undefined)).toBeNull();
      expect(resolveSlotsResponse('garbage')).toBeNull();
    });
  });

  describe('applyBookingLinkResponse isActive merge (paused link = dead link)', () => {
    const seed = {
      slug: 'strategy-session',
      title: '30 Min Strategy Session',
      description: 'One-on-one session.',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3, 4, 5],
      hostName: '',
      hostEmail: '',
    };

    it('carries isActive=false through so the page can show the inactive state', () => {
      const merged = applyBookingLinkResponse(seed, { ...seed, isActive: false });
      expect(merged.isActive).toBe(false);
    });

    it('defaults isActive to true when the backend omits it (older payloads)', () => {
      const merged = applyBookingLinkResponse(seed, { ...seed });
      expect(merged.isActive).toBe(true);
    });
  });

  describe('PublicBookingPage initial render keeps the honest loading placeholder', () => {
    it('does not show a dead-link error state before the fetch resolves', () => {
      const html = renderToStaticMarkup(
        <PublicBookingPage params={Promise.resolve({ slug: 'dead-link-xyz' })} />,
      );

      // Seeded placeholder layout while loading (existing behaviour kept)…
      expect(html).toContain('Select a Date &amp; Time');
      // …but no dead-link error copy before any fetch result.
      expect(html).not.toContain('Booking link not found');
      expect(html).not.toContain('This booking link is inactive');
      expect(html).not.toContain("Couldn't load this booking link");
    });
  });

  // --------------------------------------------------------------------------
  // 3. BookingLinksModal Component (Host Manager)
  // --------------------------------------------------------------------------
  // NOTE (2026-10-11, fix/qm-bookinglinks-fake-data): this modal must NEVER
  // ship sample data. First load shows the honest "no links yet" empty state,
  // never the old seeded "30 Min Strategy Session" fakes, and the footer
  // shows the real signed-in email or an honest "Not signed in" — never a
  // hardcoded identity.
  describe('BookingLinksModal Component', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={false} onClose={vi.fn()} userEmail="qa-user@quantmail.in" />,
      );
      expect(html).toBe('');
    });

    it('shows the honest empty state on first load — no sample links, no hardcoded identity', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={true} onClose={vi.fn()} userEmail="qa-user@quantmail.in" />,
      );

      // Modal chrome renders
      expect(html).toContain('Booking Links');
      expect(html).toContain('Calendly Parity');
      expect(html).toContain('Active Links (0)');
      expect(html).toContain('+ Create New Link');

      // Honest empty state, not seeded fakes
      expect(html).toContain('No booking links created yet');
      expect(html).toContain('Create Your First Link');
      expect(html).not.toContain('30 Min Strategy Session');
      expect(html).not.toContain('15 Min Quick Sync');
      expect(html).not.toContain('60 Min Technical Deep Dive');

      // No hardcoded identity anywhere in the modal
      expect(html).not.toContain('kundan@quantmail.in');
      expect(html).not.toContain('Kundan Singh');
    });

    it('shows the real signed-in email in the footer', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={true} onClose={vi.fn()} userEmail="real.user@quantmail.in" />,
      );
      expect(html).toContain('Host:');
      expect(html).toContain('real.user@quantmail.in');
    });

    it('shows an honest "Not signed in" host label when no email is available', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={true} onClose={vi.fn()} />,
      );
      expect(html).toContain('Host:');
      expect(html).toContain('Not signed in');
      expect(html).not.toContain('kundan@quantmail.in');
    });

    it('correctly auto-slugifies meeting titles with slugify helper', () => {
      expect(slugify('30 Min Strategy Session')).toBe('30-min-strategy-session');
      expect(slugify('Product Architecture Review & Q&A')).toBe('product-architecture-review-qa');
      expect(slugify('  Live Pair-Programming Session!  ')).toBe('live-pair-programming-session');
      expect(slugify('QuantMail 2.0 Launch Sync')).toBe('quantmail-20-launch-sync');
      expect(slugify('Coffee & Catch-Up (15m)')).toBe('coffee-catch-up-15m');
    });
  });

  // --------------------------------------------------------------------------
  // 3b. Fake-data purge: parseStoredBookingLinks
  // --------------------------------------------------------------------------
  describe('parseStoredBookingLinks (seeded-fake purge + validation)', () => {
    const seededSample = JSON.stringify([
      {
        id: 'link-30-min',
        slug: '30-min-strategy-session',
        title: '30 Min Strategy Session',
        duration: 30,
        startHour: 9,
        endHour: 17,
        availableDays: [1, 2, 3, 4, 5],
        isActive: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'link-15-min',
        slug: '15-min-quick-sync',
        title: '15 Min Quick Sync',
        duration: 15,
        startHour: 10,
        endHour: 16,
        availableDays: [1, 2, 3, 4, 5],
        isActive: true,
        createdAt: '2026-09-05T00:00:00.000Z',
      },
      {
        id: 'link-60-min',
        slug: '60-min-deep-dive',
        title: '60 Min Technical Deep Dive',
        duration: 60,
        startHour: 9,
        endHour: 18,
        availableDays: [1, 2, 3, 4, 5],
        isActive: true,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ]);

    const userLink: BookingLinkItem = {
      id: 'link-1729000000000-abc12',
      slug: 'my-real-meeting',
      title: 'My Real Meeting',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3],
      isActive: true,
      createdAt: '2026-10-11T00:00:00.000Z',
    };

    it('strips the exact seeded sample links persisted by the old version', () => {
      expect(parseStoredBookingLinks(seededSample)).toEqual([]);
    });

    it('keeps user-created links while purging seeded samples from a mixed store', () => {
      const mixed = JSON.stringify([userLink, ...JSON.parse(seededSample)]);
      const result = parseStoredBookingLinks(mixed);
      expect(result).toEqual([userLink]);
    });

    it('returns [] for missing, corrupt, or non-array stored values', () => {
      expect(parseStoredBookingLinks(null)).toEqual([]);
      expect(parseStoredBookingLinks(undefined)).toEqual([]);
      expect(parseStoredBookingLinks('')).toEqual([]);
      expect(parseStoredBookingLinks('not-json{{{')).toEqual([]);
      expect(parseStoredBookingLinks(JSON.stringify({ not: 'an array' }))).toEqual([]);
      expect(parseStoredBookingLinks(JSON.stringify(['a-string-not-an-object']))).toEqual([]);
    });

    it('does not drop a user link that merely shares a title with a sample', () => {
      // Same title, but a real created id/slug — must survive the purge.
      const lookalike: BookingLinkItem = {
        ...userLink,
        title: '30 Min Strategy Session',
        slug: '30-min-strategy-session-custom',
      };
      expect(parseStoredBookingLinks(JSON.stringify([lookalike]))).toEqual([lookalike]);
    });
  });

  // --------------------------------------------------------------------------
  // 3c. Honest backend sync: persistBookingLinkToServer
  // --------------------------------------------------------------------------
  describe('persistBookingLinkToServer (honest sync result)', () => {
    const link: BookingLinkItem = {
      id: 'link-1729000000000-abc12',
      slug: 'my-real-meeting',
      title: 'My Real Meeting',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3],
      isActive: true,
      createdAt: '2026-10-11T00:00:00.000Z',
    };

    beforeEach(() => {
      vi.mocked(apiFetchRaw).mockReset();
    });

    it('returns true when the backend accepts the link (HTTP 2xx)', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toBe(true);
      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/booking/links',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns false on non-2xx responses instead of silently pretending success', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 404 } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toBe(false);
    });

    it('returns false on network failure instead of throwing', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new Error('network down'));
      await expect(persistBookingLinkToServer(link)).resolves.toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. CalendarHeader Toolbar Integration
  // --------------------------------------------------------------------------
  describe('CalendarHeader Toolbar Integration', () => {
    it('renders "Booking Links" button when onOpenBookingLinks is provided', () => {
      const onOpenBookingLinks = vi.fn();
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="September"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onOpenBookingLinks={onOpenBookingLinks}
        />,
      );

      expect(html).toContain('Booking Links');
      expect(html).toContain('Share Booking Links');
      expect(html).toContain('New Event');
    });

    it('omits Booking Links button when onOpenBookingLinks is not provided', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="September"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          openDedicatedSheet={vi.fn()}
        />,
      );

      expect(html).not.toContain('Share Booking Links');
      expect(html).toContain('New Event');
    });
  });
});
