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

// ---------------------------------------------------------------------------
// Per-label overrides (frontend copy of the backend contract in
// `backend/services/mail-notification-mode.service.ts`).
//
// Label id → 'all' | 'none'. An absent entry means "follow the global mode".
// Precedence, enforced server-side by the inbound webhook: global 'off' beats
// everything; a 'none' on any carried label beats an 'all' on another; an
// 'all' beats the global mode. The settings UI therefore never has to explain
// a conflict — it only ever sends the map the server stores.
// ---------------------------------------------------------------------------

export const MAIL_NOTIFICATION_LABEL_OVERRIDES = ['all', 'none'] as const;

export type MailNotificationLabelOverride = (typeof MAIL_NOTIFICATION_LABEL_OVERRIDES)[number];

/** Label id → override. */
export type MailNotificationLabelOverrides = Record<string, MailNotificationLabelOverride>;

export function normalizeMailNotificationLabelOverrides(
  value: unknown,
): MailNotificationLabelOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides: MailNotificationLabelOverrides = {};
  for (const [labelId, override] of Object.entries(value as Record<string, unknown>)) {
    if (labelId && (override === 'all' || override === 'none')) overrides[labelId] = override;
  }
  return overrides;
}

export interface MailNotificationLabelOverrideOption {
  /** null = no override: follow the global "Notify me about" mode. */
  value: MailNotificationLabelOverride | null;
  label: string;
  description: string;
}

export const MAIL_NOTIFICATION_LABEL_OVERRIDE_OPTIONS: MailNotificationLabelOverrideOption[] = [
  {
    value: null,
    label: 'Follow global setting',
    description: 'This label follows the "Notify me about" choice above.',
  },
  {
    value: 'all',
    label: 'Notify for every message',
    description: 'Mail with this label always notifies, even under "Important mail only".',
  },
  {
    value: 'none',
    label: 'Never notify',
    description: 'Mail with this label never notifies, even under "All new mail".',
  },
];
