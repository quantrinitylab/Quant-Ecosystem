// ============================================================================
// Routing-difficulty datasets (V3.0 — AI_ENGINE_V3_RESEARCH §3, offline only)
//
// Labeled prompts for measuring DIFFICULTY-ESTIMATION quality. Difficulty is
// the input the V3 cascade router needs: trivial/standard traffic goes to the
// cheap tier, hard/frontier to expensive models. Before ANY router change is
// allowed (V3.1), the estimator must prove itself on this versioned corpus —
// the same evaluation-before-integration discipline as the memory subsystem.
//
// VERSIONED: never mutate an entry after a baseline is run against this
// version. Add entries or bump ROUTING_CORPUS_VERSION; preserve prior
// versions for reproducibility.
// ============================================================================

export const ROUTING_CORPUS_VERSION = 'routing-v1';

/** Difficulty bins, ordered. Index = rank (used for adjacency scoring). */
export const DIFFICULTIES = ['trivial', 'standard', 'hard', 'frontier'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface RoutingCase {
  id: string;
  prompt: string;
  /** Human-labeled difficulty (the answer key). */
  difficulty: Difficulty;
  /** Marks prompts that are known traps for surface heuristics. */
  knownHard?: boolean;
}

export interface RoutingScenario {
  name: string;
  description: string;
  knownHard?: boolean;
  cases: RoutingCase[];
}

export const routingScenarios: RoutingScenario[] = [
  {
    name: 'trivial',
    description: 'Greetings, acks, tiny formatting — cheapest tier, no reasoning.',
    cases: [
      { id: 'greet', prompt: 'hi', difficulty: 'trivial' },
      { id: 'thanks', prompt: 'thanks, that worked!', difficulty: 'trivial' },
      { id: 'yes-no', prompt: 'Is 7 an odd number?', difficulty: 'trivial' },
      { id: 'uppercase', prompt: 'Make this uppercase: hello world', difficulty: 'trivial' },
      { id: 'emoji', prompt: 'Add a smiley to: good morning team', difficulty: 'trivial' },
      { id: 'date', prompt: 'What day comes after Tuesday?', difficulty: 'trivial' },
    ],
  },
  {
    name: 'standard',
    description: 'Everyday single-step tasks — summarize, translate, draft, small code.',
    cases: [
      {
        id: 'summarize-mail',
        prompt:
          'Summarize this email in two sentences: Hi team, the Q3 launch moved to October because the payment integration needs another security review. Marketing assets are ready. Please update your roadmaps accordingly and flag conflicts by Friday.',
        difficulty: 'standard',
      },
      {
        id: 'translate',
        prompt: 'Translate to Hindi: The meeting is rescheduled to Monday morning.',
        difficulty: 'standard',
      },
      {
        id: 'draft-reply',
        prompt: 'Draft a polite reply declining this vendor demo invitation.',
        difficulty: 'standard',
      },
      {
        id: 'small-code',
        prompt: 'Write a TypeScript function that returns the largest number in an array.',
        difficulty: 'standard',
      },
      {
        id: 'regex',
        prompt: 'Give me a regex that matches ISO dates like 2026-07-09.',
        difficulty: 'standard',
      },
      {
        id: 'rename-list',
        prompt: 'Suggest five names for a note-taking feature inside a mail app.',
        difficulty: 'standard',
      },
    ],
  },
  {
    name: 'hard',
    description: 'Multi-step reasoning, debugging, multi-constraint planning.',
    cases: [
      {
        id: 'debug-race',
        prompt:
          'Our Node service intermittently returns stale data after a deploy. We use Redis cache-aside with a 60s TTL, and deploys flush the cache. Walk through the possible race conditions step by step and propose a fix that avoids a thundering herd.',
        difficulty: 'hard',
      },
      {
        id: 'sql-optimize',
        prompt:
          'This Postgres query joins four tables and takes 9 seconds at 10M rows. Explain how to diagnose it with EXPLAIN ANALYZE, then propose index and query rewrites, and discuss the trade-offs of each.',
        difficulty: 'hard',
      },
      {
        id: 'migration-plan',
        prompt:
          'Plan a zero-downtime migration from a monolithic session table to per-tenant partitions. Requirements: reversible at every step, no data loss, dual-write window, and a verification strategy. Lay out the phases in order.',
        difficulty: 'hard',
      },
      {
        id: 'concurrency-proof',
        prompt:
          'Given an outbox pattern with at-least-once delivery, reason through every duplicate-processing scenario a consumer must handle, and derive the idempotency key design that covers all of them.',
        difficulty: 'hard',
      },
    ],
  },
  {
    name: 'frontier',
    description: 'Deep synthesis, novel design, research-grade reasoning — top tier only.',
    cases: [
      {
        id: 'architecture-design',
        prompt:
          'Design a multi-region, active-active architecture for a collaborative document editor with CRDT sync, sub-100ms local latency, conflict-free offline editing, and GDPR data-residency constraints. Compare at least three replication topologies, derive the failure modes of each, prove which invariants survive a region partition, and recommend one with a migration path from a single-region deployment.',
        difficulty: 'frontier',
      },
      {
        id: 'formal-analysis',
        prompt:
          'Prove whether the following distributed lock protocol is safe under clock drift: leases of 10s granted by a majority of 5 nodes, clients renew at 5s, fencing tokens increment per grant. Derive the exact drift bound at which mutual exclusion breaks, and construct a counterexample execution.',
        difficulty: 'frontier',
      },
      {
        id: 'research-synthesis',
        prompt:
          'Survey the trade-offs between speculative decoding, cascade routing, and mixture-of-experts for cutting LLM inference cost. Derive a cost model for each under a 100k-user workload with a 30% cache hit-rate, identify where the models disagree, and design an experiment that would distinguish which applies to our traffic.',
        difficulty: 'frontier',
      },
    ],
  },
  {
    name: 'traps',
    description: 'Known traps for surface heuristics: length ≠ difficulty.',
    knownHard: true,
    cases: [
      {
        // Short but genuinely deep — length heuristics under-route it.
        id: 'short-deep',
        prompt: 'Why can’t consensus be solved deterministically with one faulty process?',
        difficulty: 'frontier',
        knownHard: true,
      },
      {
        // Long but trivial — length heuristics over-route it.
        id: 'long-trivial',
        prompt:
          'Here is our full meeting transcript from Monday covering the roadmap discussion, the budget review where finance walked us through every line item for the next two quarters, the hiring update including all fourteen open roles across engineering and design, and the office relocation debate that took forty minutes. Please just fix the typo in the word "recieve" wherever it appears.',
        difficulty: 'trivial',
        knownHard: true,
      },
      {
        // Emotional weight but computationally standard.
        id: 'urgent-standard',
        prompt:
          'URGENT!!! Production is down and my boss is furious!!! Write an apology email to customers about 30 minutes of downtime.',
        difficulty: 'standard',
        knownHard: true,
      },
    ],
  },
];

/** Flat view of all cases across scenarios. */
export function allRoutingCases(): RoutingCase[] {
  return routingScenarios.flatMap((s) => s.cases);
}
