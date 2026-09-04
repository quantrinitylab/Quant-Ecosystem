// @vitest-environment node
// ============================================================================
// POST /ai/chat — the intent, not the answer.
// ============================================================================
//
// This route had no test at all, and it is the only place the settings page's
// "How much thinking" picker can be honoured. That picker wrote
// `quant-ai-model-mode` to `localStorage` while `git grep` proved nothing read
// it, and the card above it told the user the choice was "sent with each request
// as an intent". So the assertions that matter here are the ones that go red if
// the intent stops reaching the provider:
//
//   1. A named tier is handed down verbatim — `fast` really does cap the answer
//      and shorten the timeout.
//   2. A named tier is NOT re-routed. If `auto`'s size rule could override an
//      explicit choice, the picker would be decorative again in a way no
//      settings-page test could see.
//   3. `auto` routes on what actually arrived, and reports which tier it picked.
//   4. Nothing from the request body can reach `options.model`: the Cloudflare
//      transport interpolates the model into a URL path, so a body-controlled
//      value there is a request-forgery sink.
//   5. An id the picker could plausibly send but the server does not know is a
//      400, not a silent fall back to a tier the user did not choose.
//
// HARNESS: the REAL route on a bare Fastify at the same `/ai` prefix `app.ts`
// registers it under, with the REAL error handler so a rejected body is asserted
// as the status a client actually receives. Only `aiChat` and `isAIConfigured`
// are mocked — `resolveTierModel` is the real one, because its closed-union env
// lookup is part of what is being asserted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import aiChatRoutes from '../routes/ai-chat';

const { aiChatMock, isAIConfiguredMock } = vi.hoisted(() => ({
  aiChatMock: vi.fn(),
  isAIConfiguredMock: vi.fn(),
}));

vi.mock('../services/ai-provider.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ai-provider.service')>();
  return { ...actual, aiChat: aiChatMock, isAIConfigured: isAIConfiguredMock };
});

const ONE_TURN = [{ role: 'user', content: 'What is on my calendar today?' }];

async function buildApp(userId: string | null = 'user-1') {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(aiChatRoutes, { prefix: '/ai' });
  await app.ready();
  return app;
}

/** The options object the route handed the provider. */
function providerOptions(): Record<string, unknown> {
  expect(aiChatMock).toHaveBeenCalled();
  return aiChatMock.mock.calls[0]![1] as Record<string, unknown>;
}

/** The message list the route handed the provider. */
function providerMessages(): Array<{ role: string; content: string }> {
  expect(aiChatMock).toHaveBeenCalled();
  return aiChatMock.mock.calls[0]![0] as Array<{ role: string; content: string }>;
}

beforeEach(() => {
  aiChatMock.mockReset();
  aiChatMock.mockResolvedValue('an answer');
  isAIConfiguredMock.mockReset();
  isAIConfiguredMock.mockReturnValue(true);
});

afterEach(() => {
  delete process.env.AI_MODEL_FAST;
  delete process.env.AI_MODEL_BALANCED;
  delete process.env.AI_MODEL_DEEP;
});

describe('POST /ai/chat — a named tier', () => {
  it('hands the fast budget and timeout straight to the provider', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'fast' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ message: 'an answer', tier: 'fast', routed: false });
    // The numbers the settings page quotes back to the user. A budget may move;
    // it may not move without this pin moving with it.
    expect(providerOptions()).toMatchObject({ maxTokens: 320, timeoutMs: 15_000 });
  });

  it('gives deep the long budget and the long timeout', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'deep' },
    });

    expect(providerOptions()).toMatchObject({ maxTokens: 3_072, timeoutMs: 75_000 });
  });

  it('does not let auto re-route an explicit choice', async () => {
    // Eight turns and 5k characters of on-screen context is squarely `deep`
    // territory for the router. The user said fast, so fast is what runs.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: Array.from({ length: 8 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'x'.repeat(400),
        })),
        intent: 'fast',
        context: { screenText: 'y'.repeat(5_000) },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ tier: 'fast', routed: false });
    expect(providerOptions()).toMatchObject({ maxTokens: 320, timeoutMs: 15_000 });
  });
});

describe('POST /ai/chat — auto', () => {
  it('routes a short first question to fast and admits that it routed', async () => {
    // No `intent` field at all: either a client that predates it, or the
    // picker's own default.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ tier: 'fast', routed: true });
  });

  it('escalates to deep on the size of what actually arrived', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Summarise this thread.' }],
        intent: 'auto',
        context: { screenText: 'z'.repeat(5_000) },
      },
    });

    // A twenty-two character question, but 5k of context behind it — the
    // measurement is of the request, not of the prompt alone.
    expect(res.json().data).toMatchObject({ tier: 'deep', routed: true });
    expect(providerOptions()).toMatchObject({ maxTokens: 3_072, timeoutMs: 75_000 });
  });
});

describe('POST /ai/chat — the reasoning directive', () => {
  it('sends it as a second system message, ahead of the context block', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'fast', context: { route: '/inbox' } },
    });

    const messages = providerMessages();
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!).toMatchObject({ role: 'system' });
    expect(messages[1]!.content).toContain('three sentences');
    expect(messages[2]!.content).toContain('Route: /inbox');
    expect(messages[3]!).toMatchObject({ role: 'user' });
  });

  it('sends a different directive for a different tier', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'fast' },
    });
    const fast = providerMessages()[1]!.content;

    aiChatMock.mockClear();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'deep' },
    });

    // Same budget with the same instruction would make two of the four options
    // the same product behaviour under two different names.
    expect(providerMessages()[1]!.content).not.toBe(fast);
  });
});

describe('POST /ai/chat — the model', () => {
  it('sends no model when the deployment has not pinned one per tier', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'balanced' },
    });

    // The honest default, and the one the settings copy is written against: a
    // tier is a budget, not a different engine.
    expect(providerOptions().model).toBeUndefined();
  });

  it('passes AI_MODEL_DEEP through when the deployment does set it', async () => {
    process.env.AI_MODEL_DEEP = '@cf/meta/llama-3.3-70b-instruct';
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'deep' },
    });

    expect(providerOptions().model).toBe('@cf/meta/llama-3.3-70b-instruct');
  });

  it('ignores a model the caller tries to pin in the body', async () => {
    // The Cloudflare transport interpolates the model into a URL path, so a
    // body-controlled value here is a request-forgery sink. `chatSchema` declares
    // no `model` key and zod drops what it does not declare — this pins that,
    // because the failure mode is a 200 that quietly used the attacker's value.
    process.env.AI_MODEL_DEEP = 'safe/model';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'deep', model: 'https://attacker.example/v1' },
    });

    expect(res.statusCode).toBe(200);
    expect(providerOptions().model).toBe('safe/model');
  });
});

describe('POST /ai/chat — what it refuses', () => {
  it('400s an intent id the server does not know', async () => {
    // `auto-router` is the id the picker actually shipped with. A silent fall
    // back to some tier would let the two halves drift apart again with nothing
    // going red; a 400 makes the drift a build failure the first time it happens.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN, intent: 'auto-router' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(aiChatMock).not.toHaveBeenCalled();
  });

  it('503s with AI_UNAVAILABLE instead of calling an unconfigured provider', async () => {
    isAIConfiguredMock.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('AI_UNAVAILABLE');
    expect(aiChatMock).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated request before spending a token on it', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN },
    });

    expect(res.statusCode).toBe(401);
    expect(aiChatMock).not.toHaveBeenCalled();
  });

  it('turns a provider failure into 503 rather than a 500', async () => {
    aiChatMock.mockRejectedValue(new Error('upstream exploded'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('AI_UNAVAILABLE');
  });
});

describe('GET /ai/chat/health', () => {
  it('is 503 and offline when nothing is configured', async () => {
    isAIConfiguredMock.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ai/chat/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json().data.status).toBe('offline');
  });

  it('is 200 and ready when a provider is', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ai/chat/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('ready');
  });
});
