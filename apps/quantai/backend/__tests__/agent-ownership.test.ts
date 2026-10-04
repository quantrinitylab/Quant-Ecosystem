/**
 * P0-3 agentId ownership gates — security tests (NOT executed in staging).
 *
 * Merge-time convention: these run only AFTER the patches
 *   patches/quantai-training-agent-ownership.patch
 *   patches/quantai-voice-agent-ownership.patch
 * have been applied to app-foundations/quantai/extract/{training,voice}.ts,
 * with fastify + vitest available in the merged repo.
 *
 * Covers the three patched handlers:
 *   training.ts  POST /                       (ownership gate on zod agentId)
 *   training.ts  GET  /sessions/:agentId      (401 + ownership gate added)
 *   voice.ts     POST /command                (401 + ownership gate added; skipped when agentId absent)
 *
 * Case matrix per handler:
 *   1. unauthenticated request            -> 401 UNAUTHORIZED
 *   2. cross-user agentId, port denies    -> 403 AGENT_FORBIDDEN
 *   3. port allows                         -> service called, 200
 *   4. default (unwired) port             -> 503 OWNERSHIP_CHECK_UNAVAILABLE (fail closed)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Service-layer mocks. Only the surface used by the route files is faked;
// @quant/agentic is NOT in this workspace, so its real API is never invented.
// ---------------------------------------------------------------------------
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, status: number, code: string) => {
    const err = new Error(message) as Error & { statusCode: number; code: string };
    err.statusCode = status;
    err.code = code;
    return err;
  },
}));

const startTraining = vi.fn(async (agentId: string, _examples: unknown[]) => ({
  sessionId: `sess-${agentId}`,
}));
const getAgentSessions = vi.fn((_agentId: string) => [{ id: 'sess-1' }]);
const processVoiceCommand = vi.fn(async (_audio: Buffer, _agentId?: string) => ({
  ok: true,
}));

vi.mock('@quant/agentic', () => ({
  training: {
    startTraining: (agentId: string, examples: unknown[]) => startTraining(agentId, examples),
    getAgentSessions: (agentId: string) => getAgentSessions(agentId),
  },
  voiceInterface: {
    textToSpeech: vi.fn(),
    speechToText: vi.fn(),
    processVoiceCommand: (audio: Buffer, agentId?: string) => processVoiceCommand(audio, agentId),
  },
}));

// voice.ts also imports ../services/voiceover-tts.service (irrelevant to /command).
vi.mock(
  '../services/voiceover-tts.service',
  () => ({
    listAvailableVoices: vi.fn(() => []),
    synthesizeSpeech: vi.fn(),
    generateSsml: vi.fn(),
  }),
);

// Route plugins, imported as they will exist post-merge (patched files applied).
import trainingRoutes, {
  type AgentOwnershipPort as TrainingOwnershipPort,
} from '../routes/training';
import voiceRoutes, {
  type AgentOwnershipPort as VoiceOwnershipPort,
} from '../routes/voice';

// ---------------------------------------------------------------------------
// Harness: builds an app with the route plugin, a fake auth hook, and an
// optionally injected fake ownership port. Omitting the port exercises the
// fail-closed 503 default.
// ---------------------------------------------------------------------------
type FakeAuthUser = 'owner' | 'intruder' | null;

interface Harness {
  app: FastifyInstance;
  ownershipCalls: Array<{ agentId: string; userId: string }>;
}

async function buildApp(
  route: 'training' | 'voice',
  port: TrainingOwnershipPort | VoiceOwnershipPort | null,
  user: FakeAuthUser,
): Promise<Harness> {
  const app = Fastify();
  const ownershipCalls: Array<{ agentId: string; userId: string }> = [];

  if (port) {
    app.decorate('agentOwnership', port);
  }
  // Test-only auth hook: mirrors whatever sets request.auth in production.
  app.addHook('onRequest', async (req, _reply) => {
    if (user) {
      (req as unknown as { auth: { userId: string } }).auth = { userId: user };
    }
  });

  if (route === 'training') {
    await app.register(trainingRoutes);
  } else {
    await app.register(voiceRoutes);
  }
  await app.ready();
  return { app, ownershipCalls };
}

function allowPort(calls: Array<{ agentId: string; userId: string }>) {
  return {
    async assertAgentOwnership(agentId: string, userId: string) {
      calls.push({ agentId, userId });
      // resolve: owner match
    },
  };
}

function denyPort(calls: Array<{ agentId: string; userId: string }>) {
  return {
    async assertAgentOwnership(agentId: string, userId: string) {
      calls.push({ agentId, userId });
      throw Object.assign(new Error('Forbidden'), {
        statusCode: 403,
        code: 'AGENT_FORBIDDEN',
      });
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// training.ts POST /
// ---------------------------------------------------------------------------
describe('training POST / ownership gate', () => {
  const payload = {
    agentId: 'agent-other-user',
    examples: [{ input: 'hi', expectedOutput: 'hello' }],
  };

  it('unauthenticated -> 401', async () => {
    const { app } = await buildApp('training', allowPort([]), null);
    const res = await app.inject({ method: 'POST', url: '/', payload });
    expect(res.statusCode).toBe(401);
    expect(startTraining).not.toHaveBeenCalled();
  });

  it('cross-user agentId with denying port -> 403', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('training', denyPort(calls), 'intruder');
    const res = await app.inject({ method: 'POST', url: '/', payload });
    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([{ agentId: 'agent-other-user', userId: 'intruder' }]);
    expect(startTraining).not.toHaveBeenCalled();
  });

  it('allowing port -> service called, 200', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('training', allowPort(calls), 'owner');
    const res = await app.inject({ method: 'POST', url: '/', payload });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([{ agentId: 'agent-other-user', userId: 'owner' }]);
    expect(startTraining).toHaveBeenCalledTimes(1);
  });

  it('default (unwired) port -> 503 fail-closed, never hits service', async () => {
    const { app } = await buildApp('training', null, 'owner');
    const res = await app.inject({ method: 'POST', url: '/', payload });
    expect(res.statusCode).toBe(503);
    expect(startTraining).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// training.ts GET /sessions/:agentId
// ---------------------------------------------------------------------------
describe('training GET /sessions/:agentId ownership gate', () => {
  it('unauthenticated -> 401', async () => {
    const { app } = await buildApp('training', allowPort([]), null);
    const res = await app.inject({ method: 'GET', url: '/sessions/agent-x' });
    expect(res.statusCode).toBe(401);
    expect(getAgentSessions).not.toHaveBeenCalled();
  });

  it('cross-user agentId with denying port -> 403', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('training', denyPort(calls), 'intruder');
    const res = await app.inject({ method: 'GET', url: '/sessions/agent-x' });
    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([{ agentId: 'agent-x', userId: 'intruder' }]);
    expect(getAgentSessions).not.toHaveBeenCalled();
  });

  it('allowing port -> service called, 200', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('training', allowPort(calls), 'owner');
    const res = await app.inject({ method: 'GET', url: '/sessions/agent-x' });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([{ agentId: 'agent-x', userId: 'owner' }]);
    expect(getAgentSessions).toHaveBeenCalledWith('agent-x');
  });

  it('default (unwired) port -> 503 fail-closed', async () => {
    const { app } = await buildApp('training', null, 'owner');
    const res = await app.inject({ method: 'GET', url: '/sessions/agent-x' });
    expect(res.statusCode).toBe(503);
    expect(getAgentSessions).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// voice.ts POST /command
// ---------------------------------------------------------------------------
describe('voice POST /command ownership gate', () => {
  const audio = Buffer.from('pcm').toString('base64');

  it('unauthenticated -> 401', async () => {
    const { app } = await buildApp('voice', allowPort([]), null);
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { audio, agentId: 'agent-other-user' },
    });
    expect(res.statusCode).toBe(401);
    expect(processVoiceCommand).not.toHaveBeenCalled();
  });

  it('cross-user agentId with denying port -> 403', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('voice', denyPort(calls), 'intruder');
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { audio, agentId: 'agent-other-user' },
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([{ agentId: 'agent-other-user', userId: 'intruder' }]);
    expect(processVoiceCommand).not.toHaveBeenCalled();
  });

  it('allowing port -> service called, 200', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('voice', allowPort(calls), 'owner');
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { audio, agentId: 'agent-other-user' },
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([{ agentId: 'agent-other-user', userId: 'owner' }]);
    expect(processVoiceCommand).toHaveBeenCalledTimes(1);
  });

  it('default (unwired) port -> 503 fail-closed when agentId present', async () => {
    const { app } = await buildApp('voice', null, 'owner');
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { audio, agentId: 'agent-other-user' },
    });
    expect(res.statusCode).toBe(503);
    expect(processVoiceCommand).not.toHaveBeenCalled();
  });

  it('no agentId -> no ownership gate, service called, 200 (TODO(UNVERIFIED))', async () => {
    const calls: Array<{ agentId: string; userId: string }> = [];
    const { app } = await buildApp('voice', denyPort(calls), 'owner');
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { audio },
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([]);
    expect(processVoiceCommand).toHaveBeenCalledTimes(1);
  });
});
