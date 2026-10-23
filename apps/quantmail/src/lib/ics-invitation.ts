// ============================================================================
// QuantMail — inline RSVP invitation detection (fix/qm-inline-rsvp-v4).
//
// Gmail parity: an invitation email carries a `text/calendar` (ICS) part with
// METHOD:REQUEST. QuantMail's own invitations (backend/routes/calendar.ts)
// mint the ICS UID as `<eventId>@quantmail.in`, so the thread view can map
// the invitation email back to the internal calendar event and offer inline
// Yes / No / Maybe chips without leaving the thread.
//
// Kept free of React/DOM so the detection and parsing contract is
// unit-testable. No fake data: when the ICS is missing, malformed, a
// cancellation (METHOD:CANCEL), or from a foreign calendar whose UID does
// not map to a QuantMail event, the parsers return null and the UI renders
// nothing — the attachment preview stays the honest fallback.
// ============================================================================

export interface IcsInvitationAttachment {
  mimeType?: string | null;
  contentType?: string | null;
  filename?: string | null;
  url?: string | null;
  id?: string | null;
}

export interface ParsedInvitation {
  /** VCALENDAR METHOD, uppercased (REQUEST, CANCEL, ...). */
  method: string | null;
  /** Raw VEVENT UID. */
  uid: string | null;
  /**
   * The internal QuantMail event id when the UID is one of ours
   * (`<eventId>@quantmail.in`); null for foreign-calendar invitations,
   * which QuantMail cannot RSVP to through its own API.
   */
  eventId: string | null;
}

const QUANTMAIL_ICS_UID_SUFFIX = '@quantmail.in';

/** True for `text/calendar` (with or without `; method=...` params) and `application/ics`. */
export function isCalendarMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase().trim();
  return lower.startsWith('text/calendar') || lower === 'application/ics';
}

/**
 * The invitation ICS attachment on an email, if any. Checks both `mimeType`
 * and `contentType` because inbound MIME parsing and the composer store the
 * part type under different keys.
 */
export function findInvitationAttachment(
  message: { attachments?: IcsInvitationAttachment[] | null } | null | undefined,
): IcsInvitationAttachment | null {
  const attachments = message?.attachments;
  if (!Array.isArray(attachments)) return null;
  return (
    attachments.find(
      (a) => isCalendarMimeType(a?.mimeType) || isCalendarMimeType(a?.contentType),
    ) ?? null
  );
}

/**
 * Unfold RFC 5545 line folding: a CRLF (or LF) followed by a space or tab
 * continues the previous logical line.
 */
export function unfoldIcsLines(text: string): string[] {
  const unfolded: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if (/^[ \t]/.test(raw) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += raw.slice(1);
    } else {
      unfolded.push(raw);
    }
  }
  return unfolded;
}

/**
 * First occurrence of an ICS property, case-insensitive on the name,
 * tolerating `NAME:` and `NAME;param=...:` forms. Returns the raw value
 * (unescaped) or null.
 */
export function extractIcsProperty(icsText: string, name: string): string | null {
  const wanted = name.toUpperCase();
  for (const line of unfoldIcsLines(icsText)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const propName = line.slice(0, colon).split(';')[0]?.trim().toUpperCase();
    if (propName === wanted) return line.slice(colon + 1).trim();
  }
  return null;
}

/** The VCALENDAR METHOD (REQUEST / CANCEL / ...), uppercased, or null. */
export function extractIcsMethod(icsText: string): string | null {
  const method = extractIcsProperty(icsText, 'METHOD');
  return method ? method.toUpperCase() : null;
}

/**
 * Map an ICS UID back to the internal QuantMail event id. Our backend mints
 * `UID:<eventId>@quantmail.in` (backend/routes/calendar.ts); anything else
 * is a foreign-calendar invitation we cannot RSVP to via our own API.
 */
export function quantmailEventIdFromUid(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const trimmed = uid.trim();
  if (!trimmed.toLowerCase().endsWith(QUANTMAIL_ICS_UID_SUFFIX)) return null;
  const eventId = trimmed.slice(0, trimmed.length - QUANTMAIL_ICS_UID_SUFFIX.length);
  return eventId ? eventId : null;
}

/**
 * Parse the invitation ICS. Returns null when there is no VEVENT UID at
 * all (not an invitation we can act on); METHOD:CANCEL is reported as-is
 * so the caller can suppress the chips for cancellations.
 */
export function parseInvitationIcs(icsText: string | null | undefined): ParsedInvitation | null {
  if (!icsText) return null;
  const uid = extractIcsProperty(icsText, 'UID');
  if (!uid) return null;
  return {
    method: extractIcsMethod(icsText),
    uid,
    eventId: quantmailEventIdFromUid(uid),
  };
}
