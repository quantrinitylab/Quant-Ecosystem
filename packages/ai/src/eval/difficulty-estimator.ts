// ============================================================================
// Difficulty estimator (V3.0 — EXPERIMENTAL, eval-only)
//
// Deterministic, zero-latency heuristic that bins a prompt into
// trivial/standard/hard/frontier. This is the candidate input signal for V3
// cascade routing (AI_ENGINE_V3_RESEARCH §3).
//
// DELIBERATELY lives in eval/, NOT core/: it is not wired into production
// routing and must not be until it clears the routing-eval gates (V3.1),
// exactly as the memory subsystem earned its wiring through M11 gates.
// Research question #1: can difficulty estimation reach ≥85% routing accuracy
// at <5ms overhead? This module + routing-eval.ts exist to answer that.
// ============================================================================

import type { Difficulty } from './routing-datasets';

export interface DifficultySignals {
  /** Approximate token count (words × 1.3). */
  tokens: number;
  /** Deep-reasoning verbs: invariants, race conditions, consensus… */
  reasoningVerbs: number;
  /** Multi-step / planning markers: step by step, phases, diagnose, propose… */
  multiStepMarkers: number;
  /** Constraint density: requirements, must/without/at least, enumerations. */
  constraints: number;
  /** Design/synthesis scope: architecture, trade-offs, compare, cost model… */
  synthesisScope: number;
  /** Research-grade markers: prove, derive, counterexample, survey… */
  frontierMarkers: number;
  /** Trivial-intent markers: greetings, acks, single micro-edits. */
  trivialMarkers: number;
}

export interface DifficultyEstimate {
  difficulty: Difficulty;
  /** Raw additive score the bin was derived from (for threshold analysis). */
  score: number;
  signals: DifficultySignals;
}

const REASONING_VERBS =
  /\b(invariant|correctness|complexity|safety property|race condition|idempoten|consensus|deterministic)\w*/gi;
const MULTI_STEP =
  /\b(step by step|walk through|phases?|plan out|lay out|in order|reason through|diagnose|propose|discuss|explain analyze|optimi[sz]e|rewrite|migration|zero.downtime|reversible)\w*/gi;
const CONSTRAINTS =
  /\b(must|without|at least|requirements?|constraints?|no data loss|sub-\d+|latency|gdpr|residency|budget|deadline)\b/gi;
const SYNTHESIS =
  /\b(architecture|design a|compare|trade-?offs?|topolog|failure modes?|cost model|experiment|recommend|multi-region|distributed)\w*/gi;
const FRONTIER_MARKERS =
  /\b(prove|derive|counterexample|formally|theorem|survey|first principles|design an experiment)\w*/gi;
const TRIVIAL =
  /^(hi|hey|hello|thanks?[.!,\s]|ok|yes|no)\b|\b(uppercase|lowercase|fix the typo|add a smiley|what day|is \d+ an? (odd|even))\b/i;
const QUICK_TASK =
  /\b(summari[sz]e|translate|draft|write an? \w+ (function|email|script|query|message|note|letter)|write a (short|polite|quick)|reply|regex|rename|suggest (a few|five|some) names?)\b/i;

function count(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/**
 * Estimate prompt difficulty. Deterministic; O(prompt length); no I/O.
 * Intent signals dominate raw length — length alone is a known trap
 * (see the `traps` scenario in routing-datasets.ts).
 */
export function estimateDifficulty(prompt: string): DifficultyEstimate {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  const signals: DifficultySignals = {
    tokens: Math.round(words * 1.3),
    reasoningVerbs: count(prompt, REASONING_VERBS),
    multiStepMarkers: count(prompt, MULTI_STEP),
    constraints: count(prompt, CONSTRAINTS),
    synthesisScope: count(prompt, SYNTHESIS),
    frontierMarkers: count(prompt, FRONTIER_MARKERS),
    trivialMarkers: TRIVIAL.test(prompt.trim()) ? 1 : 0,
  };

  // Intent-weighted score. Length contributes only weakly (capped).
  let score = 0;
  score += Math.min(signals.tokens / 60, 2); // ≤2 points from length alone
  score += signals.reasoningVerbs * 2.5;
  score += signals.multiStepMarkers * 1.5;
  score += signals.constraints * 0.75;
  score += signals.synthesisScope * 1.25;
  score += signals.frontierMarkers * 2;

  // Explicit trivial intent overrides accumulated length noise.
  if (signals.trivialMarkers > 0 && signals.reasoningVerbs === 0 && signals.synthesisScope === 0) {
    return { difficulty: 'trivial', score: 0, signals };
  }
  // Recognized single-step task with no deep-reasoning signals → standard.
  if (
    QUICK_TASK.test(prompt) &&
    signals.reasoningVerbs === 0 &&
    signals.multiStepMarkers === 0 &&
    signals.frontierMarkers === 0 &&
    signals.synthesisScope <= 1
  ) {
    return { difficulty: 'standard', score: Math.min(score, 3), signals };
  }

  // Research-grade intent (≥2 distinct frontier markers) or extreme scope.
  const difficulty: Difficulty =
    signals.frontierMarkers >= 2 || score >= 16
      ? 'frontier'
      : score >= 5
        ? 'hard'
        : score >= 1.25
          ? 'standard'
          : 'trivial';
  return { difficulty, score, signals };
}
