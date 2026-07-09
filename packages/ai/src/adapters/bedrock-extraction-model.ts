// ============================================================================
// AI Adapters — BedrockExtractionModel (M11d, provider-agnostic)
//
// Implements the SAME frozen InstrumentedExtractionModel port (ADR-010) as the
// OpenAI LlmExtractionModel, but backed by Amazon Bedrock's Converse API (works
// across Nova, Claude, Llama, etc.). Same extraction prompt + schema so the
// extractor is swappable per ADR-003 — the memory pipeline is unchanged.
//
// The Bedrock client is injectable so this is unit-testable offline (no AWS
// calls at test time). Prompt/schema are IDENTICAL to LlmExtractionModel to keep
// extraction behavior comparable across providers (no tuning).
// ============================================================================

import { z } from 'zod';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { MemoryCandidate } from '../core/default-memory-extractor';
import {
  mapFactToCandidate,
  type ExtractedFact,
  type ExtractionResult,
  type InstrumentedExtractionModel,
} from '../core/extraction-schema';

const DEFAULT_MODEL = 'amazon.nova-lite-v1:0';
// Rough blended $/1M tokens; override per model. Nova Lite is ~ $0.06/$0.24.
const DEFAULT_COST_PER_MTOKENS = 0.15;

// IDENTICAL to LlmExtractionModel's prompt (provider-agnostic extraction).
const SYSTEM_PROMPT = [
  'You extract durable memory facts from a single user message.',
  'Return STRICT JSON: {"facts":[{...}]}. Each fact has:',
  '- slot: a stable attribute key (e.g. "residence","employer","name","favourite:language").',
  '- value: the normalized value.',
  '- operation: "store" for an assertion, "retract" to end a prior fact.',
  '- polarity: "positive" or "negative".',
  '- temporal: "current", "transient" (visiting/temporary), or "past" (used to / no longer).',
  '- confidence: 0..1 how sure you are.',
  '- subject: "user" if about the speaker, else the third party (e.g. "brother","friend John").',
  'Do NOT invent facts. Hypotheticals ("I wish..."), third-party facts, and past',
  'values must set subject/temporal accordingly. If nothing is memorable, return {"facts":[]}.',
].join('\n');

const FactSchema = z.object({
  slot: z.string().default(''),
  value: z.string().min(1),
  operation: z.enum(['store', 'retract']).default('store'),
  polarity: z.enum(['positive', 'negative']).default('positive'),
  temporal: z.enum(['current', 'transient', 'past']).default('current'),
  confidence: z.number().min(0).max(1).default(0.5),
  subject: z.string().default('user'),
});
const ResponseSchema = z.object({ facts: z.array(FactSchema).default([]) });

/** Minimal injectable client surface (a real BedrockRuntimeClient satisfies it). */
export interface BedrockConverseClient {
  send(command: unknown): Promise<{
    output?: { message?: { content?: Array<{ text?: string }> } };
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}

export interface BedrockExtractionConfig {
  region: string;
  model?: string;
  costPerMTokens?: number;
  rememberRoles?: string[];
  client?: BedrockConverseClient;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class BedrockExtractionModel implements InstrumentedExtractionModel {
  readonly model: string;
  private readonly costPerMTokens: number;
  private readonly rememberRoles: string[];
  private readonly client: BedrockConverseClient;

  constructor(config: BedrockExtractionConfig) {
    if (!config.region) throw new Error('BedrockExtractionModel: region is required');
    this.model = config.model ?? DEFAULT_MODEL;
    this.costPerMTokens = config.costPerMTokens ?? DEFAULT_COST_PER_MTOKENS;
    this.rememberRoles = config.rememberRoles ?? ['user'];
    this.client =
      config.client ??
      (new BedrockRuntimeClient({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
              },
            }
          : {}),
      }) as unknown as BedrockConverseClient);
  }

  async extract(
    actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<MemoryCandidate[]> {
    const { facts } = await this.extractDetailed(actor, session, role, content);
    const candidates: MemoryCandidate[] = [];
    for (const fact of facts) {
      const c = mapFactToCandidate(fact, actor);
      if (c) candidates.push(c);
    }
    return candidates;
  }

  async extractDetailed(
    _actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<ExtractionResult> {
    const emptyMetrics = { model: this.model, latencyMs: 0, tokens: 0, costUsd: 0 };
    if (!this.rememberRoles.includes(role)) return { facts: [], metrics: emptyMetrics };

    const start = Date.now();
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.model,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: content }] }],
        inferenceConfig: { temperature: 0, maxTokens: 512 },
      }),
    );
    const latencyMs = Date.now() - start;

    const tokens = (res.usage?.inputTokens ?? 0) + (res.usage?.outputTokens ?? 0);
    const metrics = {
      model: this.model,
      latencyMs,
      tokens,
      costUsd: (tokens * this.costPerMTokens) / 1_000_000,
    };

    const raw = res.output?.message?.content?.map((c) => c.text ?? '').join('') ?? '';
    const jsonText = extractJson(raw);
    if (!jsonText) return { facts: [], metrics };

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { facts: [], metrics };
    }
    const result = ResponseSchema.safeParse(parsed);
    if (!result.success) return { facts: [], metrics };

    const provenance = `bedrock.${this.model}`;
    const facts: ExtractedFact[] = result.data.facts.map((f) => ({
      slot: f.slot,
      value: f.value,
      operation: f.operation,
      polarity: f.polarity,
      temporal: f.temporal,
      confidence: f.confidence,
      provenance,
      subject: f.subject,
      evidence: {
        extractor: `bedrock:${this.model}`,
        quote: content,
        ...(session ? { conversationId: session } : {}),
      },
    }));

    return { facts, metrics };
  }
}

/**
 * Converse models (unlike OpenAI JSON mode) may wrap JSON in prose or fences.
 * Extract the first balanced {...} object; return null if none.
 */
function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ─── Env config (zod-validated) ─────────────────────────────────────────────

const EnvSchema = z.object({
  BEDROCK_REGION: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),
  BEDROCK_EXTRACTION_MODEL: z.string().default(DEFAULT_MODEL),
  BEDROCK_ACCESS_KEY_ID: z.string().optional(),
  BEDROCK_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_SESSION_TOKEN: z.string().optional(),
});

/** Build a config from env (region falls back to AWS_REGION; throws if neither). */
export function loadBedrockExtractionConfig(
  env: NodeJS.ProcessEnv = process.env,
): BedrockExtractionConfig {
  const parsed = EnvSchema.parse(env);
  const region = parsed.BEDROCK_REGION ?? parsed.AWS_REGION;
  if (!region) {
    throw new Error('BedrockExtractionModel: BEDROCK_REGION or AWS_REGION is required');
  }
  return {
    region,
    model: parsed.BEDROCK_EXTRACTION_MODEL,
    ...(parsed.BEDROCK_ACCESS_KEY_ID ? { accessKeyId: parsed.BEDROCK_ACCESS_KEY_ID } : {}),
    ...(parsed.BEDROCK_SECRET_ACCESS_KEY
      ? { secretAccessKey: parsed.BEDROCK_SECRET_ACCESS_KEY }
      : {}),
    ...(parsed.BEDROCK_SESSION_TOKEN ? { sessionToken: parsed.BEDROCK_SESSION_TOKEN } : {}),
  };
}
