// Desktop alert tag must collapse per conversation, not per message.
//
// Regression: useNewMailDesktopAlerts passed `tag: newest.id` — the
// notification row's own id, unique per message — so a thread gaining three
// messages stacked three OS notifications, contradicting the contract on
// DesktopNotificationInput.tag ("one tag per conversation") and the web-push
// path (`tag: email.threadId ?? email.id` in inbound-webhook.ts). The fix
// derives the tag in `desktopAlertTag` (row `data.threadId`, else the
// /thread/<id> deep link, else `data.emailId`, else the row id) and the hook
// passes exactly that value as `tag`.
//
// These tests pin the derivation and its fallback order. There is deliberately
// no hook-effect test here: under jsdom, React Query observer effects for
// refetched data never arrive (only the mount effect runs — the same
// observer-flakiness class the useSearchEmails-failure test documents), so an
// effect-level test would assert on the harness, not the product. The wiring
// itself is one line (`tag: desktopAlertTag(newest)`) in the hook.
import { describe, it, expect, vi } from 'vitest';
import { desktopAlertTag } from '../useNewMailDesktopAlerts';
import type { AppNotification } from '../useNotifications';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(),
}));

vi.mock('../useDesktopNotifications', () => ({
  showDesktopNotification: vi.fn(),
  desktopNotificationsAllowed: () => true,
}));

function notification(
  overrides: Partial<AppNotification> & { id: string },
): AppNotification {
  return {
    type: 'new_email',
    title: 'New email',
    body: 'subject',
    actionUrl: null,
    priority: 'NORMAL',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('desktopAlertTag', () => {
  it('uses the stored thread id over everything else', () => {
    expect(
      desktopAlertTag(
        notification({
          id: 'notif-2',
          data: { emailId: 'email-2', threadId: 'thread-1' },
          actionUrl: '/thread/thread-1',
        }),
      ),
    ).toBe('thread-1');
  });

  it('falls back to the /thread/<id> deep link when the payload lacks a thread', () => {
    expect(
      desktopAlertTag(notification({ id: 'notif-2', actionUrl: '/thread/thread-9' })),
    ).toBe('thread-9');
  });

  it('falls back to the email id for thread-less mail (push-path parity)', () => {
    expect(
      desktopAlertTag(
        notification({
          id: 'notif-3',
          data: { emailId: 'email-3', threadId: null },
          actionUrl: '/inbox',
        }),
      ),
    ).toBe('email-3');
  });

  it('falls back to the notification id when nothing else identifies the mail', () => {
    expect(desktopAlertTag(notification({ id: 'notif-4' }))).toBe('notif-4');
  });

  it('never treats a non-thread deep link as a thread id', () => {
    expect(
      desktopAlertTag(notification({ id: 'notif-5', actionUrl: '/inbox' })),
    ).toBe('notif-5');
  });

  it('gives every message of one thread the same tag', () => {
    const tags = ['email-1', 'email-2', 'email-3'].map((emailId, i) =>
      desktopAlertTag(
        notification({
          id: `notif-${i + 1}`,
          data: { emailId, threadId: 'thread-1' },
          actionUrl: '/thread/thread-1',
        }),
      ),
    );
    expect(tags).toEqual(['thread-1', 'thread-1', 'thread-1']);
  });
});
