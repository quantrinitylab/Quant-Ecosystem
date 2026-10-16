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
