import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { createAppError, errorHandlerPlugin } from '@quant/server-core';
import chatRoutes from '../routes/chat';

describe('QuantAI /chat/:id/messages Identity & Memory Isolation', () => {
  let app: ReturnType<typeof Fastify>;
  let mockChat: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockChat = vi.fn().mockResolvedValue({
      content: 'AI response text',
      model: 'gpt-4o',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCost: 0.001 },
    });

    app = Fastify();
    await app.register(errorHandlerPlugin);

    // Decorate app with mock aiEngine
    (app as any).aiEngine = {
      chat: mockChat,
    };

    // Dynamic auth hook reading x-test-user-id header to simulate authenticated callers
    app.decorateRequest('auth', null);
    app.addHook('preHandler', async (request: FastifyRequest) => {
      const headerUserId = request.headers['x-test-user-id'] as string | undefined;
      if (headerUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: headerUserId };
      }
    });

    await app.register(chatRoutes, { prefix: '/chat' });
    await app.ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it('proves two authenticated users get isolated per-user userId and never fall back to anonymous', async () => {
    // 1. User Alice sends a message
    const resAlice = await app.inject({
      method: 'POST',
      url: '/chat/session-alice-1/messages',
      headers: { 'x-test-user-id': 'user-alice-123' },
      payload: {
        content: 'Hello from Alice',
        temperature: 0.4,
        maxTokens: 500,
        model: 'gpt-4o',
      },
    });

    expect(resAlice.statusCode).toBe(200);
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockChat).toHaveBeenNthCalledWith(
      1,
      [{ role: 'user', content: 'Hello from Alice' }],
      {
        userId: 'user-alice-123',
        model: 'gpt-4o',
        temperature: 0.4,
        maxTokens: 500,
      },
    );

    // 2. User Bob sends a message
    const resBob = await app.inject({
      method: 'POST',
      url: '/chat/session-bob-99/messages',
      headers: { 'x-test-user-id': 'user-bob-456' },
      payload: {
        content: 'Hello from Bob',
      },
    });

    expect(resBob.statusCode).toBe(200);
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockChat).toHaveBeenNthCalledWith(
      2,
      [{ role: 'user', content: 'Hello from Bob' }],
      {
        userId: 'user-bob-456',
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: undefined,
      },
    );

    // Assert neither call fell back to 'anonymous'
    const firstCallOpts = mockChat.mock.calls[0][1];
    const secondCallOpts = mockChat.mock.calls[1][1];
    expect(firstCallOpts.userId).toBe('user-alice-123');
    expect(secondCallOpts.userId).toBe('user-bob-456');
    expect(firstCallOpts.userId).not.toBe(secondCallOpts.userId);
    expect(firstCallOpts.userId).not.toBe('anonymous');
    expect(secondCallOpts.userId).not.toBe('anonymous');
  });

  it('rejects unauthenticated requests with 401 UNAUTHORIZED without calling aiEngine.chat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/chat/session-anonymous/messages',
      payload: {
        content: 'Trying to chat anonymously',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(mockChat).not.toHaveBeenCalled();
  });
});
