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

async function buildApp(
  userId: string | null = 'user-1',
  extraDecorators: Record<string, any> = {},
) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  for (const [key, val] of Object.entries(extraDecorators)) {
    app.decorate(key, val);
  }
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
    // Mailbox grounding (bug 4) rides as its own system message after the
    // screen context and ahead of the conversation turns.
    expect(messages[3]!).toMatchObject({ role: 'system' });
    expect(messages[3]!.content).toContain('Mailbox data unavailable');
    expect(messages[4]!).toMatchObject({ role: 'user' });
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

describe('POST /ai/chat — autonomous tool calling', () => {
  beforeEach(() => {
    process.env.ENABLE_AUTONOMOUS_TOOLS = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_AUTONOMOUS_TOOLS;
  });

  it('skips tool execution when tools is not explicitly enabled (fail-closed default)', async () => {
    const prismaMock = {
      repository: {
        create: vi.fn(),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "rogue-repo" }\n}\n```\n\nI suggested creating a repo.',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Suggest a repo' }] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions).toHaveLength(0);
    expect(prismaMock.repository.create).not.toHaveBeenCalled();
    // QM-UIUX-077: the block was proposed but NOT executed, and the reply
    // must say so — silently returning the model's prose would let a claim
    // like "Repository … created in database!" stand as fact.
    expect(body.data.message).toContain('NOT executed');
    expect(body.data.message).toContain('I suggested creating a repo.');
  });

  it('skips tool execution when tools.enabled is false even if ENABLE_AUTONOMOUS_TOOLS is true (kill switch)', async () => {
    const prismaMock = {
      repository: {
        create: vi.fn(),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "rogue-repo" }\n}\n```\n\nI suggested creating a repo.',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Suggest a repo' }],
        tools: { enabled: false },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions).toHaveLength(0);
    expect(prismaMock.repository.create).not.toHaveBeenCalled();
    // QM-UIUX-077: the block was proposed but NOT executed, and the reply
    // must say so — silently returning the model's prose would let a claim
    // like "Repository … created in database!" stand as fact.
    expect(body.data.message).toContain('NOT executed');
    expect(body.data.message).toContain('I suggested creating a repo.');
  });

  it('skips tool execution when ENABLE_AUTONOMOUS_TOOLS is not true even if tools.enabled is true', async () => {
    delete process.env.ENABLE_AUTONOMOUS_TOOLS;

    const prismaMock = {
      repository: {
        create: vi.fn(),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "rogue-repo" }\n}\n```\n\nI suggested creating a repo.',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Suggest a repo' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions).toHaveLength(0);
    expect(prismaMock.repository.create).not.toHaveBeenCalled();
    // QM-UIUX-077: the block was proposed but NOT executed, and the reply
    // must say so — silently returning the model's prose would let a claim
    // like "Repository … created in database!" stand as fact.
    expect(body.data.message).toContain('NOT executed');
    expect(body.data.message).toContain('I suggested creating a repo.');
  });

  it('detects and executes a create_repository tool call when tools are enabled', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'repo-101',
          name: 'autonomous-swarm-engine',
          description: 'Created by Quanty',
          visibility: 'PRIVATE',
          defaultBranch: 'main',
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'astra-ceo',
          displayName: 'Astra CEO',
          email: 'astra@quantmail.in',
        }),
      },
    };

    aiChatMock.mockResolvedValue(
      'I will create the repository for you now.\n\n```tool_call\n{\n  "name": "create_repository",\n  "arguments": {\n    "name": "autonomous-swarm-engine",\n    "description": "Created by Quanty"\n  }\n}\n```\n\nRepository has been created successfully!',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Create autonomous-swarm-engine repo' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Repository has been created successfully!');
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'create_repository',
      status: 'succeeded',
      result: {
        id: 'repo-101',
        name: 'autonomous-swarm-engine',
        visibility: 'private',
      },
    });
    expect(prismaMock.repository.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'user-1',
        name: 'autonomous-swarm-engine',
        description: 'Created by Quanty',
        visibility: 'PRIVATE',
        defaultBranch: 'main',
      },
    });
  });

  it('QM-UIUX-077: a create_repository claim from the tools-less QuantGit copilot is disclosed as NOT executed', async () => {
    // The exact audit reproduction: the QuantGit copilot client never sends
    // `tools`, so nothing can execute — but the model, prompted as if it had
    // tools, announced the write as done. The reply must lead with the truth.
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "audit-test-repo" }\n}\n```\n\nRepository kundan/audit-test-repo created in database!',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      // No `tools` field — byte-for-byte the shape src/app/quantgit/page.tsx sends.
      payload: { messages: [{ role: 'user', content: 'Create a repo called audit-test-repo' }] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions).toHaveLength(0);
    expect(prismaMock.repository.create).not.toHaveBeenCalled();
    // The disclosure comes FIRST, before the model's unexecuted claim.
    expect(body.data.message).toContain('NOT executed');
    expect(body.data.message.indexOf('NOT executed')).toBeLessThan(
      body.data.message.indexOf('created in database'),
    );
  });

  it('QM-UIUX-077: without tooling the model is told it cannot perform actions; with tooling it is told how', async () => {
    const app = await buildApp('user-1', { prisma: { repository: { create: vi.fn() } } });

    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Create a repo' }] },
    });
    const noToolsPrompt = providerMessages()[0]!.content;
    expect(noToolsPrompt).toContain('CANNOT create, modify, or delete anything');
    expect(noToolsPrompt).not.toContain('MUST execute the appropriate tool');

    aiChatMock.mockClear();
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Create a repo' }],
        tools: { enabled: true },
      },
    });
    const toolsPrompt = providerMessages()[0]!.content;
    expect(toolsPrompt).toContain('MUST execute the appropriate tool');
  });

  it('QM-UIUX-077: tool calls beyond maxSteps are disclosed as NOT executed', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: `repo-${data.name}`,
          name: data.name,
          description: data.description,
          visibility: 'PRIVATE',
          defaultBranch: 'main',
        })),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'kundan',
          displayName: 'Kundan Singh',
          email: 'kundan@quantmail.in',
        }),
      },
    };

    aiChatMock.mockResolvedValue(
      'Creating both repositories now.\n\n```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "first-repo" }\n}\n```\n\n```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "second-repo" }\n}\n```\n\nBoth repositories have been created successfully!',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Create first-repo and second-repo' }],
        tools: { enabled: true, maxSteps: 1 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'create_repository',
      status: 'succeeded',
    });
    expect(prismaMock.repository.create).toHaveBeenCalledTimes(1);
    expect(body.data.message).toContain('1 proposed action(s) were NOT executed');
  });

  it('holds deploy_agent tool call as failed and prepends action notice to prose', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({ id: 'repo-101', name: 'demo', ownerId: 'user-1' }),
      },
    };

    aiChatMock.mockResolvedValue(
      'Deploying agent now.\n\n```tool_call\n{\n  "name": "deploy_agent",\n  "arguments": {\n    "repoId": "demo",\n    "agentName": "Forge",\n    "role": "Autonomous Coder",\n    "workstationIndex": 2\n  }\n}\n```\n\nAgent deployed to Desk #2.',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Deploy Forge to desk 2' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'deploy_agent',
      status: 'failed',
      error: {
        code: 'HELD_PENDING_PERSISTENCE',
      },
    });
    // V15: Prose reflects the failure rather than lying about success
    expect(body.data.message).toContain(
      '[Action Notice: deploy_agent: deploy_agent is held pending durable AgentSession persistence and runtime task handoff]',
    );
    expect(body.data.message).toContain('Agent deployed to Desk #2.');
  });

  it('detects and executes a commit_file tool call via strict CAS repositoryMutation port', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({ id: 'repo-101', name: 'demo', ownerId: 'user-1' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'astra-ceo',
          displayName: 'Astra CEO',
          email: 'astra@quantmail.in',
        }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'branch-1',
          repoId: 'repo-101',
          name: 'main',
          commitSha: '1111222233334444555566667777888899990000',
          isProtected: false,
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const repositoryMutationMock = {
      getBranchHead: vi.fn().mockResolvedValue('1111222233334444555566667777888899990000'),
      commitFile: vi.fn().mockResolvedValue({
        commitSha: '2222333344445555666677778888999900001111',
        blobSha: '3333444455556666777788889999000011112222',
        path: 'src/index.ts',
        branch: 'main',
      }),
    };

    aiChatMock.mockResolvedValue(
      'Committing changes.\n\n```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "console.log(42);",\n    "message": "feat: hello world",\n    "branch": "main",\n    "parentSha": "1111222233334444555566667777888899990000"\n  }\n}\n```\n\nCommitted file to repo.',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit index.ts' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'succeeded',
      result: {
        commitSha: '2222333344445555666677778888999900001111',
        path: 'src/index.ts',
        branch: 'main',
      },
    });
    expect(repositoryMutationMock.commitFile).toHaveBeenCalledWith({
      owner: 'user-1',
      name: 'demo',
      branch: 'main',
      path: 'src/index.ts',
      content: 'console.log(42);',
      message: 'feat: hello world',
      expectedHeadSha: '1111222233334444555566667777888899990000',
      author: expect.any(Object),
    });
  });

  it('fails commit_file when parentSha is missing (no force-write, strict CAS)', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({ id: 'repo-101', name: 'demo', ownerId: 'user-1' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', username: 'astra' }),
      },
    };
    const repositoryMutationMock = {
      commitFile: vi.fn(),
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "console.log(42);",\n    "message": "feat: force-write"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Force commit' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        message:
          'parentSha is required: provide 40-char SHA of current branch head or null for root commit',
      },
    });
    expect(repositoryMutationMock.commitFile).not.toHaveBeenCalled();
  });

  it('fails commit_file with STORAGE_UNAVAILABLE if repositoryMutation port is absent', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({ id: 'repo-101', name: 'demo', ownerId: 'user-1' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'astra-ceo',
        }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'branch-1',
          repoId: 'repo-101',
          name: 'main',
          commitSha: '1111222233334444555566667777888899990000',
          isProtected: false,
        }),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "console.log(42);",\n    "message": "feat: test",\n    "parentSha": "1111222233334444555566667777888899990000"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit index.ts' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        code: 'STORAGE_UNAVAILABLE',
      },
    });
  });

  it('enforces tenant scoping: rejects commit_file to another user repository', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "other-tenant-repo",\n    "path": "secret.txt",\n    "content": "payload",\n    "message": "malicious write",\n    "parentSha": "1111222233334444555566667777888899990000"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit to other repo' }],
        tools: { enabled: true },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        message: 'Repository "other-tenant-repo" not found',
      },
    });
    expect(prismaMock.repository.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'other-tenant-repo' }, { name: 'other-tenant-repo' }],
        ownerId: 'user-1',
        deletedAt: null,
      },
    });
  });

  it('normalizes commit_file CAS SHAs to lowercase', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'repo-101',
          name: 'demo',
          ownerId: 'user-1',
          defaultBranch: 'main',
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'astra-ceo',
          displayName: 'Astra CEO',
          email: 'astra@quantmail.in',
        }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'branch-1',
          repoId: 'repo-101',
          name: 'main',
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          isProtected: false,
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const repositoryMutationMock = {
      getBranchHead: vi.fn().mockResolvedValue('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      commitFile: vi.fn().mockResolvedValue({
        commitSha: '2222333344445555666677778888999900001111',
        blobSha: '3333444455556666777788889999000011112222',
        path: 'src/index.ts',
        branch: 'main',
      }),
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "console.log(42);",\n    "message": "fix: normalize CAS",\n    "branch": "main",\n    "parentSha": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit index.ts' }],
        tools: { enabled: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'succeeded',
    });
    expect(repositoryMutationMock.commitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );
  });

  it('rejects commit_file on a protected branch before reading or mutating Git', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'repo-101',
          name: 'demo',
          ownerId: 'user-1',
          defaultBranch: 'main',
        }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'branch-1',
          repoId: 'repo-101',
          name: 'main',
          commitSha: '1111222233334444555566667777888899990000',
          isProtected: true,
        }),
        upsert: vi.fn(),
      },
    };

    const repositoryMutationMock = {
      getBranchHead: vi.fn(),
      commitFile: vi.fn(),
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "console.log(42);",\n    "message": "feat: protected write",\n    "branch": "main",\n    "parentSha": "1111222233334444555566667777888899990000"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit to protected main' }],
        tools: { enabled: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        code: 'BRANCH_PROTECTED',
        message: 'Cannot commit to protected branch',
      },
    });
    expect(repositoryMutationMock.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutationMock.commitFile).not.toHaveBeenCalled();
    expect(prismaMock.branch.upsert).not.toHaveBeenCalled();
  });

  it('rejects commit_file with a malformed parent SHA', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn(),
      },
    };
    const repositoryMutationMock = {
      getBranchHead: vi.fn(),
      commitFile: vi.fn(),
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": {\n    "repoId": "demo",\n    "path": "src/index.ts",\n    "content": "content",\n    "message": "bad CAS",\n    "branch": "main",\n    "parentSha": "948e3612"\n  }\n}\n```',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit with short SHA' }],
        tools: { enabled: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        code: 'INVALID_PARENT_SHA',
      },
    });
    expect(prismaMock.repository.findFirst).not.toHaveBeenCalled();
    expect(repositoryMutationMock.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutationMock.commitFile).not.toHaveBeenCalled();
  });

  it('rejects disallowed tools with TOOL_NOT_ALLOWED when tools.allow is specified (V27)', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn(),
      },
    };
    const repositoryMutationMock = {
      commitFile: vi.fn(),
    };

    aiChatMock.mockResolvedValue(
      '```tool_call\n{\n  "name": "commit_file",\n  "arguments": { "repoId": "demo", "path": "test.ts", "content": "1", "message": "msg", "parentSha": "1111222233334444555566667777888899990000" }\n}\n```',
    );

    const app = await buildApp('user-1', {
      prisma: prismaMock,
      repositoryMutation: repositoryMutationMock,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Commit file' }],
        tools: { enabled: true, allow: ['create_repository'] }, // commit_file is NOT in allowlist
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'commit_file',
      status: 'failed',
      error: {
        code: 'TOOL_NOT_ALLOWED',
        message: "Tool 'commit_file' is not in the allowed tools list",
      },
    });
    expect(repositoryMutationMock.commitFile).not.toHaveBeenCalled();
  });

  it('stops tool execution when maxSteps is reached (V27)', async () => {
    const prismaMock = {
      repository: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'repo-1', name: 'repo-1', ownerId: 'user-1' })
          .mockResolvedValueOnce({ id: 'repo-2', name: 'repo-2', ownerId: 'user-1' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', username: 'kundan' }),
      },
    };

    // Model emits 3 tool calls, but maxSteps is set to 1
    aiChatMock.mockResolvedValue(
      [
        '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "repo-1" }\n}\n```',
        '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "repo-2" }\n}\n```',
        '```tool_call\n{\n  "name": "create_repository",\n  "arguments": { "name": "repo-3" }\n}\n```',
      ].join('\n\n'),
    );

    const app = await buildApp('user-1', { prisma: prismaMock });
    const response = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Create 3 repos' }],
        tools: { enabled: true, maxSteps: 1 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Exactly 1 tool execution, stopping at maxSteps
    expect(body.data.toolExecutions).toHaveLength(1);
    expect(body.data.toolExecutions[0]).toMatchObject({
      toolName: 'create_repository',
      status: 'succeeded',
      result: { id: 'repo-1' },
    });
    expect(prismaMock.repository.create).toHaveBeenCalledTimes(1);
  });
});

describe('POST /ai/chat — mailbox grounding (bug 4)', () => {
  // Bug 4 (2026-10-04): "Summarize my inbox" claimed "5 unread emails and 17
  // total messages" for a mailbox with 1 conversation and 0 unread. The route
  // used to send the model NO mailbox data, so the numbers were hallucinated.
  // These tests pin the opposite: real counts from the store reach the model,
  // with a strict use-only-what-is-provided rule — and when the store cannot
  // be read, the model is told to admit it rather than invent numbers.

  /** The system message the route hands the provider as the grounding block. */
  function groundingMessage(): string {
    const messages = providerMessages();
    const block = messages.find(
      (m) => m.role === 'system' && /MAILBOX SNAPSHOT|Mailbox data unavailable/.test(m.content),
    );
    expect(block).toBeDefined();
    return block!.content;
  }

  function mailboxPrismaMock() {
    return {
      email: {
        count: vi.fn(async ({ where }: any) => (where?.isRead === false ? 0 : 1)),
        findMany: vi.fn(async () => [
          {
            fromName: 'Aarav Mehta',
            fromAddress: 'aarav@example.com',
            subject: 'Q3 planning notes',
            isRead: true,
            receivedAt: new Date('2026-10-03T09:00:00Z'),
          },
        ]),
      },
    };
  }

  it('injects the real counts and recent messages as a system message', async () => {
    const app = await buildApp('user-1', { prisma: mailboxPrismaMock() });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Summarize my inbox' }] },
    });

    expect(res.statusCode).toBe(200);
    const grounding = groundingMessage();
    // The real store says 1 total, 0 unread — those exact numbers must reach
    // the model, not the "5 unread / 17 total" it used to invent.
    expect(grounding).toContain('1 total message(s), 0 unread');
    expect(grounding).toContain('Aarav Mehta <aarav@example.com>');
    expect(grounding).toContain('Q3 planning notes');
    expect(grounding).not.toContain('17');
  });

  it('queries the same inbox rows the list endpoint reads, scoped to the caller', async () => {
    const prismaMock = mailboxPrismaMock();
    const app = await buildApp('user-1', { prisma: prismaMock });
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: ONE_TURN },
    });

    // Every count and the listing must be tenant-scoped to the chat user and
    // exclude deleted/draft/spam/trash — the "my inbox" contract.
    for (const call of prismaMock.email.count.mock.calls) {
      expect(call[0].where).toMatchObject({
        userId: 'user-1',
        deletedAt: null,
        isDraft: false,
        isSpam: false,
        isTrash: false,
      });
    }
    expect(prismaMock.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: expect.any(Number) }),
    );
  });

  it('instructs the model to use only the snapshot and never invent numbers', async () => {
    const app = await buildApp('user-1', { prisma: mailboxPrismaMock() });
    await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'How many unread emails do I have?' }] },
    });

    const grounding = groundingMessage();
    expect(grounding).toContain('quote its numbers exactly');
    expect(grounding).toContain('Never invent counts');
  });

  it('admits the mailbox is unavailable when there is no message store', async () => {
    // The default harness decorates no prisma: the route must still answer,
    // with the honest state rather than a fabricated one.
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Summarize my inbox' }] },
    });

    expect(res.statusCode).toBe(200);
    const grounding = groundingMessage();
    expect(grounding).toContain('could not load their mailbox data');
    expect(grounding).toContain('NEVER invent counts');
  });

  it('admits the mailbox is unavailable when the store read fails', async () => {
    const failingPrisma = {
      email: {
        count: vi.fn(async () => {
          throw new Error('connection lost');
        }),
        findMany: vi.fn(async () => {
          throw new Error('connection lost');
        }),
      },
    };
    const app = await buildApp('user-1', { prisma: failingPrisma });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Summarize my inbox' }] },
    });

    // A DB failure must not fail the chat turn and must not reach the model
    // as invented data — the honest block goes instead.
    expect(res.statusCode).toBe(200);
    const grounding = groundingMessage();
    expect(grounding).toContain('Mailbox data unavailable');
  });
});

describe('POST /ai/chat — grounding scope (PAUD-P0-7 / QM-UIUX-080)', () => {
  // Personal deep audit 2026-10-09: asking "what is 2+2" returned the identical
  // canned "I don't have that information." on BOTH Fast and Deep tiers. Root
  // cause: the mailbox grounding block's refusal rule was written without any
  // scope, so the model read "say you do not have that information" as a
  // universal refusal — every non-mailbox question "was not in the snapshot" and
  // got refused, regardless of tier. The model boundary is mocked (the model
  // itself cannot run in this harness); the pin is on the prompt we hand it:
  // the block must scope the snapshot rules to mailbox questions and explicitly
  // permit general answers, on every tier.

  /** A live-looking mailbox so the route renders the real snapshot block. */
  function mailboxPrismaMock() {
    return {
      email: {
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [
          {
            fromName: 'Aarav Mehta',
            fromAddress: 'aarav@example.com',
            subject: 'Q3 planning notes',
            isRead: true,
            receivedAt: new Date('2026-10-03T09:00:00Z'),
          },
        ]),
      },
    };
  }

  function twoPlusTwoGrounding(): string {
    const messages = providerMessages();
    const block = messages.find(
      (m) => m.role === 'system' && /LIVE MAILBOX SNAPSHOT/.test(m.content),
    );
    expect(block).toBeDefined();
    return block!.content;
  }

  async function askTwoPlusTwo(intent?: string) {
    const app = await buildApp('user-1', { prisma: mailboxPrismaMock() });
    const res = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'what is 2+2' }],
        ...(intent ? { intent } : {}),
      },
    });
    return res;
  }

  it('fast tier: a general question is not steered to the canned refusal', async () => {
    const res = await askTwoPlusTwo('fast');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ tier: 'fast' });
    const grounding = twoPlusTwoGrounding();
    // The old unconditional refusal ("If they ask about something not in the
    // snapshot, say you do not have that information") must be gone, and the
    // replacement must explicitly permit non-mailbox answers.
    expect(grounding).not.toContain('If they ask about something not in the snapshot');
    expect(grounding).toContain('answer normally from your own knowledge');
    expect(grounding).toContain('RULES — SCOPE');
  });

  it('deep tier: the same general question gets the same scoped grounding', async () => {
    const res = await askTwoPlusTwo('deep');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ tier: 'deep' });
    const grounding = twoPlusTwoGrounding();
    expect(grounding).not.toContain('If they ask about something not in the snapshot');
    expect(grounding).toContain('answer normally from your own knowledge');
  });

  it('still refuses to invent mailbox data (the anti-hallucination guard survives)', async () => {
    // Scoping the refusal is a loosening; this pins what must not loosen. The
    // guard for real mailbox questions — quote the snapshot exactly, never
    // invent — stays in the block verbatim.
    await askTwoPlusTwo('balanced');

    const grounding = twoPlusTwoGrounding();
    expect(grounding).toContain('answer ONLY from this snapshot and quote its numbers exactly');
    expect(grounding).toContain('Never invent counts');
  });
});
