import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messagesRoutes from '../routes/messages';
import { MessageService } from '../services/message.service';

// QC-F-329 regression suite: a snap's `mediaUrl` was never validated or
// bound to its sender. Any conversation member could persist a snap whose
// mediaUrl pointed at ANY storage key; consumeSnap then derived the key
// from that sender-controlled URL and (a) minted a real SigV4 presigned
// URL for it on sender review — repeatedly, without consuming — and
// (b) HARD-DELETED the object from storage when a recipient consumed the
// snap (presign/delete confused deputy). QC-F-274 had moved the anchor
// onto mediaUrl (away from forgeable metadata.storageKey) but the anchor
// itself stayed attacker-controlled.
//
// The fix is structural (there is no durable media registry to look up —
// MediaService keeps an in-memory map and the Prisma `Media` table has no
// writers): the only ownership fact the system actually issues is the
// upload key shape `${userId}/${mediaId}/${filename}`
// (MediaService.generateUploadUrl). A non-`data:` snap mediaUrl is only
// ever honoured when the storage key derived from it lives in the
// message sender's own namespace:
//   - sendMessage rejects a snap-intent send whose derived key is not
//     owned by the sender with 400 MEDIA_URL_NOT_OWNED (after the
//     membership check, before any persistence);
//   - consumeSnap fails closed with 403 SNAP_MEDIA_NOT_OWNED before ANY
//     presign, snapView burn, or delete when a persisted (e.g. pre-fix)
//     row's derived key is not owned by its sender.
// The URL host is deliberately NOT checked: presign/delete always act on
// the server's own bucket via StorageClient — only the key chooses the
// object. `data:` snaps (the shipped client's only real snap path) and
// ordinary non-snap media (QC-F-330's surface) are untouched.
//
// Negative control (brief §5.2): on the pre-fix service S1–S5, C1–C4,
// C8, C9 and R1 FAIL (12 cases — forged snaps persist, presign/delete
// spies fire); S6–S10 and C5–C7 are behaviour-preservation / scope
// controls that pass on both versions (8 cases).

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

type MockStorage = ReturnType<typeof mockStorage>;

describe('QC-F-329 send-bind: a snap may only reference the sender’s own upload namespace', () => {
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

  const sendSnap = (mediaUrl: string, senderId = 'attacker-1') =>
    service.sendMessage({
      conversationId: 'conv-1',
      senderId,
      content: 'Photo Snap',
      type: 'snap_photo',
      mediaUrl,
      disappearMode: 'after_view',
    });

  it('S1: URL form pointing at another user’s key is rejected and never persisted', async () => {
    await expect(
      sendSnap('https://s3.example.com/victim-9/media_1/secret.jpg'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_OWNED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('S2: s3:// form pointing at another user’s key is rejected', async () => {
    await expect(
      sendSnap('s3://quantmail-attachments/victim-9/media_1/secret.jpg'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_OWNED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('S3: bare-string key of another user is rejected', async () => {
    await expect(sendSnap('victim-9/media_1/secret.jpg')).rejects.toMatchObject({
      statusCode: 400,
      code: 'MEDIA_URL_NOT_OWNED',
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('S4: a recordings/ key is rejected (its first segment is never a user)', async () => {
    await expect(
      sendSnap('https://cdn.example.com/recordings/room-1/rec.webm'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_OWNED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('S5: bucket-prefix juggling does not smuggle a foreign key past the bind', async () => {
    // extractStorageKey strips the env-default bucket prefix first, so the
    // derived key here is `victim-9/…` — the check runs on the derived key.
    await expect(
      sendSnap('https://s3.example.com/quantmail-attachments/victim-9/media_1/x.jpg'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_OWNED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('S6: the sender’s own upload key persists verbatim and stays view-once', async () => {
    await sendSnap('https://s3.example.com/user-1/media_abc/photo.jpg', 'user-1');

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const call = prisma.message.create.mock.calls[0] as unknown as [
      { data: { mediaUrl: string; metadata: Record<string, unknown> } },
    ];
    expect(call[0].data.mediaUrl).toBe('https://s3.example.com/user-1/media_abc/photo.jpg');
    expect(call[0].data.metadata).toMatchObject({ viewOnce: true });
  });

  it('S7: the sender’s own key persists in s3:// and bare forms too', async () => {
    await sendSnap('s3://quantmail-attachments/user-1/media_abc/photo.jpg', 'user-1');
    await sendSnap('user-1/media_abc/photo.jpg', 'user-1');
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
  });

  it('S8 (control): data: snaps — the shipped client’s only real snap path — persist unchanged', async () => {
    await sendSnap('data:image/png;base64,AAAA', 'user-1');
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('S9 (control, scope pin): ordinary non-snap media is NOT bound by this slice (QC-F-330 owns it)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Photo',
      type: 'image',
      mediaUrl: 'https://cdn.example.com/photo.jpg',
    });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('S10 (order pin): membership is checked before the bind — a non-member gets NOT_A_MEMBER, not the bind error', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue(null);
    await expect(
      sendSnap('https://s3.example.com/victim-9/media_1/secret.jpg'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('QC-F-329 consume-gate: a persisted snap may only ever touch its sender’s own namespace', () => {
  let prisma: MockPrisma;
  let storage: MockStorage;
  let service: MessageService;

  beforeEach(() => {
    prisma = createMockPrisma();
    storage = mockStorage();
    service = createService(prisma, storage);
  });

  // Rows are seeded straight into findUnique — pre-fix / forged rows that
  // bypass today's send-bind, which is exactly what the gate exists for.
  const seedSnap = (overrides: Record<string, unknown> = {}) => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'snap-1',
      conversationId: 'conv-1',
      senderId: 'attacker-1',
      type: 'IMAGE',
      mediaUrl: 'https://s3.example.com/victim-9/media_1/secret.jpg',
      metadata: { viewOnce: true, duration: 10 },
      ...overrides,
    });
  };

  const expectNoStorageTouch = () => {
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.snapView.create).not.toHaveBeenCalled();
  };

  it('C1: sender review can no longer mint presigned URLs for a foreign key — repeatedly', async () => {
    seedSnap();
    await expect(service.consumeSnap('snap-1', 'attacker-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    // The old oracle was unlimited: a second attempt must fail identically.
    await expect(service.consumeSnap('snap-1', 'attacker-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
  });

  it('C2: recipient consume of a forged snap presigns nothing, burns no view, deletes nothing', async () => {
    seedSnap();
    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('C3: a recordings/ key is refused for both sender review and recipient consume', async () => {
    seedSnap({ mediaUrl: 'https://cdn.example.com/recordings/room-1/rec.webm' });
    await expect(service.consumeSnap('snap-1', 'attacker-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
  });

  it('C4: s3:// and bare-string foreign keys are refused too', async () => {
    seedSnap({ mediaUrl: 's3://quantmail-attachments/victim-9/media_1/secret.jpg' });
    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    seedSnap({ mediaUrl: 'victim-9/media_1/secret.jpg' });
    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
  });

  it('C5 (control): sender review of the sender’s own key still presigns, without consuming or deleting', async () => {
    seedSnap({
      senderId: 'sender-1',
      mediaUrl: 'https://s3.example.com/sender-1/media_1/photo.jpg',
    });
    const result = await service.consumeSnap('snap-1', 'sender-1');
    expect(result.mediaUrl).toContain('sender-1/media_1/photo.jpg');
    expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(storage.getSignedUrl).toHaveBeenCalledWith('sender-1/media_1/photo.jpg', 60);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.snapView.create).not.toHaveBeenCalled();
  });

  it('C6 (control): recipient consume of the sender’s own key presigns, burns the view, and deletes only that object', async () => {
    seedSnap({
      senderId: 'sender-1',
      mediaUrl: 'https://s3.example.com/sender-1/media_1/photo.jpg',
    });
    const result = await service.consumeSnap('snap-1', 'viewer-1');
    expect(result.mediaUrl).toContain('sender-1/media_1/photo.jpg');
    expect(prisma.snapView.create).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('sender-1/media_1/photo.jpg');
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'snap-1' },
        data: expect.objectContaining({ mediaUrl: null }),
      }),
    );
  });

  it('C7 (control): data: snaps are delivered inline exactly as before', async () => {
    seedSnap({ senderId: 'sender-1', mediaUrl: 'data:image/png;base64,AAAA' });
    const result = await service.consumeSnap('snap-1', 'viewer-1');
    expect(result.mediaUrl).toBe('data:image/png;base64,AAAA');
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.snapView.create).toHaveBeenCalledTimes(1);
  });

  it('C8: the legacy ownerless snaps/ shape fails closed — no grandfathering', async () => {
    seedSnap({
      senderId: 'sender-1',
      mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
    });
    await expect(service.consumeSnap('snap-1', 'sender-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
  });

  it('C9: an own-namespace metadata.storageKey cannot bypass the gate when mediaUrl is foreign (QC-F-274 sangam)', async () => {
    seedSnap({
      metadata: {
        viewOnce: true,
        duration: 10,
        storageKey: 'attacker-1/media_1/x.jpg',
      },
    });
    await expect(service.consumeSnap('snap-1', 'attacker-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SNAP_MEDIA_NOT_OWNED',
    });
    expectNoStorageTouch();
  });
});

describe('QC-F-329 route: the send-bind reaches HTTP unchanged (route itself untouched)', () => {
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

  it('R1: POST a snap_photo with a foreign mediaUrl key → 400 MEDIA_URL_NOT_OWNED, nothing persisted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: 'Photo Snap',
        type: 'snap_photo',
        mediaUrl: 'https://s3.example.com/victim-9/media_1/secret.jpg',
        disappearMode: 'after_view',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('MEDIA_URL_NOT_OWNED');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
