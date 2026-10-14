import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import messageRequestsRoutes from '../routes/message-requests';
import conversationsRoutes from '../routes/conversations';

// QC-F-321: MESSAGE REQUESTS — the first-contact consent surface.
// The whoCanMessage gate is binary (allowed / 403 MESSAGE_NOT_ALLOWED),
// and with the default 'friends' setting two brand-new users could never
// start a first chat. These tests pin the new PENDING state end to end:
//   - a request is created ONLY for the 'friends' + not-a-friend denial
//     ('nobody' stays a hard 403, blocked senders get the same
//     indistinguishable 403, gate-allowed pairs get 409 NOT_NEEDED);
//   - the first message lives on the request row — NO conversation and
//     NO message exist until the recipient accepts;
//   - accept creates exactly one DIRECT conversation and delivers the
//     first message as its first Message (idempotently);
//   - decline is terminal for the ordered pair;
//   - only the recipient may respond; every uncertain read fails closed
//     (503) with no row created.
// Harness: bare Fastify + REAL routes + REAL services over a fake prisma
// (qc-f-218 pattern; stable module-level fakes, per-test fresh state).

const S = 'user_stranger';
const T = 'user_target';
const F = 'user_friend';
const P = 'user_partner';
const U = 'user_third';

interface FakeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  deletedAt: Date | null;
  preferences: unknown;
}

interface FakeRequest {
  id: string;
  senderId: string;
  targetId: string;
  firstMessage: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  conversationId: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

interface FakeConversation {
  id: string;
  type: string;
  createdBy: string;
  [key: string]: unknown;
}

interface FakeMember {
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  [key: string]: unknown;
}

interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  [key: string]: unknown;
}

function prefsWith(privacy?: Record<string, unknown>, extra?: Record<string, unknown>) {
  return {
    chatSettings: {
      ...(privacy ? { privacy } : {}),
      ...(extra ?? {}),
    },
  };
}

function makeUser(id: string, preferences: unknown = null): FakeUser {
  return {
    id,
    username: `${id.replace('user_', '')}`,
    displayName: `User ${id.replace('user_', '')}`,
    avatarUrl: null,
    deletedAt: null,
    preferences,
  };
}

function createFakePrisma(input: {
  users: FakeUser[];
  closeFriends?: Array<{ userId: string; friendId: string }>;
  conversations?: FakeConversation[];
  members?: FakeMember[];
}) {
  const users = new Map(input.users.map((u) => [u.id, u]));
  const closeFriends = input.closeFriends ?? [];
  const requests: FakeRequest[] = [];
  const conversations: FakeConversation[] = [...(input.conversations ?? [])];
  const members: FakeMember[] = [...(input.members ?? [])];
  const messages: FakeMessage[] = [];
  let reqSeq = 0;
  let convSeq = 0;
  let msgSeq = 0;

  const partyOf = (u: FakeUser) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  });

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = users.get(where.id);
        return row ? { ...row } : null;
      }),
    },
    closeFriend: {
      findMany: vi.fn(
        async ({ where }: { where: { userId: string; friendId: string } }) =>
          closeFriends.filter(
            (e) => e.userId === where.userId && e.friendId === where.friendId,
          ),
      ),
    },
    conversation: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; type: string };
        }) =>
          conversations.filter(
            (c) => where.id.in.includes(c.id) && c.type === where.type,
          ),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeConversation = {
          id: `conv_${++convSeq}`,
          type: String(data.type),
          createdBy: String(data.createdBy),
          ...data,
        };
        conversations.push(row);
        return row;
      }),
    },
    conversationMember: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId?: string;
            conversationId?: string | { in: string[] };
            leftAt?: null;
          };
        }) => {
          let rows = members.filter((m) => m.leftAt == null);
          if (where.userId) rows = rows.filter((m) => m.userId === where.userId);
          const convFilter = where.conversationId;
          if (typeof convFilter === 'string') {
            rows = rows.filter((m) => m.conversationId === convFilter);
          } else if (convFilter) {
            rows = rows.filter((m) => convFilter.in.includes(m.conversationId));
          }
          return rows;
        },
      ),
      createMany: vi.fn(async ({ data }: { data: FakeMember[] }) => {
        members.push(...data);
        return { count: data.length };
      }),
    },
    message: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeMessage = {
          id: `msg_${++msgSeq}`,
          conversationId: String(data.conversationId),
          senderId: String(data.senderId),
          type: String(data.type),
          content: (data.content as string | null) ?? null,
          ...data,
        };
        messages.push(row);
        return row;
      }),
    },
    messageRequest: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id?: string;
            senderId_targetId?: { senderId: string; targetId: string };
          };
        }) => {
          if (where.id) return requests.find((r) => r.id === where.id) ?? null;
          const pair = where.senderId_targetId!;
          return (
            requests.find(
              (r) => r.senderId === pair.senderId && r.targetId === pair.targetId,
            ) ?? null
          );
        },
      ),
      findMany: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { targetId?: string; senderId?: string; status?: string };
          include?: { sender?: unknown; target?: unknown };
        }) => {
          let rows = [...requests];
          if (where.targetId) rows = rows.filter((r) => r.targetId === where.targetId);
          if (where.senderId) rows = rows.filter((r) => r.senderId === where.senderId);
          if (where.status) rows = rows.filter((r) => r.status === where.status);
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return rows.map((r) => ({
            ...r,
            ...(include?.sender ? { sender: partyOf(users.get(r.senderId)!) } : {}),
            ...(include?.target ? { target: partyOf(users.get(r.targetId)!) } : {}),
          }));
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { senderId: string; status: string } }) =>
          requests.filter(
            (r) => r.senderId === where.senderId && r.status === where.status,
          ).length,
      ),
      create: vi.fn(async ({ data }: { data: Omit<FakeRequest, 'id' | 'createdAt' | 'respondedAt' | 'conversationId'> & { status: 'PENDING' } }) => {
        if (
          requests.some(
            (r) => r.senderId === data.senderId && r.targetId === data.targetId,
          )
        ) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row: FakeRequest = {
          id: `req_${++reqSeq}`,
          conversationId: null,
          createdAt: new Date(Date.now() + reqSeq),
          respondedAt: null,
          ...data,
        };
        requests.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeRequest>;
        }) => {
          const row = requests.find((r) => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  return { prisma, requests, conversations, members, messages, users };
}

type FakePrisma = ReturnType<typeof createFakePrisma>;

async function buildApp(fake: FakePrisma): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', fake.prisma as never);
  // Auth stub: the x-test-user header stands in for the auth plugin's
  // request.auth; absent header = unauthenticated request.
  app.addHook('onRequest', (request, _reply, done) => {
    const userId = request.headers['x-test-user'];
    if (typeof userId === 'string' && userId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    }
    done();
  });
  await app.register(messageRequestsRoutes, { prefix: '/message-requests' });
  await app.register(conversationsRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

function post(app: FastifyInstance, url: string, user: string | null, payload?: unknown) {
  return app.inject({
    method: 'POST',
    url,
    headers: user ? { 'x-test-user': user } : {},
    payload: payload as Record<string, unknown> | undefined,
  });
}

function get(app: FastifyInstance, url: string, user: string | null) {
  return app.inject({
    method: 'GET',
    url,
    headers: user ? { 'x-test-user': user } : {},
  });
}

function bodyOf(res: { body: string }) {
  return JSON.parse(res.body) as {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  };
}

/** Standard cast: T with default prefs, plus friend/partner/third party. */
function standardFake(): FakePrisma {
  return createFakePrisma({
    users: [makeUser(S), makeUser(T), makeUser(F), makeUser(P), makeUser(U)],
    closeFriends: [{ userId: T, friendId: F }],
    conversations: [{ id: 'conv_existing', type: 'DIRECT', createdBy: P }],
    members: [
      { conversationId: 'conv_existing', userId: P, role: 'OWNER', leftAt: null },
      { conversationId: 'conv_existing', userId: T, role: 'MEMBER', leftAt: null },
    ],
  });
}

describe('QC-F-321 message requests', () => {
  let app: FastifyInstance;
  let fake: FakePrisma;

  beforeEach(async () => {
    fake = standardFake();
    app = await buildApp(fake);
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. default-friends stranger: request is created PENDING, no conversation/message exists, inbox shows the real sender', async () => {
    const res = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'Hi, mai S hoon — pehla salaam',
    });
    expect(res.statusCode).toBe(201);
    const body = bodyOf(res);
    expect(body.success).toBe(true);
    const dto = body.data as { status: string; firstMessage: string; senderId: string };
    expect(dto.status).toBe('PENDING');
    expect(dto.firstMessage).toBe('Hi, mai S hoon — pehla salaam');
    expect(dto.senderId).toBe(S);
    // The request is NOT a delivery: nothing reached any inbox yet.
    expect(fake.conversations.filter((c) => c.id !== 'conv_existing')).toHaveLength(0);
    expect(fake.messages).toHaveLength(0);

    const inbox = await get(app, '/message-requests/inbox', T);
    expect(inbox.statusCode).toBe(200);
    const rows = bodyOf(inbox).data as Array<{
      sender: { id: string; username: string; displayName: string };
      firstMessage: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sender.id).toBe(S);
    expect(rows[0]!.sender.username).toBe('stranger');
    expect(rows[0]!.firstMessage).toBe('Hi, mai S hoon — pehla salaam');
  });

  it("2. 'everyone' target: 409 MESSAGE_REQUEST_NOT_NEEDED, no row", async () => {
    fake.users.set(
      'user_open',
      makeUser('user_open', prefsWith({ whoCanMessage: 'everyone' })),
    );
    const res = await post(app, '/message-requests', S, {
      targetId: 'user_open',
      message: 'hello',
    });
    expect(res.statusCode).toBe(409);
    expect(bodyOf(res).error?.code).toBe('MESSAGE_REQUEST_NOT_NEEDED');
    expect(fake.requests).toHaveLength(0);
  });

  it('3. close friend: 409 MESSAGE_REQUEST_NOT_NEEDED, no row', async () => {
    const res = await post(app, '/message-requests', F, {
      targetId: T,
      message: 'hello dost',
    });
    expect(res.statusCode).toBe(409);
    expect(bodyOf(res).error?.code).toBe('MESSAGE_REQUEST_NOT_NEEDED');
    expect(fake.requests).toHaveLength(0);
  });

  it('4. existing DIRECT partner: 409 MESSAGE_REQUEST_NOT_NEEDED, no row', async () => {
    const res = await post(app, '/message-requests', P, {
      targetId: T,
      message: 'hello partner',
    });
    expect(res.statusCode).toBe(409);
    expect(bodyOf(res).error?.code).toBe('MESSAGE_REQUEST_NOT_NEEDED');
    expect(fake.requests).toHaveLength(0);
  });

  it("5. 'nobody' target: hard 403 MESSAGE_NOT_ALLOWED, no row (the opt-out is never a requests inbox)", async () => {
    fake.users.set(
      'user_closed',
      makeUser('user_closed', prefsWith({ whoCanMessage: 'nobody' })),
    );
    const res = await post(app, '/message-requests', S, {
      targetId: 'user_closed',
      message: 'hello',
    });
    expect(res.statusCode).toBe(403);
    expect(bodyOf(res).error?.code).toBe('MESSAGE_NOT_ALLOWED');
    expect(fake.requests).toHaveLength(0);
  });

  it('6. blocked sender: the SAME indistinguishable 403 as an ordinary denial, no row', async () => {
    fake.users.set(
      'user_blocker',
      makeUser(
        'user_blocker',
        prefsWith(undefined, {
          blockedUsers: [{ id: S, name: 'User stranger', username: 'stranger', blockedAt: '2026-10-01T00:00:00.000Z' }],
        }),
      ),
    );
    const res = await post(app, '/message-requests', S, {
      targetId: 'user_blocker',
      message: 'hello',
    });
    expect(res.statusCode).toBe(403);
    // No distinct block code: the response must not reveal the block.
    expect(bodyOf(res).error?.code).toBe('MESSAGE_NOT_ALLOWED');
    expect(fake.requests).toHaveLength(0);
  });

  it('7. fail-closed: malformed prefs -> 503 with no row; malformed block list -> 503 with no row', async () => {
    fake.users.set('user_broken', makeUser('user_broken', 'not-an-object'));
    const res1 = await post(app, '/message-requests', S, {
      targetId: 'user_broken',
      message: 'hello',
    });
    expect(res1.statusCode).toBe(503);
    expect(bodyOf(res1).error?.code).toBe('UPSTREAM_UNAVAILABLE');

    fake.users.set(
      'user_broken_block',
      makeUser('user_broken_block', prefsWith(undefined, { blockedUsers: 'oops' })),
    );
    const res2 = await post(app, '/message-requests', S, {
      targetId: 'user_broken_block',
      message: 'hello',
    });
    expect(res2.statusCode).toBe(503);
    expect(bodyOf(res2).error?.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(fake.requests).toHaveLength(0);
  });

  it('8. missing target -> 404 USER_NOT_FOUND; deleted target -> 404, no row', async () => {
    const res1 = await post(app, '/message-requests', S, {
      targetId: 'user_ghost',
      message: 'hello',
    });
    expect(res1.statusCode).toBe(404);
    expect(bodyOf(res1).error?.code).toBe('USER_NOT_FOUND');

    const deleted = makeUser('user_deleted');
    deleted.deletedAt = new Date();
    fake.users.set('user_deleted', deleted);
    const res2 = await post(app, '/message-requests', S, {
      targetId: 'user_deleted',
      message: 'hello',
    });
    expect(res2.statusCode).toBe(404);
    expect(bodyOf(res2).error?.code).toBe('USER_NOT_FOUND');
    expect(fake.requests).toHaveLength(0);
  });

  it('9. self-request -> 400 BAD_REQUEST, no row', async () => {
    const res = await post(app, '/message-requests', S, {
      targetId: S,
      message: 'note to self',
    });
    expect(res.statusCode).toBe(400);
    expect(bodyOf(res).error?.code).toBe('BAD_REQUEST');
    expect(fake.requests).toHaveLength(0);
  });

  it('10. duplicate pending is idempotent: 200, same id, FIRST message kept, one row', async () => {
    const first = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'pehla text',
    });
    expect(first.statusCode).toBe(201);
    const firstId = (bodyOf(first).data as { id: string }).id;

    const second = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'badla hua text',
    });
    expect(second.statusCode).toBe(200);
    const dto = bodyOf(second).data as { id: string; firstMessage: string };
    expect(dto.id).toBe(firstId);
    expect(dto.firstMessage).toBe('pehla text');
    expect(fake.requests).toHaveLength(1);
  });

  it('11. decline is terminal: sender sees DECLINED, re-request is 403, the message never arrives', async () => {
    const created = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'salaam',
    });
    const id = (bodyOf(created).data as { id: string }).id;

    const declined = await post(app, `/message-requests/${id}/decline`, T);
    expect(declined.statusCode).toBe(200);
    expect((bodyOf(declined).data as { request: { status: string } }).request.status).toBe('DECLINED');
    expect(fake.requests[0]!.respondedAt).not.toBeNull();

    const sent = await get(app, '/message-requests/sent', S);
    const sentRows = bodyOf(sent).data as Array<{ status: string }>;
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0]!.status).toBe('DECLINED');

    const again = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'ek aur mauka?',
    });
    expect(again.statusCode).toBe(403);
    expect(bodyOf(again).error?.code).toBe('MESSAGE_REQUEST_DECLINED');
    expect(fake.requests).toHaveLength(1);
    expect(fake.messages).toHaveLength(0);
    expect(fake.conversations.filter((c) => c.id !== 'conv_existing')).toHaveLength(0);
  });

  it('12. accept delivers: one DIRECT conversation, first message inside it, pair can now chat directly', async () => {
    const created = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'pehla salaam',
    });
    const id = (bodyOf(created).data as { id: string }).id;

    const accepted = await post(app, `/message-requests/${id}/accept`, T);
    expect(accepted.statusCode).toBe(200);
    const data = bodyOf(accepted).data as {
      request: { status: string; conversationId: string };
      conversationId: string;
    };
    expect(data.request.status).toBe('ACCEPTED');
    expect(data.conversationId).toBeTruthy();
    expect(data.request.conversationId).toBe(data.conversationId);

    const newConvs = fake.conversations.filter((c) => c.id !== 'conv_existing');
    expect(newConvs).toHaveLength(1);
    expect(newConvs[0]!.type).toBe('DIRECT');
    const memberRows = fake.members.filter((m) => m.conversationId === data.conversationId);
    expect(memberRows).toHaveLength(2);
    expect(memberRows.find((m) => m.userId === S)?.role).toBe('OWNER');
    expect(memberRows.find((m) => m.userId === T)?.role).toBe('MEMBER');

    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]).toMatchObject({
      conversationId: data.conversationId,
      senderId: S,
      type: 'TEXT',
      content: 'pehla salaam',
    });

    const inbox = await get(app, '/message-requests/inbox', T);
    expect(bodyOf(inbox).data).toHaveLength(0);

    // The pair is now a 'friend' v1 pair (existing DIRECT): a direct
    // create passes the gate instead of 403ing.
    const direct = await post(app, '/conversations', S, {
      participantIds: [T],
      type: 'direct',
    });
    expect(direct.statusCode).toBe(201);
  });

  it('13. accept is idempotent: second accept returns the same conversation, nothing new is created', async () => {
    const created = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'salaam',
    });
    const id = (bodyOf(created).data as { id: string }).id;
    const first = await post(app, `/message-requests/${id}/accept`, T);
    const convId = (bodyOf(first).data as { conversationId: string }).conversationId;

    const second = await post(app, `/message-requests/${id}/accept`, T);
    expect(second.statusCode).toBe(200);
    expect((bodyOf(second).data as { conversationId: string }).conversationId).toBe(convId);
    expect(fake.conversations.filter((c) => c.id !== 'conv_existing')).toHaveLength(1);
    expect(fake.messages).toHaveLength(1);
  });

  it('14. wrong-order responses are 409; decline-after-decline stays an idempotent 200', async () => {
    const c1 = await post(app, '/message-requests', S, { targetId: T, message: 'one' });
    const id1 = (bodyOf(c1).data as { id: string }).id;
    await post(app, `/message-requests/${id1}/decline`, T);
    const acceptDeclined = await post(app, `/message-requests/${id1}/accept`, T);
    expect(acceptDeclined.statusCode).toBe(409);
    expect(bodyOf(acceptDeclined).error?.code).toBe('MESSAGE_REQUEST_NOT_PENDING');
    const declineAgain = await post(app, `/message-requests/${id1}/decline`, T);
    expect(declineAgain.statusCode).toBe(200);

    const c2 = await post(app, '/message-requests', U, { targetId: T, message: 'two' });
    const id2 = (bodyOf(c2).data as { id: string }).id;
    await post(app, `/message-requests/${id2}/accept`, T);
    const declineAccepted = await post(app, `/message-requests/${id2}/decline`, T);
    expect(declineAccepted.statusCode).toBe(409);
    expect(bodyOf(declineAccepted).error?.code).toBe('MESSAGE_REQUEST_NOT_PENDING');
  });

  it('15. only the recipient can respond: sender and third party get 403, the row stays PENDING', async () => {
    const created = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'salaam',
    });
    const id = (bodyOf(created).data as { id: string }).id;

    const bySender = await post(app, `/message-requests/${id}/accept`, S);
    expect(bySender.statusCode).toBe(403);
    expect(bodyOf(bySender).error?.code).toBe('NOT_REQUEST_RECIPIENT');
    const byThird = await post(app, `/message-requests/${id}/decline`, U);
    expect(byThird.statusCode).toBe(403);
    expect(bodyOf(byThird).error?.code).toBe('NOT_REQUEST_RECIPIENT');

    expect(fake.requests[0]!.status).toBe('PENDING');
    expect(fake.conversations.filter((c) => c.id !== 'conv_existing')).toHaveLength(0);
    expect(fake.messages).toHaveLength(0);
  });

  it('16. pending cap: the 21st distinct pending target is 429; a response frees a slot', async () => {
    for (let i = 0; i < 20; i++) {
      const id = `user_cap_${i}`;
      fake.users.set(id, makeUser(id));
      const res = await post(app, '/message-requests', S, {
        targetId: id,
        message: `request ${i}`,
      });
      expect(res.statusCode).toBe(201);
    }
    fake.users.set('user_cap_20', makeUser('user_cap_20'));
    const over = await post(app, '/message-requests', S, {
      targetId: 'user_cap_20',
      message: 'one too many',
    });
    expect(over.statusCode).toBe(429);
    expect(bodyOf(over).error?.code).toBe('MESSAGE_REQUEST_LIMIT');
    expect(fake.requests.filter((r) => r.senderId === S)).toHaveLength(20);

    // A decline frees a PENDING slot (the cap counts PENDING, not total).
    const firstId = fake.requests.find((r) => r.targetId === 'user_cap_0')!.id;
    await post(app, `/message-requests/${firstId}/decline`, 'user_cap_0');
    const after = await post(app, '/message-requests', S, {
      targetId: 'user_cap_20',
      message: 'now it fits',
    });
    expect(after.statusCode).toBe(201);
  });

  it('17. message bounds: whitespace-only -> 400, 1001 chars -> 400 (service cap), exactly 1000 -> 201', async () => {
    const blank = await post(app, '/message-requests', S, {
      targetId: T,
      message: '   ',
    });
    expect(blank.statusCode).toBe(400);

    const tooLong = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'x'.repeat(1001),
    });
    expect(tooLong.statusCode).toBe(400);
    expect(bodyOf(tooLong).error?.code).toBe('BAD_REQUEST');

    const exact = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'x'.repeat(1000),
    });
    expect(exact.statusCode).toBe(201);
    expect(fake.requests).toHaveLength(1);
  });

  it('18. isolation: nobody else sees the request, and no DTO leaks email/phone fields', async () => {
    await post(app, '/message-requests', S, { targetId: T, message: 'salaam' });

    const thirdInbox = await get(app, '/message-requests/inbox', U);
    expect(bodyOf(thirdInbox).data).toHaveLength(0);
    const senderInbox = await get(app, '/message-requests/inbox', S);
    expect(bodyOf(senderInbox).data).toHaveLength(0);
    const thirdSent = await get(app, '/message-requests/sent', U);
    expect(bodyOf(thirdSent).data).toHaveLength(0);

    const inbox = await get(app, '/message-requests/inbox', T);
    const row = (bodyOf(inbox).data as Array<{ sender: Record<string, unknown> }>)[0]!;
    expect(Object.keys(row.sender).sort()).toEqual(
      ['avatarUrl', 'displayName', 'id', 'username'].sort(),
    );
    expect(JSON.stringify(bodyOf(inbox).data)).not.toContain('phone');
    expect(JSON.stringify(bodyOf(inbox).data)).not.toContain('email');
  });

  it('19. group create is unchanged: still 403 for a stranger target and creates NO request row', async () => {
    const res = await post(app, '/conversations', S, {
      participantIds: [T],
      type: 'group',
      name: 'bypass attempt',
    });
    expect(res.statusCode).toBe(403);
    expect(bodyOf(res).error?.code).toBe('MESSAGE_NOT_ALLOWED');
    expect(fake.requests).toHaveLength(0);
  });

  it('20. unauthenticated: all five endpoints answer 401 and change nothing', async () => {
    const created = await post(app, '/message-requests', S, {
      targetId: T,
      message: 'salaam',
    });
    const id = (bodyOf(created).data as { id: string }).id;

    expect((await post(app, '/message-requests', null, { targetId: T, message: 'x' })).statusCode).toBe(401);
    expect((await get(app, '/message-requests/inbox', null)).statusCode).toBe(401);
    expect((await get(app, '/message-requests/sent', null)).statusCode).toBe(401);
    expect((await post(app, `/message-requests/${id}/accept`, null)).statusCode).toBe(401);
    expect((await post(app, `/message-requests/${id}/decline`, null)).statusCode).toBe(401);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.status).toBe('PENDING');
  });
});
