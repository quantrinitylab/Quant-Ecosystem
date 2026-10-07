// ============================================================================
// AI reasoning intent - Tests
// ============================================================================
//
// The picker these tiers sit behind shipped with four described behaviours and
// one code path, so the tests that matter are the ones that would go red if a
// tier stopped differing: the boundaries `auto` routes on, and the fact that
// each tier's numbers are actually distinct.

import { describe, it, expect } from 'vitest';
import {
  AI_AUTO_THRESHOLDS,
  AI_INTENTS,
  AI_TIERS,
  isAIIntent,
  measureAISignals,
  normalizeStoredIntent,
  resolveAIIntent,
  routeAutoTier,
} from '../ai-intent';

const signals = (promptChars: number, contextChars = 0, turnCount = 1) => ({
  promptChars,
  contextChars,
  turnCount,
});

describe('isAIIntent', () => {
  it('accepts exactly the four published ids', () => {
    for (const id of AI_INTENTS) expect(isAIIntent(id)).toBe(true);
    expect(AI_INTENTS).toHaveLength(4);
  });

  it('rejects the legacy id, model names, and non-strings', () => {
    for (const value of ['auto-router', 'gpt-4o-mini', '', null, undefined, 3, {}]) {
      expect(isAIIntent(value)).toBe(false);
    }
  });
});

describe('routeAutoTier', () => {
  it('sends a short, context-free, first-turn question to fast', () => {
    expect(routeAutoTier(signals(40, 0, 1))).toBe('fast');
  });

  it('leaves fast the moment any one of the three fast conditions is exceeded', () => {
    expect(routeAutoTier(signals(241, 0, 1))).toBe('balanced');
    expect(routeAutoTier(signals(40, 601, 1))).toBe('balanced');
    expect(routeAutoTier(signals(40, 0, 3))).toBe('balanced');
  });

  it('holds fast exactly at each boundary', () => {
    expect(routeAutoTier(signals(240, 600, 2))).toBe('fast');
  });

  it('escalates to deep on total size, counting prompt and context together', () => {
    expect(routeAutoTier(signals(3_999, 0, 1))).toBe('balanced');
    expect(routeAutoTier(signals(2_000, 2_000, 1))).toBe('deep');
  });

  it('escalates to deep on conversation depth alone', () => {
    expect(routeAutoTier(signals(20, 0, 7))).toBe('balanced');
    expect(routeAutoTier(signals(20, 0, 8))).toBe('deep');
  });

  it('does not let a negative count subtract from the total', () => {
    expect(routeAutoTier(signals(-10_000, 5_000, 1))).toBe('deep');
  });
});

describe('resolveAIIntent', () => {
  it('honours a named tier and ignores the signals entirely', () => {
    const plan = resolveAIIntent('fast', signals(9_000, 9_000, 20));
    expect(plan.tier).toBe('fast');
    expect(plan.routed).toBe(false);
  });

  it('marks an auto-resolved plan as routed', () => {
    const plan = resolveAIIntent('auto', signals(9_000));
    expect(plan.tier).toBe('deep');
    expect(plan.routed).toBe(true);
  });

  it('treats a missing or unknown intent as auto rather than throwing', () => {
    expect(resolveAIIntent(undefined, signals(40)).tier).toBe('fast');
    expect(resolveAIIntent('auto-router', signals(40)).tier).toBe('fast');
    expect(resolveAIIntent('gpt-4o', signals(40)).routed).toBe(true);
  });

  it('defaults the signals so a caller with nothing to measure still gets a plan', () => {
    expect(resolveAIIntent('auto').tier).toBe('fast');
  });

  // The whole point of the picker. If two tiers ever collapse onto the same
  // budget, the settings copy starts describing a difference that is not there.
  it('gives every tier a distinct token budget and timeout', () => {
    const plans = AI_TIERS.map((tier) => resolveAIIntent(tier));
    expect(new Set(plans.map((p) => p.maxTokens)).size).toBe(AI_TIERS.length);
    expect(new Set(plans.map((p) => p.timeoutMs)).size).toBe(AI_TIERS.length);
    expect(new Set(plans.map((p) => p.directive)).size).toBe(AI_TIERS.length);
    expect(new Set(plans.map((p) => p.modelEnvVar)).size).toBe(AI_TIERS.length);
  });

  it('orders the budgets fast < balanced < deep', () => {
    const [fast, balanced, deep] = AI_TIERS.map((t) => resolveAIIntent(t));
    expect(fast!.maxTokens).toBeLessThan(balanced!.maxTokens);
    expect(balanced!.maxTokens).toBeLessThan(deep!.maxTokens);
    expect(fast!.timeoutMs).toBeLessThan(balanced!.timeoutMs);
    expect(balanced!.timeoutMs).toBeLessThan(deep!.timeoutMs);
  });

  // A client that aborts before the server does turns a slow answer into what
  // looks like a dead network, which is the failure the drawer's hardcoded
  // 45 s timeout would have produced against the 75 s deep tier.
  it('always leaves the client more patience than the server', () => {
    for (const tier of AI_TIERS) {
      const plan = resolveAIIntent(tier);
      expect(plan.clientTimeoutMs).toBeGreaterThan(plan.timeoutMs);
    }
  });
});

describe('measureAISignals', () => {
  it('counts turns, prompt characters and string context together', () => {
    const measured = measureAISignals([{ content: 'a'.repeat(10) }, { content: 'b'.repeat(5) }], {
      route: '/inbox',
      screenText: 'x'.repeat(100),
    });
    expect(measured).toEqual({ promptChars: 15, contextChars: 106, turnCount: 2 });
  });

  it('survives empty, null and non-string members', () => {
    const measured = measureAISignals([{ content: null }, {}], {
      route: 'ab',
      depth: 4,
      flag: true,
    });
    expect(measured).toEqual({ promptChars: 0, contextChars: 2, turnCount: 2 });
  });

  it('treats a missing context as zero rather than as an error', () => {
    expect(measureAISignals([{ content: 'hi' }]).contextChars).toBe(0);
    expect(measureAISignals([], null).turnCount).toBe(0);
  });
});

describe('normalizeStoredIntent', () => {
  it('passes a current id through', () => {
    for (const id of AI_INTENTS) expect(normalizeStoredIntent(id)).toBe(id);
  });

  it('migrates the id the picker actually shipped with', () => {
    expect(normalizeStoredIntent('auto-router')).toBe('auto');
  });

  it('falls back to auto for an empty, absent or stale value', () => {
    for (const value of [null, undefined, '', 'gpt-4o-mini', '@cf/meta/llama-3.1-70b-instruct']) {
      expect(normalizeStoredIntent(value)).toBe('auto');
    }
  });
});

describe('AI_AUTO_THRESHOLDS', () => {
  // The settings page interpolates these into the sentence describing what
  // `auto` does. If a threshold moves and the exported number does not, the page
  // starts describing a rule the router no longer follows — which is the exact
  // failure this whole change exists to remove.
  it('reports the boundaries routeAutoTier actually uses', () => {
    const t = AI_AUTO_THRESHOLDS;
    expect(routeAutoTier(signals(t.fastPromptChars, t.fastContextChars, t.fastTurns))).toBe('fast');
    expect(routeAutoTier(signals(t.fastPromptChars + 1, t.fastContextChars, t.fastTurns))).toBe(
      'balanced',
    );
    expect(routeAutoTier(signals(t.deepTotalChars, 0, 1))).toBe('deep');
    expect(routeAutoTier(signals(t.deepTotalChars - 1, 0, 1))).toBe('balanced');
    expect(routeAutoTier(signals(1, 0, t.deepTurns))).toBe('deep');
    expect(routeAutoTier(signals(1, 0, t.deepTurns - 1))).toBe('balanced');
  });
});
