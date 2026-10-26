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
  MAIL_NOTIFICATION_LABEL_OVERRIDE_OPTIONS,
  MAIL_NOTIFICATION_LABEL_OVERRIDES,
  MAIL_NOTIFICATION_MODE_OPTIONS,
  MAIL_NOTIFICATION_MODES,
  normalizeMailNotificationLabelOverrides,
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

describe('mail notification label overrides', () => {
  it('is exactly the two overrides the backend validates', () => {
    expect([...MAIL_NOTIFICATION_LABEL_OVERRIDES]).toEqual(['all', 'none']);
  });

  it('offers follow-global plus one labelled option per override, each with honest copy', () => {
    expect(MAIL_NOTIFICATION_LABEL_OVERRIDE_OPTIONS.map((option) => option.value)).toEqual([
      null,
      'all',
      'none',
    ]);
    for (const option of MAIL_NOTIFICATION_LABEL_OVERRIDE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps only string ids mapped to all/none', () => {
    expect(
      normalizeMailNotificationLabelOverrides({
        'lbl-1': 'all',
        'lbl-2': 'none',
        'lbl-3': 'everything',
        'lbl-4': null,
      }),
    ).toEqual({ 'lbl-1': 'all', 'lbl-2': 'none' });
  });

  it('normalizes non-objects to an empty map', () => {
    expect(normalizeMailNotificationLabelOverrides(undefined)).toEqual({});
    expect(normalizeMailNotificationLabelOverrides(null)).toEqual({});
    expect(normalizeMailNotificationLabelOverrides('all')).toEqual({});
    expect(normalizeMailNotificationLabelOverrides([{ 'lbl-1': 'all' }])).toEqual({});
  });
});
