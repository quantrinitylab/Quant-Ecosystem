// ============================================================================
// QC-F-449 — Channel feed archive: routes layer (cursor passthrough + shape)
// ============================================================================
// Harness = qc-f-396 pattern (bare Fastify + errorHandlerPlugin +
// decorate('prisma', fake) + preHandler request.auth). Pins the BAND
// contract (specialist-qc-f-449-buildprep §3.2/§3.3): `data` stays the BARE
// ARRAY (the Flutter ChannelsApi consumer throws on any other shape), and
// pagination truth rides in the `pagination` sibling { hasMore, nextCursor }.
// The fake implements the real composite-cursor query semantics.
// Negative-control signature (§5.5): on the original route+service R1/R2/R5
// FAIL (no pagination sibling; `before` ignored → page 1 returned / no 400);
// R3/R4 are control-PASS (403/401 predate the fix).
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import channelsRoutes from '../routes/channels';

interface FakeConv {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
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
  createdAt: Date;
}

type Where = Record<string, unknown>;

const OWNER = 'u-owner';
const READER = 'u-reader';

function matchesScalar(row: FakeMessage, where: Where): boolean {
  if (where['conversationId'] != null && row.conversationId !== where['conversationId'])
    return false;
  if (typeof where['id'] === 'string' && row.id !== where['id']) return false;
  const created = where['createdAt'];
  if (created instanceof Date) {
    if (row.createdAt.getTime() !== created.getTime()) return false;
  } else if (created && typeof created === 'object') {
    const lt = (created as { lt?: Date }).lt;
    if (lt && !(row.createdAt.getTime() < lt.getTime())) return false;
  }
  const idCond = where['id'];
  if (idCond && typeof idCond === 'object') {
    const lt = (idCond as { lt?: string }).lt;
    if (lt && !(row.id < lt)) return false;
  }
  return true;
}

function matchesWhere(row: FakeMessage, where: Where): boolean {
  const or = where['OR'] as Where[] | undefined;
  if (Array.isArray(or)) {
    const base: Where = { ...where };
    delete base['OR'];
    if (!matchesScalar(row, base)) return false;
    return or.some((branch) => matchesScalar(row, branch));
  }
  return matchesScalar(row, where);
}

function makeFakePrisma() {
  const convs: FakeConv[] = [
    { id: 'ch-1', type: 'CHANNEL', name: 'Quant News', description: null, createdBy: OWNER },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: 'ch-1', userId: OWNER, role: 'OWNER', leftAt: null },
    { id: 'mb-2', conversationId: 'ch-1', userId: READER, role: 'MEMBER', leftAt: null },
  ];
  const messages: FakeMessage[] = [];
  // Seed 5 posts, oldest first: ids p1..p5 with increasing createdAt.
  for (let i = 1; i <= 5; i += 1) {
    messages.push({
      id: `p${i}`,
      conversationId: 'ch-1',
      senderId: OWNER,
      content: `post-${i}`,
      createdAt: new Date(1_700_000_000_000 + i * 1000),
    });
  }
  let seq = 100;
  const memberMatches = (m: FakeMember, where: Where) => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId'])
      return false;
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
    return true;
  };
  const prisma = {
    conversation: {
      async create({ data }: { data: Where }) {
        const row: FakeConv = {
          id: `conv-${++seq}`,
          type: String(data['type']),
          name: (data['name'] as string) ?? null,
          description: (data['description'] as string) ?? null,
          createdBy: String(data['createdBy']),
        };
        convs.push(row);
        return row;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return convs.find((c) => c.id === where.id) ?? null;
      },
    },
    conversationMember: {
      async create({ data }: { data: Where }) {
        const row: FakeMember = {
          id: `mb-${++seq}`,
          conversationId: String(data['conversationId']),
          userId: String(data['userId']),
          role: String(data['role']),
          leftAt: null,
        };
        members.push(row);
        return row;
      },
      async findFirst({ where }: { where: Where }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where }: { where: Where }) {
        return members.filter((m) => memberMatches(m, where));
      },
      async count({ where }: { where: Where }) {
        return members.filter((m) => memberMatches(m, where)).length;
      },
      async updateMany({ where, data }: { where: Where; data: Where }) {
        let count = 0;
        for (const m of members) {
          if (memberMatches(m, where)) {
            m.leftAt = data['leftAt'] as Date;
            count += 1;
          }
        }
        return { count };
      },
    },
    message: {
      async create({ data }: { data: Where }) {
        const row: FakeMessage = {
          id: `msg-${++seq}`,
          conversationId: String(data['conversationId']),
          senderId: String(data['senderId']),
          content: (data['content'] as string) ?? null,
          createdAt: new Date(),
        };
        messages.push(row);
        return row;
      },
      async findFirst({ where }: { where: Where }) {
        return messages.find((m) => matchesWhere(m, where)) ?? null;
      },
      async findMany({
        where,
        orderBy,
        take,
      }: {
        where: Where;
        orderBy?: Where | Where[];
        take?: number;
      }) {
        const rows = messages.filter((m) => matchesWhere(m, where));
        const keys = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        rows.sort((a, b) => {
          for (const k of keys) {
            if ('createdAt' in k) {
              const d = b.createdAt.getTime() - a.createdAt.getTime();
              if (d !== 0) return k['createdAt'] === 'desc' ? d : -d;
            }
            if ('id' in k) {
              const d = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
              if (d !== 0) return k['id'] === 'desc' ? -d : d;
            }
          }
          return 0;
        });
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
  };
  return { prisma };
}

interface FeedBody {
  success: boolean;
  data?: Array<{ id: string }>;
  pagination?: { hasMore: boolean; nextCursor: string | null };
  error?: { code: string };
}

describe('QC-F-449 GET /channels/:id/messages', () => {
  let app: FastifyInstance;
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = READER;
    const fake = makeFakePrisma();
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (n: string, v: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    app.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await app.register(channelsRoutes, { prefix: '/channels' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('R1: limit+before reach the service; data is a bare array; pagination sibling present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/channels/ch-1/messages?limit=2&before=p4',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FeedBody;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // before p4 with limit 2 → the two posts older than p4, chronological.
    expect(body.data!.map((m) => m.id)).toEqual(['p2', 'p3']);
    expect(body.pagination).toEqual({ hasMore: true, nextCursor: 'p2' });
  });

  it('R2: no query returns the newest page with truthful pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/ch-1/messages' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FeedBody;
    expect(body.data!.map((m) => m.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(body.pagination).toEqual({ hasMore: false, nextCursor: null });
  });

  it('R3 (control): non-member with a real cursor still gets 403 NOT_A_MEMBER', async () => {
    authUserId = 'u-stranger';
    const res = await app.inject({
      method: 'GET',
      url: '/channels/ch-1/messages?before=p4',
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as FeedBody).error?.code).toBe('NOT_A_MEMBER');
  });

  it('R4 (control): unauthenticated gets 401', async () => {
    authUserId = null;
    const res = await app.inject({ method: 'GET', url: '/channels/ch-1/messages' });
    expect(res.statusCode).toBe(401);
  });

  it('R5: unknown cursor fails closed 400 INVALID_CURSOR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/channels/ch-1/messages?before=nope',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as FeedBody).error?.code).toBe('INVALID_CURSOR');
  });
});
