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
  resolveSlotsLoadFailure,
  bookingWallTimeToUtcMs,
  formatSlotTimeLabelInTz,
} from '../app/calendar/booking/[slug]/booking-utils';
import {
  BookingLinksModal,
  slugify,
  parseStoredBookingLinks,
  persistBookingLinkToServer,
  bookingLinkSaveToast,
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
      // fix/qm-booking-tz-availability-2: BookingLinkDetails now carries the
      // host's IANA timezone anchoring the availability window.
      timezone: 'UTC',
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

    it('renders slot labels in the guest-selected timezone (fix/qm-booking-tz-selector)', () => {
      // 13:00Z == 09:00 EDT in America/New_York on 2028-10-02
      const slots = resolveSlotsResponse(
        { success: true, data: [slotPayload('2028-10-02T13:00:00.000Z')] },
        'America/New_York',
      );
      expect(slots).toHaveLength(1);
      expect(slots![0].timeLabel).toBe('09:00 AM');
    });

    it('defaults to UTC labels when no timezone is passed', () => {
      const slots = resolveSlotsResponse({
        success: true,
        data: [slotPayload('2028-10-02T13:00:00.000Z')],
      });
      expect(slots![0].timeLabel).toBe('01:00 PM');
    });
  });

  // --------------------------------------------------------------------------
  // 2f. Slots-fetch failure is never answered with invented availability
  // (fix/qm-booking-slots-fallback): the page's failure path shows the
  // resolveSlotsLoadFailure copy + a retry action. The helper must be
  // honest per status class and must never fabricate times/slots.
  // --------------------------------------------------------------------------
  describe('resolveSlotsLoadFailure (honest copy, no invented availability)', () => {
    it('maps a network failure (status 0) to connection copy', () => {
      const msg = resolveSlotsLoadFailure(0);
      expect(msg).toContain('connection');
      expect(msg).toContain('try again');
    });

    it('maps 5xx to an honest server-side copy', () => {
      for (const status of [500, 502, 503, 504]) {
        const msg = resolveSlotsLoadFailure(status);
        expect(msg).toContain('try again');
        expect(msg).toMatch(/[Ss]erver/);
      }
    });

    it('maps 429 to a rate-limit copy', () => {
      expect(resolveSlotsLoadFailure(429)).toContain('wait a moment');
    });

    it('maps anything else to a generic retry copy (no fake reason)', () => {
      const msg = resolveSlotsLoadFailure(400);
      expect(msg).toContain('try again');
      expect(msg).toContain('could not load availability');
    });

    it('never fabricates times or slots in the error copy', () => {
      for (const status of [0, 400, 404, 418, 429, 500, 503]) {
        const msg = resolveSlotsLoadFailure(status);
        expect(msg).not.toMatch(/\b\d{1,2}:\d{2}\s*(AM|PM)\b/); // no invented time labels
        expect(msg).not.toContain('09:00');
        expect(msg).not.toContain('available slot');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2e. Guest-timezone wall-time math (fix/qm-booking-tz-selector): the
  // timezone dropdown must shift displayed slot times and the date boundary.
  // --------------------------------------------------------------------------
  describe('bookingWallTimeToUtcMs / formatSlotTimeLabelInTz', () => {
    it('converts a New York wall time to the correct UTC instant (EDT, UTC-4)', () => {
      expect(bookingWallTimeToUtcMs(2028, 10, 2, 9, 0, 'America/New_York')).toBe(
        Date.UTC(2028, 9, 2, 13, 0),
      );
    });

    it('handles non-hour offsets (Asia/Kolkata, UTC+5:30)', () => {
      expect(bookingWallTimeToUtcMs(2028, 10, 2, 9, 0, 'Asia/Kolkata')).toBe(
        Date.UTC(2028, 9, 2, 3, 30),
      );
      expect(formatSlotTimeLabelInTz(new Date(Date.UTC(2028, 9, 2, 3, 30)), 'Asia/Kolkata')).toBe(
        '09:00 AM',
      );
    });

    it('respects DST: January New York is EST (UTC-5), October is EDT (UTC-4)', () => {
      expect(bookingWallTimeToUtcMs(2028, 1, 10, 9, 0, 'America/New_York')).toBe(
        Date.UTC(2028, 0, 10, 14, 0),
      );
      expect(bookingWallTimeToUtcMs(2028, 10, 2, 9, 0, 'America/New_York')).toBe(
        Date.UTC(2028, 9, 2, 13, 0),
      );
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
      // fix/qm-booking-tz-availability-2: BookingLinkDetails now carries the
      // host's IANA timezone anchoring the availability window.
      timezone: 'UTC',
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

  // fix/qm-booking-tz-availability-2: the host's IANA timezone rides the
  // link-details merge so the public page and its fallback generator share
  // the backend's availability-window anchor.
  describe('applyBookingLinkResponse timezone merge', () => {
    const seed = {
      slug: 'strategy-session',
      title: '30 Min Strategy Session',
      description: 'One-on-one session.',
      duration: 30,
      startHour: 9,
      endHour: 17,
      availableDays: [1, 2, 3, 4, 5],
      timezone: 'UTC',
      hostName: '',
      hostEmail: '',
    };

    it('carries the backend timezone through', () => {
      const merged = applyBookingLinkResponse(seed, {
        ...seed,
        timezone: 'America/New_York',
      });
      expect(merged.timezone).toBe('America/New_York');
    });

    it('defaults timezone to the previous value when the backend omits it', () => {
      const rest: Record<string, unknown> = { ...seed };
      delete rest.timezone;
      const merged = applyBookingLinkResponse(seed, rest);
      expect(merged.timezone).toBe('UTC');
    });

    it('falls back to UTC for blank timezone values', () => {
      const merged = applyBookingLinkResponse(seed, { ...seed, timezone: '  ' });
      expect(merged.timezone).toBe('UTC');
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
      // fix/qm-booking-tz-availability-2: parseStoredBookingLinks must keep
      // the stored timezone verbatim.
      timezone: 'America/New_York',
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
      timezone: 'America/New_York',
      isActive: true,
      createdAt: '2026-10-11T00:00:00.000Z',
    };

    beforeEach(() => {
      vi.mocked(apiFetchRaw).mockReset();
    });

    it('returns ok when the backend accepts the link (HTTP 2xx)', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true, status: 201 } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: true,
        slugTaken: false,
      });
      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/booking/links',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // fix/qm-booking-tz-availability-2: the host's IANA timezone must ride
    // along in the create payload so availability is anchored honestly.
    it('sends the link timezone in the create payload', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: true, status: 201 } as Response);
      await persistBookingLinkToServer(link);
      const [, init] = vi.mocked(apiFetchRaw).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.timezone).toBe('America/New_York');
    });

    it('returns not-ok on non-2xx responses instead of silently pretending success', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 404 } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: false,
        slugTaken: false,
      });
    });

    it('returns not-ok on network failure instead of throwing', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new Error('network down'));
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: false,
        slugTaken: false,
      });
    });

    // fix/qm-booking-slug-409: the backend rejects a slug another host owns
    // with 409 BOOKING_LINK_SLUG_TAKEN — the client must detect it so it can
    // tell the host to pick another slug instead of keeping a permanently
    // unsyncable local copy.
    it('flags slugTaken on 409 BOOKING_LINK_SLUG_TAKEN', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'BOOKING_LINK_SLUG_TAKEN',
            message: 'This URL slug is already taken — pick another',
            statusCode: 409,
          },
        }),
      } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: false,
        slugTaken: true,
      });
    });

    it('flags slugTaken on a bare 409 when the error body is unavailable', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({ ok: false, status: 409 } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: false,
        slugTaken: true,
      });
    });

    it('does not flag slugTaken on a 409 carrying a different error code', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: { code: 'SOME_OTHER_CONFLICT', message: 'conflict', statusCode: 409 },
        }),
      } as Response);
      await expect(persistBookingLinkToServer(link)).resolves.toEqual({
        ok: false,
        slugTaken: false,
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3d. Honest modal copy: bookingLinkSaveToast (fix/qm-booking-slug-409)
  // --------------------------------------------------------------------------
  describe('bookingLinkSaveToast (honest save-outcome copy)', () => {
    it('tells the host the slug is taken and to pick another', () => {
      expect(bookingLinkSaveToast({ ok: false, slugTaken: true })).toEqual({
        text: 'This URL slug is already taken — pick another',
        type: 'error',
      });
    });

    it('announces success only when the server accepted the link', () => {
      expect(bookingLinkSaveToast({ ok: true, slugTaken: false })).toEqual({
        text: 'Booking link created successfully!',
        type: 'success',
      });
    });

    it('is honest about the local-only state instead of faking success', () => {
      const toast = bookingLinkSaveToast({ ok: false, slugTaken: false });
      expect(toast.type).toBe('error');
      expect(toast.text).toContain('saved on this device only');
      expect(toast.text).not.toContain('created successfully');
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
