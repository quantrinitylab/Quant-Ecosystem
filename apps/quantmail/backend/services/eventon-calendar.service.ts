/**
 * ============================================================================
 * EventON v5.0.13-Grade Multi-Day Event Spans & Attendee RSVP Matrix Service
 * Provides commercial-grade calendar multi-day date bands, real-time RSVP
 * statuses, capacity cap enforcement with auto-waitlist spillover, and guest
 * counts for @quant/quantmail.
 * ============================================================================
 */

export type RsvpStatus = 'attending' | 'maybe' | 'declined' | 'waitlist';

export interface AttendeeRsvp {
  userId: string;
  email: string;
  name: string;
  status: RsvpStatus;
  guestCount: number; // +0, +1, +2
  respondedAt: string;
}

export interface EventOnCalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  startDate: string; // ISO date-time
  endDate: string; // ISO date-time
  isMultiDay: boolean;
  hexColor: string; // e.g. '#FF5722'
  locationType: 'in_person' | 'virtual' | 'hybrid';
  virtualMeetingUrl?: string;
  maxCapacity?: number;
  rsvps: AttendeeRsvp[];
  categoryTags: string[];
}

// In-memory store for EventON calendar events
const eventsStore = new Map<string, EventOnCalendarEvent>();

/**
 * Validates whether a string is a 6-digit or 3-digit hex color (e.g. #FF5722 or #F52)
 */
export function validateHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/**
 * Creates a new calendar event with multi-day span auto-calculation and validation.
 */
export function createEvent(
  workspaceId: string,
  data: Omit<EventOnCalendarEvent, 'id' | 'workspaceId' | 'isMultiDay' | 'rsvps'>,
): EventOnCalendarEvent {
  if (!workspaceId) {
    throw new Error('workspaceId is required');
  }
  if (!data.title || data.title.trim() === '') {
    throw new Error('Event title is required');
  }

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date-time format for event');
  }

  if (end.getTime() < start.getTime()) {
    throw new Error('Event endDate must be greater than or equal to startDate');
  }

  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);
  const isMultiDay = startDay !== endDay;

  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const event: EventOnCalendarEvent = {
    id,
    workspaceId,
    title: data.title.trim(),
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    isMultiDay,
    hexColor: data.hexColor || '#FF5722',
    locationType: data.locationType || 'in_person',
    virtualMeetingUrl: data.virtualMeetingUrl,
    maxCapacity: data.maxCapacity,
    rsvps: [],
    categoryTags: data.categoryTags ? [...data.categoryTags] : [],
  };

  eventsStore.set(id, event);
  return event;
}

/**
 * Records or updates an attendee RSVP.
 * If status is 'attending' and event has maxCapacity, checks if total attending
 * (attendees + guests) exceeds capacity. If exceeded, sets status to 'waitlist'.
 */
export function recordRsvp(
  eventId: string,
  rsvp: {
    userId: string;
    email: string;
    name: string;
    status: 'attending' | 'maybe' | 'declined';
    guestCount?: number;
  },
): AttendeeRsvp {
  const event = eventsStore.get(eventId);
  if (!event) {
    throw new Error(`Event with id "${eventId}" not found`);
  }

  if (!rsvp.userId || !rsvp.email || !rsvp.name) {
    throw new Error('userId, email, and name are required for RSVP');
  }

  const guestCount = Math.max(0, rsvp.guestCount ?? 0);
  const existingIndex = event.rsvps.findIndex((r) => r.userId === rsvp.userId);

  let finalStatus: RsvpStatus = rsvp.status;

  if (rsvp.status === 'attending' && typeof event.maxCapacity === 'number') {
    // Calculate current confirmed attending headcount excluding this user's existing RSVP
    const otherAttending = event.rsvps.filter((r, idx) => {
      if (existingIndex !== -1 && idx === existingIndex) return false;
      return r.status === 'attending';
    });

    const currentHeadcount = otherAttending.reduce((sum, r) => sum + 1 + (r.guestCount || 0), 0);

    const requestedHeadcount = 1 + guestCount;

    if (currentHeadcount + requestedHeadcount > event.maxCapacity) {
      finalStatus = 'waitlist';
    }
  }

  const attendeeRsvp: AttendeeRsvp = {
    userId: rsvp.userId,
    email: rsvp.email,
    name: rsvp.name,
    status: finalStatus,
    guestCount,
    respondedAt: new Date().toISOString(),
  };

  if (existingIndex !== -1) {
    event.rsvps[existingIndex] = attendeeRsvp;
  } else {
    event.rsvps.push(attendeeRsvp);
  }

  return attendeeRsvp;
}

/**
 * Computes the real-time RSVP summary metrics for an event.
 */
export function getEventRsvpSummary(eventId: string): {
  attendingCount: number;
  maybeCount: number;
  declinedCount: number;
  waitlistCount: number;
  totalGuests: number;
  isFull: boolean;
} {
  const event = eventsStore.get(eventId);
  if (!event) {
    throw new Error(`Event with id "${eventId}" not found`);
  }

  let attendingCount = 0;
  let maybeCount = 0;
  let declinedCount = 0;
  let waitlistCount = 0;
  let totalGuests = 0;

  for (const r of event.rsvps) {
    switch (r.status) {
      case 'attending':
        attendingCount++;
        totalGuests += r.guestCount || 0;
        break;
      case 'maybe':
        maybeCount++;
        break;
      case 'declined':
        declinedCount++;
        break;
      case 'waitlist':
        waitlistCount++;
        break;
    }
  }

  const totalHeadcount = attendingCount + totalGuests;
  const isFull =
    typeof event.maxCapacity === 'number' ? totalHeadcount >= event.maxCapacity : false;

  return {
    attendingCount,
    maybeCount,
    declinedCount,
    waitlistCount,
    totalGuests,
    isFull,
  };
}

/**
 * Calculates all date spans covered by an event, labeling start and end boundaries.
 */
export function calculateEventDaySpans(
  event: EventOnCalendarEvent,
): Array<{ date: string; isStartDay: boolean; isEndDay: boolean }> {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid event date-time format');
  }

  if (end.getTime() < start.getTime()) {
    throw new Error('Event endDate must be greater than or equal to startDate');
  }

  const startDayStr = start.toISOString().slice(0, 10);
  const endDayStr = end.toISOString().slice(0, 10);

  const spans: Array<{ date: string; isStartDay: boolean; isEndDay: boolean }> = [];
  const curr = new Date(`${startDayStr}T00:00:00.000Z`);
  const targetEnd = new Date(`${endDayStr}T00:00:00.000Z`);

  while (curr.getTime() <= targetEnd.getTime()) {
    const dateStr = curr.toISOString().slice(0, 10);
    spans.push({
      date: dateStr,
      isStartDay: dateStr === startDayStr,
      isEndDay: dateStr === endDayStr,
    });
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return spans;
}

/**
 * Retrieves an event by its ID.
 */
export function getEventById(eventId: string): EventOnCalendarEvent | undefined {
  return eventsStore.get(eventId);
}

/**
 * Lists all events belonging to a workspace.
 */
export function listEventsByWorkspace(workspaceId: string): EventOnCalendarEvent[] {
  return Array.from(eventsStore.values()).filter((e) => e.workspaceId === workspaceId);
}

/**
 * Exports attendees to CSV format for event organizers.
 */
export function exportAttendeesCsv(eventId: string): string {
  const event = eventsStore.get(eventId);
  if (!event) {
    throw new Error(`Event with id "${eventId}" not found`);
  }
  const headers = ['User ID', 'Name', 'Email', 'Status', 'Guest Count', 'Responded At'];
  const rows = event.rsvps.map((r) =>
    [
      `"${r.userId}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.email.replace(/"/g, '""')}"`,
      `"${r.status}"`,
      r.guestCount,
      `"${r.respondedAt}"`,
    ].join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generates a virtual meeting URL for the event based on provider.
 */
export function generateVirtualMeetingUrl(
  type: 'google_meet' | 'zoom' | 'quant_stage',
  roomCode: string,
): string {
  switch (type) {
    case 'google_meet':
      return `https://meet.google.com/${roomCode}`;
    case 'zoom':
      return `https://zoom.us/j/${roomCode}`;
    case 'quant_stage':
      return `https://stage.quantrinity.in/room/${roomCode}`;
    default:
      return `https://meet.quantrinity.in/${roomCode}`;
  }
}

/**
 * Clears the in-memory event store (for test isolation).
 */
export function clearEventsForTesting(): void {
  eventsStore.clear();
}
