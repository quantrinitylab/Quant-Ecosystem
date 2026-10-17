/**
 * mail-notification-mode lib — the frontend copy of the mode contract.
 *
 * The mode itself is enforced server-side (the inbound webhook reads it from
 * `User.preferences`); these tests hold the shared vocabulary to the three
 * values the backend accepts, so the settings UI can never offer a mode the
 * API would reject or misread.
 */
import { describe, expect, it } from 'vitest';
import {
  MAIL_NOTIFICATION_MODE_OPTIONS,
  MAIL_NOTIFICATION_MODES,
  normalizeMailNotificationMode,
} from '../lib/mail-notification-mode';

describe('mail notification modes', () => {
  it('is exactly the three modes the backend validates', () => {
    expect([...MAIL_NOTIFICATION_MODES]).toEqual(['all', 'important', 'off']);
  });

  it('offers one labelled option per mode, each with honest copy', () => {
    expect(MAIL_NOTIFICATION_MODE_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'important',
      'off',
    ]);
    for (const option of MAIL_NOTIFICATION_MODE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it('normalizes anything unexpected to the fail-open default', () => {
    expect(normalizeMailNotificationMode('important')).toBe('important');
    expect(normalizeMailNotificationMode('off')).toBe('off');
    expect(normalizeMailNotificationMode('all')).toBe('all');
    expect(normalizeMailNotificationMode('everything')).toBe('all');
    expect(normalizeMailNotificationMode(undefined)).toBe('all');
    expect(normalizeMailNotificationMode(null)).toBe('all');
  });
});
