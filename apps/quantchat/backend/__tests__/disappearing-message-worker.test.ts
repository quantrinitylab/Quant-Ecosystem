// ============================================================================
// Unit tests — DisappearingMessageWorker + Phase 1B DisappearingService
// additions (revoke / keep-request / keep-consent).
//
// Verifies the durable sweep (no in-memory timers), the sender-only revoke
// gate (409 when already viewed), and the keep-consent flow: a recipient's
// keep request alone never keeps the message — only the sender's grant
// cancels the expiry.
//
// Style follows the repo's vitest suites: fake in-memory prisma cast
// through `as never`, rejects.toMatchObject({ statusCode, code }).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisappearingService } from '../services/disappearing.service';
import { DisappearingMessageWorker } from '../services/disappearing-message-worker';
import type { ExpiredMessageRecord } from '../services/disappearing.service';

interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isDeleted: boolean;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
}

function makeMessage(partial: Partial<FakeMessage> & { id: string }): FakeMessage {
  return {
    conversationId: 'conv-1',
    senderId: 'user-sender',
    content: 'hello',
    isDeleted: false,
    expiresAt: null,
    metadata: {},
    ...partial,
  };
}

function fakePrisma(store: Map<string, FakeMessage>) {
  return {
    message: {
      findMany: async ({ where }: { where: { expiresAt?: { lte: Date }; isDeleted?: boolean } }) => {
        return [...store.values()].filter((m) => {
          if (where.isDeleted !== undefined && m.isDeleted !== where.isDeleted) return false;
          const lte = where.expiresAt?.lte;
          if (lte !== undefined) {
            if (!m.expiresAt || m.expiresAt > lte) return false;
          }
          return true;
        });
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.get(where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: Partial<FakeMessage>;
      }) => {
        let count = 0;
        for (const id of where.id.in) {
          const m = store.get(id);
          if (m) {
            Object.assign(m, data);
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeMessage> }) => {
        const m = store.get(where.id);
        if (!m) throw new Error('not found');
        Object.assign(m, data);
        return m;
      },
    },
    conversationMember: {
      findFirst: async ({
        where,
      }: {
        where: { conversationId: string; userId: string; leftAt: null };
      }) => {
        // user-blocked is never a member; everyone else is.
        if (where.userId === 'user-blocked') return null;
        return { id: 'membership-1' };
      },
    },
  };
}

describe('DisappearingMessageWorker', () => {
  let store: Map<string, FakeMessage>;

  beforeEach(() => {
    store = new Map();
  });

  function setup() {
    const prisma = fakePrisma(store);
    const service = new DisappearingService(prisma as never, {} as never);
    const expired: ExpiredMessageRecord[] = [];
    const mediaExpired: string[] = [];
    const errors: unknown[] = [];
    const worker = new DisappearingMessageWorker(prisma as never, {
      service,
      snapMediaExpirer: {
        expireSnapMedia: async (mediaId: string) => {
          mediaExpired.push(mediaId);
        },
      },
      onExpired: (record) => {
        expired.push(record);
      },
      onError: (error) => {
        errors.push(error);
      },
    });
    return { worker, expired, mediaExpired, errors };
  }

  it('sweeps expired messages, deletes them, and fires onExpired per record', async () => {
    store.set(
      'msg-due',
      makeMessage({ id: 'msg-due', expiresAt: new Date(Date.now() - 1_000) }),
    );
    store.set(
      'msg-future',
      makeMessage({ id: 'msg-future', expiresAt: new Date(Date.now() + 60_000) }),
    );

    const { worker, expired } = setup();
    const processed = await worker.tick();

    expect(processed).toBe(1);
    expect(store.get('msg-due')?.isDeleted).toBe(true);
    expect(store.get('msg-due')?.content).toBe('[Message expired]');
    expect(store.get('msg-future')?.isDeleted).toBe(false);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({
      id: 'msg-due',
      conversationId: 'conv-1',
      senderId: 'user-sender',
    });
  });

  it('does not expire messages whose keep consent was granted', async () => {
    store.set(
      'msg-kept',
      makeMessage({
        id: 'msg-kept',
        expiresAt: new Date(Date.now() - 1_000),
        metadata: { keepConsent: 'granted' },
      }),
    );

    const { worker, expired } = setup();
    const processed = await worker.tick();

    expect(processed).toBe(0);
    expect(store.get('msg-kept')?.isDeleted).toBe(false);
    expect(expired).toHaveLength(0);
  });

  it('expires snap media attached to expired messages via the expirer port', async () => {
    store.set(
      'msg-snap',
      makeMessage({
        id: 'msg-snap',
        expiresAt: new Date(Date.now() - 1_000),
        metadata: { mediaId: 'media-a', mediaIds: ['media-b'] },
      }),
    );

    const { worker, mediaExpired } = setup();
    await worker.tick();

    expect(mediaExpired).toEqual(['media-a', 'media-b']);
  });

  it('a failing onExpired hook does not stop the sweep', async () => {
    store.set('m1', makeMessage({ id: 'm1', expiresAt: new Date(Date.now() - 1_000) }));
    store.set('m2', makeMessage({ id: 'm2', expiresAt: new Date(Date.now() - 1_000) }));

    const prisma = fakePrisma(store);
    const errors: unknown[] = [];
    const seen: string[] = [];
    const worker = new DisappearingMessageWorker(prisma as never, {
      service: new DisappearingService(prisma as never, {} as never),
      onExpired: (record) => {
        seen.push(record.id);
        if (record.id === 'm1') throw new Error('publish boom');
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    const processed = await worker.tick();

    // Both rows were expired; only the successful hook counts as processed,
    // and the failure was sunk to onError instead of aborting the tick.
    expect(store.get('m1')?.isDeleted).toBe(true);
    expect(store.get('m2')?.isDeleted).toBe(true);
    expect(processed).toBe(1);
    expect(errors).toHaveLength(1);
    expect(seen).toEqual(['m1', 'm2']);
  });

  it('start/stop are idempotent and tick guards overlap', async () => {
    const prisma = fakePrisma(store);
    const worker = new DisappearingMessageWorker(prisma as never, {
      service: new DisappearingService(prisma as never, {} as never),
      intervalMs: 10,
    });
    worker.start();
    worker.start(); // no-op
    worker.stop();
    worker.stop(); // no-op
    expect(await worker.tick()).toBe(0);
  });
});

describe('DisappearingService revoke (Phase 1B)', () => {
  let store: Map<string, FakeMessage>;
  let service: DisappearingService;

  beforeEach(() => {
    store = new Map();
    service = new DisappearingService(fakePrisma(store) as never, {} as never);
  });

  it('revoke-before-viewed deletes the unviewed disappearing message', async () => {
    store.set(
      'msg-r1',
      makeMessage({ id: 'msg-r1', expiresAt: new Date(Date.now() + 60_000) }),
    );

    const result = await service.revokeDisappearingMessage('msg-r1', 'user-sender');

    expect(result.messageId).toBe('msg-r1');
    expect(result.conversationId).toBe('conv-1');
    const row = store.get('msg-r1');
    expect(row?.isDeleted).toBe(true);
    expect(row?.expiresAt).toBeNull();
    expect(row?.metadata['revoked']).toBe(true);
  });

  it('revoke-after-viewed is rejected with 409 MESSAGE_ALREADY_VIEWED', async () => {
    store.set(
      'msg-r2',
      makeMessage({
        id: 'msg-r2',
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { viewedAt: new Date().toISOString() },
      }),
    );

    await expect(service.revokeDisappearingMessage('msg-r2', 'user-sender')).rejects.toMatchObject(
      { statusCode: 409, code: 'MESSAGE_ALREADY_VIEWED' },
    );
    expect(store.get('msg-r2')?.isDeleted).toBe(false);
  });

  it('revoke by a non-sender is rejected with 403 NOT_SENDER', async () => {
    store.set('msg-r3', makeMessage({ id: 'msg-r3', expiresAt: new Date(Date.now() + 60_000) }));

    await expect(service.revokeDisappearingMessage('msg-r3', 'user-other')).rejects.toMatchObject(
      { statusCode: 403, code: 'NOT_SENDER' },
    );
  });

  it('revoke of a non-disappearing message is rejected with 400', async () => {
    store.set('msg-r4', makeMessage({ id: 'msg-r4', expiresAt: null }));

    await expect(service.revokeDisappearingMessage('msg-r4', 'user-sender')).rejects.toMatchObject(
      { statusCode: 400, code: 'MESSAGE_NOT_DISAPPEARING' },
    );
  });
});

describe('DisappearingService keep-request / keep-consent (Phase 1B)', () => {
  let store: Map<string, FakeMessage>;
  let service: DisappearingService;

  beforeEach(() => {
    store = new Map();
    service = new DisappearingService(fakePrisma(store) as never, {} as never);
    vi.restoreAllMocks();
  });

  it('keep requires sender consent: request alone does not keep the message', async () => {
    store.set(
      'msg-k1',
      makeMessage({ id: 'msg-k1', expiresAt: new Date(Date.now() - 1_000) }),
    );

    const req = await service.requestKeep('msg-k1', 'user-recipient');
    expect(req.keepConsent).toBe('pending');

    // The sweep still deletes it: a request without consent keeps nothing.
    const worker = new DisappearingMessageWorker(fakePrisma(store) as never, {
      service,
      onExpired: () => {},
    });
    expect(await worker.tick()).toBe(1);
    expect(store.get('msg-k1')?.isDeleted).toBe(true);
  });

  it('sender grant cancels the expiry and the sweep skips the kept message', async () => {
    store.set(
      'msg-k2',
      makeMessage({ id: 'msg-k2', expiresAt: new Date(Date.now() - 1_000) }),
    );

    await service.requestKeep('msg-k2', 'user-recipient');
    const res = await service.resolveKeepConsent('msg-k2', 'user-sender', 'granted');

    expect(res.keepConsent).toBe('granted');
    expect(store.get('msg-k2')?.expiresAt).toBeNull();
    expect(store.get('msg-k2')?.isDeleted).toBe(false);

    const worker = new DisappearingMessageWorker(fakePrisma(store) as never, {
      service,
      onExpired: () => {},
    });
    expect(await worker.tick()).toBe(0);
  });

  it('sender deny leaves the expiry armed', async () => {
    store.set(
      'msg-k3',
      makeMessage({ id: 'msg-k3', expiresAt: new Date(Date.now() - 1_000) }),
    );

    await service.requestKeep('msg-k3', 'user-recipient');
    const res = await service.resolveKeepConsent('msg-k3', 'user-sender', 'denied');

    expect(res.keepConsent).toBe('denied');
    expect(store.get('msg-k3')?.expiresAt).not.toBeNull();

    const worker = new DisappearingMessageWorker(fakePrisma(store) as never, {
      service,
      onExpired: () => {},
    });
    expect(await worker.tick()).toBe(1);
    expect(store.get('msg-k3')?.isDeleted).toBe(true);
  });

  it('consent without a pending request is rejected with 400 NO_KEEP_REQUEST', async () => {
    store.set('msg-k4', makeMessage({ id: 'msg-k4', expiresAt: new Date(Date.now() + 60_000) }));

    await expect(
      service.resolveKeepConsent('msg-k4', 'user-sender', 'granted'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'NO_KEEP_REQUEST' });
  });

  it('keep consent by a non-sender is rejected with 403 NOT_SENDER', async () => {
    store.set('msg-k5', makeMessage({ id: 'msg-k5', expiresAt: new Date(Date.now() + 60_000) }));
    await service.requestKeep('msg-k5', 'user-recipient');

    await expect(
      service.resolveKeepConsent('msg-k5', 'user-recipient', 'granted'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_SENDER' });
  });

  it('keep request by a non-member is rejected with 403 NOT_A_MEMBER', async () => {
    store.set('msg-k6', makeMessage({ id: 'msg-k6', expiresAt: new Date(Date.now() + 60_000) }));

    await expect(service.requestKeep('msg-k6', 'user-blocked')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_A_MEMBER',
    });
  });
});
