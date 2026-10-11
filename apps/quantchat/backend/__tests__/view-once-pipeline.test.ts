import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messagesRoutes from '../routes/messages';
import { MessageService } from '../services/message.service';

// QC-F-019 regression suite: the view-once pipeline end to end.
// Before the fix: the send route's zod schema silently stripped
// `disappearMode`, snap types collapsed to IMAGE/VIDEO with no view-once
// metadata, the message list handed the raw mediaUrl to anyone who
// fetched it, and consumeSnap burned the recipient's only view before
// minting the delivery URL (and could not deliver data-URL media at all).

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
      update: vi.fn().mockResolvedValue({}),
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

describe('QC-F-019 send path persists view-once intent', () => {
  let prisma: MockPrisma;
  let service: MessageService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma, mockStorage());
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      ...(data as Record<string, unknown>),
    }));
  });

  it("marks a snap_photo sent with disappearMode 'after_view' as view-once with its duration", async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Photo Snap',
      type: 'snap_photo',
      mediaUrl: 'data:image/png;base64,AAAA',
      disappearMode: 'after_view',
      metadata: { snap: { durationSec: 30 } },
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          viewOnce: true,
          isSnap: true,
          duration: 30,
          disappearMode: 'after_view',
          snap: { durationSec: 30 },
        }),
      }),
    });
  });

  it('marks a snap type as view-once even without an explicit disappearMode', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Video Snap',
      type: 'snap_video',
      mediaUrl: 'data:video/mp4;base64,AAAA',
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ viewOnce: true, isSnap: true, duration: 10 }),
      }),
    });
  });

  it('leaves ordinary messages untouched (no fabricated view-once flags)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hello',
      type: 'text',
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: {} }),
    });
  });
});

describe('QC-F-019 message list never leaks snap media', () => {
  it('strips mediaUrl for view-once snaps but keeps it for ordinary media', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma, mockStorage());
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'snap-1',
        mediaUrl: 'data:image/png;base64,SECRET',
        metadata: { viewOnce: true, duration: 10 },
      },
      {
        id: 'img-1',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        metadata: {},
      },
    ]);
    prisma.message.count.mockResolvedValue(2);

    const result = await service.getMessages('conv-1', 'user-1');

    expect(result.data[0]?.mediaUrl).toBeNull();
    expect(result.data[1]?.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
  });
});

describe('QC-F-019 consumeSnap delivery', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('delivers inline data-URL media exactly once and destroys the stored copy', async () => {
    const service = createService(prisma, mockStorage());
    prisma.message.findUnique.mockResolvedValue({
      id: 'snap-1',
      conversationId: 'conv-1',
      senderId: 'sender-1',
      type: 'IMAGE',
      mediaUrl: 'data:image/png;base64,AAAA',
      metadata: { viewOnce: true, snap: { durationSec: 25 } },
    });

    const result = await service.consumeSnap('snap-1', 'viewer-1');

    expect(result.mediaUrl).toBe('data:image/png;base64,AAAA');
    expect(result.duration).toBe(25);
    expect(prisma.snapView.create).toHaveBeenCalledWith({
      data: { messageId: 'snap-1', userId: 'viewer-1' },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: expect.objectContaining({ mediaUrl: null }),
    });
  });

  it('does not burn the view when delivery URL minting fails', async () => {
    const storage = mockStorage();
    storage.getSignedUrl.mockRejectedValueOnce(new Error('storage down'));
    const service = createService(prisma, storage);
    prisma.message.findUnique.mockResolvedValue({
      id: 'snap-1',
      conversationId: 'conv-1',
      senderId: 'sender-1',
      type: 'IMAGE',
      mediaUrl: 'https://s3.example.com/snaps/secret.jpg',
      metadata: { viewOnce: true, duration: 10 },
    });

    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      code: 'PRESIGNING_FAILED',
    });
    expect(prisma.snapView.create).not.toHaveBeenCalled();
  });
});

describe('QC-F-019 route: disappearMode survives the HTTP layer', () => {
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

  it('POST snap with disappearMode persists view-once metadata (not stripped)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: 'Photo Snap',
        type: 'snap_photo',
        mediaUrl: 'data:image/png;base64,AAAA',
        disappearMode: 'after_view',
        metadata: { snap: { durationSec: 30 } },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          viewOnce: true,
          isSnap: true,
          duration: 30,
          disappearMode: 'after_view',
        }),
      }),
    });
  });
});
