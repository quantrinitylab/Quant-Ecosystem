// ============================================================================
// @quant/common — AI reasoning intent
// ============================================================================
//
// The settings page has a four-option picker headed "How much thinking", and
// until now it wrote `quant-ai-model-mode` to `localStorage` and stopped. A
// `git grep` for that key returned three hits, all of them inside the page that
// writes it: its own restore effect and its own click handler. No request path
// consulted it. The card above the picker nonetheless told the user their choice
// was "sent with each request as an intent", and each option described distinct
// behaviour — "answers immediately", "takes noticeably longer and thinks
// harder" — so the page was asserting four behaviours over one code path that
// hardcoded `{ maxTokens: 1024, temperature: 0.6 }` for every caller.
//
// This module is the vocabulary both halves now share. It lives in
// `@quant/common` because that is the one package both `tsconfig.json` (the Next
// app) and `tsconfig.backend.json` (Fastify) map, so the client that sends an
// intent and the route that honours it cannot drift into two different lists.
//
// What a tier actually changes, and nothing more than this:
//
//   1. `maxTokens`  — how long an answer may be.
//   2. `directive`  — a system line asking for that much reasoning.
//   3. `timeoutMs`  — how long the provider is given, and (derived) how long the
//                     client waits, so a slow tier cannot be aborted by a caller
//                     that was written against a faster one.
//   4. `modelEnvVar` — the env var a deployment may point at a different model
//                     for this tier. Unset means the tier runs on the default
//                     model, which is the honest common case.
//
// It deliberately does NOT vary `temperature`: the "Precise / Balanced /
// Creative" pills that claimed exact temperatures were deleted from settings for
// quoting numbers no request carried, and reintroducing a hidden temperature
// spread would be the same defect with the label removed.
// ============================================================================

/** The four ids a client may send. `auto` is the default and resolves per request. */
export const AI_INTENTS = ['auto', 'fast', 'balanced', 'deep'] as const;
export type AIIntent = (typeof AI_INTENTS)[number];

/** The three tiers `auto` can resolve to. `auto` never survives resolution. */
export const AI_TIERS = ['fast', 'balanced', 'deep'] as const;
export type AITier = (typeof AI_TIERS)[number];

export function isAIIntent(value: unknown): value is AIIntent {
  return typeof value === 'string' && (AI_INTENTS as readonly string[]).includes(value);
}

/**
 * A resolved plan. Every field here is consumed by real code: `maxTokens`,
 * `timeoutMs` and `model` reach the provider transport, `directive` is appended
 * to the system prompt, and `clientTimeoutMs` is what the browser's `AbortController`
 * uses. Nothing in it is decoration.
 */
export interface AIIntentPlan {
  /** What the request will actually run as. Never `auto`. */
  tier: AITier;
  /** True when `auto` chose the tier rather than the user naming it. */
  routed: boolean;
  /** Answer-length budget handed to the provider. */
  maxTokens: number;
  /** How long the provider is given before the server aborts it. */
  timeoutMs: number;
  /**
   * How long the *browser* should wait. Strictly greater than `timeoutMs` so a
   * slow tier fails as a server-side provider timeout with a real error body,
   * not as a client abort that looks like a dead network.
   */
  clientTimeoutMs: number;
  /** A system line asking for this much reasoning. Sent verbatim. */
  directive: string;
  /**
   * The env var a deployment may set to run this tier on a different model.
   * Unset in env means the tier uses the provider's default model — so the UI
   * must not promise a different engine, only a different budget.
   */
  modelEnvVar: 'AI_MODEL_FAST' | 'AI_MODEL_BALANCED' | 'AI_MODEL_DEEP';
}

/**
 * The three tiers, as data. `clientTimeoutMs` is derived rather than written so
 * the two halves of the timeout cannot be edited apart: the drawer used to
 * hardcode `REQUEST_TIMEOUT_MS = 45_000` against a provider default of 40_000,
 * a 5 s margin nobody had written down.
 */
const CLIENT_TIMEOUT_MARGIN_MS = 6_000;

const TIERS: Record<AITier, Omit<AIIntentPlan, 'tier' | 'routed' | 'clientTimeoutMs'>> = {
  fast: {
    maxTokens: 320,
    timeoutMs: 15_000,
    directive:
      'Answer in at most three sentences. Lead with the answer itself. Do not restate the question, do not add caveats, and do not offer follow-up suggestions.',
    modelEnvVar: 'AI_MODEL_FAST',
  },
  balanced: {
    maxTokens: 1_024,
    timeoutMs: 40_000,
    directive:
      'Give a complete but economical answer: a short paragraph, or a tight list when the answer is genuinely a list. No preamble and no summary of what you just said.',
    modelEnvVar: 'AI_MODEL_BALANCED',
  },
  deep: {
    maxTokens: 3_072,
    timeoutMs: 75_000,
    directive:
      'Work the problem before answering. Read the whole on-screen context, state any assumption you had to make, cover the cases that could change the answer, and then answer thoroughly. Length is not a constraint here; padding still is.',
    modelEnvVar: 'AI_MODEL_DEEP',
  },
};

/**
 * Everything `auto` is allowed to look at. All three are counted off the request
 * body itself, which matters: the settings card used to claim routing "shifts
 * with load and health", and no load or health signal exists anywhere in this
 * request path. Size and depth of the conversation do exist, so those are what
 * `auto` may use and what the UI may describe.
 */
export interface AIRequestSignals {
  /** Characters across every turn the client sent. */
  promptChars: number;
  /** Characters of on-screen context (route, subject, selection, screen text). */
  contextChars: number;
  /** How many turns the conversation has accumulated. */
  turnCount: number;
}

/** A short question with no page context and no history: nothing to think about. */
const AUTO_FAST_PROMPT_CHARS = 240;
const AUTO_FAST_CONTEXT_CHARS = 600;
const AUTO_FAST_TURNS = 2;

/** A long request, or a conversation with real state behind it. */
const AUTO_DEEP_TOTAL_CHARS = 4_000;
const AUTO_DEEP_TURNS = 8;

/** Which tier `auto` picks, exported so a test can pin the boundaries. */
export function routeAutoTier(signals: AIRequestSignals): AITier {
  const total = Math.max(0, signals.promptChars) + Math.max(0, signals.contextChars);
  if (total >= AUTO_DEEP_TOTAL_CHARS || signals.turnCount >= AUTO_DEEP_TURNS) return 'deep';
  if (
    signals.promptChars <= AUTO_FAST_PROMPT_CHARS &&
    signals.contextChars <= AUTO_FAST_CONTEXT_CHARS &&
    signals.turnCount <= AUTO_FAST_TURNS
  ) {
    return 'fast';
  }
  return 'balanced';
}

const NO_SIGNALS: AIRequestSignals = { promptChars: 0, contextChars: 0, turnCount: 0 };

/**
 * Turn an intent into a plan. `auto` (and anything unrecognised, including
 * `undefined` from a client that predates this field) routes on the signals;
 * a named tier is honoured exactly.
 */
export function resolveAIIntent(
  intent: AIIntent | string | undefined,
  signals: AIRequestSignals = NO_SIGNALS,
): AIIntentPlan {
  const named = isAIIntent(intent) && intent !== 'auto' ? intent : null;
  const tier: AITier = named ?? routeAutoTier(signals);
  const spec = TIERS[tier];
  return {
    tier,
    routed: named === null,
    maxTokens: spec.maxTokens,
    timeoutMs: spec.timeoutMs,
    clientTimeoutMs: spec.timeoutMs + CLIENT_TIMEOUT_MARGIN_MS,
    directive: spec.directive,
    modelEnvVar: spec.modelEnvVar,
  };
}

/**
 * Count the signals off a message list and a context object. Both halves of the
 * stack call this so `auto` decides the same way whether the client is
 * pre-computing an estimate or the route is measuring what actually arrived.
 */
export function measureAISignals(
  messages: ReadonlyArray<{ content?: string | null }>,
  context?: Readonly<Record<string, unknown>> | null,
): AIRequestSignals {
  const promptChars = messages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
  const contextChars = context
    ? Object.values(context).reduce<number>(
        (sum, v) => sum + (typeof v === 'string' ? v.length : 0),
        0,
      )
    : 0;
  return { promptChars, contextChars, turnCount: messages.length };
}

/**
 * The `localStorage` key the settings picker writes. Exported so the page that
 * writes it and the request paths that read it cannot disagree about the string;
 * three hand-written copies of it is how the value came to have no readers.
 */
export const AI_INTENT_STORAGE_KEY = 'quant-ai-model-mode';

/**
 * Browsers already hold values this enum does not contain. `auto-router` was the
 * id the picker shipped with; older builds stored raw model names. Anything
 * unrecognised falls back to `auto`, which is also the default for a fresh
 * profile, so a stale value degrades to per-request routing rather than to an
 * arbitrary tier.
 */
export function normalizeStoredIntent(stored: string | null | undefined): AIIntent {
  if (!stored) return 'auto';
  if (isAIIntent(stored)) return stored;
  if (stored === 'auto-router' || stored === 'router' || stored === 'balanced-auto') return 'auto';
  return 'auto';
}

/**
 * The thresholds `auto` routes on, exported so the settings page can describe the
 * rule with the real numbers rather than a paraphrase that goes stale. No prose
 * lives here: a second copy of the description is a second thing to forget.
 */
export const AI_AUTO_THRESHOLDS = {
  fastPromptChars: AUTO_FAST_PROMPT_CHARS,
  fastContextChars: AUTO_FAST_CONTEXT_CHARS,
  fastTurns: AUTO_FAST_TURNS,
  deepTotalChars: AUTO_DEEP_TOTAL_CHARS,
  deepTurns: AUTO_DEEP_TURNS,
} as const;
