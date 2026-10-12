// ===========================================================================
// QC-F-067 — "Quant AI Auto-Reply" toggle was theatre: no trigger, global
// in-memory state, no membership check, no state restore
// ===========================================================================
//
// Pre-fix behaviour (origin/main @ e7d54cce5, firsthand):
//   - POST /ai/auto-reply/toggle flipped a conversationId-keyed in-memory
//     Set — NOT per user (one member armed everyone), lost on restart,
//     and with NO membership check (any logged-in user could flip any
//     conversation, cancelling other people's queued replies).
//   - The generate endpoint consulted that same global Set and returned
//     text to its caller; nothing in the message flow ever called it, and
//     the generated text was never delivered as a message.
//   - The web panel always mounted OFF — no read endpoint existed.
//
// Fix pinned here:
//   - AutoReplyService persists enablement per user in
//     User.preferences.chatSettings.autoReply.conversationIds; toggle +
//     state reads are membership-gated (403 NOT_A_MEMBER, no oracle).
//   - handleIncomingMessage is the real trigger: other active members who
//     personally opted in get a generated reply delivered as their own
//     message (deliver port → MessageService with isAIGenerated: true).
//   - Loop safety: AI incoming → no replies; sender never self-replies;
//     one in-flight reply per user+conversation; disable during
//     generation cancels delivery.
//
// Negative control: on pre-fix code the route cases fail at import (no
// AutoReplyService / no /auto-reply/state route — toggle returns 200 for
// a non-member and persists nothing), and the MessageService pin fails
// (isAIGenerated was dropped before persistence).
// ===========================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import aiAgentRoutes from '../routes/ai-agent';
import { AutoReplyManager } from '../lib/auto-reply-manager';
import {
  AutoReplyService,
  extractAutoReplyConversationIds,
  type AutoReplyAgent,
  type AutoReplyDeliver,
  type AutoReplyPrisma,
} from '../services/auto-reply.service';
import { MessageService } from '../services/message.service';
import { createFakeMessagePrisma } from './fake-message-prisma';

const CONV = 'conv-1';
const A = 'user_a'; // the away user who enables auto-reply
const B = 'user_b'; // the sender / second member
const C = 'user_c'; // third member
const OUTSIDER = 'user_x';

const key = (userId: string, conversationId: string) => `${userId}::${conversationId}`;

// ---------------------------------------------------------------------------
// In-memory DB fake implementing the AutoReplyPrisma structural surface.
// Membership rows honour the leftAt filter exactly like the real delegate.
// ---------------------------------------------------------------------------
interface MsgRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  isAIGenerated: boolean;
  isDeleted: boolean;
  createdAt: Date;
}

function makeDb(memberIds: string[] = [A, B, C]) {
  const users = new Map<string, { preferences: unknown }>(
    [A, B, C, OUTSIDER].map((id) => [id, { preferences: {} }]),
  );
  const memberships = new Map<string, Date | null>(
    memberIds.map((id) => [key(id, CONV), null]),
  );
  const messages: MsgRow[] = [];
  let msgSeq = 0;

  const prisma: AutoReplyPrisma = {
    user: {
      findUnique: async ({ where }) => {
        const row = users.get(where.id);
        return row ? { preferences: row.preferences } : null;
      },
      findMany: async ({ where }) =>
        where.id.in
          .filter((id) => users.has(id))
          .map((id) => ({ id, preferences: users.get(id)!.preferences })),
      update: async ({ where, data }) => {
        const row = users.get(where.id);
        if (!row) throw new Error('user not found');
        row.preferences = data.preferences;
        return row;
      },
    },
    conversationMember: {
      findFirst: async ({ where }) => {
        const leftAt = memberships.get(key(where.userId, where.conversationId));
        if (leftAt === undefined || leftAt !== null) return null;
        return { id: `mem_${where.userId}` };
      },
      findMany: async ({ where }) =>
        [...memberships.entries()]
          .filter(([k, leftAt]) => k.endsWith(`::${where.conversationId}`) && leftAt === null)
          .map(([k]) => ({ userId: k.split('::')[0]! })),
    },
    message: {
      findMany: async ({ where, take }) =>
        messages
          .filter((m) => m.conversationId === where.conversationId && !m.isDeleted)
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
          .slice(0, take)
          .map((m) => ({
            id: m.id,
            senderId: m.senderId,
            content: m.content,
            isAIGenerated: m.isAIGenerated,
          })),
    },
  };

  const addMessage = (row: Omit<MsgRow, 'id' | 'isDeleted' | 'createdAt'> & { createdAt?: Date }) => {
    msgSeq += 1;
    const full: MsgRow = {
      isDeleted: false,
      createdAt: row.createdAt ?? new Date(1_700_000_000_000 + msgSeq * 1000),
      ...row,
      id: `m_${msgSeq}`,
    };
    messages.push(full);
    return full;
  };

  return { prisma, users, memberships, messages, addMessage };
}

type Db = ReturnType<typeof makeDb>;

function makeAgent(
  behaviour?: (input: { incomingMessage: string }, userId: string) => Promise<string> | string,
): AutoReplyAgent & { calls: Array<{ userId: string; context: unknown; incomingMessage: string }> } {
  const calls: Array<{ userId: string; context: unknown; incomingMessage: string }> = [];
  return {
    calls,
    autoReply: async (input, userId) => {
      calls.push({ userId, context: input.context, incomingMessage: input.incomingMessage });
      const content = behaviour
        ? await behaviour(input, userId)
        : `auto-reply from ${userId}`;
      return { content, isAIGenerated: true as const, confidence: 0.9 };
    },
  };
}

function makeDeliver() {
  const calls: Array<{ conversationId: string; senderId: string; content: string }> = [];
  const deliver: AutoReplyDeliver = async (input) => {
    calls.push(input);
  };
  return { deliver, calls };
}

function makeService(db: Db, agent = makeAgent(), deliver = makeDeliver().deliver) {
  const manager = new AutoReplyManager();
  const service = new AutoReplyService(db.prisma, manager, agent, deliver);
  return { service, manager, agent };
}

// ---------------------------------------------------------------------------
// Route harness (F-095 pattern)
// ---------------------------------------------------------------------------
describe('QC-F-067 auto-reply routes (per-user, persisted, membership-gated)', () => {
  let apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps = [];
  });

  async function openApp(authUserId: string | null, service: AutoReplyService) {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('prisma', {});
    if (authUserId) {
      app.addHook('onRequest', (request, _reply, done) => {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
        done();
      });
    }
    await app.register(aiAgentRoutes, { prefix: '/ai', autoReplyService: service });
    await app.ready();
    apps.push(app);
    return app;
  }

  const toggle = (app: FastifyInstance, payload: unknown) =>
    app.inject({ method: 'POST', url: '/ai/auto-reply/toggle', payload: payload as object });
  const state = (app: FastifyInstance, qs = `conversationId=${CONV}`) =>
    app.inject({ method: 'GET', url: `/ai/auto-reply/state?${qs}` });
  const generate = (app: FastifyInstance) =>
    app.inject({
      method: 'POST',
      url: '/ai/auto-reply',
      payload: { conversationId: CONV, incomingMessage: 'kal milte hain?', context: [] },
    });

  it('1. non-member toggle is 403 NOT_A_MEMBER and persists nothing', async () => {
    const db = makeDb();
    const { service } = makeService(db);
    const app = await openApp(OUTSIDER, service);

    const res = await toggle(app, { conversationId: CONV, enabled: true });
    expect(res.statusCode).toBe(403);
    expect(res.json().error?.code).toBe('NOT_A_MEMBER');
    expect(extractAutoReplyConversationIds(db.users.get(OUTSIDER)!.preferences)).toEqual([]);
  });

  it('2. member toggle-on persists into User.preferences (chatSettings.autoReply)', async () => {
    const db = makeDb();
    const { service } = makeService(db);
    const app = await openApp(A, service);

    const res = await toggle(app, { conversationId: CONV, enabled: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ conversationId: CONV, enabled: true });

    const prefs = db.users.get(A)!.preferences as {
      chatSettings?: { autoReply?: { conversationIds?: string[] } };
    };
    expect(prefs.chatSettings?.autoReply?.conversationIds).toEqual([CONV]);
    // Other members' preferences untouched.
    expect(extractAutoReplyConversationIds(db.users.get(B)!.preferences)).toEqual([]);
  });

  it('3. per-user isolation: A enabling does not arm B (state + generate)', async () => {
    const db = makeDb();
    const { service } = makeService(db);
    const appA = await openApp(A, service);
    await toggle(appA, { conversationId: CONV, enabled: true });

    const appB = await openApp(B, service);
    const stateB = await state(appB);
    expect(stateB.statusCode).toBe(200);
    expect(stateB.json().data.enabled).toBe(false);

    const genB = await generate(appB);
    expect(genB.json().data).toMatchObject({ generated: false, cancelled: true });

    const genA = await generate(appA);
    expect(genA.json().data).toMatchObject({ generated: true, content: `auto-reply from ${A}` });
  });

  it('4. enablement survives a restart — new manager + new service, same DB', async () => {
    const db = makeDb();
    const first = makeService(db);
    const app1 = await openApp(A, first.service);
    await toggle(app1, { conversationId: CONV, enabled: true });

    // Simulated restart: fresh in-memory manager and service instances.
    const second = makeService(db);
    const app2 = await openApp(A, second.service);
    const res = await state(app2);
    expect(res.json().data.enabled).toBe(true);
    const gen = await generate(app2);
    expect(gen.json().data.generated).toBe(true);
  });

  it('5. state endpoint: non-member 403, unauthenticated 401, bad query 400', async () => {
    const db = makeDb();
    const { service } = makeService(db);

    const outsiderApp = await openApp(OUTSIDER, service);
    const resOut = await state(outsiderApp);
    expect(resOut.statusCode).toBe(403);
    expect(resOut.json().error?.code).toBe('NOT_A_MEMBER');

    const anonApp = await openApp(null, service);
    expect((await state(anonApp)).statusCode).toBe(401);

    const memberApp = await openApp(A, service);
    expect((await state(memberApp, '')).statusCode).toBe(400);
  });

  it("6. toggle-off cancels only the caller's queued responses", async () => {
    const db = makeDb();
    const { service, manager } = makeService(db);
    const appA = await openApp(A, service);
    await toggle(appA, { conversationId: CONV, enabled: true });

    const appB = await openApp(B, service);
    await toggle(appB, { conversationId: CONV, enabled: true });

    const ticketA = manager.enqueue(A, CONV);
    const ticketB = manager.enqueue(B, CONV);

    const res = await toggle(appA, { conversationId: CONV, enabled: false });
    expect(res.json().data).toMatchObject({ enabled: false, cancelledCount: 1 });
    expect(manager.isPending(ticketA.ticketId)).toBe(false);
    expect(manager.isPending(ticketB.ticketId)).toBe(true);
    expect(await service.getEnabled(B, CONV)).toBe(true);
  });

  it('7. disable during generation drops the generated reply', async () => {
    const db = makeDb();
    let serviceRef: AutoReplyService;
    const agent = makeAgent(async (_input, userId) => {
      await serviceRef.setEnabled(userId, CONV, false);
      return 'too late';
    });
    const { service } = makeService(db, agent);
    serviceRef = service;
    const app = await openApp(A, service);
    await toggle(app, { conversationId: CONV, enabled: true });

    const res = await generate(app);
    expect(res.json().data).toMatchObject({ generated: false, cancelled: true });
  });
});

// ---------------------------------------------------------------------------
// Trigger (service level)
// ---------------------------------------------------------------------------
describe('QC-F-067 handleIncomingMessage — the real trigger', () => {
  const incoming = (over: Partial<{ senderId: string; isAIGenerated: boolean }> = {}) => ({
    conversationId: CONV,
    senderId: over.senderId ?? B,
    messageId: 'm_incoming',
    content: 'kal milte hain?',
    isAIGenerated: over.isAIGenerated ?? false,
  });

  it('8. enabled member gets a delivered reply; context excludes incoming + AI rows', async () => {
    const db = makeDb();
    db.addMessage({ conversationId: CONV, senderId: A, content: 'mai kal busy hoon', isAIGenerated: false });
    db.addMessage({ conversationId: CONV, senderId: A, content: 'purana auto', isAIGenerated: true });
    const inc = db.addMessage({ conversationId: CONV, senderId: B, content: 'kal milte hain?', isAIGenerated: false });

    const agent = makeAgent();
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, agent, deliver);
    await service.setEnabled(A, CONV, true);

    const delivered = await service.handleIncomingMessage({ ...incoming(), messageId: inc.id });
    expect(delivered).toBe(1);
    expect(calls).toEqual([
      { conversationId: CONV, senderId: A, content: `auto-reply from ${A}` },
    ]);
    // Context: only A's own real message, marked isSelf; incoming + AI rows out.
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.context).toEqual([
      { sender: 'me', content: 'mai kal busy hoon', isSelf: true },
    ]);
  });

  it('9. nobody enabled → no generation at all', async () => {
    const db = makeDb();
    const agent = makeAgent();
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, agent, deliver);

    expect(await service.handleIncomingMessage(incoming())).toBe(0);
    expect(agent.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('10. AI-generated incoming never triggers replies (loop prevention)', async () => {
    const db = makeDb();
    const agent = makeAgent();
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, agent, deliver);
    await service.setEnabled(A, CONV, true);

    expect(await service.handleIncomingMessage(incoming({ isAIGenerated: true }))).toBe(0);
    expect(agent.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('11. the sender never auto-replies to their own message', async () => {
    const db = makeDb();
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, makeAgent(), deliver);
    await service.setEnabled(A, CONV, true);

    expect(await service.handleIncomingMessage(incoming({ senderId: A }))).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('12. disable during generation cancels delivery', async () => {
    const db = makeDb();
    let serviceRef: AutoReplyService;
    const agent = makeAgent(async (_input, userId) => {
      await serviceRef.setEnabled(userId, CONV, false);
      return 'too late';
    });
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, agent, deliver);
    serviceRef = service;
    await service.setEnabled(A, CONV, true);

    expect(await service.handleIncomingMessage(incoming())).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("13. one member's generation failure does not block another member's reply", async () => {
    const db = makeDb();
    const agent = makeAgent((_input, userId) => {
      if (userId === A) throw new Error('provider down');
      return `auto-reply from ${userId}`;
    });
    const { deliver, calls } = makeDeliver();
    const { service } = makeService(db, agent, deliver);
    await service.setEnabled(A, CONV, true);
    await service.setEnabled(C, CONV, true);

    const delivered = await service.handleIncomingMessage(incoming());
    expect(delivered).toBe(1);
    expect(calls).toEqual([
      { conversationId: CONV, senderId: C, content: `auto-reply from ${C}` },
    ]);
  });

  it('14. a member with a reply already in flight is skipped (no reply storm)', async () => {
    const db = makeDb();
    const { deliver, calls } = makeDeliver();
    const { service, manager } = makeService(db, makeAgent(), deliver);
    await service.setEnabled(A, CONV, true);
    manager.enqueue(A, CONV); // an earlier reply is still generating

    expect(await service.handleIncomingMessage(incoming())).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MessageService pin: the AI flag actually reaches persistence
// ---------------------------------------------------------------------------
describe('QC-F-067 MessageService isAIGenerated pass-through', () => {
  it('15. sendMessage persists isAIGenerated=true only when the caller sets it', async () => {
    const fake = createFakeMessagePrisma([{ conversationId: CONV, memberIds: [A, B] }]);
    const service = new MessageService(fake as never, undefined, undefined, undefined as never);

    const aiMsg = await service.sendMessage({
      conversationId: CONV,
      senderId: A,
      content: 'auto reply',
      isAIGenerated: true,
    });
    expect((aiMsg as unknown as { isAIGenerated: boolean }).isAIGenerated).toBe(true);

    const humanMsg = await service.sendMessage({
      conversationId: CONV,
      senderId: B,
      content: 'human',
    });
    expect((humanMsg as unknown as { isAIGenerated: boolean }).isAIGenerated).toBe(false);
  });
});
