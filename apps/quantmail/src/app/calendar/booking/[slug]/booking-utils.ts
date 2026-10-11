// ============================================================================
// QuantCalendar — Booking Utilities (RFC 5545 ICS & Google Calendar URL)
// Tasks W39-CAL01 & W39-CAL02
//
// NOTE: applyBookingLinkResponse lives here (NOT in page.tsx) because
// Next.js build-time type validation rejects non-page exports from
// page.tsx ("X is not a valid Page export field").
// ============================================================================

// Generate Google Calendar deep link
export function generateGoogleCalendarUrl(event: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours(),
    )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const dates = `${formatUtc(event.startTime)}/${formatUtc(event.endTime)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: event.description || '',
    location: event.location || 'QuantMeet Video Call',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate RFC 5545 compliant .ics content
// hostName/hostEmail are the REAL host identity from the backend booking-link
// record. When unknown, pass '' — the ORGANIZER line is omitted rather than
// fabricating a person.
export function generateIcsContent(event: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  hostName?: string;
  hostEmail?: string;
  attendeeName: string;
  attendeeEmail: string;
  uid?: string;
}): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours(),
    )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const nowStr = formatUtc(new Date());
  const startStr = formatUtc(event.startTime);
  const endStr = formatUtc(event.endTime);
  const uid =
    event.uid || `quant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@quantmail.in`;

  // Honest identity: never attribute the meeting to a made-up person.
  // ORGANIZER is emitted only when a real host email is known.
  const organizerLine = event.hostEmail
    ? `ORGANIZER;CN=${event.hostName || 'Host'}:mailto:${event.hostEmail}`
    : null;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quant Ecosystem//QuantCalendar Public Booking Engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
    'STATUS:CONFIRMED',
    ...(organizerLine ? [organizerLine] : []),
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${event.attendeeName}:mailto:${event.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export interface BookingLinkDetails {
  slug: string;
  title: string;
  description: string;
  duration: number; // in minutes
  startHour: number;
  endHour: number;
  availableDays: number[];
  // Real host identity from the backend booking-link record.
  // Empty string = unknown host (rendered honestly as "unknown host").
  hostName: string;
  hostEmail: string;
  hostAvatar?: string;
}

/**
 * Merge a backend booking-link response into local meeting details.
 * Host identity comes ONLY from the backend record — when the backend
 * omits it, the result stays an honest "unknown" (''), never a hardcoded
 * name. Pure function so the merge rule is unit-testable.
 */
export function applyBookingLinkResponse(
  prev: BookingLinkDetails,
  data: Record<string, any> | null | undefined,
): BookingLinkDetails {
  if (!data) return prev;
  return {
    ...prev,
    slug: data.slug || prev.slug,
    title: data.title || prev.title,
    description: data.description || prev.description,
    duration: data.duration || prev.duration,
    startHour: data.startHour ?? prev.startHour,
    endHour: data.endHour ?? prev.endHour,
    availableDays: data.availableDays || prev.availableDays,
    hostName: data.hostName || '',
    hostEmail: data.hostEmail || '',
  };
}

/**
 * Honest user-facing copy for a failed booking POST (fix/qm-booking-fake-confirm).
 * A non-2xx booking response — or a network failure (status 0) — must NEVER
 * advance to the confirmation screen, and the booker must see the REAL reason
 * (slot taken, link inactive/invalid, retry) instead of a fake "Booking
 * Confirmed!". Pure function so the mapping is unit-testable.
 *
 * Backend status codes (booking-link.service.ts):
 *   400 INVALID_BOOKING_SLOT | 404 BOOKING_LINK_NOT_FOUND |
 *   410 BOOKING_LINK_INACTIVE | 409 SLOT_UNAVAILABLE
 */
export function resolveBookingFailureMessage(
  status: number,
  serverMessage?: string,
): string {
  // Network failure (no response at all) — the booking may never have
  // reached the server, so never imply success or any specific reason.
  if (status === 0) {
    return 'Could not reach the booking server. Check your connection and try again.';
  }
  switch (status) {
    case 400:
      return serverMessage || 'The booking details look invalid. Please check the form and try again.';
    case 404:
      return serverMessage || 'This booking link no longer exists or was removed.';
    case 409:
      return (
        serverMessage ||
        'This slot was just taken by someone else. Please go back and choose another time.'
      );
    case 410:
      return (
        serverMessage ||
        'This booking link is no longer active. Please ask the host for a new link.'
      );
    case 429:
      return 'Too many booking attempts. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
    case 504:
      // Never surface raw backend/edge messages on 5xx (may be technical) —
      // honest retry guidance instead.
      return 'The booking server ran into a problem. Please try again.';
    default:
      return serverMessage || 'Booking could not be completed. Please try again.';
  }
}
