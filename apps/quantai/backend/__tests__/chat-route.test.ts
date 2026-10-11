import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal server-core mock: real apps get the same shape from createAppError.
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

const runAgentMock = vi.fn(async () => 'AGENT_OK');

vi.mock('@quant/agentic', () => ({
  orchestrator: {
    runAgent: (...args: any[]) =>
      (runAgentMock as (...callArgs: any[]) => Promise<string>)(...args),
  },
}));

import Fastify from 'fastify';
import chatRoutes from '../routes/chat';
import { AIEngine } from '../services/ai-engine';
import { DEFAULT_USER_MODEL } from '../services/user-model-preference.service';

interface SessionRow {
  id: string;
  userId: string;
}

function makePrisma(sessions: Record<string, SessionRow>, prefs: Record<string, string>) {
  return {
    aISession: {
      findUnique: async ({ where }: { where: { id: string } }) => sessions[where.id] ?? null,
    },
    userModelPreference: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const model = prefs[where.userId];
        if (!model) return null;
        return {
          id: 'pref-1',
          userId: where.userId,
          model,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      upsert: async () => {
        throw new Error('not used');
      },
    },
  };
}

function makeAiEngine() {
  return {
    chat: vi.fn(
      async (
        _messages: unknown[],
        options: { model?: string; userId?: string; temperature?: number },
      ) => ({
      content: 'ENGINE_REPLY',
      model: options.model ?? 'unknown',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
    })),
  };
}

describe('POST /chat/:id/messages (F-107)', () => {
  let app: ReturnType<typeof Fastify>;
  let aiEngine: ReturnType<typeof makeAiEngine>;
  let authUser: string | null;
  let sessions: Record<string, SessionRow>;
  let prefs: Record<string, string>;

  beforeEach(async () => {
    authUser = 'user-1';
    sessions = { 'sess-1': { id: 'sess-1', userId: 'user-1' } };
    prefs = {};
    runAgentMock.mockClear();
    vi.stubEnv('QUANTAI_ALLOWED_MODELS', '');

    app = Fastify();
    app.decorateRequest('auth', null);
    app.addHook('preHandler', async (request: unknown) => {
      (request as { auth: { userId: string } | null }).auth = authUser
        ? { userId: authUser }
        : null;
    });
    app.decorate('prisma', makePrisma(sessions, prefs));
    aiEngine = makeAiEngine();
    app.decorate('aiEngine', aiEngine);
    await app.register(chatRoutes, { prefix: '/chat' });
    await app.ready();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  const post = (sessionId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/chat/${sessionId}/messages`, payload });

  it('rejects unauthenticated callers with 401', async () => {
    authUser = null;
    const res = await post('sess-1', { content: 'hi' });
    expect(res.statusCode).toBe(401);
    expect(aiEngine.chat).not.toHaveBeenCalled();
  });

  it('rejects unknown session ids with 404 SESSION_NOT_FOUND', async () => {
    const res = await post('no-such-session', { content: 'hi' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { message: string };
    expect(body.message).toContain('no-such-session');
    expect(aiEngine.chat).not.toHaveBeenCalled();
  });

  it("rejects another user's session with 403 and actionable copy", async () => {
    sessions['sess-1'] = { id: 'sess-1', userId: 'user-2' };
    const res = await post('sess-1', { content: 'hi' });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { message: string };
    expect(body.message).toContain('different account');
    expect(body.message).toContain('your own chat');
    expect(aiEngine.chat).not.toHaveBeenCalled();
  });

  it('passes the caller userId into the engine (no anonymous bucket)', async () => {
    const res = await post('sess-1', { content: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(aiEngine.chat).toHaveBeenCalledTimes(1);
    const options = aiEngine.chat.mock.calls[0]![1];
    expect(options.userId).toBe('user-1');
    expect(options.userId).not.toBe('anonymous');
    expect(options.model).toBe(DEFAULT_USER_MODEL);
    expect(options.temperature).toBe(0.7);
    const body = res.json() as { message: string; model: string; usage: object };
    expect(body.message).toBe('ENGINE_REPLY');
    expect(body.usage).toBeDefined();
  });

  it('validates the request model against the operator allow-list', async () => {
    vi.stubEnv('QUANTAI_ALLOWED_MODELS', 'openai/gpt-4o-mini,openai/gpt-4o');
    const res = await post('sess-1', { content: 'hi', model: 'evil/unlisted-model' });
    expect(res.statusCode).toBe(200);
    // Disallowed pin falls back to the platform default instead of being
    // honored by the router.
    expect(aiEngine.chat.mock.calls[0]![1].model).toBe(DEFAULT_USER_MODEL);
  });

  it('honors an allow-listed pinned model', async () => {
    vi.stubEnv('QUANTAI_ALLOWED_MODELS', 'openai/gpt-4o-mini,openai/gpt-4o');
    const res = await post('sess-1', { content: 'hi', model: 'openai/gpt-4o' });
    expect(res.statusCode).toBe(200);
    expect(aiEngine.chat.mock.calls[0]![1].model).toBe('openai/gpt-4o');
  });

  it("honors the caller's stored preference when no model is pinned", async () => {
    vi.stubEnv('QUANTAI_ALLOWED_MODELS', 'openai/gpt-4o-mini,openai/gpt-4o');
    prefs['user-1'] = 'openai/gpt-4o';
    const res = await post('sess-1', { content: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(aiEngine.chat.mock.calls[0]![1].model).toBe('openai/gpt-4o');
  });

  it('validates the model on the agent path too', async () => {
    vi.stubEnv('QUANTAI_ALLOWED_MODELS', 'openai/gpt-4o-mini,openai/gpt-4o');
    const res = await post('sess-1', {
      content: 'hi',
      model: 'evil/unlisted-model',
      useAgent: true,
    });
    expect(res.statusCode).toBe(200);
    expect(runAgentMock).toHaveBeenCalledTimes(1);
    const calls = runAgentMock.mock.calls as unknown as unknown[][];
    const context = calls[0]?.[2] as unknown as { userId: string; model: string };
    expect(context.userId).toBe('user-1');
    expect(context.model).toBe(DEFAULT_USER_MODEL);
    const body = res.json() as { model: string };
    expect(body.model).toBe(DEFAULT_USER_MODEL);
  });

  it('rejects empty content with 400', async () => {
    const res = await post('sess-1', { content: '' });
    expect(res.statusCode).toBe(400);
    expect(aiEngine.chat).not.toHaveBeenCalled();
  });
});

describe('AIEngine.chat/streamChat userId requirement (F-107)', () => {
  it('chat() rejects when no userId is provided (no anonymous fallback)', async () => {
    const engine = new AIEngine();
    const err = await engine
      .chat([{ role: 'user', content: 'hi' }], { model: 'm' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { statusCode: number }).statusCode).toBe(400);
    expect((err as Error & { code: string }).code).toBe('USER_ID_REQUIRED');
  });

  it('streamChat() rejects when no userId is provided (no anonymous fallback)', async () => {
    const engine = new AIEngine();
    await expect(async () => {
      const gen = await engine.streamChat([{ role: 'user', content: 'hi' }], { model: 'm' });
      for await (const _ of gen) {
        // drain
      }
    }).rejects.toMatchObject({ statusCode: 400, code: 'USER_ID_REQUIRED' });
  });

  it('chat() works when a userId is provided', async () => {
    const engine = new AIEngine();
    const seen: string[] = [];
    // Intercept at the infer boundary by spying on the instance method.
    const spy = vi
      .spyOn(engine, 'infer')
      .mockImplementation(async (request: { userId: string }) => {
        seen.push(request.userId);
        return {
          id: 'infer-1',
          content: 'OK',
          model: 'm',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCost: 0 },
          latencyMs: 1,
          cached: false,
        };
      });
    const result = await engine.chat([{ role: 'user', content: 'hi' }], {
      model: 'm',
      userId: 'user-9',
    });
    expect(result.content).toBe('OK');
    expect(seen).toEqual(['user-9']);
    spy.mockRestore();
  });
});
