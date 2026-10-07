import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareWorkersAIClient,
  CloudflareWorkersAIError,
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
    QUANT_AI_FAIL_CLOSED: 'true',
    ...overrides,
  };
}

const request = {
  prompt: 'Reply with the health marker.',
  systemPrompt: 'Be concise.',
  context: [
    { role: 'assistant', content: 'Previous turn' },
    { role: 'user', content: 'Reply with the health marker.' },
  ],
  userId: 'user-1',
  app: 'quantai',
  feature: 'chat',
};

describe('CloudflareWorkersAIClient', () => {
  it('constructs without credentials until Cloudflare is selected and invoked', () => {
    const client = new CloudflareWorkersAIClient({ env: {} });
    expect(client.isSelected()).toBe(false);
    expect(client.isAvailable()).toBe(false);
  });

  it('fails closed before network access when the API token is absent', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => new Response());
    const client = new CloudflareWorkersAIClient({
      env: env({ CLOUDFLARE_API_TOKEN: '' }),
      fetchImpl,
    });

    await expect(client.infer(request)).rejects.toMatchObject({
      code: 'CLOUDFLARE_WORKERS_AI_UNAVAILABLE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires the explicit fail-closed invariant in production', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => new Response());
    const client = new CloudflareWorkersAIClient({
      env: env({ NODE_ENV: 'production', QUANT_AI_FAIL_CLOSED: 'false' }),
      fetchImpl,
    });

    await expect(client.infer(request)).rejects.toMatchObject({
      code: 'CLOUDFLARE_WORKERS_AI_UNAVAILABLE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-Cloudflare base URLs before sending the bearer token', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => new Response());
    const client = new CloudflareWorkersAIClient({
      env: env({ CLOUDFLARE_AI_BASE_URL: 'https://example.invalid/client/v4/accounts' }),
      fetchImpl,
    });

    await expect(client.infer(request)).rejects.toBeInstanceOf(CloudflareWorkersAIError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends context once to the official endpoint and parses usage', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            response: 'CLOUDFLARE_AI_OK',
            usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new CloudflareWorkersAIClient({ env: env(), fetchImpl });

    const result = await client.infer(request);
    expect(result.content).toBe('CLOUDFLARE_AI_OK');
    expect(result.model).toBe(DEFAULT_CLOUDFLARE_AI_MODEL);
    expect(result.usage).toMatchObject({
      promptTokens: 12,
      completionTokens: 4,
      totalTokens: 16,
      estimatedCost: 0,
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      `${DEFAULT_CLOUDFLARE_AI_BASE_URL}/${ACCOUNT_ID}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`,
    );
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-token-not-a-secret',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init?.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'assistant', content: 'Previous turn' },
      { role: 'user', content: 'Reply with the health marker.' },
    ]);
  });

  it('parses Workers AI SSE deltas and completes the stream contract', async () => {
    const sse =
      'data: {"response":"Cloud"}\n' +
      'data: {"response":"flare"}\n' +
      'data: [DONE]\n';
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
    const client = new CloudflareWorkersAIClient({ env: env(), fetchImpl });

    const chunks = [];
    for await (const chunk of client.stream({ ...request, stream: true })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      expect.objectContaining({ content: 'Cloud', done: false }),
      expect.objectContaining({ content: 'flare', done: false }),
      expect.objectContaining({ content: '', done: true, finishReason: 'stop' }),
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string).stream).toBe(true);
  });

  it('redacts the API token from upstream error details', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: 'model unavailable: test-token-not-a-secret' }],
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new CloudflareWorkersAIClient({ env: env(), fetchImpl });

    const error = await client.infer(request).catch((value) => value);
    expect(error).toBeInstanceOf(CloudflareWorkersAIError);
    expect(error.message).toContain('503');
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('test-token-not-a-secret');
  });

  it('redacts the API token from network failure details', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => {
      throw new Error('network failed with test-token-not-a-secret');
    });
    const client = new CloudflareWorkersAIClient({ env: env(), fetchImpl });

    const error = await client.infer(request).catch((value) => value);
    expect(error).toBeInstanceOf(CloudflareWorkersAIError);
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('test-token-not-a-secret');
  });
});
