// ===========================================================================
// QC-F-518 — history-visibility route contract tests
// ===========================================================================
//
// The service-level behaviour (cutoff, search bound, channel bound,
// rejoin revive) is pinned in qc-f-518-history-visibility.test.ts. This
// file pins the ROUTE contract: PUT /conversations/:id accepts
// historyVisibility ONLY through the admin gate, POST /conversations
// accepts it at create time for groups, a DIRECT create carrying it is
// rejected honestly, and an invalid enum value hits the existing zod
// validation path.
//
// Mounted exactly like qc-f-017: REAL route plugin + REAL service, bare
// Fastify, preHandler-installed request.auth, in-memory Prisma fake with
// stable identities. Negative control: against the pre-fix routes the
// toggle is stripped by zod (field never reaches the service), so the
// OWNER-toggle and create assertions fail there.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('@prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {
    constructor(..._args: unknown[]) {}
  },
  ConversationType: { DIRECT: 'DIRECT', GROUP: 'GROUP', CHANNEL: 'CHANNEL' },
  ConversationRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  MessageType: { SYSTEM: 'SYSTEM', TEXT: 'TEXT' },
}));

import conversationsRoutes from '../routes/conversations';

const OWNER = { userId: 'user_owner', username: 'owner' };
const MEMBER = { userId: 'user_member', username: 'member' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };

interface MemberRow {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  joinedAt: Date;
  isMuted: boolean;
  lastReadAt: Date | null;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

function userStub(userId: string) {
  return { id: userId, username: userId, displayName: userId, avatarUrl: null };
}

function makeFakePrisma() {
  const conversation: Record<string, unknown> = {
    id: 'conv-1',
    type: 'GROUP',
    name: 'Team Chat',
    description: 'original description',
    createdBy: OWNER.userId,
    historyVisibility: 'VISIBLE',
    lastMessageAt: new Date(),
    metadata: {},
  };
  const members: MemberRow[] = [
    {
      id: 'member-owner',
      conversationId: 'conv-1',
      userId: OWNER.userId,
      role: 'OWNER',
      leftAt: null,
      joinedAt: new Date(),
      isMuted: false,
      lastReadAt: null,
      user: userStub(OWNER.userId),
    },
    {
      id: 'member-member',
      conversationId: 'conv-1',
      userId: MEMBER.userId,
      role: 'MEMBER',
      leftAt: null,
      joinedAt: new Date(),
      isMuted: false,
      lastReadAt: null,
      user: userStub(MEMBER.userId),
    },
  ];
  const created: Array<Record<string, unknown>> = [];

  const prisma = {
    conversation: {
      async findUnique({ where }: { where: { id: string } }) {
        if (where.id !== conversation.id) return null;
        return { ...conversation, members: members.filter((m) => m.leftAt === null) };
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: 'conv-created', ...data };
        created.push(row);
        return row;
      },
      async update({ data }: { data: Record<string, unknown> }) {
        Object.assign(conversation, data);
        return { ...conversation };
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return (
          members.find(
            (m) =>
              m.conversationId === where.conversationId &&
              m.userId === where.userId &&
              (where.leftAt === undefined || m.leftAt === where.leftAt),
          ) ?? null
        );
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members
          .filter((m) => m.userId === where.userId && m.leftAt === null)
          .map((m) => ({ ...m, conversation: { ...conversation, members } }));
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => m.userId === where.userId && m.leftAt === null).length;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: `member-${data.userId as string}`,
          leftAt: null,
          joinedAt: new Date(),
          isMuted: false,
          lastReadAt: null,
          user: userStub(data.userId as string),
          ...data,
        } as unknown as MemberRow;
        members.push(row);
        return row;
      },
      async createMany({ data }: { data: Array<Record<string, unknown>> }) {
        for (const d of data) {
          members.push({
            id: `member-${d.userId as string}`,
            conversationId: d.conversationId as string,
            userId: d.userId as string,
            role: d.role as string,
            leftAt: null,
            joinedAt: (d.joinedAt as Date) ?? new Date(),
            isMuted: false,
            lastReadAt: null,
            user: userStub(d.userId as string),
          });
        }
        return { count: data.length };
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const row = members.find(
          (m) => m.conversationId === where.conversationId && m.userId === where.userId,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = members.find((m) => m.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
    // No user delegate: PrivacyService treats targets as 'missing', which
    // the whoCanMessage gate deliberately leaves outside its scope
    // (pre-existing behaviour for nonexistent targets — see QC-F-042).
    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(prisma);
    },
  };

  return { prisma, conversation, members, created };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
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
    // Zod errors (safeParse rethrown by the handlers) land here without a
    // statusCode — mirror the real error handler's validation shape (400).
    const isZod = (err as { name?: string }).name === 'ZodError';
    return reply
      .status(isZod ? 400 : 500)
      .send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  if (auth) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(conversationsRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-518 history visibility routes', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    fake = makeFakePrisma();
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function as(auth: { userId: string; username: string } | null) {
    app = await buildRouteApp(auth, fake.prisma);
    return app;
  }

  it('T-518-11a: OWNER can toggle historyVisibility via PUT — the stored value flips to HIDDEN', async () => {
    const a = await as(OWNER);
    const res = await a.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { historyVisibility: 'hidden' },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.conversation.historyVisibility).toBe('HIDDEN');
    expect((res.json() as { data: { historyVisibility: string } }).data.historyVisibility).toBe(
      'HIDDEN',
    );
  });

  it('T-518-11b: plain MEMBER cannot toggle — 403 NOT_CONVERSATION_ADMIN, value unchanged', async () => {
    const a = await as(MEMBER);
    const res = await a.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { historyVisibility: 'hidden' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_CONVERSATION_ADMIN');
    expect(fake.conversation.historyVisibility).toBe('VISIBLE');
  });

  it('T-518-11c: OUTSIDER cannot toggle — 403 NOT_A_MEMBER, value unchanged', async () => {
    const a = await as(OUTSIDER);
    const res = await a.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { historyVisibility: 'hidden' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_A_MEMBER');
    expect(fake.conversation.historyVisibility).toBe('VISIBLE');
  });

  it('T-518-11d: invalid enum value is rejected by the existing zod validation path (400)', async () => {
    const a = await as(OWNER);
    const res = await a.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { historyVisibility: 'sometimes' },
    });
    expect(res.statusCode).toBe(400);
    expect(fake.conversation.historyVisibility).toBe('VISIBLE');
  });

  it('T-518-11e: MEMBER archive-only PUT still works (regression — the admin branch did not swallow it)', async () => {
    const a = await as(MEMBER);
    const res = await a.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { isArchived: true },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.conversation.isArchived).toBe(true);
  });

  it("T-518-13a: POST / group with historyVisibility 'hidden' creates a HIDDEN conversation", async () => {
    const a = await as(OWNER);
    const res = await a.inject({
      method: 'POST',
      url: '/conversations',
      payload: {
        participantIds: [MEMBER.userId],
        type: 'group',
        name: 'Secret Club',
        historyVisibility: 'hidden',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]!.historyVisibility).toBe('HIDDEN');
  });

  it('T-518-13b: POST / group without the field leaves the DB default in charge (undefined → VISIBLE)', async () => {
    const a = await as(OWNER);
    const res = await a.inject({
      method: 'POST',
      url: '/conversations',
      payload: { participantIds: [MEMBER.userId], type: 'group', name: 'Open Club' },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.created[0]!.historyVisibility).toBeUndefined();
  });

  it('T-518-13c: POST / direct with historyVisibility is rejected honestly — 400 HISTORY_VISIBILITY_NOT_APPLICABLE, nothing created', async () => {
    const a = await as(OWNER);
    const res = await a.inject({
      method: 'POST',
      url: '/conversations',
      payload: {
        participantIds: [MEMBER.userId],
        type: 'direct',
        historyVisibility: 'hidden',
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe(
      'HISTORY_VISIBILITY_NOT_APPLICABLE',
    );
    expect(fake.created).toHaveLength(0);
  });
});
