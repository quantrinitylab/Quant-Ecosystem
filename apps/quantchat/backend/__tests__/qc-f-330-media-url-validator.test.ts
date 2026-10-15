// ===========================================================================
// QC-F-330 — media/avatar/reel URLs had NO host or ownership binding: any
// sender could persist ANY external server's URL as message/story/reel/
// avatar media, and every viewer's browser then loaded that URL verbatim —
// leaking each viewer's IP + open-time to the sender's server and letting
// the sender swap the content after delivery.
//
// Fix (Slice 1, write-side): one shared validator
// (`backend/lib/media-url.ts`) gates every writer — non-snap messages
// (MessageService.sendMessage), stories (route), reels (ReelService),
// avatar select (route) and profile avatarUrl (auth route). A non-`data:`
// URL is accepted only when (1) scheme is https (http only for local
// storage hosts), (2) host is in the env-derived own-storage host set,
// (3) the storage key derived from the path has the shape
// `<ownerId>/media_*/<filename>`. `data:` is per-surface (brief §3.3).
// Rejections are 400 MEDIA_URL_NOT_ALLOWED before any persistence.
// Snap sends are NOT gated here — QC-F-329 owns the snap branch (M5 pins
// that boundary). Legacy rows already in the DB are Slice 2 (read-side).
//
// Negative control (brief §5.2): the behavioural reject cases (M1, M4, S1,
// S5, R1, R2, R4, A2, A3, A5) FAIL on the pre-fix code — the external URL
// persists. S2 also fails pre-fix, for the opposite reason (a real data:
// story was already rejected by the 4096 schema cap). V-series unit cases
// import the new lib, so on pre-fix code they fail at import — they pin
// the fixed shape, they are not behavioural evidence.
// ===========================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// routes/auth.ts pulls @quant/auth (see qc-f-041 header for why this stub
// is needed to keep the suite loadable in a worktree test env).
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
// NOTE: lib/media-url is loaded via dynamic import inside the V-series so
// this file still LOADS on pre-fix code — the behavioural cases below must
// fail individually in the negative control, not collapse into one
// import error (brief §5.2).
import { MessageService } from '../services/message.service';
import { ReelService } from '../services/reel.service';
import storiesRoutes from '../routes/stories';
import avatarRoutes from '../routes/avatar';
import authRoutes from '../routes/auth';

const OWNER = 'user-1';
const OWN_URL = 'https://quantchat-media.s3.amazonaws.com/user-1/media_abc/photo.jpg';
const DATA_SVG = 'data:image/svg+xml;base64,PHN2Zy8+';

type ValidateMediaUrl = (
  raw: string,
  opts: { ownerId: string; allowData: readonly string[] | false; maxDataLength?: number; maxUrlLength?: number },
) => { ok: boolean };
async function loadValidator(): Promise<ValidateMediaUrl> {
  const mod = (await import('../lib/media-url')) as { validateMediaUrl: ValidateMediaUrl };
  return mod.validateMediaUrl;
}

// ---------------------------------------------------------------------------
// Env hygiene for the V-series: own-host derivation reads process.env.
// ---------------------------------------------------------------------------
const ENV_KEYS = ['S3_BASE_URL', 'S3_BUCKET', 'S3_ENDPOINT', 'R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT', 'ATTACHMENTS_BUCKET', 'R2_BUCKET'] as const;
let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ---------------------------------------------------------------------------
// V-series — validator unit cases (the only cases importing lib/media-url)
// ---------------------------------------------------------------------------
describe('QC-F-330 validator unit', () => {
  let validateMediaUrl: ValidateMediaUrl;
  beforeEach(async () => {
    validateMediaUrl = await loadValidator();
  });

  it('V1: own-storage default form is accepted', async () => {
    expect(validateMediaUrl(OWN_URL, { ownerId: OWNER, allowData: false }).ok).toBe(true);
  });

  it('V2: endpoint-derived hosts are accepted (path-style and virtual-hosted)', async () => {
    process.env.S3_ENDPOINT = 'https://acct123.r2.cloudflarestorage.com';
    expect(
      validateMediaUrl('https://acct123.r2.cloudflarestorage.com/user-1/media_abc/v.mp4', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(true);
    expect(
      validateMediaUrl(
        'https://quantmail-attachments.acct123.r2.cloudflarestorage.com/user-1/media_abc/v.mp4',
        { ownerId: OWNER, allowData: false },
      ).ok,
    ).toBe(true);
  });

  it("V3: another user's key on our own host is rejected", async () => {
    expect(
      validateMediaUrl('https://quantchat-media.s3.amazonaws.com/victim-9/media_abc/secret.jpg', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(false);
  });

  it('V4: own key on an external host is rejected (the 329/330 difference)', async () => {
    expect(
      validateMediaUrl('https://evil.example/user-1/media_abc/photo.jpg', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(false);
  });

  it('V5: bare key, s3://, relative and protocol-relative forms are rejected', async () => {
    for (const raw of [
      'user-1/media_abc/photo.jpg',
      's3://quantmail-attachments/user-1/media_abc/photo.jpg',
      '/user-1/media_abc/photo.jpg',
      '//quantchat-media.s3.amazonaws.com/user-1/media_abc/photo.jpg',
    ]) {
      expect(validateMediaUrl(raw, { ownerId: OWNER, allowData: false }).ok).toBe(false);
    }
  });

  it('V6: http is rejected for remote hosts but allowed for a local storage endpoint', async () => {
    expect(
      validateMediaUrl('http://evil.example/user-1/media_abc/photo.jpg', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(false);
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    expect(
      validateMediaUrl('http://localhost:9000/user-1/media_abc/photo.jpg', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(true);
  });

  it('V7: key shape is enforced (media_ segment and a filename are required)', async () => {
    for (const raw of [
      'https://quantchat-media.s3.amazonaws.com/user-1/other/photo.jpg',
      'https://quantchat-media.s3.amazonaws.com/user-1/media_abc',
      'https://quantchat-media.s3.amazonaws.com/recordings/room-1/rec.webm',
    ]) {
      expect(validateMediaUrl(raw, { ownerId: OWNER, allowData: false }).ok).toBe(false);
    }
  });

  it('V8: presigned (query-bearing) own-storage URLs are accepted', async () => {
    expect(
      validateMediaUrl(`${OWN_URL}?X-Amz-Signature=deadbeef&X-Amz-Expires=60`, {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(true);
  });

  it('V9: lookalike host (suffix attack) is rejected', async () => {
    expect(
      validateMediaUrl(
        'https://quantchat-media.s3.amazonaws.com.evil.com/user-1/media_abc/photo.jpg',
        { ownerId: OWNER, allowData: false },
      ).ok,
    ).toBe(false);
  });

  it('V10: userinfo trick is rejected (real host is evil.com)', async () => {
    expect(
      validateMediaUrl('https://quantchat-media.s3.amazonaws.com@evil.com/user-1/media_abc/photo.jpg', {
        ownerId: OWNER,
        allowData: false,
      }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M-series — MessageService.sendMessage (ordinary media; snap is 329's)
// ---------------------------------------------------------------------------
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
    messageOutbox: { create: vi.fn().mockResolvedValue({}) },
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

describe('QC-F-330 messages gate (service level)', () => {
  let prisma: MockPrisma;
  let service: MessageService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MessageService(prisma as never, undefined, undefined, undefined as never);
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      createdAt: new Date(),
      ...(data as Record<string, unknown>),
    }));
  });

  it('M1: external-host ordinary image is rejected 400 MEDIA_URL_NOT_ALLOWED, never persisted', async () => {
    await expect(
      service.sendMessage({
        conversationId: 'conv-1',
        senderId: OWNER,
        content: 'Photo',
        type: 'image',
        mediaUrl: 'https://tracker.evil.example/pixel.jpg?u=victim',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('M2: own-storage media persists verbatim', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: OWNER,
      content: 'Photo',
      type: 'image',
      mediaUrl: OWN_URL,
    });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const call = prisma.message.create.mock.calls[0] as unknown as [{ data: { mediaUrl: string } }];
    expect(call[0].data.mediaUrl).toBe(OWN_URL);
  });

  it('M3 (control): data: image persists unchanged (real client path)', async () => {
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: OWNER,
      content: 'Photo',
      type: 'image',
      mediaUrl: 'data:image/png;base64,AAAA',
    });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('M4: voice-note sink form (type audio, external CDN URL) is rejected', async () => {
    await expect(
      service.sendMessage({
        conversationId: 'conv-1',
        senderId: OWNER,
        content: 'Voice note',
        type: 'audio',
        mediaUrl: 'https://cdn.example.com/voice.m4a',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('M5 (scope pin): snap sends are NOT gated by 330 — 329 owns the snap branch', async () => {
    // Declared boundary (brief §5.1 M5): a snap's stored mediaUrl is never
    // browser-loaded (consumeSnap mediates it), so 330 does not gate the
    // snap branch; 329's own-key bind decides. An own-key snap on an
    // arbitrary host therefore still persists — exactly as 329 designed.
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: OWNER,
      content: 'Snap',
      type: 'snap_photo',
      mediaUrl: 'https://evil.example/user-1/media_abc/x.jpg',
      disappearMode: 'after_view',
    });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Bare-Fastify harness for the route-level gates (stories / avatar / auth)
// ---------------------------------------------------------------------------
async function buildRouteApp(
  prisma: unknown,
  register: (app: FastifyInstance) => Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  // Helper takes the real decorated type pattern used by qc-f-041 (the
  // `unknown`-param decorate broke CI typecheck in PR #903/#905's lesson).
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = { userId: OWNER, username: 'user1' };
  });
  await register(app);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// S-series — POST /stories
// ---------------------------------------------------------------------------
describe('QC-F-330 stories gate (route level)', () => {
  let storyCreate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    storyCreate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'story-1',
      userId: OWNER,
      type: data['type'],
      mediaUrl: data['mediaUrl'] ?? null,
      textContent: data['textContent'] ?? null,
      duration: data['duration'],
      viewCount: 0,
      audience: data['audience'],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      user: { id: OWNER, displayName: 'User One', avatarUrl: null },
    }));
    app = await buildRouteApp({ story: { create: storyCreate } }, async (a) => {
      await a.register(storiesRoutes, { prefix: '/stories' });
    });
  });
  afterEach(async () => {
    await app.close();
  });

  const postStory = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/stories', payload });

  it('S1: external-host story media is rejected 400 MEDIA_URL_NOT_ALLOWED, never persisted', async () => {
    const res = await postStory({ type: 'photo', mediaUrl: 'https://tracker.evil.example/s.jpg' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(storyCreate).not.toHaveBeenCalled();
  });

  it('S2: a real data: photo story larger than the old 4096 cap is accepted (cap repair)', async () => {
    const bigDataUrl = `data:image/jpeg;base64,${'A'.repeat(6000)}`;
    expect(bigDataUrl.length).toBeGreaterThan(5000);
    const res = await postStory({ type: 'photo', mediaUrl: bigDataUrl });
    expect(res.statusCode).toBe(201);
    expect(storyCreate).toHaveBeenCalledTimes(1);
    const call = storyCreate.mock.calls[0] as unknown as [{ data: { mediaUrl: string } }];
    expect(call[0].data.mediaUrl).toBe(bigDataUrl);
  });

  it('S3: data:video and own-storage stories are accepted', async () => {
    const r1 = await postStory({ type: 'video', mediaUrl: 'data:video/mp4;base64,AAAA' });
    expect(r1.statusCode).toBe(201);
    const r2 = await postStory({ type: 'photo', mediaUrl: OWN_URL });
    expect(r2.statusCode).toBe(201);
    expect(storyCreate).toHaveBeenCalledTimes(2);
  });

  it('S4 (control): a text story without mediaUrl is unaffected by the gate', async () => {
    const res = await postStory({ type: 'text', text: 'hello world' });
    expect(res.statusCode).toBe(201);
    expect(storyCreate).toHaveBeenCalledTimes(1);
  });

  it("S5: the shipped client's fake 'video-placeholder' is rejected honestly", async () => {
    const res = await postStory({ type: 'video', mediaUrl: 'video-placeholder' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(storyCreate).not.toHaveBeenCalled();
  });

  it('S6: the non-data length bound survives the cap repair (long invalid URL still 400)', async () => {
    const longUrl = `https://quantchat-media.s3.amazonaws.com/user-1/${'x'.repeat(4100)}`;
    const res = await postStory({ type: 'photo', mediaUrl: longUrl });
    expect(res.statusCode).toBe(400);
    expect(storyCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R-series — ReelService.createReel
// ---------------------------------------------------------------------------
describe('QC-F-330 reels gate (service level)', () => {
  let reelCreate: ReturnType<typeof vi.fn>;
  let service: ReelService;

  beforeEach(() => {
    reelCreate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'reel-1',
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      watchThroughRate: 0,
      createdAt: new Date(),
      creator: { username: 'user1', avatarUrl: null },
      ...data,
    }));
    service = new ReelService({ reel: { create: reelCreate } } as never);
  });

  const createReel = (over: Record<string, unknown>) =>
    service.createReel({
      creatorId: OWNER,
      videoUrl: OWN_URL,
      caption: '',
      duration: 10,
      ...over,
    } as never);

  it('R1: external-host videoUrl is rejected 400 MEDIA_URL_NOT_ALLOWED, never persisted', async () => {
    await expect(createReel({ videoUrl: 'https://cdn.evil.example/v.mp4' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'MEDIA_URL_NOT_ALLOWED',
    });
    expect(reelCreate).not.toHaveBeenCalled();
  });

  it('R2: an external thumbnailUrl is rejected even with an own-storage videoUrl', async () => {
    await expect(createReel({ thumbnailUrl: 'https://evil.example/t.jpg' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'MEDIA_URL_NOT_ALLOWED',
    });
    expect(reelCreate).not.toHaveBeenCalled();
  });

  it('R3: own-storage video persists and the derived thumbnail behaviour is unchanged', async () => {
    const item = await createReel({});
    expect(reelCreate).toHaveBeenCalledTimes(1);
    expect(item.thumbnailUrl).toBe(`${OWN_URL}#t=0.1`);
  });

  it('R4: data: video is rejected on reels (no real client sends one)', async () => {
    await expect(createReel({ videoUrl: 'data:video/mp4;base64,AAAA' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'MEDIA_URL_NOT_ALLOWED',
    });
    expect(reelCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A-series — POST /avatar/select + PUT /auth/profile
// ---------------------------------------------------------------------------
describe('QC-F-330 avatar + profile gates (route level)', () => {
  let avatarUpsert: ReturnType<typeof vi.fn>;
  let userUpdate: ReturnType<typeof vi.fn>;
  let app: FastifyInstance;

  beforeEach(async () => {
    avatarUpsert = vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      userId: OWNER,
      ...create,
      updatedAt: new Date(),
    }));
    userUpdate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: OWNER,
      username: 'user1',
      displayName: 'User One',
      bio: null,
      ...data,
    }));
    app = await buildRouteApp(
      { avatar: { upsert: avatarUpsert }, user: { update: userUpdate } },
      async (a) => {
        await a.register(avatarRoutes, { prefix: '/avatar' });
        await a.register(authRoutes, { prefix: '/auth' });
      },
    );
  });
  afterEach(async () => {
    await app.close();
  });

  it('A1 (control): the real generate→select flow (data:image/svg+xml) persists unchanged', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avatar/select',
      payload: { style: 'crystalline', imageUrl: DATA_SVG, thumbnailUrl: DATA_SVG },
    });
    expect(res.statusCode).toBe(201);
    expect(avatarUpsert).toHaveBeenCalledTimes(1);
  });

  it('A2: an external-host avatar image is rejected 400, never persisted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avatar/select',
      payload: { style: 'crystalline', imageUrl: 'https://tracker.evil.example/a.png', thumbnailUrl: DATA_SVG },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(avatarUpsert).not.toHaveBeenCalled();
  });

  it('A3: a tracking avatarUrl on profile update is rejected 400, never persisted', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { avatarUrl: 'https://tracker.evil.example/a.png?u=1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('A4: an own-storage profile avatarUrl persists', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { avatarUrl: OWN_URL },
    });
    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
  });

  it('A5: data: is rejected on profile avatarUrl (no shipped caller sends one)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { avatarUrl: 'data:image/png;base64,AAAA' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'MEDIA_URL_NOT_ALLOWED' } });
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
