import { describe, it, expect, vi } from 'vitest';
import {
  compatChatCompletion,
  compatChatCompletionStream,
  stripReasoning,
  toCompatMessages,
} from '../core/openai-compatible-transport';

const endpoint = { baseURL: 'https://example.test/accounts/acct/ai/v1/', apiKey: 'secret-token' };
const options = { model: '@cf/meta/llama-3.1-8b-instruct-fast', temperature: 0.2, maxTokens: 64, timeoutMs: 5000 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

describe('toCompatMessages', () => {
  it('keeps string content and flattens text parts', () => {
    expect(
      toCompatMessages([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'image', url: 'x' }] },
        { role: 'tool', content: 'ignored' },
      ]),
    ).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
    ]);
  });
});

describe('compatChatCompletion', () => {
  it('posts an OpenAI chat request and returns text plus usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'pong' } }],
        usage: { prompt_tokens: 7, completion_tokens: 1 },
      }),
    );

    const result = await compatChatCompletion(endpoint, [{ role: 'user', content: 'ping' }], {
      ...options,
      fetchImpl,
    });

    expect(result).toEqual({ text: 'pong', promptTokens: 7, completionTokens: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://example.test/accounts/acct/ai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body)).toEqual({
      model: options.model,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0.2,
      max_tokens: 64,
    });
  });

  it('throws with the HTTP status (for retry) and never echoes the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"errors":[{"message":"Authentication error"}]}', { status: 401 }),
    );

    const error = (await compatChatCompletion(endpoint, [{ role: 'user', content: 'x' }], {
      ...options,
      fetchImpl,
    }).then(
      () => new Error('expected a rejection'),
      (e: unknown) => e,
    )) as Error & { status?: number };

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('HTTP 401');
    expect(error.message).toContain('Authentication error');
    expect(error.message).not.toContain('secret-token');
    expect(error.status).toBe(401);
  });

  it('drops a reasoning model <think> block before the answer', async () => {
    expect(stripReasoning('<think>weigh it up</think>\n{"verdict":"safe"}')).toBe('{"verdict":"safe"}');
    expect(stripReasoning('reasoning without opener</think> Answer')).toBe('Answer');
    expect(stripReasoning('plain answer')).toBe('plain answer');

    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '<think>hmm</think>pong' } }] }),
    );
    const result = await compatChatCompletion(endpoint, [{ role: 'user', content: 'ping' }], {
      ...options,
      fetchImpl,
    });
    expect(result.text).toBe('pong');
  });

  it('treats an empty completion as an error, not an empty answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '  ' } }] }));
    await expect(
      compatChatCompletion(endpoint, [{ role: 'user', content: 'x' }], { ...options, fetchImpl }),
    ).rejects.toThrow(/empty completion/);
  });
});

describe('compatChatCompletionStream', () => {
  it('yields SSE deltas across chunk boundaries and stops at [DONE]', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\nda',
        'ta: {"choices":[{"delta":{"content":"lo"}}]}\n\n: keep-alive\n\n',
        'data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"after done"}}]}\n\n',
      ]),
    );

    const parts: string[] = [];
    for await (const part of compatChatCompletionStream(endpoint, [{ role: 'user', content: 'hi' }], {
      ...options,
      fetchImpl,
    })) {
      parts.push(part);
    }

    expect(parts).toEqual(['Hel', 'lo']);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).stream).toBe(true);
  });

  it('surfaces HTTP errors on first iteration', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('overloaded', { status: 503 }));
    const iterator = compatChatCompletionStream(endpoint, [{ role: 'user', content: 'hi' }], {
      ...options,
      fetchImpl,
    });
    await expect(iterator.next()).rejects.toThrow(/HTTP 503/);
  });
});
