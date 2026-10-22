// ============================================================================
// QC-F-519 — route-level honest failure: when real @quant/ai inference is
// unavailable, the QuantAIAgent throws 503 AI_UNAVAILABLE and the routes
// surface the standard envelope { success:false, error:{ code, statusCode } }
// instead of returning hand-written canned output labelled AI-generated.
//
// Harness: QC-F-067 pattern (bare Fastify + errorHandlerPlugin + injected
// agent/service). The agent here is a REAL QuantAIAgent with NO engine —
// exactly the "no provider configured" production shape.
//
// Negative control: on the original code every 503 case FAILS (routes
// return 200 with canned results flagged isAIGenerated:true) and the
// 0-message summarize case FAILS (isAIGenerated was true). The
// prioritize-notifications control PASSES on both versions.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import aiAgentRoutes from '../routes/ai-agent';
import { QuantAIAgent } from '../lib/ai-agent';
import { AutoReplyManager } from '../lib/auto-reply-manager';
import {
  AutoReplyService,
  type AutoReplyDeliver,
  type AutoReplyPrisma,
} from '../services/auto-reply.service';

const CONV = 'conv-1';
const A = 'user_a';
const B = 'user_b';

// Minimal AutoReplyPrisma fake: A has auto-reply enabled for CONV.
function makeAutoReplyPrisma(): AutoReplyPrisma {
  const prefs = { chatSettings: { autoReply: { conversationIds: [CONV] } } };
  const prisma: AutoReplyPrisma = {
    user: {
      findUnique: async ({ where }) =>
        where.id === A ? { preferences: prefs } : { preferences: {} },
      findMany: async ({ where }) =>
        where.id.in.map((id) => ({ id, preferences: id === A ? prefs : {} })),
      update: async () => ({}),
    },
    $transaction: async <T,>(fn: (tx: AutoReplyPrisma) => Promise<T>): Promise<T> =>
      fn(prisma),
    conversationMember: {
      findFirst: async ({ where }) =>
        where.conversationId === CONV && (where.userId === A || where.userId === B)
          ? { id: `mem_${where.userId}` }
          : null,
      findMany: async () => [{ userId: A }, { userId: B }],
    },
    message: {
      findMany: async () => [],
    },
  };
  return prisma;
}

describe('QC-F-519 AI routes — honest 503 when inference is unavailable (T-519-5)', () => {
  let apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps = [];
  });

  async function openApp() {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('prisma', {});
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: A };
      done();
    });
    const agent = new QuantAIAgent(); // no engine — provider unconfigured shape
    const deliver: AutoReplyDeliver = async () => {
      throw new Error('deliver must never be called when AI is unavailable');
    };
    const service = new AutoReplyService(
      makeAutoReplyPrisma(),
      new AutoReplyManager(),
      agent,
      deliver,
    );
    await app.register(aiAgentRoutes, { prefix: '/ai', agent, autoReplyService: service });
    await app.ready();
    apps.push(app);
    return app;
  }

  const post = (app: FastifyInstance, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url, payload: payload as object });

  function expectUnavailable(res: { statusCode: number; json: () => any }) {
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
  }

  it('POST /ai/summarize (non-empty) → 503 AI_UNAVAILABLE envelope', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/summarize', {
      conversationId: CONV,
      messages: [{ sender: 'alice', content: 'dinner tonight?' }],
    });
    expectUnavailable(res);
  });

  it('POST /ai/summarize (0 messages) → 200 honest-empty, isAIGenerated:false', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/summarize', { conversationId: CONV, messages: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      summary: 'No messages to summarize yet.',
      keyTopics: [],
      messageCount: 0,
      isAIGenerated: false,
    });
  });

  it('POST /ai/suggestions → 503 AI_UNAVAILABLE envelope', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/suggestions', {
      conversationId: CONV,
      messages: [{ sender: 'alice', content: 'dinner tonight?' }],
    });
    expectUnavailable(res);
  });

  it('POST /ai/translate → 503 AI_UNAVAILABLE envelope', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/translate', { text: 'hello', targetLanguage: 'fr' });
    expectUnavailable(res);
  });

  it('POST /ai/generate-content → 503 AI_UNAVAILABLE envelope', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/generate-content', {
      type: 'caption',
      context: 'beach day',
      count: 3,
    });
    expectUnavailable(res);
  });

  it('POST /ai/auto-reply (enabled user) → 503 AI_UNAVAILABLE envelope, nothing generated', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/auto-reply', {
      conversationId: CONV,
      incomingMessage: 'kal milte hain?',
      context: [],
    });
    expectUnavailable(res);
  });

  it('control: POST /ai/prioritize-notifications stays 200 (deterministic, no AI claim)', async () => {
    const app = await openApp();
    const res = await post(app, '/ai/prioritize-notifications', {
      notifications: [
        { id: '1', category: 'CALLS', title: 'Incoming call', body: '' },
        { id: '2', category: 'REELS', title: 'New reel', body: '' },
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.highPriority.map((n: { id: string }) => n.id)).toEqual(['1']);
    expect(body.data.digest.count).toBe(1);
  });
});
