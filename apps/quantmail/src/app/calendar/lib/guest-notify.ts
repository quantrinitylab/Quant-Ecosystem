// fix/qm-calendar-event-guest-notify — honest copy for the backend's
// guestNotification status. Returns null when there is nothing to tell the
// user (no guests, user declined, or they never asked) — the UI must never
// claim guests were notified when they were not.
import type { GuestNotificationStatus } from '../../../types';

export function guestNotificationToastText(
  status: GuestNotificationStatus | null | undefined,
  kind: 'update' | 'cancellation',
): string | null {
  if (!status) return null;
  const what = kind === 'cancellation' ? 'cancellation' : 'update';
  switch (status.reason) {
    case 'sent':
      return kind === 'cancellation'
        ? `Cancellation emailed to ${status.count} guest${status.count === 1 ? '' : 's'}.`
        : `Update emailed to ${status.count} guest${status.count === 1 ? '' : 's'}.`;
    case 'mail-not-configured':
      return `Saved, but the guest ${what} email was not sent — email sending is not configured.`;
    case 'send-failed':
      return `Saved, but the guest ${what} email failed to send.`;
    case 'occurrence-notify-not-wired':
      return `Guests were not emailed — notifications for a single occurrence are not wired yet.`;
    case 'no-guests':
    case 'not-requested':
    case 'declined':
    default:
      return null;
  }
}
