/**
 * ai-streaming.ts — Fastify plugin: SSE streaming variants of the /api/v1/ai/* endpoints (P0-6, W2).
 *
 * Mount: `await fastify.register(aiStreamingRoutes, { prefix: '/api/v1/ai', streamProvider })`
 *         → POST /api/v1/ai/stream/summarize | /stream/summarize-thread | /stream/reply |
 *            POST /api/v1/ai/stream/compose | /stream/compose/improve | /stream/triage
 *
 * Staging constraints (LEARNINGS.md — heavy deps):
 *   - `fastify` TYPE-ONLY import — staging me fastify dep nahi hai; merge-time par real FastifyInstance milega.
 *   - `@quant/ai` ka koi runtime import NAHI — LLM `AIStreamProvider` seam se injected hai.
 *     Merge-time adapter: `AIEngine.stream()` (packages/ai/src/core/engine.ts:456,
 *     AsyncGenerator<StreamChunk>, Vercel streamText at engine.ts:502) ko wrap karke
 *     StreamChunk → string delta map karo. Adapter me `import type` hi rakho.
 *   - zod nahi hai staging me — body validators neeche RESEARCH.md ke EXACT sync-endpoint
 *     schemas ko field-for-field mirror karte hain; merge-time par routes/ai-services.ts ke
 *     zod schemas se replace karo (koi field invent nahi kiya gaya).
 *   - `@quant/credits` UsageGate unwired hai (RESEARCH Q6) — `StreamMetering` seam abhi se hai,
 *     default no-op; P0-4 me real UsageGate (estimate → reserve → settle, fail-closed) wire hoga.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createSseStream } from './sse-transport';

// ---------------------------------------------------------------------------
// Injected seams
// ---------------------------------------------------------------------------

export interface StreamTextOptions {
  signal: AbortSignal;
  model?: string;
}

/**
 * Injected LLM streaming seam (tests me fake; merge-time me real AIEngine.stream() ka adapter).
 */
export interface AIStreamProvider {
  streamText(prompt: string, opts: StreamTextOptions): AsyncIterable<string>;
}

export type ReserveResult = { ok: true; reservationId?: string } | { ok: false; code: string };

/**
 * UsageGate seam — fail-closed. reserve fail → 402/429 JSON, hijack se PEHLE.
 * (RESEARCH Q6: @quant/credits exists par backend me unwired — P0-4 me wire hoga.)
 */
export interface StreamMetering {
  reserve(userId: string, estTokens: number): Promise<ReserveResult>;
  settle(userId: string, reservationId: string | undefined, actualTokens: number): Promise<void>;
}

const noopMetering: StreamMetering = {
  reserve: async () => ({ ok: true }),
  settle: async () => {},
};

// ---------------------------------------------------------------------------
// Errors — merge-time: createAppError from '@quant/server-core' se replace karo.
// Shape server-core error-handler envelope se compatible hai:
//   { success: false, error: { code, message, statusCode? } }
// ---------------------------------------------------------------------------

export interface AppErrorShape extends Error {
  statusCode: number;
  code: string;
}

function appError(statusCode: number, code: string, message: string): AppErrorShape {
  const e = new Error(message) as AppErrorShape;
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// Auth — inline guard. Global onRequest hook (@quant/server-core createApp,
// packages/server-core/src/app.ts:203-210) requireAuth() karta hai; uske upar har AI route
// inline re-check karta hai (routes/ai-services.ts convention — RESEARCH Q3).
// ---------------------------------------------------------------------------

function reqUserId(req: FastifyRequest): string {
  const userId = (req as unknown as { auth?: { userId?: unknown } }).auth?.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw appError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Per-user token-bucket rate limiter (in-process).
// RESEARCH Q3 finding: AI routes par KOI per-route limit nahi (global 1000/min) —
// streaming endpoints long-lived + LLM-costly hain, isliye apna per-user bucket.
// Default 30 streams/min/user. Multi-instance deploy me Redis-backed banana hoga
// (TODO(UNVERIFIED): k8s me shared limiter — P0-5 deploy-wiring ke saath confirm).
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function createTokenBucketRateLimiter(streamsPerMin: number): {
  check(userId: string): RateLimitResult;
} {
  const capacity = Math.max(1, Math.floor(streamsPerMin));
  const buckets = new Map<string, { tokens: number; lastMs: number }>();
  return {
    check(userId: string): RateLimitResult {
      const now = Date.now();
      let b = buckets.get(userId);
      if (!b) {
        b = { tokens: capacity, lastMs: now };
        buckets.set(userId, b);
      }
      const elapsedMs = now - b.lastMs;
      b.tokens = Math.min(capacity, b.tokens + (elapsedMs * capacity) / 60_000);
      b.lastMs = now;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true, retryAfterSec: 0 };
      }
      return { ok: false, retryAfterSec: 60 };
    },
  };
}

// ---------------------------------------------------------------------------
// Body validators — RESEARCH Q1 ke EXACT sync-endpoint schemas (koi field invent nahi).
// Merge-time: routes/ai-services.ts ke zod schemas se replace karo.
// 400 code: TODO(UNVERIFIED) — server-core error-handler ka exact zod-failure code confirm karna hai.
// ---------------------------------------------------------------------------

function reqString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw appError(400, 'VALIDATION_ERROR', `body.${field} is required and must be a non-empty string`);
  }
  return v;
}

function optString(obj: Record<string, unknown>, field: string): string | undefined {
  const v = obj[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw appError(400, 'VALIDATION_ERROR', `body.${field} must be a string`);
  return v;
}

function asRecord(v: unknown, field: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw appError(400, 'VALIDATION_ERROR', `body.${field} must be an object`);
  }
  return v as Record<string, unknown>;
}

// --- 1. summarize → POST /api/v1/ai/summarize ---
// Body (all required): subject, body, from
// (routes/ai-services.ts → AISummarizeService.summarizeSingle; data: { summary, keyPoints: string[] })
export interface SummarizeBody {
  subject: string;
  body: string;
  from: string;
}
function parseSummarizeBody(body: unknown): SummarizeBody {
  const o = asRecord(body, '');
  return { subject: reqString(o, 'subject'), body: reqString(o, 'body'), from: reqString(o, 'from') };
}

// --- 2. summarize-thread → POST /api/v1/ai/summarize-thread ---
// Body: { messages: ThreadMessage[] } required; each { from, subject, body, date? }
// (routes/ai-services.ts → AISummarizeService.summarizeThread; services/ai-summarize.service.ts:5-17)
export interface ThreadMessage {
  from: string;
  subject: string;
  body: string;
  date?: string;
}
export interface SummarizeThreadBody {
  messages: ThreadMessage[];
}
function parseSummarizeThreadBody(body: unknown): SummarizeThreadBody {
  const o = asRecord(body, '');
  const messages = o['messages'];
  if (!Array.isArray(messages) || messages.length === 0) {
    throw appError(400, 'VALIDATION_ERROR', 'body.messages is required and must be a non-empty array');
  }
  return {
    messages: messages.map((m, i) => {
      const r = asRecord(m, `messages[${i}]`);
      return {
        from: reqString(r, 'from'),
        subject: reqString(r, 'subject'),
        body: reqString(r, 'body'),
        date: optString(r, 'date'),
      };
    }),
  };
}

// --- 3. triage → POST /api/v1/ai/triage ---
// Body (TriageInputSchema): subject, body, from required; receivedAt? optional
// (routes/ai-services.ts → AITriageService.triage; services/ai-triage.service.ts:5-20)
export interface TriageBody {
  subject: string;
  body: string;
  from: string;
  receivedAt?: string;
}
function parseTriageBody(body: unknown): TriageBody {
  const o = asRecord(body, '');
  return {
    subject: reqString(o, 'subject'),
    body: reqString(o, 'body'),
    from: reqString(o, 'from'),
    receivedAt: optString(o, 'receivedAt'),
  };
}

// --- 4. compose → POST /api/v1/ai/compose ---
// Body: { bullets: string[] (required), context?: { recipient?, subject?, tone?, format? } }
// tone: 'professional'|'casual'|'friendly'|'urgent'; format: 'brief'|'detailed'|'bullet_points'
// (routes/ai-services.ts → AIComposeService.composeFromBullets; services/ai-compose.service.ts:5-16)
const COMPOSE_TONES = ['professional', 'casual', 'friendly', 'urgent'] as const;
const COMPOSE_FORMATS = ['brief', 'detailed', 'bullet_points'] as const;
export interface ComposeBody {
  bullets: string[];
  context?: {
    recipient?: string;
    subject?: string;
    tone?: (typeof COMPOSE_TONES)[number];
    format?: (typeof COMPOSE_FORMATS)[number];
  };
}
function parseComposeBody(body: unknown): ComposeBody {
  const o = asRecord(body, '');
  const bullets = o['bullets'];
  if (!Array.isArray(bullets) || bullets.length === 0 || !bullets.every((b) => typeof b === 'string')) {
    throw appError(400, 'VALIDATION_ERROR', 'body.bullets is required and must be a non-empty string array');
  }
  let context: ComposeBody['context'];
  if (o['context'] !== undefined) {
    const c = asRecord(o['context'], 'context');
    const tone = optString(c, 'tone');
    if (tone !== undefined && !(COMPOSE_TONES as readonly string[]).includes(tone)) {
      throw appError(400, 'VALIDATION_ERROR', `body.context.tone must be one of ${COMPOSE_TONES.join('|')}`);
    }
    const format = optString(c, 'format');
    if (format !== undefined && !(COMPOSE_FORMATS as readonly string[]).includes(format)) {
      throw appError(400, 'VALIDATION_ERROR', `body.context.format must be one of ${COMPOSE_FORMATS.join('|')}`);
    }
    context = {
      recipient: optString(c, 'recipient'),
      subject: optString(c, 'subject'),
      tone: tone as (typeof COMPOSE_TONES)[number] | undefined,
      format: format as (typeof COMPOSE_FORMATS)[number] | undefined,
    };
  }
  return { bullets: bullets as string[], context };
}

// --- 5. compose/improve → POST /api/v1/ai/compose/improve ---
// Body: { draft (required), instructions (required) }
// (routes/ai-services.ts → AIComposeService.improveEmail; data: { body, changes: string[], confidence })
export interface ImproveBody {
  draft: string;
  instructions: string;
}
function parseImproveBody(body: unknown): ImproveBody {
  const o = asRecord(body, '');
  return { draft: reqString(o, 'draft'), instructions: reqString(o, 'instructions') };
}

// --- 6. reply → POST /api/v1/ai/reply ---
// Body: { email: { subject, body, from, to? } (required), options?: { tone?, maxLength?, includeGreeting? } }
// tone: 'professional'|'casual'|'friendly'|'brief'
// (routes/ai-services.ts → AIReplyService.draftReply; services/ai-reply.service.ts:6-23)
const REPLY_TONES = ['professional', 'casual', 'friendly', 'brief'] as const;
export interface ReplyBody {
  email: { subject: string; body: string; from: string; to?: string };
  options?: {
    tone?: (typeof REPLY_TONES)[number];
    maxLength?: number;
    includeGreeting?: boolean;
  };
}
function parseReplyBody(body: unknown): ReplyBody {
  const o = asRecord(body, '');
  const e = asRecord(o['email'], 'email');
  let options: ReplyBody['options'];
  if (o['options'] !== undefined) {
    const p = asRecord(o['options'], 'options');
    const tone = optString(p, 'tone');
    if (tone !== undefined && !(REPLY_TONES as readonly string[]).includes(tone)) {
      throw appError(400, 'VALIDATION_ERROR', `body.options.tone must be one of ${REPLY_TONES.join('|')}`);
    }
    const maxLength = p['maxLength'];
    if (maxLength !== undefined && (typeof maxLength !== 'number' || maxLength <= 0)) {
      throw appError(400, 'VALIDATION_ERROR', 'body.options.maxLength must be a positive number');
    }
    const includeGreeting = p['includeGreeting'];
    if (includeGreeting !== undefined && typeof includeGreeting !== 'boolean') {
      throw appError(400, 'VALIDATION_ERROR', 'body.options.includeGreeting must be a boolean');
    }
    options = {
      tone: tone as (typeof REPLY_TONES)[number] | undefined,
      maxLength: maxLength as number | undefined,
      includeGreeting: includeGreeting as boolean | undefined,
    };
  }
  return {
    email: {
      subject: reqString(e, 'subject'),
      body: reqString(e, 'body'),
      from: reqString(e, 'from'),
      to: optString(e, 'to'),
    },
    options,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders — RESEARCH Q7 me documented service prompt logic se grounded.
// Har builder ke upar source file:line hai. EXACT system prompts service files ke
// andar hain (yahan fetch nahi hue) — ye builders schema-grounded approximations hain.
// TODO(UNVERIFIED): merge-time par services ko apne prompt builders expose karne chahiye
// (prompt-builder drift follow-up — NOTES.md §8) taaki sync aur stream prompts kabhi diverge na hon.
// ---------------------------------------------------------------------------

// Source: services/ai-summarize.service.ts:38 — AISummarizeService.summarizeSingle → AIEngine.infer()
function buildSummarizePrompt(b: SummarizeBody): string {
  return [
    'Summarize the following email for a busy reader.',
    'Return a concise summary followed by 3-5 key points.',
    '',
    `From: ${b.from}`,
    `Subject: ${b.subject}`,
    '',
    b.body,
  ].join('\n');
}

// Source: services/ai-summarize.service.ts:38 — AISummarizeService.summarizeThread → AIEngine.infer()
// (service file lines 5-17 define ThreadMessage: { from, subject, body, date? })
function buildSummarizeThreadPrompt(b: SummarizeThreadBody): string {
  const msgs = b.messages
    .map(
      (m, i) =>
        `--- Message ${i + 1} ---\nFrom: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date ?? 'unknown'}\n\n${m.body}`,
    )
    .join('\n\n');
  return [
    `Summarize the following email thread (${b.messages.length} messages).`,
    'Return: a concise summary, key points, and action items.',
    '',
    msgs,
  ].join('\n');
}

// Source: services/ai-triage.service.ts:28 — AITriageService.triage → AIEngine.infer()
function buildTriagePrompt(b: TriageBody): string {
  return [
    'Triage the following email.',
    'Classify it into exactly one category: act_now | delegate | read_later | ignore.',
    'Respond with JSON only: {"category": "...", "reason": "...", "urgency": 0.0-1.0, "suggestedAction": "..."}',
    '',
    `From: ${b.from}`,
    `Subject: ${b.subject}`,
    `Received: ${b.receivedAt ?? 'unknown'}`,
    '',
    b.body,
  ].join('\n');
}

// Source: services/ai-compose.service.ts:43 — AIComposeService.composeFromBullets → AIEngine.infer()
function buildComposePrompt(b: ComposeBody): string {
  const ctx = b.context ?? {};
  const lines = ['Compose a complete email from the following bullet points.'];
  if (ctx.recipient) lines.push(`Recipient: ${ctx.recipient}`);
  if (ctx.subject) lines.push(`Subject: ${ctx.subject}`);
  if (ctx.tone) lines.push(`Tone: ${ctx.tone}`);
  if (ctx.format) lines.push(`Format: ${ctx.format}`);
  lines.push('', 'Bullet points:');
  for (const bullet of b.bullets) lines.push(`- ${bullet}`);
  return lines.join('\n');
}

// Source: services/ai-compose.service.ts — AIComposeService.improveEmail → AIEngine.infer()
function buildImprovePrompt(b: ImproveBody): string {
  return [
    'Improve the following email draft according to the instructions.',
    'Return the improved email body.',
    '',
    `Instructions: ${b.instructions}`,
    '',
    'Draft:',
    b.draft,
  ].join('\n');
}

// Source: services/ai-reply.service.ts:6-23 — AIReplyService.draftReply → AIEngine.infer()
// (optionally enriched by UserStyleMemory profile — streaming path me style enrichment
// TODO(UNVERIFIED): merge-time par UserStyleMemory lookup add karna hai ya nahi)
function buildReplyPrompt(b: ReplyBody): string {
  const o = b.options ?? {};
  const lines = ['Draft a reply to the following email.'];
  if (o.tone) lines.push(`Tone: ${o.tone}`);
  if (typeof o.maxLength === 'number') lines.push(`Maximum length: ${o.maxLength} characters`);
  if (o.includeGreeting === false) lines.push('Do not include a greeting.');
  lines.push(
    '',
    `From: ${b.email.from}`,
    `To: ${b.email.to ?? 'unknown'}`,
    `Subject: ${b.email.subject}`,
    '',
    b.email.body,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Model selection — RESEARCH Q2 ke resolveTierModel-jaisi tier mapping.
// Exact names RESEARCH se: per-tier env pins AI_MODEL_FAST / AI_MODEL_BALANCED / AI_MODEL_DEEP
// (env ONLY — request body se kabhi nahi; deliberate SSRF guard, ai-provider.service.ts).
// Default model: cloudflare `@cf/meta/llama-3.1-70b-instruct` (AI_PROVIDER default).
// TODO(UNVERIFIED): resolveTierModel ke exact tier names/behavior — merge-time par
// apps/quantmail/backend/services/ai-provider.service.ts se confirm karo.
// ---------------------------------------------------------------------------

export type ModelTier = 'fast' | 'balanced' | 'deep';

function resolveModel(tier: ModelTier, override?: string): string {
  if (override) return override;
  const pins: Record<ModelTier, string | undefined> = {
    fast: process.env.AI_MODEL_FAST,
    balanced: process.env.AI_MODEL_BALANCED,
    deep: process.env.AI_MODEL_DEEP,
  };
  return pins[tier] ?? process.env.AI_MODEL ?? '@cf/meta/llama-3.1-70b-instruct';
}

// ---------------------------------------------------------------------------
// Endpoint table — 6 streaming endpoints is shift me.
// Baaki 9 candidates (attachment-summary, contact-context, followup/*, meeting-extract,
// send-time, style/*, tone-shift, triage/batch) next shift — NOTES.md §11.
// ---------------------------------------------------------------------------

interface EndpointDef<B> {
  /** route path segment: /stream/<name> (plugin prefix /api/v1/ai ke saath register hota hai) */
  name: string;
  tier: ModelTier;
  parseBody: (body: unknown) => B;
  buildPrompt: (body: B) => string;
}

const ENDPOINTS: EndpointDef<any>[] = [
  { name: 'summarize', tier: 'balanced', parseBody: parseSummarizeBody, buildPrompt: buildSummarizePrompt },
  {
    name: 'summarize-thread',
    tier: 'balanced',
    parseBody: parseSummarizeThreadBody,
    buildPrompt: buildSummarizeThreadPrompt,
  },
  { name: 'reply', tier: 'balanced', parseBody: parseReplyBody, buildPrompt: buildReplyPrompt },
  { name: 'compose', tier: 'balanced', parseBody: parseComposeBody, buildPrompt: buildComposePrompt },
  {
    name: 'compose/improve',
    tier: 'balanced',
    parseBody: parseImproveBody,
    buildPrompt: buildImprovePrompt,
  },
  { name: 'triage', tier: 'fast', parseBody: parseTriageBody, buildPrompt: buildTriagePrompt },
] as EndpointDef<any>[];

interface HandlerCtx {
  streamProvider: AIStreamProvider;
  metering: StreamMetering;
  rateLimiter: { check(userId: string): RateLimitResult };
  streamsPerMin: number;
  modelOverride?: string;
  heartbeatMs?: number;
}

function toErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.length > 0 ? code : 'STREAM_FAILED';
}

function toAppError(err: unknown): AppErrorShape {
  if ((err as AppErrorShape | null)?.statusCode) return err as AppErrorShape;
  // TODO(UNVERIFIED): error-message sanitization policy security-audit program se confirm karo.
  // Prompt/body kabhi message me echo nahi hota — provider errors yahan generic wrap hote hain.
  return appError(502, 'AI_UNAVAILABLE', 'AI streaming failed before the first byte');
}

function makeStreamHandler<B>(def: EndpointDef<B>, ctx: HandlerCtx) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startedAt = Date.now();
    const log = (req as unknown as { log?: { error(o: object, m: string): void } }).log;

    // (a) auth — hijack se PEHLE
    const userId = reqUserId(req);

    // (b) zod-exact validation — hijack se PEHLE (400 JSON path)
    const body = def.parseBody((req as unknown as { body?: unknown }).body);

    // (c) per-user rate limit — hijack se PEHLE (429 JSON path)
    const rl = ctx.rateLimiter.check(userId);
    if (!rl.ok) {
      reply.header('Retry-After', String(rl.retryAfterSec));
      throw appError(
        429,
        'RATE_LIMITED',
        `AI stream rate limit exceeded (${ctx.streamsPerMin}/min per user)`,
      );
    }

    // (d) UsageGate reserve — fail-closed, hijack se PEHLE (402/429 JSON path)
    const prompt = def.buildPrompt(body);
    const estTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const reservation = await ctx.metering.reserve(userId, estTokens);
    if (!reservation.ok) {
      const status = reservation.code === 'QUOTA_EXHAUSTED' ? 429 : 402;
      throw appError(status, reservation.code, 'AI usage allowance exhausted for this request');
    }

    const model = resolveModel(def.tier, ctx.modelOverride);
    const requestId =
      (req as unknown as { id?: unknown }).id ??
      // fallback jab request.id decorate na hua ho
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    // (e) SSE stream — hijack YAHAN hota hai; iske baad sirf frames ya throw.
    const stream = createSseStream(reply, req, { startedAt, heartbeatMs: ctx.heartbeatMs });

    try {
      // Provider setup error (e.g. AI not configured) first byte se pehle throw karega
      // → close + throw (pre-first-byte error path; client ko [DONE] kabhi nahi milega = failure).
      const iterable = ctx.streamProvider.streamText(prompt, { signal: stream.signal, model });

      stream.writeMeta(String(requestId), model); // FIRST BYTE

      for await (const delta of iterable) {
        if (stream.aborted) break; // client disconnect → loop chhodo, provider abort ho chuka hai
        if (typeof delta !== 'string' || delta.length === 0) continue;
        stream.writeToken(delta);
      }

      if (stream.aborted) {
        stream.close(); // reconnect = naya request; adhoora stream resume nahi hota
        return;
      }

      // usage — provider token counts unknown → -1
      // TODO(UNVERIFIED): AIEngine.stream ke StreamChunk me token counts hain ya nahi (engine.ts:456)
      stream.writeUsage(-1, -1);
      stream.done(); // data: [DONE]
    } catch (err) {
      if (!stream.firstByteSent) {
        stream.close();
        throw toAppError(err);
      }
      // Mid-stream error: error frame bhejkar close — kabhi JSON nahi, [DONE] nahi.
      // Prompt/PII kabhi log nahi — sirf requestId + code.
      try {
        log?.error({ requestId: String(requestId), code: toErrorCode(err) }, 'ai stream failed mid-stream');
      } catch {
        /* logging must never break the stream */
      }
      stream.writeError(toErrorCode(err), 'AI stream failed');
    } finally {
      // Reservation hamesha settle — success, error, ya abort.
      // TODO(UNVERIFIED): actualTokens real counts se aane chahiye (StreamChunk counts, upar dekho).
      try {
        await ctx.metering.settle(userId, reservation.reservationId, -1);
      } catch {
        /* metering failure must never break the stream */
      }
      stream.close(); // heartbeat timer clear; idempotent
    }
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AIStreamingOptions {
  streamProvider: AIStreamProvider;
  metering?: StreamMetering;
  /** per-user streams per minute; default 30 */
  rateLimitPerMin?: number;
  /** merge-time: env AI_MODEL / tier pins se set karo; request body se KABHI nahi */
  modelOverride?: string;
  heartbeatMs?: number;
}

export async function aiStreamingRoutes(
  fastify: FastifyInstance,
  opts: AIStreamingOptions,
): Promise<void> {
  if (!opts || typeof opts.streamProvider?.streamText !== 'function') {
    // Fail-fast: bina provider ke register karna = saare streams AI_UNAVAILABLE honge.
    // Merge-time par provider absent ho to plugin register hi mat karo (disabled-mode).
    throw new Error('aiStreamingRoutes: opts.streamProvider.streamText is required');
  }
  const streamsPerMin = opts.rateLimitPerMin ?? 30;
  const ctx: HandlerCtx = {
    streamProvider: opts.streamProvider,
    metering: opts.metering ?? noopMetering,
    rateLimiter: createTokenBucketRateLimiter(streamsPerMin),
    streamsPerMin,
    modelOverride: opts.modelOverride,
    heartbeatMs: opts.heartbeatMs,
  };
  for (const def of ENDPOINTS) {
    fastify.post(`/stream/${def.name}`, makeStreamHandler(def as EndpointDef<unknown>, ctx));
  }
}

export default aiStreamingRoutes;
