// fix/qm-calendar-event-guest-notify — the guest-notification copy must never
// fake a confirmation: null when the user declined / never asked / had no
// guests, and a truthful reason otherwise.
import { describe, it, expect } from 'vitest';
import { guestNotificationToastText } from '../guest-notify';

describe('guestNotificationToastText', () => {
  it('returns null when there is nothing to tell the user', () => {
    expect(guestNotificationToastText(undefined, 'update')).toBeNull();
    expect(
      guestNotificationToastText({ notified: false, count: 0, reason: 'no-guests' }, 'cancellation'),
    ).toBeNull();
    expect(
      guestNotificationToastText({ notified: false, count: 0, reason: 'declined' }, 'update'),
    ).toBeNull();
    expect(
      guestNotificationToastText({ notified: false, count: 0, reason: 'not-requested' }, 'update'),
    ).toBeNull();
  });

  it('confirms a real send with the guest count', () => {
    expect(
      guestNotificationToastText({ notified: true, count: 2, reason: 'sent' }, 'cancellation'),
    ).toContain('2 guests');
    expect(
      guestNotificationToastText({ notified: true, count: 1, reason: 'sent' }, 'update'),
    ).toContain('1 guest');
  });

  it('states the failure honestly, never as success', () => {
    const notConfigured = guestNotificationToastText(
      { notified: false, count: 0, reason: 'mail-not-configured' },
      'update',
    )!;
    expect(notConfigured).toContain('not sent');
    const failed = guestNotificationToastText(
      { notified: false, count: 0, reason: 'send-failed' },
      'cancellation',
    )!;
    expect(failed).toContain('failed to send');
    expect(notConfigured).not.toMatch(/emailed to \d/);
    expect(failed).not.toMatch(/emailed to \d/);
  });

  it('admits occurrence-level notifications are not wired yet', () => {
    expect(
      guestNotificationToastText(
        { notified: false, count: 0, reason: 'occurrence-notify-not-wired' },
        'cancellation',
      ),
    ).toContain('not wired yet');
  });
});
