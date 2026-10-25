/**
 * Schedule-send state for the composers (fix/qm-compose-undo-schedule).
 *
 * The schedule used to live ONLY in `handleSend`'s argument and in the send
 * snapshot — there was no `scheduledAt` state variable in EmailComposer, so
 * undo restored every field except the one that decides WHEN the message
 * goes out, and the reopened composer showed no schedule at all. A re-send
 * then delivered immediately instead of at the chosen time.
 *
 * These two helpers are the single place that decides what counts as a
 * restorable schedule. They live in this tiny module (not in
 * EmailComposer.tsx) so unit tests can import them without pulling the whole
 * composer — next/dynamic, router, auth — into the test worker.
 */

/**
 * The schedule to restore after an undone send, or `undefined` when there is
 * nothing restorable. A time that is not in the future can no longer be
 * honored — it resolves to `undefined` so the caller can say so plainly
 * instead of silently sending immediately.
 *
 * Mirrors `ScheduleSendModal.isPastScheduleTime` exactly (a time equal to
 * `now` counts as past: it is already un-schedulable), without statically
 * importing that module — EmailComposer loads the modal dynamically, and a
 * static import here would defeat the split.
 */
export function resolveUndoScheduledAt(
  scheduledAt: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!scheduledAt) return undefined;
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) return undefined;
  if (at.getTime() <= now.getTime()) return undefined;
  return scheduledAt;
}

/**
 * The human label for a restored schedule, as shown in the composer's
 * schedule chip ("Scheduled to send Tue, Oct 27, 9:00 AM"). Returns `''`
 * for an unparseable value so the chip never renders a garbage time.
 */
export function formatScheduledSendTime(scheduledAt: string): string {
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
