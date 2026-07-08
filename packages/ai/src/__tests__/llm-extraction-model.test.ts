import { describe, it, expect } from 'vitest';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';

interface Call {
  url: string;
  body?: unknown;
}

/** Fake OpenAI chat-completions endpoint returning a facts JSON in message.content. */
function fakeLlm(facts: unknown, usageTokens = 100): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: { body?: string }) => {
    calls.push({ url, ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ facts }) } }],
        usage: { total_tokens: usageTokens },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const model = (f: typeof fetch) =>
  new LlmExtractionModel({ apiKey: 'sk-test', model: 'gpt-test', fetch: f });

describe('LlmExtractionModel.extractDetailed', () => {
  it('parses facts and reports metrics', async () => {
    const { fetch } = fakeLlm(
      [{ slot: 'residence', value: 'Bangalore', subject: 'user', confidence: 0.9 }],
      250,
    );
    const m = model(fetch);
    const result = await m.extractDetailed('user_1', 's1', 'user', 'I live in Bangalore');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      slot: 'residence',
      value: 'Bangalore',
      subject: 'user',
      provenance: 'llm.gpt-test',
    });
    expect(result.metrics.tokens).toBe(250);
    expect(result.metrics.costUsd).toBeGreaterThan(0);
    expect(result.metrics.model).toBe('gpt-test');
  });

  it('only calls the model for user turns', async () => {
    const { fetch, calls } = fakeLlm([]);
    const m = model(fetch);
    const out = await m.extractDetailed('user_1', 's1', 'assistant', 'anything');
    expect(out.facts).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('degrades to no facts on malformed JSON (soft failure)', async () => {
    const fn = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'not json' } }],
          usage: { total_tokens: 5 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const out = await model(fn).extractDetailed('user_1', 's1', 'user', 'x');
    expect(out.facts).toEqual([]);
    expect(out.metrics.tokens).toBe(5);
  });

  it('throws on a non-OK HTTP response', async () => {
    const fn = (async () =>
      new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    await expect(model(fn).extractDetailed('u', 's', 'user', 'x')).rejects.toThrow(/429/);
  });
});

describe('LlmExtractionModel.extract → storable candidates', () => {
  it('maps a user fact to a candidate owned by the user', async () => {
    const { fetch } = fakeLlm([
      { slot: 'residence', value: 'lives in Bangalore', subject: 'user' },
    ]);
    const out = await model(fetch).extract('user_1', 's1', 'user', 'I live in Bangalore');
    expect(out).toHaveLength(1);
    expect(out[0]?.owner).toBe('user_1');
    expect(out[0]?.metadata).toMatchObject({
      slot: 'residence',
      provenance: 'llm.gpt-test',
      extractor: 'llm',
    });
    expect(out[0]?.metadata?.['fingerprint']).toBeTypeOf('string');
  });

  it('scopes a third-party fact away from the user (anti-hallucination)', async () => {
    const { fetch } = fakeLlm([
      { slot: 'employer', value: 'works at Google', subject: 'friend John' },
    ]);
    const out = await model(fetch).extract(
      'user_1',
      's1',
      'user',
      'My friend John works at Google',
    );
    expect(out).toHaveLength(1);
    // Owned by a subject-scoped id, never the user → excluded from user recall.
    expect(out[0]?.owner).toBe('user_1#friend John');
    expect(out[0]?.owner).not.toBe('user_1');
  });

  it('drops past-tense facts (not current)', async () => {
    const { fetch } = fakeLlm([
      { slot: 'favourite:movie', value: 'Interstellar', subject: 'user', temporal: 'past' },
    ]);
    const out = await model(fetch).extract(
      'user_1',
      's1',
      'user',
      'My favorite movie used to be Interstellar',
    );
    expect(out).toEqual([]);
  });

  it('sets a TTL on transient facts', async () => {
    const { fetch } = fakeLlm([
      { slot: 'residence', value: 'Patna', subject: 'user', temporal: 'transient' },
    ]);
    const out = await model(fetch).extract('user_1', 's1', 'user', 'I am visiting Patna this week');
    expect(out[0]?.expiresAt).toBeTypeOf('number');
    expect(out[0]?.expiresAt! > Date.now()).toBe(true);
  });
});
