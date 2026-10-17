/**
 * Mail notification modes (frontend copy of the backend contract in
 * `backend/services/mail-notification-mode.service.ts`).
 *
 * One per-user setting, stored server-side in `User.preferences`: it filters
 * notification *creation* at the inbound webhook, so it covers the in-app
 * bell, web push, and the desktop-alert watcher's feed at once. The two
 * toggles on the Notifications tab stay per-device OS delivery gates
 * (browser permission + the user's ask on this machine).
 */

export const MAIL_NOTIFICATION_MODES = ['all', 'important', 'off'] as const;

export type MailNotificationMode = (typeof MAIL_NOTIFICATION_MODES)[number];

export function normalizeMailNotificationMode(value: unknown): MailNotificationMode {
  return value === 'all' || value === 'important' || value === 'off' ? value : 'all';
}

export interface MailNotificationModeOption {
  value: MailNotificationMode;
  label: string;
  description: string;
}

export const MAIL_NOTIFICATION_MODE_OPTIONS: MailNotificationModeOption[] = [
  {
    value: 'all',
    label: 'All new mail',
    description: 'A notification for every message that reaches your inbox.',
  },
  {
    value: 'important',
    label: 'Important mail only',
    description:
      'Only starred, high-priority and personal (Primary) mail. Newsletters, receipts and social updates stay silent.',
  },
  {
    value: 'off',
    label: 'Nothing',
    description: 'No mail notifications at all. Your mail still arrives normally.',
  },
];
