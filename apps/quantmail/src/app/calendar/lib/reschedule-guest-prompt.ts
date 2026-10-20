// fix/qm-calendar-drag-reschedule-guest-notify — Gmail parity for the
// week-view drag-to-reschedule path. A moved event with guests must ask
// "Send update to guests?" (the edit sheet's exact prompt copy) before the
// move persists, because the backend only emails guests a METHOD:REQUEST
// update when the payload carries sendUpdate: true (useCalendar.ts
// documents it on useUpdateEvent). Without this, a drag drop silently left
// every guest's invite stale at the old time.
//
// Contract, pinned by reschedule-guest-prompt.test.ts:
// - no attendees → no prompt at all, and sendUpdate is left OUT of the
//   payload (not even false);
// - attendees + confirm → sendUpdate: true;
// - attendees + decline → sendUpdate: false (the move still persists — the
//   user chose to move without emailing guests).
import type { ConfirmOptions } from '../../../hooks/useConfirm';
import type { CalendarEventLike } from '../types';
import { toAttendeeEmail } from './attendee-validation';

export async function buildReschedulePayload(
  event: CalendarEventLike,
  newStart: Date,
  newEnd: Date,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
): Promise<{ startTime: string; endTime: string; sendUpdate?: boolean }> {
  const base = {
    startTime: newStart.toISOString(),
    endTime: newEnd.toISOString(),
  };
  // Count only notifiable guests: legacy non-email attendee values are never
  // emailed by the backend, so they must not trigger the prompt or inflate
  // the guest count (matches the edit-sheet loader + notification validation).
  const attendeeCount = (event.attendees ?? []).filter(
    (a) => toAttendeeEmail(a) !== null,
  ).length;
  if (attendeeCount === 0) return base;
  // Reuse the edit sheet's exact copy so the two save paths ask the same
  // question the same way.
  const title = event.title.trim() || 'Untitled event';
  const sendUpdate = await confirm({
    title: 'Send update to guests?',
    message: `“${title}” has ${attendeeCount} guest${attendeeCount === 1 ? '' : 's'}. Send them an updated invitation by email?`,
    confirmLabel: 'Send update',
    cancelLabel: "Don't send",
  });
  return { ...base, sendUpdate };
}
