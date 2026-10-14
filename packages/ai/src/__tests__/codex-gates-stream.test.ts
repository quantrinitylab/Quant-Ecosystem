// ============================================================================
// CODEX-REVIEW gate 4 (PR #1119) — truncated-stream rejection and
// reasoning-text filtering in compatChatCompletionStream.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { compatChatCompletionStream } from '../core/openai-compatible-transport';

const endpoint = { baseURL: 'https://example.test/accounts/acct/ai/v1' };
const options = {
  model: '@cf/meta/llama-3.2-1b-instruct',
  temperature: 0.2,
  maxTokens: 64,
  timeoutMs: 5000,
};
const messages = [{ role: 'user' as const, content: 'hi' }];

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function sseData(content: string): string {
  return `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`;
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of gen) parts.push(chunk);
  return parts.join('');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CODEX gate 4 — truncated streams', () => {
  it('yields deltas and completes on data: [DONE]', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('Hello'), sseData(' world'), 'data: [DONE]\n\n']),
    );
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('Hello world');
  });

  it('completes when [DONE] is the final line without a trailing newline', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([sseData('hi'), 'data: [DONE]']));
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('hi');
  });

  it('rejects a stream that ends WITHOUT data: [DONE] (truncated EOF)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('partial answer'), sseData(' cut off mid-sen')]),
    );
    await expect(
      collect(compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl })),
    ).rejects.toThrow(/truncated/i);
  });

  it('rejects an empty stream ([DONE] with no content)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
    await expect(
      collect(compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl })),
    ).rejects.toThrow(/empty/i);
  });
});

describe('CODEX gate 4 — no reasoning-text exposure', () => {
  it('strips a <think> block delivered in one chunk', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        sseData('<think>secret chain of thought</think>Visible answer'),
        'data: [DONE]\n\n',
      ]),
    );
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('Visible answer');
    expect(text).not.toContain('secret');
  });

  it('strips <think> tags split across chunk boundaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        sseData('Start <th'),
        sseData('ink>hidden reasoning</th'),
        sseData('ink> end'),
        'data: [DONE]\n\n',
      ]),
    );
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('Start  end');
    expect(text).not.toContain('hidden');
  });

  it('drops an unclosed <think> block at EOF', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('Visible<think>never closed'), 'data: [DONE]\n\n']),
    );
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('Visible');
  });

  it('passes plain "<" text through untouched', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('a < b and c > d'), 'data: [DONE]\n\n']),
    );
    const text = await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    );
    expect(text).toBe('a < b and c > d');
  });

  it('rejects a stream whose only content was reasoning (empty answer)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('<think>only thought, never answered</think>'), 'data: [DONE]\n\n']),
    );
    await expect(
      collect(compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl })),
    ).rejects.toThrow(/empty/i);
  });
});

describe('CODEX gate 2 — Authorization header on the transport', () => {
  it('omits the Authorization header when the endpoint has no apiKey', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
    await collect(
      compatChatCompletionStream(endpoint, messages, { ...options, fetchImpl }),
    ).catch(() => {
      // Empty-stream rejection is expected; the request assertions matter.
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers['Authorization']).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends Bearer auth when the endpoint has an apiKey', async () => {
    const authed = { ...endpoint, apiKey: 'k-test' };
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([sseData('ok'), 'data: [DONE]\n\n']),
    );
    await collect(compatChatCompletionStream(authed, messages, { ...options, fetchImpl }));
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers['Authorization']).toBe('Bearer k-test');
  });
});
