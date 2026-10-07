import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK to prevent actual API calls
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

// Mock server-core to provide a minimal Fastify app
vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

import Fastify, { type FastifyRequest } from 'fastify';
import askRoutes from '../routes/ask';

describe('POST /api/ask', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Ensure mock mode (no API keys)
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');

    app = Fastify();

    // Add a decorator to simulate auth
    app.decorateRequest('auth', null);
    app.addHook('preHandler', async (request: FastifyRequest) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'test-user-123' };
    });

    await app.register(askRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await app.close();
  });

  it('returns 200 with valid question', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: 'What is TypeScript?' },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as {
      success: boolean;
      data: { answer: string; model: string; usage: Record<string, number> };
    };
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.answer).toBe('string');
    expect(body.data.answer.length).toBeGreaterThan(0);
    expect(typeof body.data.model).toBe('string');
    expect(body.data.usage).toBeDefined();
    expect(typeof body.data.usage.promptTokens).toBe('number');
    expect(typeof body.data.usage.completionTokens).toBe('number');
    expect(typeof body.data.usage.totalTokens).toBe('number');
  });

  it('returns validation error with empty body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: {},
    });

    // Should return an error (400 or 500 depending on error handler)
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('returns validation error with empty question', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('accepts optional model and systemPrompt parameters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: {
        question: 'Explain React hooks',
        model: 'gpt-4o',
        systemPrompt: 'You are a helpful coding assistant',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as {
      success: boolean;
      data: { answer: string; model: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.answer.length).toBeGreaterThan(0);
  });
});
