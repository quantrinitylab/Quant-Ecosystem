// ============================================================================
// Inline RSVP invitation detection — contract tests (fix/qm-inline-rsvp-v4).
//
// The thread view may only offer Yes / No / Maybe when the email carries a
// real invitation ICS: detection must be exact (no false chips on ordinary
// mail with attachments) and parsing must survive folded ICS lines,
// parameter suffixes, and case variation. Pure unit tests — no DOM.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  extractIcsMethod,
  extractIcsProperty,
  findInvitationAttachment,
  isCalendarMimeType,
  isRsvpableInvitation,
  parseInvitationIcs,
  quantmailEventIdFromUid,
  unfoldIcsLines,
} from '../ics-invitation';

const INVITE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//QuantMail//Calendar//EN',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:evt_abc123@quantmail.in',
  'DTSTAMP:20261018T120000Z',
  'DTSTART:20261024T100000Z',
  'DTEND:20261024T110000Z',
  'SUMMARY:Team sync',
  'ORGANIZER;CN=Alice:mailto:alice@quantmail.in',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;',
  ' RSVP=TRUE;CN=Bob:mailto:bob@quantmail.in',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('isCalendarMimeType', () => {
  it('accepts text/calendar with and without parameters', () => {
    expect(isCalendarMimeType('text/calendar')).toBe(true);
    expect(isCalendarMimeType('text/calendar; method=REQUEST')).toBe(true);
    expect(isCalendarMimeType('TEXT/CALENDAR')).toBe(true);
  });
  it('accepts application/ics', () => {
    expect(isCalendarMimeType('application/ics')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isCalendarMimeType('application/pdf')).toBe(false);
    expect(isCalendarMimeType('text/html')).toBe(false);
    expect(isCalendarMimeType(null)).toBe(false);
    expect(isCalendarMimeType(undefined)).toBe(false);
    expect(isCalendarMimeType('')).toBe(false);
  });
});

describe('findInvitationAttachment', () => {
  const ics = { filename: 'invite.ics', mimeType: 'text/calendar; method=REQUEST' };
  it('finds the ICS attachment by mimeType', () => {
    expect(findInvitationAttachment({ attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf' }, ics] })).toBe(ics);
  });
  it('falls back to contentType', () => {
    const att = { filename: 'invite.ics', contentType: 'text/calendar' };
    expect(findInvitationAttachment({ attachments: [att] })).toBe(att);
  });
  it('returns null without attachments or without a calendar part', () => {
    expect(findInvitationAttachment({ attachments: [] })).toBeNull();
    expect(findInvitationAttachment({ attachments: [{ mimeType: 'image/png' }] })).toBeNull();
    expect(findInvitationAttachment({})).toBeNull();
    expect(findInvitationAttachment(null)).toBeNull();
  });
});

describe('unfoldIcsLines', () => {
  it('joins RFC 5545 folded continuation lines', () => {
    const unfolded = unfoldIcsLines('A:one\r\n two\r\n\tthree\r\nB:four\r\n');
    expect(unfolded).toEqual(['A:onetwothree', 'B:four', '']);
  });
});

describe('extractIcsProperty', () => {
  it('extracts UID across a folded ATTENDEE line', () => {
    expect(extractIcsProperty(INVITE_ICS, 'UID')).toBe('evt_abc123@quantmail.in');
    // Case-insensitive on the property name.
    expect(extractIcsProperty(INVITE_ICS, 'uid')).toBe('evt_abc123@quantmail.in');
    expect(extractIcsProperty(INVITE_ICS, 'SUMMARY')).toBe('Team sync');
    // Parameter form ORGANIZER;CN=...: must still match.
    expect(extractIcsProperty(INVITE_ICS, 'ORGANIZER')).toBe('mailto:alice@quantmail.in');
  });
  it('returns null for a missing property', () => {
    expect(extractIcsProperty(INVITE_ICS, 'RRULE')).toBeNull();
  });
});

describe('extractIcsMethod', () => {
  it('uppercases the VCALENDAR method', () => {
    expect(extractIcsMethod(INVITE_ICS)).toBe('REQUEST');
    expect(extractIcsMethod('BEGIN:VCALENDAR\r\nmethod:cancel\r\nEND:VCALENDAR')).toBe('CANCEL');
  });
  it('returns null when absent', () => {
    expect(extractIcsMethod('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeNull();
  });
});

describe('quantmailEventIdFromUid', () => {
  it('maps our own UID suffix to the internal event id', () => {
    expect(quantmailEventIdFromUid('evt_abc123@quantmail.in')).toBe('evt_abc123');
  });
  it('is case-insensitive on the suffix', () => {
    expect(quantmailEventIdFromUid('evt_abc123@QUANTMAIL.IN')).toBe('evt_abc123');
  });
  it('rejects foreign-calendar UIDs and empties', () => {
    expect(quantmailEventIdFromUid('abc@google.com')).toBeNull();
    expect(quantmailEventIdFromUid('@quantmail.in')).toBeNull();
    expect(quantmailEventIdFromUid(null)).toBeNull();
    expect(quantmailEventIdFromUid('')).toBeNull();
  });
});

describe('parseInvitationIcs', () => {
  it('parses a REQUEST invitation to its event id', () => {
    expect(parseInvitationIcs(INVITE_ICS)).toEqual({
      method: 'REQUEST',
      uid: 'evt_abc123@quantmail.in',
      eventId: 'evt_abc123',
    });
  });
  it('reports CANCEL so the caller can suppress the chips', () => {
    const cancel = INVITE_ICS.replace('METHOD:REQUEST', 'METHOD:CANCEL');
    const parsed = parseInvitationIcs(cancel);
    expect(parsed?.method).toBe('CANCEL');
    expect(parsed?.eventId).toBe('evt_abc123');
  });
  it('keeps foreign-calendar invitations identifiable but unmapped', () => {
    const foreign = INVITE_ICS.replace('evt_abc123@quantmail.in', 'xyz789@google.com');
    const parsed = parseInvitationIcs(foreign);
    expect(parsed?.method).toBe('REQUEST');
    expect(parsed?.uid).toBe('xyz789@google.com');
    expect(parsed?.eventId).toBeNull();
  });
  it('returns null without a UID or without input', () => {
    expect(parseInvitationIcs('BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR')).toBeNull();
    expect(parseInvitationIcs(null)).toBeNull();
    expect(parseInvitationIcs('')).toBeNull();
  });
});

describe('isRsvpableInvitation', () => {
  it('admits ONLY a genuine METHOD:REQUEST invitation mapped to our event', () => {
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS))).toBe(true);
  });
  it('rejects CANCEL even though its UID maps to our event', () => {
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS.replace('METHOD:REQUEST', 'METHOD:CANCEL')))).toBe(false);
  });
  it('rejects REPLY and PUBLISH even though their UIDs map to our event', () => {
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS.replace('METHOD:REQUEST', 'METHOD:REPLY')))).toBe(false);
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS.replace('METHOD:REQUEST', 'METHOD:PUBLISH')))).toBe(false);
  });
  it('rejects a missing METHOD', () => {
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS.replace('METHOD:REQUEST\r\n', '')))).toBe(false);
  });
  it('rejects foreign-calendar invitations (no mappable event id) and null', () => {
    expect(isRsvpableInvitation(parseInvitationIcs(INVITE_ICS.replace('evt_abc123@quantmail.in', 'xyz789@google.com')))).toBe(false);
    expect(isRsvpableInvitation(null)).toBe(false);
  });
});
