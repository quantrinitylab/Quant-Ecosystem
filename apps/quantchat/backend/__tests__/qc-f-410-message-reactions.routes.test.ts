import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messagesRoutes from '../routes/messages';

// QC-F-410 (QC-2) — the shipped web client's reaction call had NO backend
// route: `apiClient.addReaction` POSTs /messages/:id/reactions (Next proxy
// path) -> backend POST /conversations/messages/:id/reactions, and BOTH
// layers 404'd, even though `MessageService.reactToMessage` (membership-
// gated, toggle semantics, service-tested) existed all along. The missing
// link was only the route. Locked design (specialist-qc-f-410-buildprep
// §4/§5/§6.2): the route follows the pin handler in the same plugin —
// zod {emoji: string 1..64}, identity ONLY from request.auth (401
// UNAUTHORIZED without it), service errors surface verbatim (403
// NOT_A_MEMBER / 404 MESSAGE_NOT_FOUND), NO realtime fan-out (pin parity),
// service itself untouched. POST only: the client's DELETE removeReaction
// carries no emoji and has no honest meaning under toggle semantics, so
// it stays unbuilt (brief §5 seema (a)).
// Harness: QC-F-396 routes pattern — bare Fastify + errorHandlerPlugin +
// decorate('prisma', fake) + preHandler installing request.auth, stable
// module-level identities.
// Negative-control signature (brief §6.2): on the ORIGINAL routes file
// (no reactions handler) B1–B7 FAIL (404 / wrong code) and the two
// controls B8 (pin) + B9 (send) PASS.

const MEMBER = 'u-member';
const MEMBER2 = 'u-member2';
const MEMBER3 = 'u-member3';
const STRANGER = 'u-stranger';
const CONV = 'conv-1';
const MSG = 'msg-1';
const EMOJI = '👍';

interface FakeConv {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
  lastMessageAt: Date | null;
}
interface FakeMember {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
}
interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  type: string;
  mediaUrl: string | null;
  replyToId: string | null;
  metadata: Record<string, unknown>;
  isEdited: boolean;
  isDeleted: boolean;
  isAIGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakePrisma() {
  const convs: FakeConv[] = [
    { id: CONV, type: 'GROUP', name: 'Study Group', description: null, createdBy: MEMBER, lastMessageAt: null },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: CONV, userId: MEMBER, role: 'OWNER', leftAt: null },
    { id: 'mb-2', conversationId: CONV, userId: MEMBER2, role: 'MEMBER', leftAt: null },
    { id: 'mb-3', conversationId: CONV, userId: MEMBER3, role: 'MEMBER', leftAt: null },
  ];
  const messages: FakeMessage[] = [
    {
      id: MSG,
      conversationId: CONV,
      senderId: MEMBER2,
      content: 'hello',
      type: 'TEXT',
      mediaUrl: null,
      replyToId: null,
      metadata: {},
      isEdited: false,
      isDeleted: false,
      isAIGenerated: false,
      createdAt: new Date('2026-10-15T10:00:00Z'),
      updatedAt: new Date('2026-10-15T10:00:00Z'),
    },
  ];
  const outbox: Array<Record<string, unknown>> = [];
  let seq = 100;

  const memberMatches = (m: FakeMember, where: Record<string, unknown>) => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId']) return false;
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
    return true;
  };

  const prisma = {
    conversation: {
      async findUnique({ where }: { where: { id: string } }) {
        return convs.find((c) => c.id === where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = convs.find((c) => c.id === where.id);
        if (!row) throw new Error('Record to update not found.');
        if (data['lastMessageAt'] instanceof Date) row.lastMessageAt = data['lastMessageAt'];
        return row;
      },
    },
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, preferences: null };
      },
      async findMany() {
        return [];
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where));
      },
    },
    message: {
      async create({ data }: { data: Record<string, unknown> }) {
        const now = new Date();
        const row: FakeMessage = {
          id: `msg-${++seq}`,
          conversationId: String(data['conversationId']),
          senderId: String(data['senderId']),
          content: (data['content'] as string) ?? null,
          type: String(data['type'] ?? 'TEXT'),
          mediaUrl: (data['mediaUrl'] as string) ?? null,
          replyToId: (data['replyToId'] as string) ?? null,
          metadata: (data['metadata'] as Record<string, unknown>) ?? {},
          isEdited: false,
          isDeleted: false,
          isAIGenerated: (data['isAIGenerated'] as boolean) ?? false,
          createdAt: now,
          updatedAt: now,
        };
        messages.push(row);
        return row;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return messages.find((m) => m.id === where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = messages.find((m) => m.id === where.id);
        if (!row) throw new Error('Record to update not found.');
        if (data['metadata'] != null) row.metadata = data['metadata'] as Record<string, unknown>;
        if (data['content'] != null) row.content = data['content'] as string;
        row.updatedAt = new Date();
        return row;
      },
    },
    messageOutbox: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: `outbox-${++seq}`, ...data };
        outbox.push(row);
        return row;
      },
    },
    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(prisma);
    },
  };

  return { prisma, state: { convs, members, messages, outbox } };
}

type Fake = ReturnType<typeof makeFakePrisma>;

function errorBody(res: { json: () => unknown }): { code: string; message: string } {
  return (res.json() as { error: { code: string; message: string } }).error;
}
function errorCode(res: { json: () => unknown }): string {
  return errorBody(res).code;
}

describe('QC-F-410 QC-2 POST /conversations/messages/:id/reactions', () => {
  let app: FastifyInstance;
  let fake: Fake;
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = MEMBER;
    fake = makeFakePrisma();
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    app.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await app.register(messagesRoutes, { prefix: '/conversations' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const react = (id: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/conversations/messages/${id}/reactions`,
      payload: payload as Record<string, unknown> | undefined,
    });

  it('B1: a member reaction persists via the service toggle (reactions {emoji:[member]})', async () => {
    const res = await react(MSG, { emoji: EMOJI });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { metadata: { reactions?: unknown } } };
    expect(body.success).toBe(true);
    expect(body.data.metadata.reactions).toEqual({ [EMOJI]: [MEMBER] });
    expect(fake.state.messages[0]?.metadata).toEqual({ reactions: { [EMOJI]: [MEMBER] } });
  });

  it('B2: the same member repeating the same emoji toggles it OFF (reactions {})', async () => {
    await react(MSG, { emoji: EMOJI });
    const res = await react(MSG, { emoji: EMOJI });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { metadata: { reactions?: unknown } } };
    expect(body.data.metadata.reactions).toEqual({});
  });

  it('B3: a second member adds alongside the first (reactions {emoji:[member, member2]})', async () => {
    await react(MSG, { emoji: EMOJI });
    authUserId = MEMBER2;
    const res = await react(MSG, { emoji: EMOJI });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { metadata: { reactions?: unknown } } };
    expect(body.data.metadata.reactions).toEqual({ [EMOJI]: [MEMBER, MEMBER2] });
  });

  it('B4: a non-member is refused 403 NOT_A_MEMBER and nothing persists', async () => {
    authUserId = STRANGER;
    const res = await react(MSG, { emoji: EMOJI });
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_MEMBER');
    expect(fake.state.messages[0]?.metadata).toEqual({});
  });

  it('B5: without auth the route fails closed 401 UNAUTHORIZED', async () => {
    authUserId = null;
    const res = await react(MSG, { emoji: EMOJI });
    expect(res.statusCode).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('B6: a missing emoji body is a zod 400 (no service call, nothing persists)', async () => {
    const res = await react(MSG, {});
    expect(res.statusCode).toBe(400);
    expect(fake.state.messages[0]?.metadata).toEqual({});
  });

  it('B7: reacting to a nonexistent message is 404 with code MESSAGE_NOT_FOUND', async () => {
    const res = await react('msg-does-not-exist', { emoji: EMOJI });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('MESSAGE_NOT_FOUND');
  });

  it('B8 (control): pin on the same mount still works for a member', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/messages/${MSG}/pin` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { metadata: { pinned?: unknown } } };
    expect(body.data.metadata.pinned).toBe(true);
  });

  it('B9 (control): send on the same mount still returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV}/messages`,
      payload: { content: 'hello' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { success: boolean; data: { content?: string } };
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('hello');
  });
});
