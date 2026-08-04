import { describe, expect, it, vi } from 'vitest';
import { AIEngine } from '../services/ai-engine';

const ACCOUNT_ID = '9af698848a5edd00e756c3a2c908ec8d';
const MODEL = '@cf/meta/llama-3.2-1b-instruct';

function env(overrides: Record<string, string> = {}) {
  return {
    AI_PROVIDER: 'cloudflare',
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: 'test-token',
    CLOUDFLARE_AI_MODEL: MODEL,
    CLOUDFLARE_AI_BASE_URL: 'https://' + 'api.cloudflare.com/client/v4/accounts',
    ...overrides,
  };
}

describe('QuantAI Cloudflare Workers AI routing', () => {
  it('sends context to the direct Workers AI endpoint and parses the response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: { response: 'CLOUDFLARE_AI_OK' },
        }),
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
    expect(result.model).toBe(MODEL);
    expect(result.cached).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://' + `api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init?.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'assistant', content: 'Previous turn' },
      { role: 'user', content: 'Reply with the health marker.' },
    ]);
  });

  it('fails closed before network access when the API token is missing', async () => {
    const fetchImpl = vi.fn();
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
    ).rejects.toThrow('CLOUDFLARE_API_TOKEN');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves the streaming contract without falling back to another provider', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: { response: 'streamed' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
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
