// ============================================================================
// Unit tests — WebPushDispatcher (W3, design Component 3)
// Spec: quantchat-launch-readiness, Task 13.1
//
// Design: Component 3 (PushDispatcher), Key Function `PushDispatcher.dispatch`,
//         error-handling "Push subscription gone" row.
// Requirements:
//   9.1 — one delivery attempt per subscription
//   9.2 — prune subscriptions returning 404/410 gone
//   9.3 — retry transient failures with exponential backoff (1s, max 3 retries)
//   9.4 / 16.1 — generic E2EE body containing no plaintext
//   9.5 — per-subscription result (succeeded | pruned | exhausted)
//
// Drives the REAL WebPushDispatcher against in-memory doubles of its injected
// dependencies (web-push transport + subscription store) with a synchronous
// `sleep` so backoff windows are exercised deterministically without timers —
// mirroring the repo's established dependency-injection + fake-* test approach.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { genericNotification, type PushNotification } from '../services/delivery-worker';
import {
  WebPushDispatcher,
  computePushBackoffMs,
  buildPushPayload,
  PUSH_MAX_RETRIES,
  type PushSubscriptionStore,
  type StoredPushSubscription,
  type WebPushClient,
  type WebPushSubscription,
} from '../services/push-dispatcher';

// --- Test doubles ----------------------------------------------------------

/** Build a `WebPushError`-like rejection carrying an HTTP status code. */
function pushError(statusCode: number, message = 'push failed'): Error {
  return Object.assign(new Error(message), { statusCode });
}

/** A transient failure with no recognisable gone status code. */
function transientError(message = 'transient'): Error {
  return new Error(message);
}

type Outcome = 'ok' | Error;

/**
 * In-memory {@link WebPushClient}. The `plan(endpoint, attemptIndex)` callback
 * decides the outcome of each (0-based) attempt for a given endpoint, so a test
 * can model "fail twice transiently then succeed", "always 410 gone", etc.
 */
class FakeTransport implements WebPushClient {
  readonly calls: Array<{ subscription: WebPushSubscription; payload: string }> = [];

  constructor(private readonly plan: (endpoint: string, attemptIndex: number) => Outcome) {}

  async sendNotification(subscription: WebPushSubscription, payload: string): Promise<void> {
    const attemptIndex = this.calls.filter(
      (c) => c.subscription.endpoint === subscription.endpoint,
    ).length;
    this.calls.push({ subscription, payload });
    const outcome = this.plan(subscription.endpoint, attemptIndex);
    if (outcome !== 'ok') throw outcome;
  }

  callsFor(endpoint: string): Array<{ subscription: WebPushSubscription; payload: string }> {
    return this.calls.filter((c) => c.subscription.endpoint === endpoint);
  }
}

/** In-memory {@link PushSubscriptionStore} recording pruned subscription ids. */
class FakeStore implements PushSubscriptionStore {
  readonly pruned: string[] = [];

  constructor(private readonly subs: StoredPushSubscription[]) {}

  async listForUser(): Promise<StoredPushSubscription[]> {
    return this.subs;
  }

  async prune(subscriptionId: string): Promise<void> {
    this.pruned.push(subscriptionId);
  }
}

/** A synchronous sleep that records the backoff windows it was asked to wait. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

function sub(id: string, endpoint = `https://push.example/${id}`): StoredPushSubscription {
  return { id, endpoint, p256dh: `p256dh-${id}`, auth: `auth-${id}` };
}

const NOTIFICATION: PushNotification = genericNotification('conv-1');

// --- computePushBackoffMs --------------------------------------------------

describe('computePushBackoffMs — exponential backoff from 1s (Requirement 9.3)', () => {
  it('doubles from 1s per retry: 1s, 2s, 4s', () => {
    expect(computePushBackoffMs(1)).toBe(1_000);
    expect(computePushBackoffMs(2)).toBe(2_000);
    expect(computePushBackoffMs(3)).toBe(4_000);
  });

  it('treats retry numbers <= 0 as the first retry (1s base)', () => {
    expect(computePushBackoffMs(0)).toBe(1_000);
    expect(computePushBackoffMs(-5)).toBe(1_000);
  });
});

// --- Requirement 9.1: one attempt per subscription -------------------------

describe('WebPushDispatcher — one delivery attempt per subscription (Requirement 9.1)', () => {
  it("sends exactly one attempt to each of the user's subscriptions on success", async () => {
    const transport = new FakeTransport(() => 'ok');
    const store = new FakeStore([sub('a'), sub('b'), sub('c')]);
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    expect(transport.calls).toHaveLength(3);
    expect(transport.callsFor('https://push.example/a')).toHaveLength(1);
    expect(result.userId).toBe('user-1');
    expect(result.results.map((r) => r.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
  });

  it('returns an empty result for a user with no subscriptions', async () => {
    const transport = new FakeTransport(() => 'ok');
    const store = new FakeStore([]);
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store });

    const result = await dispatcher.dispatch('user-empty', NOTIFICATION);

    expect(result).toEqual({ userId: 'user-empty', results: [] });
    expect(transport.calls).toHaveLength(0);
  });
});

// --- Requirement 9.2: prune gone subscriptions -----------------------------

describe('WebPushDispatcher — prunes gone subscriptions (Requirement 9.2)', () => {
  for (const goneCode of [404, 410]) {
    it(`prunes a subscription that returns ${goneCode} and reports it as pruned`, async () => {
      const transport = new FakeTransport(() => pushError(goneCode, `gone-${goneCode}`));
      const store = new FakeStore([sub('gone')]);
      const { sleep, delays } = recordingSleep();
      const dispatcher = new WebPushDispatcher({ transport, subscriptions: store, sleep });

      const result = await dispatcher.dispatch('user-1', NOTIFICATION);

      // Gone is terminal: exactly one attempt, no retries/backoff.
      expect(transport.calls).toHaveLength(1);
      expect(delays).toHaveLength(0);
      expect(store.pruned).toEqual(['gone']);
      expect(result.results).toEqual([{ endpoint: 'https://push.example/gone', status: 'pruned' }]);
    });
  }

  it('prunes only the gone subscription while others succeed', async () => {
    const transport = new FakeTransport((endpoint) =>
      endpoint.endsWith('/dead') ? pushError(410) : 'ok',
    );
    const store = new FakeStore([sub('live'), sub('dead'), sub('live2')]);
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    expect(store.pruned).toEqual(['dead']);
    expect(result.results).toEqual([
      { endpoint: 'https://push.example/live', status: 'succeeded' },
      { endpoint: 'https://push.example/dead', status: 'pruned' },
      { endpoint: 'https://push.example/live2', status: 'succeeded' },
    ]);
  });
});

// --- Requirement 9.3: retry/backoff on transient failures ------------------

describe('WebPushDispatcher — retry with exponential backoff on transient errors (Requirement 9.3)', () => {
  it('retries up to 3 times with backoff 1s, 2s, 4s then reports exhausted (Requirement 9.5)', async () => {
    const transport = new FakeTransport(() => transientError()); // always transient
    const store = new FakeStore([sub('flaky')]);
    const { sleep, delays } = recordingSleep();
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store, sleep });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    // 1 initial attempt + 3 retries = 4 sends; 3 backoff windows in between.
    expect(transport.calls).toHaveLength(PUSH_MAX_RETRIES + 1);
    expect(delays).toEqual([1_000, 2_000, 4_000]);
    expect(store.pruned).toHaveLength(0); // transient, never pruned
    expect(result.results).toEqual([
      { endpoint: 'https://push.example/flaky', status: 'exhausted' },
    ]);
  });

  it('recovers and reports succeeded when a transient failure clears before retries run out', async () => {
    // Fail transiently on attempts 0 and 1, succeed on attempt 2.
    const transport = new FakeTransport((_endpoint, attemptIndex) =>
      attemptIndex < 2 ? transientError() : 'ok',
    );
    const store = new FakeStore([sub('recovers')]);
    const { sleep, delays } = recordingSleep();
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store, sleep });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    expect(transport.calls).toHaveLength(3); // 1 initial + 2 retries, then success
    expect(delays).toEqual([1_000, 2_000]);
    expect(result.results).toEqual([
      { endpoint: 'https://push.example/recovers', status: 'succeeded' },
    ]);
  });

  it('does not retry a gone (410) failure even though it occurs mid-flight', async () => {
    // First a transient error (retried), then the endpoint reports gone.
    const transport = new FakeTransport((_endpoint, attemptIndex) =>
      attemptIndex === 0 ? transientError() : pushError(410),
    );
    const store = new FakeStore([sub('turns-gone')]);
    const { sleep, delays } = recordingSleep();
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store, sleep });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    expect(transport.calls).toHaveLength(2); // initial transient + the gone retry
    expect(delays).toEqual([1_000]); // one backoff before the retry that returned gone
    expect(store.pruned).toEqual(['turns-gone']);
    expect(result.results).toEqual([
      { endpoint: 'https://push.example/turns-gone', status: 'pruned' },
    ]);
  });
});

// --- Requirement 9.4 / 16.1: generic E2EE body, no plaintext ---------------

describe('WebPushDispatcher — generic E2EE body carries no plaintext (Requirement 9.4 / 16.1)', () => {
  it('builds a payload from safe fields only — a generic body and no message plaintext', () => {
    const payload = buildPushPayload(genericNotification('conv-secret'));
    const parsed = JSON.parse(payload) as Record<string, unknown>;

    // Generic body — the worker never has plaintext to leak.
    expect(parsed['body']).toBe('New message');
    // Payload exposes ONLY routing/display fields, never message content. The
    // optional `badge` is omitted when unset (JSON.stringify drops undefined),
    // so every present key must be one of the safe, plaintext-free fields.
    const allowedFields = ['title', 'body', 'conversationId', 'badge'];
    for (const key of Object.keys(parsed)) {
      expect(allowedFields).toContain(key);
    }
    expect(parsed['conversationId']).toBe('conv-secret');
  });

  it('transmits the generic payload to the transport without any plaintext', async () => {
    const PLAINTEXT = 'meet me at midnight';
    const transport = new FakeTransport(() => 'ok');
    const store = new FakeStore([sub('a')]);
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store });

    // The dispatcher only ever receives the generic notification (no plaintext).
    await dispatcher.dispatch('user-1', genericNotification('conv-1'));

    expect(transport.calls).toHaveLength(1);
    const sentPayload = transport.calls[0]!.payload;
    expect(sentPayload).not.toContain(PLAINTEXT);
    expect(JSON.parse(sentPayload).body).toBe('New message');
  });
});

// --- Requirement 9.5: per-subscription result shape ------------------------

describe('WebPushDispatcher — per-subscription result reporting (Requirement 9.5)', () => {
  it('reports succeeded, pruned, and exhausted across a mixed batch', async () => {
    const transport = new FakeTransport((endpoint) => {
      if (endpoint.endsWith('/ok')) return 'ok';
      if (endpoint.endsWith('/gone')) return pushError(404);
      return transientError(); // /flaky → always transient → exhausted
    });
    const store = new FakeStore([sub('ok'), sub('gone'), sub('flaky')]);
    const { sleep } = recordingSleep();
    const dispatcher = new WebPushDispatcher({ transport, subscriptions: store, sleep });

    const result = await dispatcher.dispatch('user-1', NOTIFICATION);

    expect(result.results).toEqual([
      { endpoint: 'https://push.example/ok', status: 'succeeded' },
      { endpoint: 'https://push.example/gone', status: 'pruned' },
      { endpoint: 'https://push.example/flaky', status: 'exhausted' },
    ]);
    // Every reported status is one of the three documented outcomes.
    for (const r of result.results) {
      expect(['succeeded', 'pruned', 'exhausted']).toContain(r.status);
    }
  });
});
