// @vitest-environment node
// ============================================================================
// ai-provider.service — Cloudflare model resolution (CODEX-gate family).
//
// The Cloudflare transports (chatViaCloudflare / chatWithToolsViaCloudflare)
// used to terminally default to the Cloudflare-deprecated
// @cf/meta/llama-3.1-70b-instruct whenever options.model, CLOUDFLARE_AI_MODEL
// and AI_MODEL were all unset — silently sending live aiChat/aiChatWithTools
// traffic (routes ai-chat.ts, ai-compose.ts) to a deprecated model, the exact
// silent-fallback failure the CODEX engine gates (PR #1119 / PR #1164) forbid.
//
// These tests pin the contract:
//   1. Unset pins resolve to the production pin @cf/meta/llama-3.2-1b-instruct
//      (the model production deploys via infra/helm/quant-platform/
//      values-production-v2.yaml) — never to the deprecated 70b model.
//   2. An explicitly configured deprecated model throws UnknownAIModelError
//      (stable code UNKNOWN_MODEL) instead of being used — fail closed,
//      mirroring the engine's UnknownModelError contract.
//   3. The legacy /ai/run REST fallback inherits the resolved model, so it
//      can never reach the deprecated default either.
//
// HARNESS: the REAL service, with only global fetch stubbed. Env is read per
// call (never cached), so each test sets the exact pins it needs.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  aiChat,
  aiChatWithTools,
  UnknownAIModelError,
} from '../services/ai-provider.service';

const PROD_PIN = '@cf/meta/llama-3.2-1b-instruct';
const DEPRECATED = '@cf/meta/llama-3.1-70b-instruct';
const ACCOUNT_ID = '9af698848a5edd00e756c3a2c908ec8d';

const ENV_KEYS = [
  'AI_PROVIDER',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_MODEL',
  'CLOUDFLARE_AI_BASE_URL',
  'AI_MODEL',
  'AI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AI_BASE_URL',
  'META_API_KEY',
  'META_AI_MODEL',
  'META_AI_BASE_URL',
];

let savedEnv: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof vi.fn>;
let calls: Array<{ url: string; body: Record<string, unknown> }>;

function okJson(payload: unknown) {
  return { ok: true, status: 200, text: async () => '', json: async () => payload };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Cloudflare provider auto-detects on this token (AI_PROVIDER unset).
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';

  calls = [];
  fetchMock = vi.fn(async (url: string, init: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ url, body });
    return okJson({ choices: [{ message: { content: 'hello from the model' } }] });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key] as string;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('aiChat — Cloudflare model resolution', () => {
  it('resolves the production pin when no model is configured (never the deprecated model)', async () => {
    const text = await aiChat([{ role: 'user', content: 'hi' }]);

    expect(text).toBe('hello from the model');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/v1/chat/completions`,
    );
    expect(calls[0]!.body.model).toBe(PROD_PIN);
    expect(calls[0]!.body.model).not.toBe(DEPRECATED);
  });

  it('honours an explicit CLOUDFLARE_AI_MODEL pin', async () => {
    process.env.CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct';

    await aiChat([{ role: 'user', content: 'hi' }]);

    expect(calls[0]!.body.model).toBe('@cf/meta/llama-3.3-70b-instruct');
  });

  it('honours the legacy AI_MODEL pin when CLOUDFLARE_AI_MODEL is unset', async () => {
    process.env.AI_MODEL = '@cf/meta/llama-3.3-70b-instruct';

    await aiChat([{ role: 'user', content: 'hi' }]);

    expect(calls[0]!.body.model).toBe('@cf/meta/llama-3.3-70b-instruct');
  });

  it('honours a server-side per-call model override', async () => {
    await aiChat([{ role: 'user', content: 'hi' }], { model: '@cf/meta/llama-3.3-70b-instruct' });

    expect(calls[0]!.body.model).toBe('@cf/meta/llama-3.3-70b-instruct');
  });

  it('fails closed with UNKNOWN_MODEL when CLOUDFLARE_AI_MODEL names the deprecated model', async () => {
    process.env.CLOUDFLARE_AI_MODEL = DEPRECATED;

    const err = await aiChat([{ role: 'user', content: 'hi' }]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnknownAIModelError);
    expect((err as UnknownAIModelError).code).toBe('UNKNOWN_MODEL');
    expect((err as Error).message).toContain(DEPRECATED);
    // No request may leave the process carrying a deprecated model.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed with UNKNOWN_MODEL when AI_MODEL names the deprecated model', async () => {
    process.env.AI_MODEL = DEPRECATED;

    const err = await aiChat([{ role: 'user', content: 'hi' }]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnknownAIModelError);
    expect((err as UnknownAIModelError).code).toBe('UNKNOWN_MODEL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed with UNKNOWN_MODEL for a deprecated per-call override', async () => {
    const err = await aiChat([{ role: 'user', content: 'hi' }], { model: DEPRECATED }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(UnknownAIModelError);
    expect((err as UnknownAIModelError).code).toBe('UNKNOWN_MODEL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the legacy /ai/run REST fallback inherits the resolved production pin', async () => {
    // First call (OpenAI-compatible /ai/v1 endpoint) fails; the transport
    // falls back to the legacy REST /ai/run/{model} endpoint.
    fetchMock.mockImplementationOnce(async (url: string, init: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ url, body });
      return { ok: false, status: 500, text: async () => 'v1 down', json: async () => ({}) };
    });
    fetchMock.mockImplementationOnce(async (url: string, init: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ url, body });
      return okJson({ success: true, result: { response: 'fallback answer' } });
    });

    const text = await aiChat([{ role: 'user', content: 'hi' }]);

    expect(text).toBe('fallback answer');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toContain(`/ai/run/${PROD_PIN}`);
    expect(calls[1]!.url).not.toContain(DEPRECATED);
  });
});

describe('aiChatWithTools — Cloudflare model resolution', () => {
  it('resolves the production pin when no model is configured', async () => {
    fetchMock.mockImplementationOnce(async (url: string, init: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ url, body });
      return okJson({ choices: [{ message: { content: 'ok', tool_calls: [] } }] });
    });

    const result = await aiChatWithTools([{ role: 'user', content: 'hi' }], { tools: [] });

    expect(result.content).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.model).toBe(PROD_PIN);
    expect(calls[0]!.body.model).not.toBe(DEPRECATED);
  });

  it('fails closed with UNKNOWN_MODEL when the pin names the deprecated model', async () => {
    process.env.CLOUDFLARE_AI_MODEL = DEPRECATED;

    const err = await aiChatWithTools([{ role: 'user', content: 'hi' }], { tools: [] }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(UnknownAIModelError);
    expect((err as UnknownAIModelError).code).toBe('UNKNOWN_MODEL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Meta Model API provider (AI_PROVIDER=meta / META_API_KEY auto-detect).
//
// The designated AI brain for the Oracle Cloud deployment (no Bedrock there).
// OpenAI-compatible transport: POST {base}/chat/completions with a Bearer
// META_API_KEY. Model precedence: per-call override > META_AI_MODEL >
// AI_MODEL > the default pin muse-spark-1.3.
// ============================================================================

const META_URL = 'https://api.meta.ai/v1/chat/completions';
const META_DEFAULT_MODEL = 'muse-spark-1.3';

function authHeader(): string | undefined {
  const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers?.['Authorization'];
}

describe('aiChat — Meta provider', () => {
  it('posts to the Meta chat-completions endpoint with the default model', async () => {
    process.env.AI_PROVIDER = 'meta';
    process.env.META_API_KEY = 'test-meta-key';

    const text = await aiChat([{ role: 'user', content: 'hi' }]);

    expect(text).toBe('hello from the model');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(META_URL);
    expect(authHeader()).toBe('Bearer test-meta-key');
    expect(calls[0]!.body.model).toBe(META_DEFAULT_MODEL);
  });

  it('auto-detects the Meta provider from META_API_KEY alone (even with a Cloudflare token set)', async () => {
    // beforeEach always sets CLOUDFLARE_API_TOKEN; META_API_KEY must win.
    process.env.META_API_KEY = 'test-meta-key';

    await aiChat([{ role: 'user', content: 'hi' }]);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(META_URL);
    expect(calls[0]!.body.model).toBe(META_DEFAULT_MODEL);
  });

  it('honours META_AI_MODEL', async () => {
    process.env.AI_PROVIDER = 'meta';
    process.env.META_API_KEY = 'test-meta-key';
    process.env.META_AI_MODEL = 'muse-spark-1.2';

    await aiChat([{ role: 'user', content: 'hi' }]);

    expect(calls[0]!.body.model).toBe('muse-spark-1.2');
  });

  it('honours a server-side per-call model override over META_AI_MODEL', async () => {
    process.env.AI_PROVIDER = 'meta';
    process.env.META_API_KEY = 'test-meta-key';
    process.env.META_AI_MODEL = 'muse-spark-1.2';

    await aiChat([{ role: 'user', content: 'hi' }], { model: 'muse-spark-1.1' });

    expect(calls[0]!.body.model).toBe('muse-spark-1.1');
  });

  it('honours META_AI_BASE_URL', async () => {
    process.env.AI_PROVIDER = 'meta';
    process.env.META_API_KEY = 'test-meta-key';
    process.env.META_AI_BASE_URL = 'https://meta-proxy.internal/v1/';

    await aiChat([{ role: 'user', content: 'hi' }]);

    // Trailing slash is stripped, /chat/completions appended.
    expect(calls[0]!.url).toBe('https://meta-proxy.internal/v1/chat/completions');
  });

  it('fails closed when AI_PROVIDER=meta but META_API_KEY is missing', async () => {
    process.env.AI_PROVIDER = 'meta';

    const err = await aiChat([{ role: 'user', content: 'hi' }]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('aiChatWithTools — Meta provider', () => {
  it('passes tools through and parses tool_calls off the Meta response', async () => {
    process.env.AI_PROVIDER = 'meta';
    process.env.META_API_KEY = 'test-meta-key';
    fetchMock.mockImplementationOnce(async (url: string, init: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ url, body });
      return okJson({
        choices: [
          {
            message: {
              content: 'checking',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_time', arguments: '{"tz":"IST"}' },
                },
              ],
            },
          },
        ],
      });
    });

    const result = await aiChatWithTools([{ role: 'user', content: 'hi' }], {
      tools: [
        {
          type: 'function',
          function: { name: 'get_time', description: 'current time', parameters: { type: 'object', properties: {} } },
        },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(META_URL);
    expect(authHeader()).toBe('Bearer test-meta-key');
    expect(calls[0]!.body.model).toBe(META_DEFAULT_MODEL);
    expect((calls[0]!.body.tools as unknown[]).length).toBe(1);
    expect(result.content).toBe('checking');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'get_time', arguments: { tz: 'IST' } }]);
  });
});
