// @vitest-environment node
/**
 * ============================================================================
 * EventON v5.0.13-Grade Multi-Day Event Spans & Attendee RSVP Matrix Vitest Suite
 * Verifies multi-day date calculation, attendee RSVP recording, capacity caps
 * with auto-waitlist spillover, and date span segmentation for @quant/quantmail.
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEvent,
  recordRsvp,
  getEventRsvpSummary,
  calculateEventDaySpans,
  clearEventsForTesting,
  getEventById,
  listEventsByWorkspace,
  exportAttendeesCsv,
  generateVirtualMeetingUrl,
  validateHexColor,
  type EventOnCalendarEvent,
} from '../services/eventon-calendar.service';

describe('EventON Calendar Multi-Day Spans & Attendee RSVP Matrix', () => {
  const workspaceId = 'ws_quant_calendar_test';

  beforeEach(() => {
    clearEventsForTesting();
  });

  describe('1. Single-Day vs Multi-Day Calculation Based on Date Difference', () => {
    it('creates a single-day event when startDate and endDate occur on the same calendar day', () => {
      const event = createEvent(workspaceId, {
        title: 'Morning Architecture Standup',
        description: 'Discussing multi-day calendar engine',
        startDate: '2026-10-15T09:00:00.000Z',
        endDate: '2026-10-15T10:30:00.000Z',
        hexColor: '#FF5722',
        locationType: 'virtual',
        virtualMeetingUrl: 'https://meet.quantrinity.in/standup',
        categoryTags: ['engineering', 'daily'],
      });

      expect(event.id).toMatch(/^evt_/);
      expect(event.workspaceId).toBe(workspaceId);
      expect(event.title).toBe('Morning Architecture Standup');
      expect(event.isMultiDay).toBe(false);
      expect(event.rsvps).toEqual([]);
      expect(event.hexColor).toBe('#FF5722');
      expect(event.categoryTags).toEqual(['engineering', 'daily']);
    });

    it('creates a multi-day event when startDate and endDate span across different calendar days', () => {
      const event = createEvent(workspaceId, {
        title: 'Quant Global Developer Summit 2026',
        description: '3-day sovereign ecosystem conference',
        startDate: '2026-10-15T09:00:00.000Z',
        endDate: '2026-10-17T18:00:00.000Z',
        hexColor: '#4CAF50',
        locationType: 'hybrid',
        maxCapacity: 100,
        categoryTags: ['conference', 'keynote'],
      });

      expect(event.isMultiDay).toBe(true);
      expect(event.maxCapacity).toBe(100);
      expect(event.locationType).toBe('hybrid');
    });

    it('detects an overnight event crossing midnight as a multi-day event', () => {
      const event = createEvent(workspaceId, {
        title: 'Late Night Hackathon Sprint',
        startDate: '2026-10-15T22:00:00.000Z',
        endDate: '2026-10-16T03:00:00.000Z',
        hexColor: '#9C27B0',
        locationType: 'in_person',
        categoryTags: ['hackathon'],
      });

      expect(event.isMultiDay).toBe(true);
    });

    it('rejects creation if endDate is earlier than startDate', () => {
      expect(() => {
        createEvent(workspaceId, {
          title: 'Invalid Chronology Event',
          startDate: '2026-10-16T10:00:00.000Z',
          endDate: '2026-10-15T10:00:00.000Z',
          hexColor: '#FF5722',
          locationType: 'in_person',
          categoryTags: [],
        });
      }).toThrow('Event endDate must be greater than or equal to startDate');
    });

    it('rejects creation if required fields are missing or invalid', () => {
      expect(() => {
        createEvent('', {
          title: 'No Workspace',
          startDate: '2026-10-15T10:00:00.000Z',
          endDate: '2026-10-15T11:00:00.000Z',
          hexColor: '#FF5722',
          locationType: 'in_person',
          categoryTags: [],
        });
      }).toThrow('workspaceId is required');

      expect(() => {
        createEvent(workspaceId, {
          title: '   ',
          startDate: '2026-10-15T10:00:00.000Z',
          endDate: '2026-10-15T11:00:00.000Z',
          hexColor: '#FF5722',
          locationType: 'in_person',
          categoryTags: [],
        });
      }).toThrow('Event title is required');

      expect(() => {
        createEvent(workspaceId, {
          title: 'Bad Date',
          startDate: 'not-a-date',
          endDate: '2026-10-15T11:00:00.000Z',
          hexColor: '#FF5722',
          locationType: 'in_person',
          categoryTags: [],
        });
      }).toThrow('Invalid date-time format for event');
    });
  });

  describe('2. RSVP Recording and Total Guest Count Summation', () => {
    let event: EventOnCalendarEvent;

    beforeEach(() => {
      event = createEvent(workspaceId, {
        title: 'Open Source Community Meetup',
        startDate: '2026-10-20T18:00:00.000Z',
        endDate: '2026-10-20T21:00:00.000Z',
        hexColor: '#00BCD4',
        locationType: 'in_person',
        categoryTags: ['community'],
      });
    });

    it('records RSVPs with primary attendee and guest count (+1, +2)', () => {
      const rsvp1 = recordRsvp(event.id, {
        userId: 'user_alex',
        email: 'alex@quantmail.in',
        name: 'Alex Mercer',
        status: 'attending',
        guestCount: 2,
      });

      expect(rsvp1.status).toBe('attending');
      expect(rsvp1.guestCount).toBe(2);
      expect(rsvp1.respondedAt).toBeDefined();

      const rsvp2 = recordRsvp(event.id, {
        userId: 'user_sarah',
        email: 'sarah@quantmail.in',
        name: 'Sarah Connor',
        status: 'attending',
        guestCount: 1,
      });

      expect(rsvp2.status).toBe('attending');
      expect(rsvp2.guestCount).toBe(1);

      const summary = getEventRsvpSummary(event.id);
      expect(summary.attendingCount).toBe(2);
      expect(summary.totalGuests).toBe(3); // 2 + 1
      expect(summary.waitlistCount).toBe(0);
    });

    it('updates existing RSVP when the same user submits an update', () => {
      recordRsvp(event.id, {
        userId: 'user_david',
        email: 'david@quantmail.in',
        name: 'David Bowman',
        status: 'maybe',
      });

      let summary = getEventRsvpSummary(event.id);
      expect(summary.maybeCount).toBe(1);
      expect(summary.attendingCount).toBe(0);

      // User changes response to attending with 1 guest
      recordRsvp(event.id, {
        userId: 'user_david',
        email: 'david@quantmail.in',
        name: 'David Bowman',
        status: 'attending',
        guestCount: 1,
      });

      summary = getEventRsvpSummary(event.id);
      expect(summary.maybeCount).toBe(0);
      expect(summary.attendingCount).toBe(1);
      expect(summary.totalGuests).toBe(1);

      // Verify event.rsvps contains only 1 entry for this user
      const storedEvent = getEventById(event.id);
      expect(storedEvent?.rsvps.length).toBe(1);
    });

    it('sanitizes negative guest counts to zero', () => {
      const rsvp = recordRsvp(event.id, {
        userId: 'user_bob',
        email: 'bob@quantmail.in',
        name: 'Bob Marley',
        status: 'attending',
        guestCount: -5,
      });

      expect(rsvp.guestCount).toBe(0);
    });
  });

  describe('3. Capacity Overflow Automatically Diverts Attendees to Waitlist', () => {
    it('diverts attending RSVPs to waitlist when capacity cap is exceeded', () => {
      // Event with maxCapacity of 4 spots
      const cappedEvent = createEvent(workspaceId, {
        title: 'Executive Roundtable',
        startDate: '2026-10-25T14:00:00.000Z',
        endDate: '2026-10-25T16:00:00.000Z',
        hexColor: '#E91E63',
        locationType: 'in_person',
        maxCapacity: 4,
        categoryTags: ['executive'],
      });

      // User 1: 1 attendee + 1 guest = 2 spots taken
      const rsvp1 = recordRsvp(cappedEvent.id, {
        userId: 'user_1',
        email: 'ceo@quantmail.in',
        name: 'Elena Rostova',
        status: 'attending',
        guestCount: 1,
      });
      expect(rsvp1.status).toBe('attending');

      // User 2: 1 attendee + 1 guest = 2 spots taken (total 4/4)
      const rsvp2 = recordRsvp(cappedEvent.id, {
        userId: 'user_2',
        email: 'cto@quantmail.in',
        name: 'Marcus Vance',
        status: 'attending',
        guestCount: 1,
      });
      expect(rsvp2.status).toBe('attending');

      let summary = getEventRsvpSummary(cappedEvent.id);
      expect(summary.attendingCount).toBe(2);
      expect(summary.totalGuests).toBe(2);
      expect(summary.isFull).toBe(true);

      // User 3: Attempts to RSVP attending with 0 guests (exceeds capacity 4 + 1 > 4)
      const rsvp3 = recordRsvp(cappedEvent.id, {
        userId: 'user_3',
        email: 'cfo@quantmail.in',
        name: 'Chloe Price',
        status: 'attending',
        guestCount: 0,
      });
      expect(rsvp3.status).toBe('waitlist');

      // User 4: Attempts to RSVP attending with 2 guests -> waitlist
      const rsvp4 = recordRsvp(cappedEvent.id, {
        userId: 'user_4',
        email: 'coo@quantmail.in',
        name: 'Liam Neeson',
        status: 'attending',
        guestCount: 2,
      });
      expect(rsvp4.status).toBe('waitlist');

      summary = getEventRsvpSummary(cappedEvent.id);
      expect(summary.attendingCount).toBe(2);
      expect(summary.waitlistCount).toBe(2);
      expect(summary.isFull).toBe(true);
    });

    it('does not divert maybe or declined statuses to waitlist regardless of capacity', () => {
      const fullEvent = createEvent(workspaceId, {
        title: 'Full Capacity Workshop',
        startDate: '2026-10-25T14:00:00.000Z',
        endDate: '2026-10-25T16:00:00.000Z',
        hexColor: '#3F51B5',
        locationType: 'virtual',
        maxCapacity: 1,
        categoryTags: ['workshop'],
      });

      // Fill the 1 spot
      recordRsvp(fullEvent.id, {
        userId: 'user_1',
        email: 'u1@test.com',
        name: 'User 1',
        status: 'attending',
      });

      // User 2 responds maybe
      const rsvpMaybe = recordRsvp(fullEvent.id, {
        userId: 'user_2',
        email: 'u2@test.com',
        name: 'User 2',
        status: 'maybe',
      });
      expect(rsvpMaybe.status).toBe('maybe');

      // User 3 responds declined
      const rsvpDeclined = recordRsvp(fullEvent.id, {
        userId: 'user_3',
        email: 'u3@test.com',
        name: 'User 3',
        status: 'declined',
      });
      expect(rsvpDeclined.status).toBe('declined');

      const summary = getEventRsvpSummary(fullEvent.id);
      expect(summary.attendingCount).toBe(1);
      expect(summary.maybeCount).toBe(1);
      expect(summary.declinedCount).toBe(1);
      expect(summary.waitlistCount).toBe(0);
      expect(summary.isFull).toBe(true);
    });
  });

  describe('4. RSVP Summary Accurately Reports Attending, Maybe, Declined, and Waitlist Counts', () => {
    it('computes exact counts across all 4 RSVP matrices', () => {
      const event = createEvent(workspaceId, {
        title: 'Product Launch Party',
        startDate: '2026-11-01T19:00:00.000Z',
        endDate: '2026-11-01T23:00:00.000Z',
        hexColor: '#FF9800',
        locationType: 'hybrid',
        maxCapacity: 3,
        categoryTags: ['launch'],
      });

      recordRsvp(event.id, {
        userId: 'u1',
        email: 'u1@test.com',
        name: 'User 1',
        status: 'attending',
        guestCount: 1, // 2 spots
      });
      recordRsvp(event.id, {
        userId: 'u2',
        email: 'u2@test.com',
        name: 'User 2',
        status: 'attending',
        guestCount: 0, // 1 spot (total 3/3, full)
      });
      recordRsvp(event.id, {
        userId: 'u3',
        email: 'u3@test.com',
        name: 'User 3',
        status: 'maybe',
      });
      recordRsvp(event.id, {
        userId: 'u4',
        email: 'u4@test.com',
        name: 'User 4',
        status: 'declined',
      });
      recordRsvp(event.id, {
        userId: 'u5',
        email: 'u5@test.com',
        name: 'User 5',
        status: 'attending', // exceeds capacity, waitlisted
      });

      const summary = getEventRsvpSummary(event.id);

      expect(summary.attendingCount).toBe(2);
      expect(summary.maybeCount).toBe(1);
      expect(summary.declinedCount).toBe(1);
      expect(summary.waitlistCount).toBe(1);
      expect(summary.totalGuests).toBe(1);
      expect(summary.isFull).toBe(true);
    });

    it('reports isFull as false when no maxCapacity is configured', () => {
      const uncappedEvent = createEvent(workspaceId, {
        title: 'Uncapped Public Webinar',
        startDate: '2026-11-05T15:00:00.000Z',
        endDate: '2026-11-05T16:00:00.000Z',
        hexColor: '#2196F3',
        locationType: 'virtual',
        categoryTags: ['webinar'],
      });

      for (let i = 1; i <= 20; i++) {
        recordRsvp(uncappedEvent.id, {
          userId: `attendee_${i}`,
          email: `attendee_${i}@quantmail.in`,
          name: `Attendee ${i}`,
          status: 'attending',
        });
      }

      const summary = getEventRsvpSummary(uncappedEvent.id);
      expect(summary.attendingCount).toBe(20);
      expect(summary.waitlistCount).toBe(0);
      expect(summary.isFull).toBe(false);
    });
  });

  describe('5. calculateEventDaySpans Lists All Intervening Dates', () => {
    it('returns a single day entry for a single-day event with both isStartDay and isEndDay true', () => {
      const event = createEvent(workspaceId, {
        title: 'Single Day Workshop',
        startDate: '2026-10-15T09:00:00.000Z',
        endDate: '2026-10-15T17:00:00.000Z',
        hexColor: '#4CAF50',
        locationType: 'in_person',
        categoryTags: ['workshop'],
      });

      const spans = calculateEventDaySpans(event);

      expect(spans).toHaveLength(1);
      expect(spans[0]).toEqual({
        date: '2026-10-15',
        isStartDay: true,
        isEndDay: true,
      });
    });

    it('lists all intervening dates for a multi-day event spanning 3 days', () => {
      const event = createEvent(workspaceId, {
        title: 'Three Day Hackathon',
        startDate: '2026-10-15T10:00:00.000Z',
        endDate: '2026-10-17T18:00:00.000Z',
        hexColor: '#FF5722',
        locationType: 'hybrid',
        categoryTags: ['hackathon'],
      });

      const spans = calculateEventDaySpans(event);

      expect(spans).toHaveLength(3);
      expect(spans[0]).toEqual({
        date: '2026-10-15',
        isStartDay: true,
        isEndDay: false,
      });
      expect(spans[1]).toEqual({
        date: '2026-10-16',
        isStartDay: false,
        isEndDay: false,
      });
      expect(spans[2]).toEqual({
        date: '2026-10-17',
        isStartDay: false,
        isEndDay: true,
      });
    });

    it('handles multi-day events crossing month boundaries correctly', () => {
      const event = createEvent(workspaceId, {
        title: 'Month-End Global Bootcamp',
        startDate: '2026-10-30T10:00:00.000Z',
        endDate: '2026-11-02T16:00:00.000Z',
        hexColor: '#673AB7',
        locationType: 'virtual',
        categoryTags: ['bootcamp'],
      });

      const spans = calculateEventDaySpans(event);

      expect(spans).toHaveLength(4);
      expect(spans.map((s) => s.date)).toEqual([
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
      ]);
      expect(spans[0]?.isStartDay).toBe(true);
      expect(spans[0]?.isEndDay).toBe(false);
      expect(spans[1]?.isStartDay).toBe(false);
      expect(spans[1]?.isEndDay).toBe(false);
      expect(spans[2]?.isStartDay).toBe(false);
      expect(spans[2]?.isEndDay).toBe(false);
      expect(spans[3]?.isStartDay).toBe(false);
      expect(spans[3]?.isEndDay).toBe(true);
    });
  });

  describe('6. Auxiliary EventON Features & Utilities', () => {
    it('retrieves events by workspace and by id', () => {
      const event1 = createEvent(workspaceId, {
        title: 'Event 1',
        startDate: '2026-10-15T10:00:00.000Z',
        endDate: '2026-10-15T12:00:00.000Z',
        hexColor: '#FF5722',
        locationType: 'in_person',
        categoryTags: [],
      });
      const event2 = createEvent(workspaceId, {
        title: 'Event 2',
        startDate: '2026-10-16T10:00:00.000Z',
        endDate: '2026-10-16T12:00:00.000Z',
        hexColor: '#00BCD4',
        locationType: 'virtual',
        categoryTags: [],
      });

      expect(getEventById(event1.id)?.title).toBe('Event 1');
      expect(getEventById('non_existent')).toBeUndefined();

      const wsEvents = listEventsByWorkspace(workspaceId);
      expect(wsEvents).toHaveLength(2);
      expect(wsEvents.map((e) => e.id)).toContain(event1.id);
      expect(wsEvents.map((e) => e.id)).toContain(event2.id);
    });

    it('exports attendees list to CSV format', () => {
      const event = createEvent(workspaceId, {
        title: 'CSV Export Test',
        startDate: '2026-10-15T10:00:00.000Z',
        endDate: '2026-10-15T12:00:00.000Z',
        hexColor: '#FF5722',
        locationType: 'in_person',
        categoryTags: [],
      });

      recordRsvp(event.id, {
        userId: 'u1',
        email: 'alice@quantmail.in',
        name: 'Alice Johnson',
        status: 'attending',
        guestCount: 2,
      });

      const csv = exportAttendeesCsv(event.id);
      expect(csv).toContain('User ID,Name,Email,Status,Guest Count,Responded At');
      expect(csv).toContain('"u1","Alice Johnson","alice@quantmail.in","attending",2,');
    });

    it('generates virtual meeting URLs and validates hex color accents', () => {
      expect(generateVirtualMeetingUrl('google_meet', 'abc-defg-hij')).toBe(
        'https://meet.google.com/abc-defg-hij',
      );
      expect(generateVirtualMeetingUrl('zoom', '123456789')).toBe('https://zoom.us/j/123456789');
      expect(generateVirtualMeetingUrl('quant_stage', 'room-42')).toBe(
        'https://stage.quantrinity.in/room/room-42',
      );

      expect(validateHexColor('#FF5722')).toBe(true);
      expect(validateHexColor('#F52')).toBe(true);
      expect(validateHexColor('red')).toBe(false);
      expect(validateHexColor('#GGGGGG')).toBe(false);
    });
  });
});
