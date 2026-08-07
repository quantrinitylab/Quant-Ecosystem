import { describe, expect, it, vi } from 'vitest';
import { AIEngine } from '../services/ai-engine';
import {
  DEFAULT_CLOUDFLARE_AI_BASE_URL,
  DEFAULT_CLOUDFLARE_AI_MODEL,
  type CloudflareAIEnv,
} from '../services/cloudflare-workers-ai';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';

function env(overrides: CloudflareAIEnv = {}): CloudflareAIEnv {
  return {
    AI_PROVIDER: 'cloudflare',
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: 'test-token-not-a-secret',
    CLOUDFLARE_AI_MODEL: DEFAULT_CLOUDFLARE_AI_MODEL,
    CLOUDFLARE_AI_BASE_URL: DEFAULT_CLOUDFLARE_AI_BASE_URL,
    ...overrides,
  };
}

describe('QuantAI Cloudflare Workers AI routing', () => {
  it('routes inference through Workers AI and exposes only the configured model', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ success: true, result: { response: 'CLOUDFLARE_AI_OK' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const engine = new AIEngine({ env: env(), fetchImpl });

    const result = await engine.infer({
      prompt: 'Reply with the health marker.',
      systemPrompt: 'Be concise.',
      context: [{ role: 'assistant', content: 'Previous turn' }],
      userId: 'user-1',
      app: 'quantai',
      feature: 'chat',
    });

    expect(result.content).toBe('CLOUDFLARE_AI_OK');
    expect(result.model).toBe(DEFAULT_CLOUDFLARE_AI_MODEL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(engine.getAvailableModels()).resolves.toEqual([
      expect.objectContaining({
        id: DEFAULT_CLOUDFLARE_AI_MODEL,
        provider: 'cloudflare',
      }),
    ]);
  });

  it('does not silently fall back when Cloudflare is selected but unconfigured', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => new Response());
    const engine = new AIEngine({
      env: env({ CLOUDFLARE_API_TOKEN: '' }),
      fetchImpl,
    });

    await expect(
      engine.infer({
        prompt: 'hello',
        userId: 'user-1',
        app: 'quantai',
        feature: 'chat',
      }),
    ).rejects.toMatchObject({ code: 'CLOUDFLARE_WORKERS_AI_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves the streaming interface through the same selected provider', async () => {
    const sse = 'data: {"response":"streamed"}\ndata: [DONE]\n';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const engine = new AIEngine({ env: env(), fetchImpl });
    const chunks = [];

    for await (const chunk of engine.stream({
      prompt: 'hello',
      userId: 'user-1',
      app: 'quantai',
      feature: 'chat-stream',
      stream: true,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      expect.objectContaining({ content: 'streamed', done: false }),
      expect.objectContaining({ content: '', done: true, finishReason: 'stop' }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
