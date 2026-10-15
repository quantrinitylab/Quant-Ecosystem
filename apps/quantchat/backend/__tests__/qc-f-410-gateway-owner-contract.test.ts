import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import channelsRoutes from '../routes/channels';
import conversationsRoutes from '../routes/conversations';
import messagesRoutes from '../routes/messages';
import searchRoutes from '../routes/search';

// QC-F-410 (QC-1) — OWNER-CONTRACT CENSUS for the Quanty -> Chat agent
// gateway. The gateway (QuantAI lane) was bound to routes QuantChat never
// had (`POST /messages`, `GET /messages/search`, key `quantchat.send-message`)
// and `quantchat.search` sat in the LLM allowlist as "verified live" against
// a 404. The owner truth (specialist-qc-f-410-buildprep §3, verified
// firsthand on origin/main) is pinned HERE, in the owner's own CI, so a
// future route rename / schema change / gateway shim fails loudly instead
// of silently breaking (or silently "fixing") the contract:
//   send  = POST /conversations/:id/messages {content, replyToId?} -> 201
//   search= POST /search {q} (NOT GET, NOT `query`) -> {plaintext, encrypted}
//   pin   = POST /conversations/messages/:id/pin (member-only)
//   create-group = POST /conversations {participantIds, type:'group', name}
//   create-channel = POST /channels {name, description?} — `members` is
//     stripped by the schema (K1: the broadcast create has NO member
//     semantics; the group-conversation create is the members surface —
//     which one `quantchat.create-channel` MEANS is a war-room decision,
//     deliberately UNMAPPED until then; both surfaces are pinned here so
//     the decision, whichever way it lands, starts from pinned truth).
// This file is a CENSUS, not a negative control: by design (brief §6.1)
// all 10 cases PASS on the original code too — its failures arrive with
// future drift. The slice's NC lives in the QC-2 files (reactions route
// + proxy). Harness: QC-F-396 pattern, stable module-level identities.

const MEMBER = 'u-member';
const MEMBER2 = 'u-member2';
const MEMBER3 = 'u-member3';
const STRANGER = 'u-stranger';
const CONV = 'conv-1';
const DM = 'conv-dm';
const MSG = 'msg-1';

interface FakeConv {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
  lastMessageAt: Date | null;
  metadata: Record<string, unknown>;
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
    { id: CONV, type: 'GROUP', name: 'Study Group', description: null, createdBy: MEMBER, lastMessageAt: null, metadata: {} },
    { id: DM, type: 'DIRECT', name: null, description: null, createdBy: MEMBER, lastMessageAt: null, metadata: {} },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: CONV, userId: MEMBER, role: 'OWNER', leftAt: null },
    { id: 'mb-2', conversationId: CONV, userId: MEMBER2, role: 'MEMBER', leftAt: null },
    { id: 'mb-3', conversationId: CONV, userId: MEMBER3, role: 'MEMBER', leftAt: null },
    { id: 'mb-4', conversationId: DM, userId: MEMBER, role: 'OWNER', leftAt: null },
    { id: 'mb-5', conversationId: DM, userId: MEMBER2, role: 'MEMBER', leftAt: null },
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
    const convCond = where['conversationId'];
    if (typeof convCond === 'string' && m.conversationId !== convCond) return false;
    if (
      convCond != null &&
      typeof convCond === 'object' &&
      Array.isArray((convCond as { in?: unknown }).in) &&
      !((convCond as { in: string[] }).in).includes(m.conversationId)
    ) {
      return false;
    }
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
    return true;
  };

  const messageMatches = (m: FakeMessage, where: Record<string, unknown>) => {
    const convCond = where['conversationId'];
    if (typeof convCond === 'string' && m.conversationId !== convCond) return false;
    if (
      convCond != null &&
      typeof convCond === 'object' &&
      Array.isArray((convCond as { in?: unknown }).in) &&
      !((convCond as { in: string[] }).in).includes(m.conversationId)
    ) {
      return false;
    }
    if (where['isDeleted'] != null && m.isDeleted !== where['isDeleted']) return false;
    const contentCond = where['content'] as { contains?: string } | undefined;
    if (contentCond?.contains != null) {
      if (!(m.content ?? '').toLowerCase().includes(contentCond.contains.toLowerCase())) return false;
    }
    const notCond = where['NOT'] as { content?: { startsWith?: string } } | undefined;
    if (notCond?.content?.startsWith != null && (m.content ?? '').startsWith(notCond.content.startsWith)) {
      return false;
    }
    return true;
  };

  const prisma = {
    conversation: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: FakeConv = {
          id: `conv-${++seq}`,
          type: String(data['type']),
          name: (data['name'] as string) ?? null,
          description: (data['description'] as string) ?? null,
          createdBy: String(data['createdBy']),
          lastMessageAt: (data['lastMessageAt'] as Date) ?? null,
          metadata: (data['metadata'] as Record<string, unknown>) ?? {},
        };
        convs.push(row);
        return row;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return convs.find((c) => c.id === where.id) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        const idCond = where['id'] as { in?: string[] } | undefined;
        return convs.filter((c) => {
          if (idCond?.in && !idCond.in.includes(c.id)) return false;
          if (where['type'] != null && c.type !== where['type']) return false;
          return true;
        });
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
      async findMany({ where }: { where: { id?: { in?: string[] } } }) {
        const ids = where.id?.in ?? [];
        return ids.map((id) => ({ id, preferences: null }));
      },
    },
    conversationMember: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: FakeMember = {
          id: `mb-${++seq}`,
          conversationId: String(data['conversationId']),
          userId: String(data['userId']),
          role: String(data['role'] ?? 'MEMBER'),
          leftAt: null,
        };
        members.push(row);
        return row;
      },
      async createMany({ data }: { data: Array<Record<string, unknown>> }) {
        for (const d of data) {
          members.push({
            id: `mb-${++seq}`,
            conversationId: String(d['conversationId']),
            userId: String(d['userId']),
            role: String(d['role'] ?? 'MEMBER'),
            leftAt: null,
          });
        }
        return { count: data.length };
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where));
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where)).length;
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
      async findMany(args: {
        where: Record<string, unknown>;
        skip?: number;
        take?: number;
      }) {
        const rows = messages
          .filter((m) => messageMatches(m, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const skipped = typeof args.skip === 'number' ? rows.slice(args.skip) : rows;
        return typeof args.take === 'number' ? skipped.slice(0, args.take) : skipped;
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return messages.filter((m) => messageMatches(m, where)).length;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = messages.find((m) => m.id === where.id);
        if (!row) throw new Error('Record to update not found.');
        if (data['metadata'] != null) row.metadata = data['metadata'] as Record<string, unknown>;
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

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

describe('QC-F-410 QC-1 gateway owner-contract census', () => {
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
    await app.register(conversationsRoutes, { prefix: '/conversations' });
    await app.register(searchRoutes, { prefix: '/search' });
    await app.register(channelsRoutes, { prefix: '/channels' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('A1: send is POST /conversations/:id/messages {content, replyToId} -> 201 with content verbatim', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV}/messages`,
      payload: { content: 'hello', replyToId: MSG },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { success: boolean; data: { content?: string; replyToId?: string } };
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('hello');
    expect(body.data.replyToId).toBe(MSG);
  });

  it("A2: the gateway's raw send shape {channelId, message} (no content) is a zod 400 — a mapper is mandatory", async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV}/messages`,
      payload: { channelId: CONV, message: 'hello' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A3: search is POST /search {q} -> 200 with the seeded message under data.plaintext.data and data.encrypted null', async () => {
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'hello' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { plaintext: { data: Array<{ id: string }> } | null; encrypted: unknown };
    };
    expect(body.data.encrypted).toBeNull();
    expect(body.data.plaintext?.data.map((m) => m.id)).toContain(MSG);
  });

  it("A4: POST /search with the gateway's param name {query} is a 400 (refine: q/tokenHashes required)", async () => {
    const res = await app.inject({ method: 'POST', url: '/search', payload: { query: 'hello' } });
    expect(res.statusCode).toBe(400);
  });

  it("A5: GET /search (the gateway's method) is 404", async () => {
    const res = await app.inject({ method: 'GET', url: '/search' });
    expect(res.statusCode).toBe(404);
  });

  it('A6 (anti-shim): POST /messages and GET /messages/search — the gateway’s current routes — are BOTH 404 on the owner', async () => {
    const post = await app.inject({ method: 'POST', url: '/messages', payload: { content: 'hello' } });
    expect(post.statusCode).toBe(404);
    const get = await app.inject({ method: 'GET', url: '/messages/search' });
    expect(get.statusCode).toBe(404);
  });

  it('A7: pin is POST /conversations/messages/:id/pin -> 200 with metadata.pinned true for a member', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/messages/${MSG}/pin` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { metadata: { pinned?: unknown } } };
    expect(body.data.metadata.pinned).toBe(true);
  });

  it('A8: pin by a non-member is 403 NOT_A_MEMBER', async () => {
    authUserId = STRANGER;
    const res = await app.inject({ method: 'POST', url: `/conversations/messages/${MSG}/pin` });
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('NOT_A_MEMBER');
  });

  it('A9: POST /channels {name} -> 201 owner-only; a `members` field is stripped (still exactly 1 member)', async () => {
    const first = await app.inject({ method: 'POST', url: '/channels', payload: { name: 'Quant News' } });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json() as { data: { id: string; subscriberCount: number; ownerId: string } };
    expect(firstBody.data.ownerId).toBe(MEMBER);
    expect(firstBody.data.subscriberCount).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: '/channels',
      payload: { name: 'Second', members: [STRANGER, 'u-x'] },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = second.json() as { data: { id: string; subscriberCount: number } };
    expect(secondBody.data.subscriberCount).toBe(1);
    const roster = fake.state.members.filter((m) => m.conversationId === secondBody.data.id);
    expect(roster.map((m) => m.userId)).toEqual([MEMBER]);
  });

  it("A10: POST /conversations {participantIds, type:'group', name} -> 201 with BOTH participants as members (the members-bearing create surface)", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      payload: { participantIds: [MEMBER2], type: 'group', name: 'New Group' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { id: string } };
    const roster = fake.state.members.filter((m) => m.conversationId === body.data.id);
    expect(roster.map((m) => m.userId).sort()).toEqual([MEMBER, MEMBER2].sort());
  });
});
