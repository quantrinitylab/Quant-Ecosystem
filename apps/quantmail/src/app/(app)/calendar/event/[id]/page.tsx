'use client';

// ============================================================================
// QuantMail — Calendar Event Detail (M09 / K10).
//
// The in-app event-detail screen the audit found missing: only the public
// booking page existed. Everything on this screen comes from the real calendar
// backend (GET /events/:id, PUT /events/:id, DELETE /events/:id,
// POST /events/:id/rsvp). No fake events, no invented attendees.
//
// Sections: header (back / edit / delete), when + timezone, location / meeting
// link, attached files, description, attendees with RSVP state, recurrence,
// reminders, and the viewer's own RSVP actions.
// ============================================================================

import { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton, ErrorState, EmptyState } from '@quant/shared-ui';
import { AppShell } from '../../../../../components/AppShell';
import { AppSidebar } from '../../../../../components/AppSidebar';
import { useCalendarEvent, useRsvpEvent } from '../../../../../hooks/useCalendarEvent';
import { useUpdateEvent, useDeleteEvent } from '../../../../../hooks/useCalendar';
import { fromRRule } from '../../lib/recurrence';
import {
  formatWhen,
  isUrl,
  rsvpTone,
  toZonedInputValue,
  zonedInputToIso,
  stripQuantMeta,
  fallbackRsvpScope,
  planRsvpWrite,
  createRsvpWriteGate,
  RSVP_LABELS,
  type RsvpStatus,
  type RsvpScopeInfo,
  type EventDetailDto,
} from '../event-detail-utils';
import { RsvpScopeConfirmation } from '../rsvp-scope-confirmation';
import { RsvpScopePrewriteConfirmation } from '../rsvp-scope-prewrite-confirmation';
import type { CalendarEvent, GuestNotificationStatus } from '../../../../../types';
import { TIMEZONES } from '../../types';
import { guestNotificationToastText } from '../../lib/guest-notify';

// --- inline icon set (SVG, no emoji) -----------------------------------------
type IconName = 'back' | 'pencil' | 'trash' | 'pin' | 'link' | 'clock' | 'repeat' | 'bell' | 'users' | 'check';
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  pencil: <path d="M4 20l1.2-4.2L16.5 4.5a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20z" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />,
  pin: (
    <>
      <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  link: <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  repeat: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  bell: <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.2a6.5 6.5 0 0 1 4 5.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function asDto(event: CalendarEvent): EventDetailDto {
  return event as unknown as EventDetailDto;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
        <Icon name={icon} className="h-4 w-4" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function CalendarEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = params?.id ? decodeURIComponent(params.id) : '';
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  // Pre-write scope gate (CODEX-REVIEW follow-up on #1100): the v1
  // occurrence-vs-series contract writes every RSVP to the series-level
  // attendee list, so for a recurring series the UI must show the
  // authoritative effect and require explicit confirm BEFORE any POST.
  // Cancel/back produces zero mutation. The post-write confirmation below
  // (RsvpScopeConfirmation) reports what the completed write covered.
  const [pendingRsvp, setPendingRsvp] = useState<{
    status: RsvpStatus;
    scope: RsvpScopeInfo;
  } | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  // Post-write receipt: reports what the completed write covered (backend's
  // authoritative rsvpScope, or the same shape derived client-side).
  const [rsvpConfirmation, setRsvpConfirmation] = useState<{
    status: RsvpStatus;
    scope: RsvpScopeInfo;
  } | null>(null);

  const { data: raw, isLoading, error, refetch } = useCalendarEvent(eventId || null);
  const event = useMemo(() => (raw ? asDto(raw) : null), [raw]);
  const rsvp = useRsvpEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  // Edit form state, seeded from the loaded event when edit mode opens.
  const [form, setForm] = useState({
    title: '',
    description: '',
    start: '',
    end: '',
    allDay: false,
    location: '',
    timezone: '',
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  // fix/qm-calendar-event-guest-notify: Gmail parity — the edit-save prompt
  // ("Send update to guests?") and the delete dialog's notify checkbox.
  // saveNotice carries the backend's honest guest-notification outcome.
  const [confirmSendUpdate, setConfirmSendUpdate] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [notifyGuests, setNotifyGuests] = useState(true);

  const openEdit = () => {
    if (!event) return;
    // Seed the wall-clock inputs in the event's own timezone, matching the
    // "When" display above. Seeding in the browser timezone here silently
    // shifted events saved in another zone.
    const tz = event.timeZone || 'Asia/Kolkata';
    setForm({
      title: event.title ?? '',
      description: stripQuantMeta(event.description),
      start: toZonedInputValue(event.startTime, tz),
      end: toZonedInputValue(event.endTime, tz),
      allDay: Boolean(event.allDay),
      location: event.location ?? '',
      timezone: tz,
    });
    setSaveError(null);
    setEditing(true);
  };

  // Switching the timezone keeps the same instant — the wall-clock inputs
  // are re-rendered in the new zone instead of being re-interpreted.
  const handleTimezoneChange = (tz: string) => {
    setForm((f) => ({
      ...f,
      timezone: tz,
      start: f.start ? toZonedInputValue(zonedInputToIso(f.start, f.timezone), tz) : f.start,
      end: f.end ? toZonedInputValue(zonedInputToIso(f.end, f.timezone), tz) : f.end,
    }));
  };

  const handleSave = async () => {
    if (!eventId || !form.title.trim() || !form.start) {
      setSaveError('A title and a start time are required.');
      return;
    }
    // fix/qm-calendar-event-guest-notify — Gmail parity: when the event has
    // guests, saving asks "Send update to guests?" instead of silently
    // skipping the update email. The choice rides on the PUT as sendUpdate.
    if ((event?.attendees ?? []).length > 0) {
      setConfirmSendUpdate(true);
      return;
    }
    await doSave(false);
  };

  const doSave = async (sendUpdate: boolean) => {
    if (!eventId) return;
    setConfirmSendUpdate(false);
    setSaveError(null);
    try {
      const saved = (await updateEvent.mutateAsync({
        id: eventId,
        data: {
          title: form.title.trim(),
          description: form.description,
          // Interpret the wall-clock inputs in the chosen timezone, and tell
          // the backend which zone they belong to, so a save never silently
          // shifts an event stored in another zone.
          startTime: zonedInputToIso(form.start, form.timezone),
          endTime: form.end ? zonedInputToIso(form.end, form.timezone) : undefined,
          location: form.location,
          timezone: form.timezone,
          ...(form.allDay ? { allDay: true } : {}),
          ...(sendUpdate ? { sendUpdate: true } : {}),
        } as never,
      })) as { guestNotification?: GuestNotificationStatus } | undefined;
      setEditing(false);
      // Honest reporting: never claim guests were updated unless the backend
      // actually sent the update email.
      const guestNote = guestNotificationToastText(saved?.guestNotification, 'update');
      setSaveNotice(guestNote);
      void refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the event.');
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;
    try {
      const deleted = (await deleteEvent.mutateAsync({
        id: eventId,
        notifyGuests,
      })) as { guestNotification?: GuestNotificationStatus } | undefined;
      // Honest reporting: carry the guest-notification outcome to the
      // calendar page so it can tell the user what really happened.
      const gn = deleted?.guestNotification;
      const suffix =
        gn && (gn.notified || (gn.reason && !['no-guests', 'declined', 'not-requested'].includes(gn.reason)))
          ? `?guestNotice=${gn.reason}${gn.notified ? `:${gn.count}` : ''}`
          : '';
      router.push(`/calendar${suffix}`);
    } catch {
      // deleteEvent surfaces through its own error; stay on the page.
    }
  };

  // One gate per page instance; the post closure is resolved lazily so the
  // declaration order (postRsvp below) is safe.
  const gateRef = useRef<ReturnType<typeof createRsvpWriteGate> | null>(null);
  const getGate = () => {
    if (!gateRef.current) {
      gateRef.current = createRsvpWriteGate({ post: (status) => postRsvp(status) });
    }
    return gateRef.current;
  };

  const handleRsvp = (status: RsvpStatus, opener?: HTMLButtonElement | null) => {
    if (!eventId) return;
    // The pre-write gate decides: non-recurring events post directly (no
    // scope surprise possible); recurring series open the confirmation
    // dialog with NO POST. Cancel/back = zero mutation.
    const intent = planRsvpWrite(eventId, event?.recurrence);
    const needsConfirm = getGate().request(status, intent);
    if (needsConfirm) {
      setRsvpError(null);
      openerRef.current = opener ?? null;
      setPendingRsvp({ status, scope: intent.scope });
    }
  };

  const confirmPendingRsvp = () => {
    // Gate guarantees a single POST per intent (double-tap/key-repeat are
    // no-ops). The dialog closes immediately; pending/retry state lives on
    // the RSVP buttons (disabled via rsvp.isPending) and rsvpError below.
    const p = getGate().confirm();
    setPendingRsvp(null);
    if (p) void p.catch(() => {});
  };

  const cancelPendingRsvp = () => {
    // Zero mutation: the gate's Cancel path performs no POST.
    getGate().cancel();
    setPendingRsvp(null);
  };

  const postRsvp = async (status: RsvpStatus) => {
    setRsvpError(null);
    setRsvpConfirmation(null);
    try {
      const result = await rsvp.mutateAsync({ id: eventId, status });
      void refetch();
      // Prefer the backend's authoritative scope; derive the same shape
      // client-side when the backend predates rsvpScope (deploy skew).
      const scope: RsvpScopeInfo =
        result?.rsvpScope ?? fallbackRsvpScope(eventId, event?.recurrence);
      setRsvpConfirmation({ status, scope });
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : 'Could not update your response.');
    }
  };

  const recurrenceLabel = event ? fromRRule(event.recurrence) : 'Does not repeat';
  const attendees = event?.attendees ?? [];
  const reminders = event?.reminders ?? [];

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--quant-border)] p-3 sm:p-4">
          <button
            type="button"
            onClick={() => router.push('/calendar')}
            aria-label="Back to calendar"
            className="grid h-10 w-10 place-items-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]"
          >
            <Icon name="back" className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
            {isLoading ? 'Loading event…' : event?.title || 'Event'}
          </h1>
          {/* Read-only for invited guests: only the organizer edits or deletes. */}
          {!isLoading && !error && event && !editing && event.viewerIsOwner !== false && (
            <>
              <Button variant="secondary" onClick={openEdit} aria-label="Edit event">
                <Icon name="pencil" className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setNotifyGuests(true);
                  setConfirmDelete(true);
                }}
                aria-label="Delete event"
              >
                <Icon name="trash" className="h-4 w-4 text-red-400" />
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
            {isLoading && (
              <div className="space-y-4" aria-label="Loading event">
                <Skeleton variant="rect" width="60%" height="28px" />
                <Skeleton variant="rect" width="100%" height="120px" />
                <Skeleton variant="rect" width="100%" height="160px" />
              </div>
            )}

            {error && (
              <ErrorState
                message={error.message}
                onRetry={() => void refetch()}
              />
            )}

            {/* fix/qm-calendar-event-guest-notify: the backend's honest guest-
                notification outcome after a save — never a faked confirmation. */}
            {saveNotice && !isLoading && !error && event && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 p-3 text-sm">
                <p>{saveNotice}</p>
                <button
                  type="button"
                  onClick={() => setSaveNotice(null)}
                  aria-label="Dismiss"
                  className="shrink-0 text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                >
                  ✕
                </button>
              </div>
            )}

            {!isLoading && !error && !event && (
              <EmptyState
                title="Event not found"
                description="This event may have been deleted, or the link is wrong."
                actionLabel="Back to calendar"
                onAction={() => router.push('/calendar')}
              />
            )}

            {!isLoading && !error && event && editing && (
              <div className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 p-4">
                <h2 className="text-sm font-semibold">Edit event</h2>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Title</span>
                  <input
                    className="h-11 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    aria-label="Event title"
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Starts</span>
                    <input
                      type="datetime-local"
                      className="h-11 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                      value={form.start}
                      onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                      aria-label="Event start"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Ends</span>
                    <input
                      type="datetime-local"
                      className="h-11 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                      value={form.end}
                      onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                      aria-label="Event end"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Time zone</span>
                  <select
                    className="h-11 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                    value={form.timezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    aria-label="Event time zone"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                    {!TIMEZONES.some((tz) => tz.value === form.timezone) && form.timezone && (
                      <option value={form.timezone}>{form.timezone}</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Location</span>
                  <input
                    className="h-11 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Room, address, or meeting link"
                    aria-label="Event location"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">Description</span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    aria-label="Event description"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allDay}
                    onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                    className="h-4 w-4 accent-[var(--app-accent)]"
                  />
                  All-day event
                </label>
                {saveError && (
                  <p role="alert" className="text-sm text-red-400">{saveError}</p>
                )}
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  Attendees, recurrence and reminders are edited from the calendar —
                  this keeps one owner for event state.
                </p>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => void handleSave()} disabled={updateEvent.isPending}>
                    {updateEvent.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && !error && event && !editing && (
              <>
                {/* When */}
                <Section icon="clock" title="When">
                  <p className="text-sm font-medium">
                    {formatWhen(event.startTime, event.endTime, Boolean(event.allDay), event.timeZone)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.allDay && (
                      <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-muted)] px-2.5 py-1 text-xs">
                        All day
                      </span>
                    )}
                    {event.timeZone && (
                      <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-muted)] px-2.5 py-1 text-xs">
                        {event.timeZone}
                      </span>
                    )}
                    {event.status && event.status !== 'confirmed' && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
                        {event.status}
                      </span>
                    )}
                  </div>
                </Section>

                {/* Where / meeting link */}
                {event.location && (
                  <Section icon="pin" title="Where">
                    {isUrl(event.location) ? (
                      <a
                        href={event.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--app-accent)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      >
                        <Icon name="link" className="h-4 w-4" />
                        Join meeting
                      </a>
                    ) : (
                      <p className="text-sm">{event.location}</p>
                    )}
                    {isUrl(event.location) && (
                      <p className="mt-2 break-all text-xs text-[var(--quant-muted-foreground)]">{event.location}</p>
                    )}
                  </Section>
                )}

                {/* Attached files */}
                <Section icon="link" title="Files">
                  {event.driveLink ? (
                    isUrl(event.driveLink) ? (
                      <>
                        <a
                          href={event.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--app-accent)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
                        >
                          <Icon name="link" className="h-4 w-4" />
                          Open link
                        </a>
                        <p className="mt-2 break-all text-xs text-[var(--quant-muted-foreground)]">
                          {event.driveLink}
                        </p>
                      </>
                    ) : (
                      <p className="break-all text-sm">{event.driveLink}</p>
                    )
                  ) : (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">No files attached.</p>
                  )}
                </Section>

                {/* Description */}
                {event.description && stripQuantMeta(event.description) && (
                  <Section icon="pencil" title="Description">
                    <p className="whitespace-pre-wrap text-sm text-[var(--quant-foreground)]/90">
                      {stripQuantMeta(event.description)}
                    </p>
                  </Section>
                )}

                {/* Attendees */}
                <Section icon="users" title={`Attendees (${attendees.length})`}>
                  {attendees.length === 0 ? (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">No attendees — just you.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--quant-border)]">
                      {attendees.map((a) => (
                        <li key={a.email} className="flex items-center gap-3 py-2.5">
                          <span
                            aria-hidden="true"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--quant-muted)] text-sm font-semibold"
                          >
                            {(a.name || a.email).charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{a.name || a.email}</span>
                            {a.name && (
                              <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">{a.email}</span>
                            )}
                          </span>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${rsvpTone(a.status ?? 'pending')}`}>
                            {RSVP_LABELS[(a.status as RsvpStatus) ?? 'pending'] ?? a.status ?? 'No response'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Your response — only offered when the viewer is an attendee.
                      Otherwise the button 403s ("not an attendee"), so the
                      affordance itself is wrong. */}
                  {event.viewerIsAttendee && (
                    <div className="mt-4 border-t border-[var(--quant-border)] pt-4">
                      <p className="mb-2 text-xs font-medium text-[var(--quant-muted-foreground)]">Your response</p>
                      <div className="flex flex-wrap gap-2">
                        {(['accepted', 'tentative', 'declined'] as RsvpStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={(e) => handleRsvp(status, e.currentTarget)}
                            disabled={rsvp.isPending}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--quant-border)] px-4 text-sm font-medium transition-colors hover:bg-[var(--quant-muted)] disabled:opacity-50"
                            aria-label={`Respond ${RSVP_LABELS[status]}`}
                          >
                            <Icon name="check" className="h-3.5 w-3.5" />
                            {RSVP_LABELS[status]}
                          </button>
                        ))}
                      </div>
                      {rsvpError && (
                        <p role="alert" className="mt-2 text-sm text-red-400">{rsvpError}</p>
                      )}
                      {rsvpConfirmation && !rsvpError && (
                        <RsvpScopeConfirmation
                          status={rsvpConfirmation.status}
                          scope={rsvpConfirmation.scope}
                          timeZone={event.timeZone}
                        />
                      )}
                      {/* Pre-write scope gate: series-wide effect confirmed
                          BEFORE any POST; Cancel = zero mutation. */}
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
                    </div>
                  )}
                </Section>

                {/* Recurrence */}
                <Section icon="repeat" title="Recurrence">
                  <p className="text-sm">{recurrenceLabel}</p>
                  {event.recurrence && recurrenceLabel === 'Custom interval…' && (
                    <p className="mt-1 font-mono text-xs text-[var(--quant-muted-foreground)]">{event.recurrence}</p>
                  )}
                </Section>

                {/* Reminders */}
                <Section icon="bell" title="Reminders">
                  {reminders.length === 0 ? (
                    <p className="text-sm text-[var(--quant-muted-foreground)]">No reminders set.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {reminders.map((r, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Icon name="bell" className="h-3.5 w-3.5 text-[var(--quant-muted-foreground)]" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Button variant="secondary" onClick={() => router.push('/calendar')} className="w-full">
                  Open in Calendar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Delete event">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
              <h2 className="text-base font-semibold">Delete this event?</h2>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                “{event?.title}” will be permanently deleted from your calendar.
              </p>
              {attendees.length > 0 && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notifyGuests}
                    onChange={(e) => setNotifyGuests(e.target.checked)}
                    className="h-4 w-4 accent-[var(--app-accent)]"
                  />
                  Notify guests by email
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    ({attendees.length} guest{attendees.length === 1 ? '' : 's'})
                  </span>
                </label>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                  Keep
                </Button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); void handleDelete(); }}
                  disabled={deleteEvent.isPending}
                  className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {deleteEvent.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Send update to guests? — Gmail parity on edit-save */}
        {confirmSendUpdate && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Send update to guests">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
              <h2 className="text-base font-semibold">Send update to guests?</h2>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                “{event?.title}” has {attendees.length} guest{attendees.length === 1 ? '' : 's'}.
                Email them an updated invitation?
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => void doSave(false)} className="flex-1" disabled={updateEvent.isPending}>
                  Don&apos;t send
                </Button>
                <button
                  type="button"
                  onClick={() => void doSave(true)}
                  disabled={updateEvent.isPending}
                  className="min-h-11 flex-1 rounded-lg bg-[var(--app-accent)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {updateEvent.isPending ? 'Saving…' : 'Send update'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
