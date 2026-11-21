import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messagesRoutes from '../routes/messages';
import searchRoutes from '../routes/search';
import {
  MessageService,
  isViewOnceMessage,
  redactViewOnceMedia,
} from '../services/message.service';
import { publishConversationEvent } from '../services/realtime-publisher';

// QC-F-109 regression suite: view-once snaps must not leak their media
// payload through search results, pin/react responses, or realtime
// fan-out. Before the fix only getMessages (thread list) stripped the
// mediaUrl (QC-F-019); every other outbound path handed the raw row to a
// member-recipient, defeating view-once without consumeSnap ever running.
//
// The shared fixture world: conversation `conv_1`; sender `user_sender`;
// member-recipient `user_bob`; snap `snap_1` (caption "sunset dekh",
// inline data-URL payload, view-once metadata); ordinary photo `img_1`;
// plain text `txt_1`.

vi.mock('../services/realtime-publisher', () => ({
  publishConversationEvent: vi.fn().mockResolvedValue(null),
}));

const SNAP_SECRET = 'data:image/png;base64,SECRET';
const THUMB_SECRET = 'data:image/png;base64,THUMB';
const PHOTO_URL = 'https://cdn.example.com/photo.jpg';

function snapRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap_1',
    conversationId: 'conv_1',
    senderId: 'user_sender',
    type: 'IMAGE',
    content: 'sunset dekh',
    mediaUrl: SNAP_SECRET,
    mediaThumbnailUrl: THUMB_SECRET,
    metadata: {
      viewOnce: true,
      isSnap: true,
      duration: 10,
      snap: { durationSec: 10 },
      disappearMode: 'after_view',
      storageKey: 'snaps/snap_1.png',
    },
    isDeleted: false,
    createdAt: new Date('2026-10-23T10:00:00.000Z'),
    updatedAt: new Date('2026-10-23T10:00:00.000Z'),
    ...overrides,
  };
}

function photoRow() {
  return {
    id: 'img_1',
    conversationId: 'conv_1',
    senderId: 'user_sender',
    type: 'IMAGE',
    content: 'sunset photo',
    mediaUrl: PHOTO_URL,
    mediaThumbnailUrl: null,
    metadata: {},
    isDeleted: false,
    createdAt: new Date('2026-10-23T10:01:00.000Z'),
    updatedAt: new Date('2026-10-23T10:01:00.000Z'),
  };
}

function textRow() {
  return {
    id: 'txt_1',
    conversationId: 'conv_1',
    senderId: 'user_sender',
    type: 'TEXT',
    content: 'sunset plans tomorrow',
    mediaUrl: null,
    mediaThumbnailUrl: null,
    metadata: {},
    isDeleted: false,
    createdAt: new Date('2026-10-23T10:02:00.000Z'),
    updatedAt: new Date('2026-10-23T10:02:00.000Z'),
  };
}

function createMockPrisma() {
  const prisma = {
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'conv_1', type: 'DIRECT' }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ preferences: null }),
    },
    conversationMember: {
      findFirst: vi.fn().mockResolvedValue({ id: 'member-1', leftAt: null }),
      findMany: vi.fn().mockResolvedValue([{ userId: 'viewer-1' }]),
    },
    messageOutbox: {
      create: vi.fn().mockResolvedValue({}),
    },
    snapView: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sv-1' }),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

function createService(prisma: MockPrisma) {
  return new MessageService(prisma as never);
}

function setupSearch(prisma: MockPrisma, rows: unknown[]) {
  prisma.conversationMember.findMany.mockResolvedValue([{ conversationId: 'conv_1' }]);
  prisma.message.findMany.mockResolvedValue(rows);
  prisma.message.count.mockResolvedValue(rows.length);
}

describe('QC-F-109 view-once search must not leak snap media', () => {
  let prisma: MockPrisma;
  let service: MessageService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
    vi.mocked(publishConversationEvent).mockClear();
  });

  it('1. strips mediaUrl + thumbnail for a view-once snap, keeps identity fields', async () => {
    const row = snapRow();
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    expect(result.total).toBe(1);
    const hit = result.data[0] as Record<string, unknown>;
    expect(hit.mediaUrl).toBeNull();
    expect(hit.mediaThumbnailUrl).toBeNull();
    // Identity/shape preserved — an honest "view-once snap" card.
    expect(hit.id).toBe('snap_1');
    expect(hit.content).toBe('sunset dekh');
    expect(hit.type).toBe('IMAGE');
    expect(hit.senderId).toBe('user_sender');
    const meta = hit.metadata as Record<string, unknown>;
    expect(meta.viewOnce).toBe(true);
    expect(meta.isSnap).toBe(true);
    expect(meta.duration).toBe(10);
  });

  it('2. strips a snap marked isSnap-only (no viewOnce flag)', async () => {
    const row = snapRow({
      metadata: { isSnap: true, snap: { durationSec: 10 } },
    });
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    expect((result.data[0] as Record<string, unknown>).mediaUrl).toBeNull();
  });

  it('3. drops storageKey from the response copy and never mutates the DB row', async () => {
    const row = snapRow();
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');
    const hit = result.data[0] as Record<string, unknown>;
    const meta = hit.metadata as Record<string, unknown>;
    expect('storageKey' in meta).toBe(false);
    // The DB fixture object is untouched — sanitiser copies, never mutates.
    expect((row.metadata as Record<string, unknown>).storageKey).toBe('snaps/snap_1.png');
    expect(row.mediaUrl).toBe(SNAP_SECRET);
    expect(row.mediaThumbnailUrl).toBe(THUMB_SECRET);
  });

  it('4. does NOT over-strip ordinary media (control)', async () => {
    const row = photoRow();
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    expect(result.data[0]).toBe(row); // same reference — untouched
    expect((result.data[0] as Record<string, unknown>).mediaUrl).toBe(PHOTO_URL);
  });

  it('5. leaves plain text hits untouched (control)', async () => {
    const row = textRow();
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    expect(result.data[0]).toBe(row);
  });

  it('6. strips for the sender too (list parity — sender review is consumeSnap)', async () => {
    const row = snapRow();
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_sender', 'sunset');

    expect((result.data[0] as Record<string, unknown>).mediaUrl).toBeNull();
  });

  it('7. an already-consumed snap still hits, still null', async () => {
    const row = snapRow({
      mediaUrl: null,
      mediaThumbnailUrl: null,
      metadata: {
        viewOnce: true,
        isSnap: true,
        consumedAt: '2026-10-23T10:05:00.000Z',
        consumedBy: 'user_bob',
      },
    });
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    expect(result.total).toBe(1);
    expect((result.data[0] as Record<string, unknown>).mediaUrl).toBeNull();
  });

  it('8. timed-disappearing media (24h, not view-once) is intentionally NOT stripped', async () => {
    const row = {
      ...textRow(),
      id: 'timed_1',
      type: 'IMAGE',
      mediaUrl: PHOTO_URL,
      metadata: { disappearMode: '24h' },
    };
    setupSearch(prisma, [row]);

    const result = await service.searchMessages('user_bob', 'sunset');

    // Deliberate parity pin with getMessages: timed-expiry is
    // DisappearingService's domain, not view-once's. If product ever
    // changes this, this test must change loudly, not silently.
    expect((result.data[0] as Record<string, unknown>).mediaUrl).toBe(PHOTO_URL);
  });

  it('9. list and search agree on every row of a mixed fixture', async () => {
    const rows = [snapRow(), photoRow(), textRow()];
    prisma.message.findMany.mockResolvedValue(rows);
    prisma.message.count.mockResolvedValue(rows.length);
    setupSearch(prisma, rows);

    const listed = await service.getMessages('conv_1', 'user_bob');
    const searched = await service.searchMessages('user_bob', 'sunset');

    expect(listed.data).toHaveLength(3);
    expect(searched.data).toHaveLength(3);
    for (const id of ['snap_1', 'img_1', 'txt_1']) {
      const l = listed.data.find((m) => (m as { id: string }).id === id) as Record<string, unknown>;
      const s = searched.data.find((m) => (m as { id: string }).id === id) as Record<string, unknown>;
      expect(l.mediaUrl).toEqual(s.mediaUrl);
      expect(l.mediaThumbnailUrl).toEqual(s.mediaThumbnailUrl);
    }
    expect((listed.data[0] as Record<string, unknown>).mediaUrl).toBeNull();
    expect((searched.data[0] as Record<string, unknown>).mediaUrl).toBeNull();
  });

  it('10. pin response strips snap payload but keeps pin state', async () => {
    const row = snapRow();
    prisma.message.findUnique.mockResolvedValue(row);
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1', leftAt: null });
    prisma.message.update.mockImplementation(async ({ data }: { data: { metadata: unknown } }) => ({
      ...row,
      metadata: data.metadata,
    }));

    const pinned = await service.pinMessage('snap_1', 'user_bob');
    const meta = pinned.metadata as Record<string, unknown>;

    expect(pinned.mediaUrl).toBeNull();
    expect(pinned.mediaThumbnailUrl).toBeNull();
    expect(meta.pinned).toBe(true);
    expect(meta.pinnedBy).toBe('user_bob');

    // Control: pinning an ordinary photo keeps its URL.
    const img = photoRow();
    prisma.message.findUnique.mockResolvedValue(img);
    prisma.message.update.mockImplementation(async ({ data }: { data: { metadata: unknown } }) => ({
      ...img,
      metadata: data.metadata,
    }));
    const pinnedImg = await service.pinMessage('img_1', 'user_bob');
    expect(pinnedImg.mediaUrl).toBe(PHOTO_URL);
  });

  it('11. react response strips snap payload but keeps the reaction', async () => {
    const row = snapRow();
    prisma.message.findUnique.mockResolvedValue(row);
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1', leftAt: null });
    prisma.message.update.mockImplementation(async ({ data }: { data: { metadata: unknown } }) => ({
      ...row,
      metadata: data.metadata,
    }));

    const reacted = await service.reactToMessage('snap_1', 'user_bob', '❤️');
    const meta = reacted.metadata as Record<string, unknown>;
    const reactions = meta.reactions as Record<string, string[]>;

    expect(reacted.mediaUrl).toBeNull();
    expect(reactions['❤️']).toEqual(['user_bob']);
  });
});

describe('QC-F-109 route level: search endpoint + send fan-out', () => {
  let app: FastifyInstance;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user_bob' };
      done();
    });
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    await app.register(searchRoutes, { prefix: '/search' });
    await app.register(messagesRoutes, { prefix: '/conversations' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.mocked(publishConversationEvent).mockClear();
  });

  it('12a. POST /search returns sanitised snap hits and requires auth', async () => {
    const rows = [snapRow(), photoRow()];
    setupSearch(prisma, rows);

    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { q: 'sunset' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { plaintext: { data: Array<Record<string, unknown>> } };
    };
    const hits = body.data.plaintext.data;
    expect(hits).toHaveLength(2);
    expect(hits[0]!.mediaUrl).toBeNull();
    expect(hits[0]!.mediaThumbnailUrl).toBeNull();
    expect(hits[1]!.mediaUrl).toBe(PHOTO_URL);
  });

  it('12b. POST /search without auth is 401', async () => {
    const naked = Fastify({ logger: false });
    await naked.register(errorHandlerPlugin);
    (naked as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    await naked.register(searchRoutes, { prefix: '/search' });
    await naked.ready();
    try {
      const res = await naked.inject({
        method: 'POST',
        url: '/search',
        payload: { q: 'sunset' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await naked.close();
    }
  });

  it('12c. send fan-out publishes a redacted copy while the 201 keeps the sender copy', async () => {
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      createdAt: new Date(),
      ...(data as Record<string, unknown>),
    }));
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1', leftAt: null });

    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv_1/messages',
      payload: {
        content: 'sunset dekh',
        type: 'snap_photo',
        mediaUrl: SNAP_SECRET,
        disappearMode: 'after_view',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: Record<string, unknown> };
    // The sender's own response is the raw created row — untouched.
    expect(body.data.mediaUrl).toBe(SNAP_SECRET);

    // The broadcast copy on the wire is redacted.
    expect(vi.mocked(publishConversationEvent)).toHaveBeenCalledTimes(1);
    const published = vi.mocked(publishConversationEvent).mock.calls[0]![2] as {
      eventType: string;
      data: Record<string, unknown>;
    };
    expect(published.eventType).toBe('chat.message.created.v1');
    expect(published.data.mediaUrl).toBeNull();
    expect(published.data.mediaThumbnailUrl).toBeNull();
  });

  it('12d. edit fan-out publishes a redacted copy while the PUT keeps the sender copy', async () => {
    const senderApp = Fastify({ logger: false });
    await senderApp.register(errorHandlerPlugin);
    senderApp.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user_sender' };
      done();
    });
    (senderApp as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    await senderApp.register(messagesRoutes, { prefix: '/conversations' });
    await senderApp.ready();
    try {
      const row = { ...snapRow(), createdAt: new Date() };
      prisma.message.findUnique.mockResolvedValue(row);
      prisma.message.update.mockResolvedValue({ ...row, content: 'sunset dekh (edited)' });
      vi.mocked(publishConversationEvent).mockClear();

      const res = await senderApp.inject({
        method: 'PUT',
        url: '/conversations/messages/snap_1',
        payload: { content: 'sunset dekh (edited)' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: Record<string, unknown> };
      // Sender's own PUT response is raw — untouched.
      expect(body.data.mediaUrl).toBe(SNAP_SECRET);

      expect(vi.mocked(publishConversationEvent)).toHaveBeenCalledTimes(1);
      const published = vi.mocked(publishConversationEvent).mock.calls[0]![2] as {
        eventType: string;
        data: Record<string, unknown>;
      };
      expect(published.eventType).toBe('chat.message.updated.v1');
      expect(published.data.mediaUrl).toBeNull();
    } finally {
      await senderApp.close();
    }
  });
});

describe('QC-F-109 helpers', () => {
  it('isViewOnceMessage matches the exact getMessages predicate', () => {
    expect(isViewOnceMessage({ metadata: { viewOnce: true } })).toBe(true);
    expect(isViewOnceMessage({ metadata: { isSnap: true } })).toBe(true);
    expect(isViewOnceMessage({ metadata: { viewOnce: true, isSnap: true } })).toBe(true);
    expect(isViewOnceMessage({ metadata: {} })).toBe(false);
    expect(isViewOnceMessage({ metadata: null })).toBe(false);
    expect(isViewOnceMessage({})).toBe(false);
    expect(isViewOnceMessage({ metadata: { disappearMode: '24h' } })).toBe(false);
  });

  it('redactViewOnceMedia returns the same reference for non-snaps', () => {
    const row = photoRow();
    expect(redactViewOnceMedia(row as never)).toBe(row);
  });
});
