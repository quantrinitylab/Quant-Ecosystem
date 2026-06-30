// ============================================================================
// QuantSync - Engine-backed Anonymous Moderator
// ============================================================================
//
// Replaces the tiny inline regex denylist (DefaultAnonymousModerator) with the
// real @quant/moderation TextModerator (ML classification via the OpenAI
// moderation API) while keeping a hard, always-on local denylist as a
// fail-closed pre-filter (defense in depth).
//
// Fail modes:
//   - Local denylist ALWAYS runs first and blocks clearly-illegal markers even
//     when no ML provider is configured.
//   - When a moderation API key is configured (MODERATION_API_KEY /
//     OPENAI_API_KEY) the ML engine runs and blocks high-confidence verdicts.
//     If the live API call throws, the post is BLOCKED (fail-closed), never
//     silently allowed.
//   - When STRICT mode is requested but no ML provider is configured, every
//     post is blocked (fail-closed) rather than degrading to denylist-only.
//
// Live OpenAI moderation is not reachable from the sandbox; the SDK wiring +
// fail-closed behaviour are unit tested with an injected client. End-to-end
// against the real API is a needs-staging step.

import { TextModerator } from '@quant/moderation';
import type { ModerationAPIClient } from '@quant/moderation';
import type { ContentModerator } from './anonymous-post.service';

const MAX_CONTENT = 50000;

// Hard local denylist of clearly-illegal-content markers. Always enforced,
// independent of the ML provider, so the worst content is blocked even in dev.
const DENY: readonly RegExp[] = [/\bcsam\b/i, /child\s*porn/i, /\bhow to (make|build) a bomb\b/i];

// ML verdicts that block an anonymous post. 'approve' and 'warn' are allowed.
const BLOCKING_ACTIONS: ReadonlySet<string> = new Set(['remove', 'flag', 'restrict']);

export interface EngineAnonymousModeratorOptions {
  /** Injected client (tests). When omitted, built from env. */
  apiClient?: ModerationAPIClient;
  /**
   * Require an ML provider. When true and no client is configured, every post
   * is blocked (fail-closed). Defaults to env ANON_MODERATION_STRICT === '1'.
   */
  strict?: boolean;
}

/**
 * Build an OpenAI-backed moderation client from env. Returns undefined when no
 * key is configured. Mirrors the moderation-worker's text client so QuantSync
 * uses the same provider contract.
 */
export function createTextClientFromEnv(): ModerationAPIClient | undefined {
  const apiKey = process.env['MODERATION_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) return undefined;
  return {
    moderateText: async (input: string) => {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input }),
      });
      if (!response.ok) {
        throw new Error(`Moderation API returned ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as {
        results: Array<{
          category_scores: {
            hate: number;
            harassment: number;
            'self-harm': number;
            sexual: number;
            violence: number;
          };
          categories: {
            hate: boolean;
            harassment: boolean;
            'self-harm': boolean;
            sexual: boolean;
            violence: boolean;
          };
        }>;
      };
      const result = data.results[0]!;
      return {
        hate: { flagged: result.categories.hate, score: result.category_scores.hate },
        harassment: {
          flagged: result.categories.harassment,
          score: result.category_scores.harassment,
        },
        selfHarm: {
          flagged: result.categories['self-harm'],
          score: result.category_scores['self-harm'],
        },
        sexual: { flagged: result.categories.sexual, score: result.category_scores.sexual },
        violence: { flagged: result.categories.violence, score: result.category_scores.violence },
      };
    },
  };
}

export class EngineAnonymousModerator implements ContentModerator {
  private readonly moderator: TextModerator | undefined;
  private readonly strict: boolean;

  constructor(options: EngineAnonymousModeratorOptions = {}) {
    const client = options.apiClient ?? createTextClientFromEnv();
    this.moderator = client ? new TextModerator(client) : undefined;
    this.strict = options.strict ?? process.env['ANON_MODERATION_STRICT'] === '1';
  }

  async check(content: string): Promise<{ allowed: boolean; reason?: string }> {
    const text = content.trim();
    if (!text) return { allowed: false, reason: 'Empty content' };
    if (text.length > MAX_CONTENT) return { allowed: false, reason: 'Content too long' };

    // 1) Hard local denylist — always enforced, fail-closed.
    for (const rx of DENY) {
      if (rx.test(text)) return { allowed: false, reason: 'Content violates policy' };
    }

    // 2) ML engine when configured.
    if (!this.moderator) {
      if (this.strict) {
        return { allowed: false, reason: 'Moderation provider unavailable' };
      }
      return { allowed: true };
    }

    try {
      const result = await this.moderator.moderate(text);
      if (BLOCKING_ACTIONS.has(result.action)) {
        const flags = result.flags.length ? result.flags.join(', ') : result.action;
        return { allowed: false, reason: `Content flagged: ${flags}` };
      }
      return { allowed: true };
    } catch {
      // Provider error => fail closed (never silently allow).
      return { allowed: false, reason: 'Moderation check failed' };
    }
  }
}
