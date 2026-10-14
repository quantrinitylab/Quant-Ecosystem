// ============================================================================
// CODEX-REVIEW gates (PR #1119) — gates 1, 2, 3
//
// Gate 1: two-user semantic-cache isolation (caching ENABLED — the default).
// Gate 2: exact deployed-env Cloudflare URL/model contract tests.
// Gate 3: fail-closed unknown model (no silent substitution).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'google' })),
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(),
  ConverseCommand: vi.fn(),
  ConverseStreamCommand: vi.fn(),
}));

import { generateText } from 'ai';
import { AIEngine } from '../core/engine';
import { ModelRouter } from '../core/model-router';
import { SemanticCache } from '../core/semantic-cache';
import { UnknownModelError } from '../core/errors';

const PROD_PIN = '@cf/meta/llama-3.2-1b-instruct';
const STAGING_PIN = '@cf/meta/llama-3.1-8b-instruct';
const DEPRECATED = '@cf/meta/llama-3.1-70b-instruct';

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    prompt: 'summarize my inbox',
    userId: 'alice',
    app: 'quantmail' as const,
    feature: 'triage' as const,
    ...overrides,
  };
}

describe('CODEX gate 1 — semantic-cache user isolation (caching enabled)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'k-test');
    vi.mocked(generateText).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('never serves one user\u2019s cached result to another user', async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: 'answer for alice', usage: {} } as never)
      .mockResolvedValue({ text: 'answer for bob', usage: {} } as never);

    // Caching explicitly ENABLED (the default): the isolation gate must hold
    // with the cache on, not just when it is disabled.
    const engine = new AIEngine({ enableCaching: true, cacheTtlMs: 60000 });

    const r1 = await engine.infer(baseRequest({ userId: 'alice' }));
    expect(r1.cached).toBe(false);
    expect(r1.content).toBe('answer for alice');

    // Same prompt, different user: must NOT hit alice's cache entry.
    const r2 = await engine.infer(baseRequest({ userId: 'bob' }));
    expect(r2.cached).toBe(false);
    expect(r2.content).toBe('answer for bob');
    expect(generateText).toHaveBeenCalledTimes(2);

    // Same user again: cache DOES hit (isolation is per-scope, not disabled).
    const r3 = await engine.infer(baseRequest({ userId: 'alice' }));
    expect(r3.cached).toBe(true);
    expect(r3.content).toBe('answer for alice');
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('isolates by app/feature/model scope, not just user', () => {
    const cache = new SemanticCache(60000);
    const scopeA = { userId: 'alice', app: 'quantmail', feature: 'triage', model: 'm1' };
    cache.set('hello world', 'resp-a', undefined, scopeA);

    // Different user → miss.
    expect(cache.get('hello world', undefined, { ...scopeA, userId: 'bob' })).toBeNull();
    // Different feature → miss.
    expect(cache.get('hello world', undefined, { ...scopeA, feature: 'chat' })).toBeNull();
    // Different model → miss.
    expect(cache.get('hello world', undefined, { ...scopeA, model: 'm2' })).toBeNull();
    // Unscoped lookup never matches a scoped entry.
    expect(cache.get('hello world')).toBeNull();
    // Identical scope → hit.
    expect(cache.get('hello world', undefined, scopeA)).toBe('resp-a');
  });
});

describe('CODEX gate 2 — deployed-environment contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('registers the production pin @cf/meta/llama-3.2-1b-instruct', () => {
    const router = new ModelRouter();
    const model = router.getModel(PROD_PIN);
    expect(model).toBeDefined();
    expect(model!.provider).toBe('cloudflare');
  });

  it('registers the staging pin @cf/meta/llama-3.1-8b-instruct', () => {
    const router = new ModelRouter();
    expect(router.getModel(STAGING_PIN)).toBeDefined();
  });

  it('does NOT register the deprecated @cf/meta/llama-3.1-70b-instruct', () => {
    const router = new ModelRouter();
    expect(router.getModel(DEPRECATED)).toBeUndefined();
  });

  it('staging AI_PROVIDER=custom honors AI_BASE_URL + AI_MODEL exactly', () => {
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'https://quantmail-ai.quantrinity.workers.dev/v1');
    vi.stubEnv('AI_MODEL', STAGING_PIN);

    const engine = new AIEngine();
    const endpoint = (engine as unknown as { cloudflareEndpoint: { baseURL: string; apiKey?: string } })
      .cloudflareEndpoint;
    expect(endpoint.baseURL).toBe('https://quantmail-ai.quantrinity.workers.dev/v1');
    // No AI_API_KEY configured → no Authorization header material.
    expect(endpoint.apiKey).toBeUndefined();
    expect((engine as unknown as { deployedModelPin: string | null }).deployedModelPin).toBe(
      STAGING_PIN,
    );
  });

  it('staging AI_PROVIDER=custom sends no Authorization header without AI_API_KEY', async () => {
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'https://quantmail-ai.quantrinity.workers.dev/v1');
    vi.stubEnv('AI_MODEL', STAGING_PIN);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const engine = new AIEngine({ enableCaching: false });
    const response = await engine.infer(baseRequest({ stateless: true }));
    expect(response.content).toBe('ok');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://quantmail-ai.quantrinity.workers.dev/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe(STAGING_PIN);
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('staging AI_PROVIDER=custom fails closed when AI_BASE_URL is missing', () => {
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_MODEL', STAGING_PIN);
    expect(() => new AIEngine()).toThrow(/requires AI_BASE_URL/);
  });

  it('staging AI_PROVIDER=custom fails closed when AI_MODEL is missing', () => {
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'https://x.test/v1');
    expect(() => new AIEngine()).toThrow(/requires AI_MODEL/);
  });

  it('staging AI_PROVIDER=custom fails closed when AI_MODEL is not registered', () => {
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'https://x.test/v1');
    vi.stubEnv('AI_MODEL', 'nope/not-a-model');
    expect(() => new AIEngine()).toThrow(UnknownModelError);
  });

  it('production AI_PROVIDER=cloudflare honors CLOUDFLARE_AI_BASE_URL + account + pin', () => {
    vi.stubEnv('AI_PROVIDER', 'cloudflare');
    vi.stubEnv('CLOUDFLARE_AI_BASE_URL', 'https://api.cloudflare.com/client/v4/accounts');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct-test');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'k-test');
    vi.stubEnv('CLOUDFLARE_AI_MODEL', PROD_PIN);

    const engine = new AIEngine();
    const endpoint = (engine as unknown as { cloudflareEndpoint: { baseURL: string } })
      .cloudflareEndpoint;
    expect(endpoint.baseURL).toBe('https://api.cloudflare.com/client/v4/accounts/acct-test/ai/v1');
    expect((engine as unknown as { deployedModelPin: string | null }).deployedModelPin).toBe(
      PROD_PIN,
    );
  });

  it('production AI_PROVIDER=cloudflare fails closed on an unregistered pin', () => {
    vi.stubEnv('AI_PROVIDER', 'cloudflare');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct-test');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'k-test');
    vi.stubEnv('CLOUDFLARE_AI_MODEL', DEPRECATED);
    expect(() => new AIEngine()).toThrow(UnknownModelError);
  });

  it('production AI_PROVIDER=cloudflare fails closed without an account id', () => {
    vi.stubEnv('AI_PROVIDER', 'cloudflare');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'k-test');
    expect(() => new AIEngine()).toThrow(/requires CLOUDFLARE_ACCOUNT_ID/);
  });

  it('production AI_PROVIDER=cloudflare fails closed without a token', () => {
    vi.stubEnv('AI_PROVIDER', 'cloudflare');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct-test');
    expect(() => new AIEngine()).toThrow(/requires CLOUDFLARE_API_TOKEN/);
  });
});

describe('CODEX gate 3 — fail-closed unknown model', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('UnknownModelError carries the stable UNKNOWN_MODEL code', () => {
    const err = new UnknownModelError('x', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnknownModelError');
    expect(err.code).toBe('UNKNOWN_MODEL');
    expect(err.message).toContain('x');
  });

  it('throws for an explicitly requested model that is not registered', () => {
    const router = new ModelRouter();
    expect(() =>
      router.selectModel(baseRequest({ model: 'nope/not-a-model' }) as never),
    ).toThrow(UnknownModelError);
  });

  it('throws when AI_DEFAULT_MODEL is not registered instead of scoring a fallback', () => {
    vi.stubEnv('AI_DEFAULT_MODEL', 'nope/not-a-model');
    const router = new ModelRouter();
    expect(() => router.selectModel(baseRequest() as never)).toThrow(UnknownModelError);
  });

  it('throws for the deprecated 70b pin — never silently substitutes', () => {
    vi.stubEnv('AI_DEFAULT_MODEL', DEPRECATED);
    const router = new ModelRouter();
    expect(() => router.selectModel(baseRequest() as never)).toThrow(
      /Unknown or unavailable AI model/,
    );
  });

  it('still resolves a registered, available explicit model', () => {
    vi.stubEnv('OPENAI_API_KEY', 'k-test');
    const router = new ModelRouter();
    router.setAvailableProviders(new Set(['openai']));
    const model = router.selectModel(baseRequest({ model: 'gpt-4o-mini' }) as never);
    expect(model.id).toBe('gpt-4o-mini');
  });

  it('still honors a registered AI_DEFAULT_MODEL', () => {
    vi.stubEnv('OPENAI_API_KEY', 'k-test');
    vi.stubEnv('AI_DEFAULT_MODEL', 'gpt-4o-mini');
    const router = new ModelRouter();
    router.setAvailableProviders(new Set(['openai']));
    const model = router.selectModel(baseRequest() as never);
    expect(model.id).toBe('gpt-4o-mini');
  });
});
