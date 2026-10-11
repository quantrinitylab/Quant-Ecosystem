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
  generateIcsContent,
  generateGoogleCalendarUrl,
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
      expect(html).toContain('Kundan Singh');
      expect(html).toContain('kundan@quantmail.in');
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
