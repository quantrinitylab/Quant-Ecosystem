import { describe, it, expect, vi } from 'vitest';
import {
  BedrockEmbeddingProvider,
  loadBedrockEmbeddingConfig,
  type BedrockSendClient,
} from '../adapters/bedrock-embedding-provider';
import {
  BedrockExtractionModel,
  loadBedrockExtractionConfig,
  type BedrockConverseClient,
} from '../adapters/bedrock-extraction-model';

// ─── Embedding adapter ────────────────────────────────────────────────────────

describe('BedrockEmbeddingProvider', () => {
  it('invokes Titan and returns the embedding vector', async () => {
    const embedding = Array.from({ length: 1024 }, (_, i) => i / 1024);
    const client: BedrockSendClient = {
      send: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({ embedding })),
      }),
    };
    const provider = new BedrockEmbeddingProvider({ region: 'us-east-1', client });

    const out = await provider.embed('hello world');

    expect(provider.provider).toBe('bedrock');
    expect(provider.dimension).toBe(1024);
    expect(out).toHaveLength(1024);
    expect(out[0]).toBe(0);
    expect(client.send).toHaveBeenCalledOnce();
  });

  it('throws on an empty response', async () => {
    const client: BedrockSendClient = {
      send: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({})) }),
    };
    const provider = new BedrockEmbeddingProvider({ region: 'us-east-1', client });
    await expect(provider.embed('x')).rejects.toThrow(/no embedding/);
  });

  it('loads region from AWS_REGION fallback', () => {
    const cfg = loadBedrockEmbeddingConfig({ AWS_REGION: 'eu-west-1' } as NodeJS.ProcessEnv);
    expect(cfg.region).toBe('eu-west-1');
  });
});

// ─── Extraction adapter ───────────────────────────────────────────────────────

function converseClient(text: string, inTok = 100, outTok = 20): BedrockConverseClient {
  return {
    send: vi.fn().mockResolvedValue({
      output: { message: { content: [{ text }] } },
      usage: { inputTokens: inTok, outputTokens: outTok },
    }),
  };
}

describe('BedrockExtractionModel', () => {
  it('parses facts + metrics from a Converse response', async () => {
    const client = converseClient(
      JSON.stringify({
        facts: [
          {
            slot: 'residence',
            value: 'Patna',
            operation: 'store',
            polarity: 'positive',
            temporal: 'current',
            confidence: 0.9,
            subject: 'user',
          },
        ],
      }),
    );
    const model = new BedrockExtractionModel({ region: 'us-east-1', client });

    const { facts, metrics } = await model.extractDetailed('u1', 's1', 'user', 'I live in Patna');

    expect(facts).toHaveLength(1);
    expect(facts[0]!.value).toBe('Patna');
    expect(facts[0]!.provenance).toContain('bedrock');
    expect(metrics.tokens).toBe(120);
    expect(metrics.costUsd).toBeGreaterThan(0);
  });

  it('extracts JSON even when wrapped in prose/fences', async () => {
    const client = converseClient(
      'Here you go:\n```json\n{"facts":[{"slot":"name","value":"Kundan"}]}\n```\nDone.',
    );
    const model = new BedrockExtractionModel({ region: 'us-east-1', client });
    const candidates = await model.extract('u1', 's1', 'user', 'My name is Kundan');
    expect(candidates.some((c) => c.content.toLowerCase().includes('kundan'))).toBe(true);
  });

  it('skips non-user roles by default (no API call)', async () => {
    const client = converseClient('{"facts":[]}');
    const model = new BedrockExtractionModel({ region: 'us-east-1', client });
    const { facts } = await model.extractDetailed('u1', 's1', 'assistant', 'noted');
    expect(facts).toEqual([]);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('degrades to no facts on malformed JSON', async () => {
    const client = converseClient('not json at all');
    const model = new BedrockExtractionModel({ region: 'us-east-1', client });
    const { facts } = await model.extractDetailed('u1', 's1', 'user', 'hi');
    expect(facts).toEqual([]);
  });

  it('loads region from AWS_REGION fallback', () => {
    const cfg = loadBedrockExtractionConfig({ AWS_REGION: 'us-east-1' } as NodeJS.ProcessEnv);
    expect(cfg.region).toBe('us-east-1');
    expect(cfg.model).toBe('amazon.nova-lite-v1:0');
  });
});
