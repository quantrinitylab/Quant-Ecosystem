// @vitest-environment node
// ============================================================================
// call-reminder-notify — the QM-SCREEN-015 wiring: due call-alarms become
// real `call_reminder` notification rows and are pushed, honestly.
//
// Contracts under test:
//   - a due call alarm persists exactly one userId-scoped row of type
//     `call_reminder` whose title/body/data are derived only from the real
//     event (no invented copy), and drives the push transport once with the
//     same copy;
//   - idempotency: a second run for the same (event, fireAt) creates no
//     second row and sends no second push;
//   - non-due, far-future, and cancelled events create nothing;
//   - another user's events never leak into this user's rows (userId scoping
//     on both the event query and the row write);
//   - a push-side failure still leaves the persisted row in place and never
//     throws out of the service.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import type { WebPushSendHandler } from '@quant/notifications';
import {
  CALL_REMINDER_TYPE,
  persistDueCallReminders,
  sweepDueCallReminders,
  type CallReminderEventRow,
  type CallReminderEventStore,
  type CallReminderNotificationStore,
  type CallReminderNotifyDeps,
} from '../services/call-reminder-notify.service';
import type { PushSubscriptionStore } from '../services/push-delivery.service';

const TEST_VAPID = {
  subject: 'mailto:push@quantmail.in',
  publicKey: 'BTestPublicKey',
  privateKey: 'test-private-key',
};

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  sourceEntityId: string | null;
}

interface PushSubRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiresAt: Date | null;
  createdAt: Date;
}

function eventRow(overrides: Partial<CallReminderEventRow> = {}): CallReminderEventRow {
  return {
    id: 'evt-1',
    userId: 'user-1',
    title: 'Design review call',
    startTime: new Date('2026-10-11T10:00:00.000Z'),
    status: 'confirmed',
    reminders: [{ type: 'call', minutesBefore: 15 }],
    ...overrides,
  };
}

function pushSubRow(userId: string, endpoint: string): PushSubRow {
  return {
    id: `sub-${userId}`,
    userId,
    endpoint,
    p256dh: 'p256dh',
    auth: 'auth',
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeStores(initialEvents: CallReminderEventRow[], pushSubs: PushSubRow[] = []) {
  const events = [...initialEvents];
  const notifications: NotificationRow[] = [];
  let seq = 0;

  const eventStore: CallReminderEventStore = {
    findMany: vi.fn(async ({ where }) => {
      return events.filter((row) => {
        if (where.userId !== undefined && row.userId !== where.userId) return false;
        const start = row.startTime instanceof Date ? row.startTime : new Date(row.startTime);
        if (!(start < where.startTime.lt)) return false;
        return true;
      });
    }),
  };
  const notificationStore: CallReminderNotificationStore = {
    findFirst: vi.fn(async ({ where }) => {
      const found = notifications.find(
        (row) =>
          row.userId === where.userId &&
          row.type === where.type &&
          row.sourceEntityId === where.sourceEntityId,
      );
      return found ? { id: found.id } : null;
    }),
    create: vi.fn(async ({ data }) => {
      seq += 1;
      notifications.push({
        id: `notif-${seq}`,
        userId: data['userId'] as string,
        type: data['type'] as string,
        title: data['title'] as string,
        body: (data['body'] as string | null) ?? null,
        sourceEntityId: (data['sourceEntityId'] as string | null) ?? null,
      });
      return { id: `notif-${seq}` };
    }),
  };
  const pushStore: PushSubscriptionStore = {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      pushSubs.filter((row) => row.userId === where.userId),
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  return { events, notifications, eventStore, notificationStore, pushStore };
}

function makeDeps(
  stores: ReturnType<typeof makeStores>,
  overrides: {
    sendHandler?: WebPushSendHandler;
    pushFindMany?: PushSubscriptionStore['findMany'];
  } = {},
): { deps: CallReminderNotifyDeps; sent: Array<{ endpoint: string; payload: unknown }> } {
  const sent: Array<{ endpoint: string; payload: unknown }> = [];
  const sendHandler: WebPushSendHandler =
    overrides.sendHandler ??
    (async (subscription, serializedPayload) => {
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(serializedPayload) });
      return { success: true, endpoint: subscription.endpoint, statusCode: 201 };
    });
  if (overrides.pushFindMany) {
    stores.pushStore.findMany = overrides.pushFindMany;
  }
  const deps: CallReminderNotifyDeps = {
    events: stores.eventStore,
    notifications: stores.notificationStore,
    push: { store: stores.pushStore, vapid: TEST_VAPID, sendHandler },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    // Wide ring window so the test clock does not have to thread a 120s needle.
    ringWindowSec: 3600,
  };
  return { deps, sent };
}

// Event starts in 10 minutes; the 15-minutes-before call reminder fired
// 5 minutes ago — inside the ring window.
const NOW = new Date('2026-10-11T09:50:00.000Z');

describe('persistDueCallReminders', () => {
  it('persists one userId-scoped call_reminder row and pushes it once', async () => {
    const stores = makeStores([eventRow()], [pushSubRow('user-1', 'https://push.example.com/u1')]);
    const { deps, sent } = makeDeps(stores);

    const result = await persistDueCallReminders(deps, 'user-1', NOW);

    expect(result.due).toHaveLength(1);
    expect(result.persisted).toBe(1);
    expect(stores.notifications).toHaveLength(1);
    const row = stores.notifications[0]!;
    expect(row.userId).toBe('user-1');
    expect(row.type).toBe(CALL_REMINDER_TYPE);
    // Only real event data in the copy: the event's own title and the
    // computed time until start — nothing invented.
    expect(row.title).toBe('Call reminder: Design review call');
    expect(row.body).toBe('Starts in 10 minutes');
    expect(row.sourceEntityId).toContain('evt-1');

    // The push transport drove exactly once, for the same user, same copy.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe('https://push.example.com/u1');
    const payload = sent[0]!.payload as { title: string; body: string; tag: string };
    expect(payload.title).toBe('Call reminder: Design review call');
    expect(payload.body).toBe('Starts in 10 minutes');
    expect(payload.tag).toContain('evt-1');
    expect(result.push).toHaveLength(1);
    expect(result.push[0]).toMatchObject({ status: 'sent', delivered: 1 });
  });

  it('is idempotent: the same due alarm never creates a second row or push', async () => {
    const stores = makeStores([eventRow()], [pushSubRow('user-1', 'https://push.example.com/u1')]);
    const { deps, sent } = makeDeps(stores);

    const first = await persistDueCallReminders(deps, 'user-1', NOW);
    const second = await persistDueCallReminders(deps, 'user-1', NOW);

    expect(first.persisted).toBe(1);
    expect(second.persisted).toBe(0);
    expect(second.skippedExisting).toBe(1);
    expect(stores.notifications).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('creates nothing for far-future reminders, non-call reminders, or cancelled events', async () => {
    const stores = makeStores(
      [
        // Reminder fires in 2 hours — outside the ring window.
        eventRow({ id: 'evt-future', startTime: new Date('2026-10-11T12:00:00.000Z') }),
        // Push-type reminder, not a call reminder.
        eventRow({ id: 'evt-push', reminders: [{ type: 'push', minutesBefore: 15 }] }),
        // Cancelled event.
        eventRow({ id: 'evt-cancelled', status: 'cancelled' }),
      ],
      [pushSubRow('user-1', 'https://push.example.com/u1')],
    );
    const { deps, sent } = makeDeps(stores);

    const result = await persistDueCallReminders(deps, 'user-1', NOW);

    expect(result.due).toHaveLength(0);
    expect(result.persisted).toBe(0);
    expect(stores.notifications).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('never mixes users: the event query and the row write are both userId-scoped', async () => {
    const stores = makeStores(
      [eventRow({ id: 'evt-a', userId: 'user-a' }), eventRow({ id: 'evt-b', userId: 'user-b' })],
      [pushSubRow('user-a', 'https://push.example.com/ua')],
    );
    const { deps, sent } = makeDeps(stores);

    const result = await persistDueCallReminders(deps, 'user-a', NOW);

    expect(result.persisted).toBe(1);
    expect(stores.notifications).toHaveLength(1);
    expect(stores.notifications[0]!.userId).toBe('user-a');
    expect(stores.notifications[0]!.sourceEntityId).toContain('evt-a');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe('https://push.example.com/ua');
  });

  it('keeps the persisted row and never throws when push delivery fails', async () => {
    const stores = makeStores([eventRow()]);
    const { deps, sent } = makeDeps(stores, {
      // The subscription lookup itself blows up — deliverPushToUser throws,
      // and the service must contain it.
      pushFindMany: (async () => {
        throw new Error('push store down');
      }) as PushSubscriptionStore['findMany'],
    });

    let result;
    await expect(
      (async () => {
        result = await persistDueCallReminders(deps, 'user-1', NOW);
      })(),
    ).resolves.not.toThrow();

    expect(result!.persisted).toBe(1);
    expect(stores.notifications).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect(deps.log!.error).toHaveBeenCalled();
  });
});

describe('sweepDueCallReminders', () => {
  it('sweeps every user with due alarms in one pass, scoping each row to its owner', async () => {
    const stores = makeStores(
      [eventRow({ id: 'evt-a', userId: 'user-a' }), eventRow({ id: 'evt-b', userId: 'user-b' })],
      [
        pushSubRow('user-a', 'https://push.example.com/ua'),
        pushSubRow('user-b', 'https://push.example.com/ub'),
      ],
    );
    const { deps, sent } = makeDeps(stores);

    const result = await sweepDueCallReminders(deps, NOW);

    expect(result.users).toBe(2);
    expect(result.due).toBe(2);
    expect(result.persisted).toBe(2);
    expect(result.truncated).toBe(false);
    const owners = stores.notifications.map((row) => row.userId).sort();
    expect(owners).toEqual(['user-a', 'user-b']);
    // Each owner got exactly one push to their own endpoint.
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      'https://push.example.com/ua',
      'https://push.example.com/ub',
    ]);
  });

  it('reports an empty sweep honestly instead of inventing rows', async () => {
    const stores = makeStores([]);
    const { deps, sent } = makeDeps(stores);

    const result = await sweepDueCallReminders(deps, NOW);

    expect(result).toEqual({ users: 0, due: 0, persisted: 0, skippedExisting: 0, truncated: false });
    expect(stores.notifications).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
