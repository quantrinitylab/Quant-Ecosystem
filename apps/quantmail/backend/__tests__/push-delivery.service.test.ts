// @vitest-environment node
// ============================================================================
// deliverPushToUser — the invocation half of QM-UIUX-053.
//
// The in-app notification path (QM-UIUX-052) persists a `Notification` row;
// this service is what turns that event into a Web Push delivery. Its
// contract is honesty under every configuration:
//
//   - no VAPID keys        → `not-configured`, nothing sent, nothing claimed;
//   - no subscriptions     → `no-subscriptions`;
//   - configured transport → the REAL `WebPushService` drives the injected
//                            transport boundary with the payload, and the
//                            outcome counts what the transport reported;
//   - 404/410 from the push service → the dead row is pruned from the store;
//   - other failures       → counted as failed, the row is kept.
//
// The store is an in-memory implementation of the `PushSubscriptionStore`
// slice; the transport is the substrate's own `setSendHandler` seam capturing
// exactly what would leave the server. No fake success anywhere: the
// capturing handler's results are the outcomes under test.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import type { WebPushSendHandler } from '@quant/notifications';
import {
  deliverPushToUser,
  type PushSubscriptionStore,
} from '../services/push-delivery.service';

const TEST_VAPID = {
  subject: 'mailto:push@quantmail.in',
  publicKey: 'BTestPublicKey',
  privateKey: 'test-private-key',
};

interface Row {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiresAt: Date | null;
  createdAt: Date;
}

function makeStore(initial: Row[]) {
  const rows = [...initial];
  const store: PushSubscriptionStore = {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      rows.filter((row) => row.userId === where.userId),
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { userId: string; endpoint: { in: string[] } } }) => {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i]!;
          if (row.userId === where.userId && where.endpoint.in.includes(row.endpoint)) {
            rows.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
    ),
  };
  return { store, rows };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'sub-1',
    userId: 'user-1',
    endpoint: 'https://push.example.com/sub/1',
    p256dh: 'p256dh-1',
    auth: 'auth-1',
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const PAYLOAD = {
  title: 'New email from Ada <ada@example.com>',
  body: 'Quarterly report',
  tag: 'thread-1',
  data: { url: '/thread/thread-1', emailId: 'email-1', threadId: 'thread-1' },
};

describe('deliverPushToUser', () => {
  it('reports not-configured and sends nothing when VAPID keys are absent', async () => {
    const { store, rows } = makeStore([row()]);
    const outcome = await deliverPushToUser({ store, vapid: null }, 'user-1', PAYLOAD);
    expect(outcome).toEqual({ status: 'not-configured', delivered: 0, failed: 0, pruned: 0 });
    // The subscription row survives untouched — it becomes deliverable the
    // moment keys are provisioned.
    expect(rows).toHaveLength(1);
  });

  it('reports no-subscriptions when the user has none', async () => {
    const { store } = makeStore([]);
    const outcome = await deliverPushToUser({ store, vapid: TEST_VAPID }, 'user-1', PAYLOAD);
    expect(outcome).toEqual({ status: 'no-subscriptions', delivered: 0, failed: 0, pruned: 0 });
  });

  it('drives the configured transport with the payload for every subscription', async () => {
    const { store } = makeStore([
      row({ id: 'sub-1', endpoint: 'https://push.example.com/sub/1' }),
      row({ id: 'sub-2', endpoint: 'https://push.example.com/sub/2', p256dh: 'p256dh-2' }),
    ]);
    const calls: Array<{ endpoint: string; keys: unknown; payload: unknown }> = [];
    const sendHandler: WebPushSendHandler = async (subscription, serializedPayload) => {
      calls.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload: JSON.parse(serializedPayload),
      });
      return { success: true, endpoint: subscription.endpoint, statusCode: 201 };
    };

    const outcome = await deliverPushToUser(
      { store, vapid: TEST_VAPID, sendHandler },
      'user-1',
      PAYLOAD,
    );

    expect(outcome).toEqual({ status: 'sent', delivered: 2, failed: 0, pruned: 0 });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.endpoint).sort()).toEqual([
      'https://push.example.com/sub/1',
      'https://push.example.com/sub/2',
    ]);
    // The payload the browser's service worker will show is the real one.
    expect(calls[0]!.payload).toEqual(PAYLOAD);
    // Subscription keys come from the stored rows, per endpoint.
    const byEndpoint = new Map(calls.map((call) => [call.endpoint, call.keys]));
    expect(byEndpoint.get('https://push.example.com/sub/2')).toEqual({
      p256dh: 'p256dh-2',
      auth: 'auth-1',
    });
  });

  it('prunes a subscription the push service reports as gone (410)', async () => {
    const { store, rows } = makeStore([
      row({ id: 'sub-1', endpoint: 'https://push.example.com/sub/1' }),
      row({ id: 'sub-2', endpoint: 'https://push.example.com/sub/2' }),
    ]);
    const sendHandler: WebPushSendHandler = async (subscription) =>
      subscription.endpoint.endsWith('/sub/2')
        ? { success: false, endpoint: subscription.endpoint, statusCode: 410, error: 'Gone' }
        : { success: true, endpoint: subscription.endpoint, statusCode: 201 };

    const outcome = await deliverPushToUser(
      { store, vapid: TEST_VAPID, sendHandler },
      'user-1',
      PAYLOAD,
    );

    expect(outcome).toEqual({ status: 'sent', delivered: 1, failed: 1, pruned: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.endpoint).toBe('https://push.example.com/sub/1');
  });

  it('counts a transport failure without pruning the subscription', async () => {
    const { store, rows } = makeStore([row()]);
    const sendHandler: WebPushSendHandler = async (subscription) => ({
      success: false,
      endpoint: subscription.endpoint,
      statusCode: 500,
      error: 'push service error',
    });

    const outcome = await deliverPushToUser(
      { store, vapid: TEST_VAPID, sendHandler },
      'user-1',
      PAYLOAD,
    );

    expect(outcome).toEqual({ status: 'sent', delivered: 0, failed: 1, pruned: 0 });
    expect(rows).toHaveLength(1);
  });

  it('prunes expired subscriptions without sending to them', async () => {
    const { store, rows } = makeStore([
      row({ expiresAt: new Date(Date.now() - 60_000) }),
    ]);
    const sendHandler = vi.fn(async () => ({
      success: true,
      endpoint: 'https://push.example.com/sub/1',
      statusCode: 201,
    }));

    const outcome = await deliverPushToUser(
      { store, vapid: TEST_VAPID, sendHandler: sendHandler as WebPushSendHandler },
      'user-1',
      PAYLOAD,
    );

    expect(sendHandler).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'no-subscriptions', delivered: 0, failed: 0, pruned: 1 });
    expect(rows).toHaveLength(0);
  });

  it('only ever loads and prunes the target user\u2019s subscriptions', async () => {
    const { store, rows } = makeStore([
      row({ id: 'mine', userId: 'user-1', endpoint: 'https://push.example.com/mine' }),
      row({ id: 'theirs', userId: 'user-2', endpoint: 'https://push.example.com/theirs' }),
    ]);
    const sendHandler: WebPushSendHandler = async (subscription) => ({
      success: true,
      endpoint: subscription.endpoint,
      statusCode: 201,
    });

    const outcome = await deliverPushToUser(
      { store, vapid: TEST_VAPID, sendHandler },
      'user-1',
      PAYLOAD,
    );

    expect(outcome.delivered).toBe(1);
    expect(store.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(rows.map((candidate) => candidate.id).sort()).toEqual(['mine', 'theirs']);
  });
});
