import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import threadCaptureRoutes from '../routes/thread-capture';

// Phase 2B — POST /conversations/:id/screen-capture (conversation-level
// screen-capture notice; detection + notice only, never prevention).
//
// Locked design: the route follows the ephemeral screenshot handler's
// safety properties — zod {kind} (unknown body keys stripped, so a
// body-supplied `viewerName` is ignored), identity ONLY from request.auth
// (401 UNAUTHORIZED without it; the display name comes from the verified
// auth identity, never the body — QC-F-038), 404 CONVERSATION_NOT_FOUND,
// 403 NOT_A_MEMBER for non-members, DIRECT threads honor the OTHER
// member's allowScreenshots opt-out (QC-F-042 semantics; notified:false,
// no system message), GROUP threads always notify.
// Harness: QC-F-410 routes pattern — bare Fastify + errorHandlerPlugin +
// decorate('prisma', fake) + preHandler installing request.auth.

const VIEWER = 'u-viewer';
const OTHER = 'u-other';
const STRANGER = 'u-stranger';
const DIRECT = 'conv-direct';
const GROUP = 'conv-group';

interface FakeConv {
  id: string;
  type: string;
}
interface FakeMember {
  id: string;
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}
interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  type: string;
  metadata: Record<string, unknown>;
}

function makeFakePrisma(prefsByUser: Record<string, Record<string, unknown>> = {}) {
  const convs: FakeConv[] = [
    { id: DIRECT, type: 'DIRECT' },
    { id: GROUP, type: 'GROUP' },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: DIRECT, userId: VIEWER, leftAt: null },
    { id: 'mb-2', conversationId: DIRECT, userId: OTHER, leftAt: null },
    { id: 'mb-3', conversationId: GROUP, userId: VIEWER, leftAt: null },
    { id: 'mb-4', conversationId: GROUP, userId: OTHER, leftAt: null },
  ];
  const messages: FakeMessage[] = [];
  let seq = 0;

  const memberMatches = (m: FakeMember, where: Record<string, unknown>) => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId'])
      return false;
    if (where['userId'] != null) {
      const u = where['userId'] as Record<string, unknown>;
      if (typeof u === 'string' && m.userId !== u) return false;
      if (typeof u === 'object' && u !== null && 'not' in u && m.userId === u['not']) return false;
    }
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
    return true;
  };

  const prisma = {
    conversation: {
      async findUnique({ where }: { where: { id: string } }) {
        return convs.find((c) => c.id === where.id) ?? null;
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const out = members.filter((m) => memberMatches(m, where));
        return typeof take === 'number' ? out.slice(0, take) : out;
      },
    },
    message: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: FakeMessage = {
          id: `sys-${++seq}`,
          conversationId: String(data['conversationId']),
          senderId: String(data['senderId']),
          content: (data['content'] as string) ?? null,
          type: String(data['type'] ?? 'SYSTEM'),
          metadata: (data['metadata'] as Record<string, unknown>) ?? {},
        };
        messages.push(row);
        return row;
      },
    },
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, preferences: prefsByUser[where.id] ?? null };
      },
    },
  };

  return { prisma, state: { convs, members, messages } };
}

type Fake = ReturnType<typeof makeFakePrisma>;

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

describe('Phase 2B POST /conversations/:id/screen-capture', () => {
  let app: FastifyInstance;
  let fake: Fake;
  let auth: { userId: string; username?: string } | null;

  const build = async (prefsByUser: Record<string, Record<string, unknown>> = {}) => {
    fake = makeFakePrisma(prefsByUser);
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    app.addHook('preHandler', async (request) => {
      if (auth) {
        (request as unknown as { auth: typeof auth }).auth = auth;
      }
    });
    await app.register(threadCaptureRoutes, { prefix: '/conversations' });
    await app.ready();
  };

  beforeEach(async () => {
    auth = { userId: VIEWER, username: 'Viewer User' };
    await build();
  });

  afterEach(async () => {
    await app.close();
  });

  const capture = (id: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${id}/screen-capture`,
      payload: payload as Record<string, unknown> | undefined,
    });

  it('401 UNAUTHORIZED without auth', async () => {
    auth = null;
    const res = await capture(GROUP, { kind: 'screenshot' });
    expect(res.statusCode).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('404 CONVERSATION_NOT_FOUND for an unknown conversation', async () => {
    const res = await capture('conv-nope', { kind: 'screenshot' });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('CONVERSATION_NOT_FOUND');
  });

  it('403 NOT_A_MEMBER for a non-member', async () => {
    auth = { userId: STRANGER, username: 'Stranger' };
    const res = await capture(GROUP, { kind: 'screenshot' });
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_MEMBER');
    expect(fake.state.messages).toHaveLength(0);
  });

  it('400 on an invalid kind', async () => {
    const res = await capture(GROUP, { kind: 'photocopy' });
    expect(res.statusCode).toBe(400);
    expect(fake.state.messages).toHaveLength(0);
  });

  it('400 on a missing body', async () => {
    const res = await capture(GROUP);
    expect(res.statusCode).toBe(400);
  });

  it('201 posts the screenshot system notice naming the verified auth identity', async () => {
    const res = await capture(GROUP, { kind: 'screenshot', viewerName: 'Forged Name' });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      success: boolean;
      data: { conversationId: string; systemMessageId: string | null; notified: boolean };
    };
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBe(GROUP);
    expect(body.data.notified).toBe(true);
    expect(body.data.systemMessageId).toBeTruthy();
    // QC-F-038: the body-supplied viewerName is ignored; the verified
    // auth identity names the notice.
    expect(fake.state.messages).toHaveLength(1);
    expect(fake.state.messages[0]?.content).toBe('Viewer User took a screenshot');
    expect(fake.state.messages[0]?.type).toBe('SYSTEM');
    expect(fake.state.messages[0]?.metadata).toMatchObject({
      system: true,
      event: 'screen_capture',
      kind: 'screenshot',
      capturedBy: VIEWER,
    });
  });

  it('201 posts the screen-recording variant copy', async () => {
    const res = await capture(GROUP, { kind: 'screen_recording' });
    expect(res.statusCode).toBe(201);
    expect(fake.state.messages[0]?.content).toBe('Viewer User started a screen recording');
    expect(fake.state.messages[0]?.metadata).toMatchObject({
      kind: 'screen_recording',
    });
  });

  it('falls back to "Someone" when the auth identity has no username', async () => {
    auth = { userId: VIEWER };
    const res = await capture(GROUP, { kind: 'screenshot' });
    expect(res.statusCode).toBe(201);
    expect(fake.state.messages[0]?.content).toBe('Someone took a screenshot');
  });

  it('DIRECT: the other member allowScreenshots opt-out suppresses the notice (notified:false, no row)', async () => {
    await app.close();
    auth = { userId: VIEWER, username: 'Viewer User' };
    await build({ [OTHER]: { allowScreenshots: true } });
    const res = await capture(DIRECT, { kind: 'screenshot' });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { notified: boolean; systemMessageId: string | null } };
    expect(body.data.notified).toBe(false);
    expect(body.data.systemMessageId).toBeNull();
    expect(fake.state.messages).toHaveLength(0);
  });

  it('DIRECT: without the opt-out the notice is posted', async () => {
    const res = await capture(DIRECT, { kind: 'screenshot' });
    expect(res.statusCode).toBe(201);
    expect(fake.state.messages).toHaveLength(1);
    expect(fake.state.messages[0]?.content).toBe('Viewer User took a screenshot');
  });
});
