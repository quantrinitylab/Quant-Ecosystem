import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import channelsRoutes from '../routes/channels';

// QC-F-396 — GET /channels/:id/subscribers/count answered for ANY
// conversation id: a logged-in user could read the active member count of
// a private DIRECT (2) or GROUP (N) conversation they are not part of,
// and 0-vs->0 leaked whether an id exists at all. The route itself was
// fine (401 via userId(request), success envelope) — the service method
// behind it had no type gate. Locked rule (specialist-qc-f-396-buildprep
// §2.1/§2.2): subscriberCount runs requireChannel first, so DIRECT/GROUP/
// nonexistent all return the identical 404 CHANNEL_NOT_FOUND, while a
// real channel's count stays available to any authenticated caller
// (member or not) exactly as Discover's publishers list already
// publishes it — membership gates channel CONTENT (getMessages), not
// this count. R05 pins that public rule on purpose: a future change
// that adds a membership gate here must fail this test and take a
// brief amendment instead.
// Harness: QC-F-077 routes pattern — bare Fastify + errorHandlerPlugin +
// decorate('prisma', fake) + preHandler installing request.auth.
// Negative-control signature (§6.3): on the original code R02/R03/R04
// FAIL (200 with {count:2} / {count:3} / {count:0}); R01/R05/R06 are
// controls that PASS on both sides.

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

const OWNER = 'u-owner';
const STRANGER = 'u-stranger';

function makeFakePrisma() {
  const convs: FakeConv[] = [
    { id: 'ch-real', type: 'CHANNEL', name: 'Quant News', description: null, createdBy: OWNER },
    { id: 'conv-direct', type: 'DIRECT', name: null, description: null, createdBy: 'u-a' },
    { id: 'conv-group', type: 'GROUP', name: 'Study Group', description: null, createdBy: 'u-a' },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: 'ch-real', userId: OWNER, role: 'OWNER', leftAt: null },
    { id: 'mb-2', conversationId: 'ch-real', userId: 'u-sub', role: 'MEMBER', leftAt: null },
    { id: 'mb-3', conversationId: 'conv-direct', userId: 'u-a', role: 'MEMBER', leftAt: null },
    { id: 'mb-4', conversationId: 'conv-direct', userId: 'u-b', role: 'MEMBER', leftAt: null },
    { id: 'mb-5', conversationId: 'conv-group', userId: 'u-a', role: 'OWNER', leftAt: null },
    { id: 'mb-6', conversationId: 'conv-group', userId: 'u-b', role: 'MEMBER', leftAt: null },
    { id: 'mb-7', conversationId: 'conv-group', userId: 'u-c', role: 'MEMBER', leftAt: null },
  ];
  const messages: FakeMessage[] = [];
  let seq = 100;

  const memberMatches = (m: FakeMember, where: Record<string, unknown>) => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId']) return false;
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
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
        };
        convs.push(row);
        return row;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return convs.find((c) => c.id === where.id) ?? null;
      },
    },
    conversationMember: {
      async create({ data }: { data: Record<string, unknown> }) {
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
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where));
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where)).length;
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
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
      async create({ data }: { data: Record<string, unknown> }) {
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
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const rows = messages
          .filter((m) => m.conversationId === where['conversationId'])
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
  };

  return { prisma };
}

function errorBody(res: { json: () => unknown }): { code: string; message: string } {
  return (res.json() as { error: { code: string; message: string } }).error;
}
function errorCode(res: { json: () => unknown }): string {
  return errorBody(res).code;
}

describe('QC-F-396 GET /channels/:id/subscribers/count', () => {
  let app: FastifyInstance;
  let authUserId: string | null;

  beforeEach(async () => {
    authUserId = STRANGER;
    const fake = makeFakePrisma();
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
    await app.register(channelsRoutes, { prefix: '/channels' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('T396-R01 (control): without auth the count route fails closed 401 UNAUTHORIZED', async () => {
    authUserId = null;
    const res = await app.inject({ method: 'GET', url: '/channels/ch-real/subscribers/count' });
    expect(res.statusCode).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('T396-R02: DIRECT id returns 404 CHANNEL_NOT_FOUND and no count payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/conv-direct/subscribers/count' });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('CHANNEL_NOT_FOUND');
    const body = res.json() as { data?: { count?: number } };
    expect(body.data?.count).toBeUndefined();
  });

  it('T396-R03: GROUP id returns 404 CHANNEL_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/conv-group/subscribers/count' });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('CHANNEL_NOT_FOUND');
  });

  it('T396-R04: nonexistent id is indistinguishable from DIRECT/GROUP (same status, code, message)', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/channels/conv-does-not-exist/subscribers/count',
    });
    const direct = await app.inject({ method: 'GET', url: '/channels/conv-direct/subscribers/count' });
    const group = await app.inject({ method: 'GET', url: '/channels/conv-group/subscribers/count' });

    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('CHANNEL_NOT_FOUND');
    for (const other of [direct, group]) {
      expect(other.statusCode).toBe(missing.statusCode);
      expect(errorCode(other)).toBe(errorCode(missing));
      expect(errorBody(other).message).toBe(errorBody(missing).message);
    }
  });

  it('T396-R05 (control, locked public rule): a NON-member authenticated caller still gets a real channel count', async () => {
    authUserId = STRANGER; // not a member of ch-real
    const res = await app.inject({ method: 'GET', url: '/channels/ch-real/subscribers/count' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { count: 2 } });
  });

  it('T396-R06 (control): the channel OWNER gets the same count as a non-member', async () => {
    authUserId = OWNER;
    const res = await app.inject({ method: 'GET', url: '/channels/ch-real/subscribers/count' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { count: 2 } });
  });
});
