import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicBookingPage from '../app/calendar/booking/[slug]/page';
import {
  generateIcsContent,
  generateGoogleCalendarUrl,
} from '../app/calendar/booking/[slug]/booking-utils';
import {
  BookingLinksModal,
  slugify,
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
      expect(html).toContain('End-to-End Encrypted Scheduling');

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
  describe('BookingLinksModal Component', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={false} onClose={vi.fn()} userEmail="kundan@quantmail.in" />,
      );
      expect(html).toBe('');
    });

    it('renders modal dialog when isOpen is true with active booking links list', () => {
      const html = renderToStaticMarkup(
        <BookingLinksModal isOpen={true} onClose={vi.fn()} userEmail="kundan@quantmail.in" />,
      );

      // Verify modal headers and description
      expect(html).toContain('Booking Links');
      expect(html).toContain('Calendly Parity');
      expect(html).toContain('Active Links');
      expect(html).toContain('+ Create New Link');

      // Verify default links are rendered
      expect(html).toContain('30 Min Strategy Session');
      expect(html).toContain('15 Min Quick Sync');
      expect(html).toContain('60 Min Technical Deep Dive');

      // Verify action buttons
      expect(html).toContain('Copy Link');
      expect(html).toContain('View Page');
      expect(html).toContain('/calendar/booking/30-min-strategy-session');
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
          activeView="agenda"
          selectView={vi.fn()}
          openDedicatedSheet={vi.fn()}
          onOpenBookingLinks={onOpenBookingLinks}
        />,
      );

      expect(html).toContain('Booking Links');
      expect(html).toContain('Share Booking Links');
      expect(html).toContain('+ New Entry');
    });

    it('omits Booking Links button when onOpenBookingLinks is not provided', () => {
      const html = renderToStaticMarkup(
        <CalendarHeader
          activeMonthName="September"
          activeYear={2026}
          goMonth={vi.fn()}
          goToday={vi.fn()}
          activeView="agenda"
          selectView={vi.fn()}
          openDedicatedSheet={vi.fn()}
        />,
      );

      expect(html).not.toContain('Share Booking Links');
      expect(html).toContain('+ New Entry');
    });
  });
});
