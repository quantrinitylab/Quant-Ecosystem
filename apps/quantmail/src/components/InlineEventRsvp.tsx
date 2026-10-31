// ============================================================================
// QuantMail — inline RSVP for calendar invitations inside the thread view
// (fix/qm-inline-rsvp-v4).
//
// Gmail parity: "Respond to an invitation in Gmail: 1. open Gmail 2. open
// the email invitation 3. at the top of the email, select a response:
// Yes / No / Maybe" (support.google.com/calendar/answer/37135). QuantMail's
// RSVP used to live ONLY on the calendar event page — an invited user
// opening the invitation email in the People/thread view had to leave the
// thread to answer.
//
// This renders the Yes / No / Maybe chips at the top of the invitation
// email itself. Detection + ICS parsing live in lib/ics-invitation.ts; the
// actual RSVP reuses the exact backend contract the event page uses
// (POST /api/events/:id/rsvp via useRsvpEvent, attendee-gated GET
// /api/events/:id, and the v1 occurrence-vs-series pre-write gate).
//
// Honest absence: the card renders ONLY for a genuine METHOD:REQUEST ICS
// that resolves to a QuantMail event the signed-in viewer is invited to
// (backend gates both read and write by attendee). Cancellations,
// replies, publishes, a missing METHOD, foreign-calendar invitations,
// unreadable ICS bytes, and the organizer's own sent copy render nothing
// — the .ics attachment preview stays the fallback.
//
// Pure-black, no divider lines, Calendar blue accent (#4285F4).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Email } from '../types';
import {
  findInvitationAttachment,
  isRsvpableInvitation,
  parseInvitationIcs,
} from '../lib/ics-invitation';
import {
  attachmentByteSource,
  attachmentServiceId,
  loadAttachmentBytes,
} from '../lib/mail-attachments';
import { useCalendarEvent, useRsvpEvent, type RsvpStatus } from '../hooks/useCalendarEvent';
import {
  fallbackRsvpScope,
  formatWhen,
  planRsvpWrite,
  createRsvpWriteGate,
  RSVP_LABELS,
  type RsvpScopeInfo,
} from '../app/calendar/event/event-detail-utils';
import { RsvpScopeConfirmation } from '../app/calendar/event/rsvp-scope-confirmation';
import { RsvpScopePrewriteConfirmation } from '../app/calendar/event/rsvp-scope-prewrite-confirmation';

/** Loose view of the event DTO the backend returns (extra fields beyond CalendarEvent). */
interface InlineEventDto {
  id: string;
  title?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  allDay?: boolean;
  isAllDay?: boolean;
  location?: string | null;
  timeZone?: string;
  recurrence?: string | null;
  viewerIsAttendee?: boolean;
  viewerIsOwner?: boolean;
  attendees?: Array<{ email?: string; rsvp?: string; status?: string }>;
}

/** Gmail's chip order: Yes / No / Maybe. */
const CHIP_OPTIONS: Array<{ status: RsvpStatus; label: string }> = [
  { status: 'accepted', label: 'Yes' },
  { status: 'declined', label: 'No' },
  { status: 'tentative', label: 'Maybe' },
];

const KNOWN_STATUSES: RsvpStatus[] = ['accepted', 'declined', 'tentative', 'pending'];

/**
 * The viewer's own RSVP status from the event's attendee list, matched by
 * account email (case-insensitive) — the same matcher the backend's
 * POST /events/:id/rsvp uses. Tolerates both the CalendarEvent shape
 * (`rsvp`) and the looser backend DTO shape (`status`).
 */
export function viewerRsvpStatus(
  event: InlineEventDto | null | undefined,
  viewerEmail: string,
): RsvpStatus | null {
  const email = (viewerEmail || '').toLowerCase().trim();
  if (!email || !Array.isArray(event?.attendees)) return null;
  for (const attendee of event.attendees) {
    if ((attendee?.email || '').toLowerCase().trim() !== email) continue;
    const raw = String(attendee?.rsvp ?? attendee?.status ?? '').toLowerCase();
    return (KNOWN_STATUSES as string[]).includes(raw) ? (raw as RsvpStatus) : null;
  }
  return null;
}

export interface InlineRsvpCardProps {
  eventTitle: string;
  whenLabel: string;
  location?: string | null;
  timeZone?: string;
  /** The viewer's own status; null/pending means "not answered yet". */
  currentStatus: RsvpStatus | null;
  isPending: boolean;
  error: string | null;
  confirmation: { status: RsvpStatus; scope: RsvpScopeInfo } | null;
  onRespond: (status: RsvpStatus, opener: HTMLButtonElement | null) => void;
}

/**
 * The invitation card itself — pure presentational so it renders under
 * renderToStaticMarkup in tests. No divider lines; Calendar blue accent.
 */
export function InlineRsvpCard({
  eventTitle,
  whenLabel,
  location,
  timeZone,
  currentStatus,
  isPending,
  error,
  confirmation,
  onRespond,
}: InlineRsvpCardProps) {
  const answered = currentStatus !== null && currentStatus !== 'pending';
  return (
    <div className="mb-3 rounded-2xl border border-[#4285F4]/30 bg-[#4285F4]/10 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#4285F4]/15"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-5 w-5 text-[#a8c7fa]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="12" height="11" rx="2" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#a8c7fa]">
            Event invitation
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[var(--quant-foreground)]">
            {eventTitle}
          </p>
          {whenLabel && (
            <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">{whenLabel}</p>
          )}
          {location && (
            <p className="mt-0.5 truncate text-xs text-[var(--quant-muted-foreground)]">
              {location}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-[var(--quant-muted-foreground)]">
        {answered ? `Your response: ${RSVP_LABELS[currentStatus]}` : 'Respond to this invitation'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Respond to invitation">
        {CHIP_OPTIONS.map(({ status, label }) => {
          const selected = currentStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={(e) => onRespond(status, e.currentTarget)}
              disabled={isPending}
              aria-label={`Respond ${RSVP_LABELS[status]}`}
              aria-pressed={selected}
              className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-[#4285F4]/60 bg-[#4285F4]/20 text-[#dbeafe]'
                  : 'border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {confirmation && !error && (
        <RsvpScopeConfirmation
          status={confirmation.status}
          scope={confirmation.scope}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}

/**
 * Container: detects the invitation ICS on the message, resolves it to a
 * QuantMail event the viewer is invited to, and hosts the RSVP mutation
 * with the same occurrence-vs-series pre-write gate the event page uses.
 * Renders nothing until (and unless) an RSVP-able invitation resolves.
 */
export function InlineEventRsvp({
  message,
  viewerEmail,
}: {
  message: Email;
  viewerEmail: string;
}) {
  const attachment = useMemo(() => findInvitationAttachment(message), [message]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    status: RsvpStatus;
    scope: RsvpScopeInfo;
  } | null>(null);
  const [pendingRsvp, setPendingRsvp] = useState<{
    status: RsvpStatus;
    scope: RsvpScopeInfo;
  } | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const gateRef = useRef<ReturnType<typeof createRsvpWriteGate> | null>(null);
  // Latest resolved event id. A previous invitation's RSVP POST can settle
  // AFTER the component has moved on to a new invitation (rerender with a
  // different message); its confirmation/error must never land on the new
  // invitation's card — postRsvp checks this ref before touching state.
  const eventIdRef = useRef<string | null>(null);
  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);

  useEffect(() => {
    // The message changed (thread navigation reuses this component):
    // drop the previous invitation's resolution BEFORE re-resolving, or a
    // slow/failed ICS load would leave the old event's card on the new email.
    setEventId(null);
    setResolved(false);
    setRsvpError(null);
    setConfirmation(null);
    setPendingRsvp(null);
    gateRef.current = null;
    if (!attachment) return;
    let cancelled = false;
    const source = attachmentByteSource({
      url: attachment.url ?? null,
      attachmentId: attachmentServiceId(attachment.id),
    });
    if (!source) {
      setResolved(true);
      return;
    }
    loadAttachmentBytes(source)
      .then((bytes) => {
        if (cancelled) return;
        const text = new TextDecoder('utf-8').decode(bytes);
        const parsed = parseInvitationIcs(text);
        // ONLY a genuine METHOD:REQUEST invitation whose UID maps to a
        // QuantMail event gets chips. Cancellations, replies, publishes,
        // a missing METHOD, and foreign-calendar UIDs all stay honestly
        // absent — eventId alone is NOT the gate (CANCEL/REPLY payloads
        // carry a mappable eventId too).
        if (isRsvpableInvitation(parsed)) {
          setEventId(parsed.eventId);
        }
        setResolved(true);
      })
      .catch(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  const { data: eventData } = useCalendarEvent(resolved ? eventId : null);
  const event = eventData as unknown as InlineEventDto | undefined;

  const rsvp = useRsvpEvent();

  const getGate = () =>
    gateRef.current ?? (gateRef.current = createRsvpWriteGate({ post: postRsvp }));

  async function postRsvp(status: RsvpStatus): Promise<void> {
    if (!eventId) return;
    const postedId = eventId;
    setRsvpError(null);
    setConfirmation(null);
    try {
      const result = await rsvp.mutateAsync({ id: eventId, status });
      // The invitation may have changed while this POST was in flight
      // (rerender with a different message). Its outcome belongs to the
      // old invitation only — never paint it onto the new card.
      if (eventIdRef.current !== postedId) return;
      const scope: RsvpScopeInfo =
        (result as { rsvpScope?: RsvpScopeInfo } | undefined)?.rsvpScope ??
        fallbackRsvpScope(eventId, event?.recurrence ?? null);
      setConfirmation({ status, scope });
    } catch (err) {
      if (eventIdRef.current !== postedId) return;
      setRsvpError(err instanceof Error ? err.message : 'Could not update your response.');
    }
  }

  const handleRespond = (status: RsvpStatus, opener: HTMLButtonElement | null) => {
    if (!eventId) return;
    const intent = planRsvpWrite(eventId, event?.recurrence ?? null);
    // Series-wide effect needs explicit confirmation BEFORE any POST;
    // Cancel produces zero mutation (same gate as the event page).
    if (getGate().request(status, intent)) {
      openerRef.current = opener;
      setPendingRsvp({ status, scope: intent.scope });
    }
  };

  const confirmPendingRsvp = () => {
    const p = getGate().confirm();
    setPendingRsvp(null);
    if (p) void p.catch(() => {});
  };
  const cancelPendingRsvp = () => {
    getGate().cancel();
    setPendingRsvp(null);
  };

  // No invitation attachment, not yet resolved, or the ICS didn't map to a
  // QuantMail event — render nothing (the attachment preview stays).
  if (!attachment || !resolved || !eventId) return null;
  // The backend gates the read by attendee; a non-attendee gets no event
  // and therefore no chips. The organizer's own sent copy (viewerIsOwner)
  // never offers RSVP — same rule as the event page.
  if (!event || !event.viewerIsAttendee || event.viewerIsOwner) return null;

  const whenLabel =
    event.startTime && event.endTime
      ? formatWhen(
          event.startTime,
          event.endTime,
          event.allDay ?? event.isAllDay ?? false,
          event.timeZone,
        )
      : '';

  return (
    <>
      <InlineRsvpCard
        eventTitle={event.title || 'Event invitation'}
        whenLabel={whenLabel}
        location={event.location}
        timeZone={event.timeZone}
        currentStatus={viewerRsvpStatus(event, viewerEmail)}
        isPending={rsvp.isPending}
        error={rsvpError}
        confirmation={confirmation}
        onRespond={handleRespond}
      />
      {pendingRsvp && (
        <RsvpScopePrewriteConfirmation
          status={pendingRsvp.status}
          scope={pendingRsvp.scope}
          timeZone={event.timeZone}
          isPending={rsvp.isPending}
          openerRef={openerRef}
          onConfirm={confirmPendingRsvp}
          onCancel={cancelPendingRsvp}
        />
      )}
    </>
  );
}
