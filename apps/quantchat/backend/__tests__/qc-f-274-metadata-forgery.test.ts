import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messagesRoutes from '../routes/messages';
import {
  MessageService,
  RESERVED_METADATA_KEYS,
  sanitizeClientMetadata,
} from '../services/message.service';

// QC-F-274 regression suite: message `metadata` was fully client-forgeable.
// Before the fix, sendMessage persisted the client's metadata record
// verbatim, so a sender could pre-forge server-owned state (reactions
// attributed to other users, pinned/pinnedBy, storyReply, view-once flags,
// storageKey steering consumeSnap's presign, ephemeral-timer keys), and
// consumeSnap preferred a persisted `metadata.storageKey` over the key
// derived from mediaUrl. The fix sanitizes client metadata at the service
// choke point (reserved keys stripped, `snap` rebuilt to a validated
// `{ durationSec }`), moves trusted writes to `serverMetadata`, and makes
// consumeSnap always derive the storage key from mediaUrl.
//
// Negative control: cases 1-6, 9, 10, 13 and the route case FAIL on the
// pre-fix service (forged keys persist / forged storageKey is presigned);
// cases 7, 8, 11, 12 are behaviour-preservation controls that pass on
// both versions.

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
      // QC-F-359 fixture migration: blocked-send gate reads (type from
      // the row; block list from user preferences — null = readable
      // empty list, 'clear' both directions). No assertion changes.
      findUnique: vi.fn().mockResolvedValue({ id: 'conv-1', type: 'DIRECT' }),
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

function createService(prisma: MockPrisma, storage?: unknown) {
  return new MessageService(
    prisma as never,
    undefined,
    undefined,
    storage as never,
  );
}

const mockStorage = () => ({
  getSignedUrl: vi
    .fn()
    .mockImplementation(
      async (key: string, ttl: number) =>
        `https://s3.example.com/${key}?X-Amz-Expires=${ttl}&X-Amz-Signature=mock-sig`,
    ),
  delete: vi.fn().mockResolvedValue(undefined),
});

describe('QC-F-274 send path strips forged server-owned metadata', () => {
  let prisma: MockPrisma;
  let service: MessageService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma, mockStorage());
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      createdAt: new Date(),
      ...(data as Record<string, unknown>),
    }));
  });

  const persistedMetadata = (): Record<string, unknown> => {
    const call = prisma.message.create.mock.calls[0] as unknown as [
      { data: { metadata: Record<string, unknown> } },
    ];
    return call[0].data.metadata;
  };

  it('case 1: forged reactions attributed to other users are stripped', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hi',
      metadata: { reactions: { '❤️': ['victim-1', 'victim-2'] } },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 2: forged pinned / pinnedBy are stripped', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hi',
      metadata: { pinned: true, pinnedBy: 'admin-1' },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 3: forged storyReply via client metadata is stripped', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'nice story',
      metadata: { storyReply: { storyId: 'someone-elses-story' } },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 4: forged view-once flags on an ordinary message are stripped (no snap pipeline entry)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'ordinary photo',
      type: 'image',
      mediaUrl: 'https://quantchat-media.s3.amazonaws.com/user-1/media_fixture/photo.jpg',
      metadata: { viewOnce: true, isSnap: true, duration: 5, disappearMode: 'after_view' },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 5: forged storageKey is stripped', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hi',
      metadata: { storageKey: 'victim/secret-object.jpg' },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 6: forged delivery / ephemeral-timer / screenshot-event keys are stripped', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hi',
      metadata: {
        deliveries: { 'viewer-1': 'read' },
        viewedAt: '2020-01-01T00:00:00.000Z',
        consumedAt: '2020-01-01T00:00:00.000Z',
        consumedBy: 'user-1',
        system: true,
        event: 'screenshot',
        screenshotBy: 'victim-1',
        targetMessageId: 'msg-victim',
      },
    });

    expect(persistedMetadata()).toEqual({});
  });

  it('case 7: free-form client keys pass through verbatim (no strict allowlist)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'photo',
      type: 'image',
      mediaUrl: 'https://quantchat-media.s3.amazonaws.com/user-1/media_fixture/photo.jpg',
      metadata: { caption: 'My photo', clientTag: 'holiday', width: 640 },
    });

    expect(persistedMetadata()).toEqual({
      caption: 'My photo',
      clientTag: 'holiday',
      width: 640,
    });
  });

  it('case 8: a legitimate snap keeps its validated durationSec (F-019 flow intact)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Photo Snap',
      type: 'snap_photo',
      mediaUrl: 'data:image/png;base64,AAAA',
      disappearMode: 'after_view',
      metadata: { snap: { durationSec: 30 } },
    });

    expect(persistedMetadata()).toEqual({
      snap: { durationSec: 30 },
      disappearMode: 'after_view',
      viewOnce: true,
      isSnap: true,
      duration: 30,
    });
  });

  it('case 9: keys smuggled inside `snap` are dropped — snap is rebuilt as { durationSec } only', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Photo Snap',
      type: 'snap_photo',
      mediaUrl: 'data:image/png;base64,AAAA',
      disappearMode: 'after_view',
      metadata: {
        snap: { durationSec: 30, storageKey: 'victim/key.jpg', viewOnce: false, extra: 'x' },
      },
    });

    const metadata = persistedMetadata();
    expect(metadata.snap).toEqual({ durationSec: 30 });
    expect(metadata).not.toHaveProperty('storageKey');
    expect(metadata.viewOnce).toBe(true);
  });

  it('case 10: invalid snap durationSec drops `snap`; the snap branch falls back to the 10s default', async () => {
    for (const bad of [0, -5, 86_401, Number.NaN, '30', undefined]) {
      prisma.message.create.mockClear();
      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Photo Snap',
        type: 'snap_photo',
        mediaUrl: 'data:image/png;base64,AAAA',
        metadata: { snap: { durationSec: bad } },
      });

      const metadata = persistedMetadata();
      expect(metadata.duration).toBe(10);
      expect(metadata.snap).toEqual({ durationSec: 10 });
    }
  });

  it('case 11: trusted serverMetadata (story reply) persists through the server channel', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'reply to your story',
      serverMetadata: { storyReply: { storyId: 'story-1' } },
    });

    expect(persistedMetadata()).toEqual({ storyReply: { storyId: 'story-1' } });
  });

  it('case 12: serverMetadata wins over a forged client value for the same key', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'reply',
      metadata: { caption: 'kept', storyReply: { storyId: 'forged-story' } },
      serverMetadata: { storyReply: { storyId: 'real-story' } },
    });

    expect(persistedMetadata()).toEqual({
      caption: 'kept',
      storyReply: { storyId: 'real-story' },
    });
  });

  it('case 13: the reserved set is exactly the 17 server-owned keys (snap is sanitized, not stripped)', () => {
    expect(RESERVED_METADATA_KEYS.size).toBe(17);
    expect(RESERVED_METADATA_KEYS.has('snap')).toBe(false);
    expect(sanitizeClientMetadata(undefined)).toEqual({});
    expect(sanitizeClientMetadata({ snap: 'not-an-object' })).toEqual({});
    expect(sanitizeClientMetadata({ snap: [{ durationSec: 30 }] })).toEqual({});
  });
});

describe('QC-F-274 consumeSnap never honours a persisted metadata.storageKey', () => {
  it('case 14: sender review presigns the mediaUrl-derived key, not a forged stored storageKey', async () => {
    const prisma = createMockPrisma();
    const storage = mockStorage();
    const service = createService(prisma, storage);
    prisma.message.findUnique.mockResolvedValue({
      id: 'snap-1',
      conversationId: 'conv-1',
      senderId: 'sender-1',
      type: 'IMAGE',
      mediaUrl: 'https://s3.example.com/sender-1/media_fixture/real.jpg',
      // Row persisted BEFORE the send-path fix: forged key still in the DB.
      metadata: { viewOnce: true, duration: 10, storageKey: 'victim/secret.jpg' },
    });

    const result = await service.consumeSnap('snap-1', 'sender-1');

    expect(storage.getSignedUrl).toHaveBeenCalledWith('sender-1/media_fixture/real.jpg', 60);
    expect(result.mediaUrl).toContain('sender-1/media_fixture/real.jpg');
    expect(result.mediaUrl).not.toContain('victim');
  });
});

describe('QC-F-274 route: forged metadata via HTTP is stripped, serverMetadata is not client-settable', () => {
  let app: FastifyInstance;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      createdAt: new Date(),
      ...(data as Record<string, unknown>),
    }));
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
      done();
    });
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      prisma,
    );
    await app.register(messagesRoutes, { prefix: '/conversations' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('case 15: POST with forged metadata + a client-supplied serverMetadata field persists neither', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: 'hi',
        metadata: {
          reactions: { '❤️': ['victim-1'] },
          storyReply: { storyId: 'forged-story' },
          caption: 'kept',
        },
        serverMetadata: { storyReply: { storyId: 'forged-story' } },
      },
    });

    expect(res.statusCode).toBe(201);
    const call = prisma.message.create.mock.calls[0] as unknown as [
      { data: { metadata: Record<string, unknown> } },
    ];
    expect(call[0].data.metadata).toEqual({ caption: 'kept' });
  });
});
