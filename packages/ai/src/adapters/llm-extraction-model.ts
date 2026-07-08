// ============================================================================
// AI Adapters — LlmExtractionModel (PR-M11)
//
// The first probabilistic extractor. Implements the frozen
// InstrumentedExtractionModel (ADR-010) over an injectable `fetch` (OpenAI
// chat-completions JSON mode; no SDK coupling). Produces ExtractedFacts with
// subject/temporal/confidence, then maps them to storable MemoryCandidates.
//
// It is a drop-in MemoryExtractor (same extract signature), usable as the
// top-level extractor in createMemoryService. `extractDetailed` additionally
// returns metrics (tokens/cost/latency) for the eval.
// ============================================================================

import { z } from 'zod';
import type { MemoryCandidate } from '../core/default-memory-extractor';
import {
  mapFactToCandidate,
  type ExtractedFact,
  type ExtractionResult,
  type InstrumentedExtractionModel,
} from '../core/extraction-schema';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
// Rough blended $/1M tokens for cost estimation; override per model via config.
const DEFAULT_COST_PER_MTOKENS = 0.3;

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

export interface LlmExtractionConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  costPerMTokens?: number;
  /** Only extract from these roles (default: user turns only). */
  rememberRoles?: string[];
}

export class LlmExtractionModel implements InstrumentedExtractionModel {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly costPerMTokens: number;
  private readonly rememberRoles: string[];

  constructor(config: LlmExtractionConfig) {
    if (!config.apiKey) throw new Error('LlmExtractionModel: apiKey is required');
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = config.fetch ?? fetch;
    this.costPerMTokens = config.costPerMTokens ?? DEFAULT_COST_PER_MTOKENS;
    this.rememberRoles = config.rememberRoles ?? ['user'];
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
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      }),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`LLM extraction failed (${res.status}): ${detail}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const tokens = body.usage?.total_tokens ?? 0;
    const metrics = {
      model: this.model,
      latencyMs,
      tokens,
      costUsd: (tokens * this.costPerMTokens) / 1_000_000,
    };

    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return { facts: [], metrics };

    // A model returning malformed JSON is a soft failure — degrade to no facts.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { facts: [], metrics };
    }
    const result = ResponseSchema.safeParse(parsed);
    if (!result.success) return { facts: [], metrics };

    const provenance = `llm.${this.model}`;
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
        extractor: `llm:${this.model}`,
        quote: content,
        ...(session ? { conversationId: session } : {}),
      },
    }));

    return { facts, metrics };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
