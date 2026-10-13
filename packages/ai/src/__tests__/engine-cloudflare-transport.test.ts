import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The AI SDK is mocked so any accidental SDK call is visible — the
// Cloudflare tool-free path must not touch it (ai@5 rejects the v1 models
// that @ai-sdk/openai@1 builds, which is the production failure this guards).
vi.mock('ai', () => ({
  generateText: vi.fn(() => {
    throw new Error('generateText must not be called on the Cloudflare tool-free path');
  }),
  streamText: vi.fn(() => {
    throw new Error('streamText must not be called on the Cloudflare tool-free path');
  }),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'google' })),
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(),
  ConverseCommand: vi.fn(),
  ConverseStreamCommand: vi.fn(),
}));

import { generateText, streamText } from 'ai';
import { AIEngine } from '../core/engine';
import { MailAIService } from '../services/mail-ai';

/** Only Cloudflare is configured — the staging/production shape. */
function cloudflareOnlyEnv(): void {
  for (const key of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'META_API_KEY',
    'META_AI_API_KEY',
    'BEDROCK_ACCESS_KEY_ID',
    'BEDROCK_SECRET_ACCESS_KEY',
    'USE_BEDROCK_DEFAULT_CREDS',
    'AI_DEFAULT_MODEL',
    'CLOUDFLARE_API_KEY',
  ]) {
    vi.stubEnv(key, '');
  }
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-test-token');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct-test');
}

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('AIEngine — Cloudflare Workers AI direct transport', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cloudflareOnlyEnv();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('infer() answers through the OpenAI-compatible endpoint, not the AI SDK', async () => {
    fetchMock.mockResolvedValue(chatResponse('pong'));
    const engine = new AIEngine({ enableCaching: false });

    const response = await engine.infer({
      prompt: 'ping',
      systemPrompt: 'Answer with one word.',
      userId: 'user-1',
      app: 'quantmail',
      feature: 'email_summary',
      temperature: 0.1,
      maxTokens: 20,
      stateless: true,
    });

    expect(response.content).toBe('pong');
    expect(response.model.startsWith('@cf/')).toBe(true);
    expect(response.usage.promptTokens).toBe(12);
    expect(response.usage.completionTokens).toBe(3);
    expect(generateText).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-test/ai/v1/chat/completions',
    );
    expect(init.headers.Authorization).toBe('Bearer cf-test-token');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(response.model);
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(20);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Answer with one word.' });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: 'user', content: 'ping' });
  });

  it('stateless requests neither read nor write conversation memory', async () => {
    fetchMock
      .mockResolvedValueOnce(chatResponse('verdict A'))
      .mockResolvedValueOnce(chatResponse('verdict B'))
      .mockResolvedValueOnce(chatResponse('hello back'));
    const engine = new AIEngine({ enableCaching: false });
    const base = { userId: 'user-1', app: 'quantmail' as const, feature: 'phishing_detection' };

    await engine.infer({ ...base, prompt: 'scan email A', stateless: true });
    await engine.infer({ ...base, prompt: 'scan email B', stateless: true });
    await engine.infer({ ...base, feature: 'chat', prompt: 'hello' });

    const lastUserContent = (call: number) => {
      const messages = JSON.parse(fetchMock.mock.calls[call]![1].body).messages;
      return messages[messages.length - 1].content as string;
    };
    // The second scan sees only its own email — nothing from scan A.
    expect(lastUserContent(1)).toBe('scan email B');
    // A later conversational call has no scan history replayed into it.
    expect(lastUserContent(2)).not.toContain('scan email');
    expect(lastUserContent(2)).toContain('hello');
  });

  it('infer() propagates provider errors (fail closed — no fabricated answer)', async () => {
    fetchMock.mockResolvedValue(new Response('{"errors":[{"message":"bad token"}]}', { status: 401 }));
    const engine = new AIEngine({ enableCaching: false, retryAttempts: 0, retryDelayMs: 1 });

    await expect(
      engine.infer({ prompt: 'ping', userId: 'user-1', app: 'quantmail', feature: 'chat' }),
    ).rejects.toThrow(/HTTP 401/);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('stream() yields provider deltas and a final done chunk', async () => {
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"po"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ng"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const engine = new AIEngine({ enableCaching: false });

    const chunks = [];
    for await (const chunk of engine.stream({
      prompt: 'ping',
      userId: 'user-1',
      app: 'quantmail',
      feature: 'chat',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.filter((c) => !c.done).map((c) => c.content)).toEqual(['po', 'ng']);
    expect(chunks[chunks.length - 1]).toMatchObject({ done: true, finishReason: 'stop' });
    expect(streamText).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).stream).toBe(true);
  });

  it('MailAIService.detectPhishing reads the JSON verdict end to end', async () => {
    fetchMock.mockResolvedValue(
      chatResponse('{"verdict": "safe", "confidence": 0.9, "indicators": []}'),
    );
    const mail = new MailAIService(new AIEngine({ enableCaching: false }));

    const result = await mail.detectPhishing(
      'Lunch?',
      'Is this not a phishing email? It is just lunch.',
      'priya@quantmail.in',
      'user-1',
    );

    expect(result.isPhishing).toBe(false);
    expect(result.indicators).toEqual([]);
  });
});
