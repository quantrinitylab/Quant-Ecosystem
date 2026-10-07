// ============================================================================
// Real-conversation evaluation corpus (Agent C) — VERSIONED
//
// Difficult, realistic multi-turn conversations for M11d live validation. Not
// synthetic perfection — deliberately messy: Hinglish, typos, contradictions,
// corrections, temporal change, negation, third-party references, multi-topic,
// and longer threads. `expectExcludes: []` with `expectIncludes: []` means the
// turn(s) should produce NO recallable user memory (hallucination probe).
//
// VERSIONED: never mutate an entry after a baseline is run against this version.
// Add entries or bump CORPUS_VERSION; preserve prior versions for reproducibility.
// ============================================================================

import type { EvalScenario } from './types';

/** Freeze this with every archived baseline (ADR: immutable baselines). */
export const CORPUS_VERSION = 'real-conv-v1';

export const realConversationCorpus: EvalScenario[] = [
  {
    name: 'rc-correction-multi-turn',
    description: 'A correction several turns after the original fact.',
    cases: [
      {
        id: 'moved-after-chatter',
        seed: [
          { role: 'user', content: 'I live in Patna' },
          { role: 'user', content: 'what is the weather like today' },
          { role: 'user', content: 'thanks' },
          { role: 'user', content: 'Actually I moved to Bangalore last month' },
        ],
        queries: [
          { query: 'where do I live', expectIncludes: ['Bangalore'], expectExcludes: ['Patna'] },
        ],
      },
    ],
  },
  {
    name: 'rc-hinglish',
    description: 'Code-mixed Hindi/English.',
    cases: [
      {
        id: 'rehta-hu',
        seed: [{ role: 'user', content: 'Ab main Bangalore me rehta hu' }],
        queries: [{ query: 'where do I live', expectIncludes: ['Bangalore'] }],
      },
      {
        id: 'favourite-ab-go',
        seed: [{ role: 'user', content: 'Mera favourite language ab Rust nahi Go hai' }],
        queries: [
          {
            query: 'favorite programming language',
            expectIncludes: ['Go'],
            expectExcludes: ['Rust'],
          },
        ],
      },
    ],
  },
  {
    name: 'rc-typos',
    description: 'Misspelled entities recalled by correct spelling.',
    cases: [
      {
        id: 'banglore-typo',
        seed: [{ role: 'user', content: 'i live in banglore' }],
        queries: [{ query: 'where do I live', expectIncludes: ['Bangalore'] }],
      },
    ],
  },
  {
    name: 'rc-negation',
    description: 'Retraction with no replacement.',
    cases: [
      {
        id: 'no-longer-vegetarian',
        seed: [
          { role: 'user', content: 'I am vegetarian' },
          { role: 'user', content: "I'm not vegetarian anymore" },
        ],
        queries: [
          { query: 'dietary preference', expectIncludes: [], expectExcludes: ['vegetarian'] },
        ],
      },
    ],
  },
  {
    name: 'rc-third-party',
    description: "Facts about other people must not become the user's facts.",
    cases: [
      {
        id: 'wife-allergy',
        seed: [{ role: 'user', content: 'My wife is allergic to peanuts' }],
        queries: [
          { query: 'what am I allergic to', expectIncludes: [], expectExcludes: ['peanuts'] },
        ],
      },
      {
        id: 'colleague-employer',
        seed: [{ role: 'user', content: 'My colleague Priya works at Stripe' }],
        queries: [{ query: 'where do I work', expectIncludes: [], expectExcludes: ['Stripe'] }],
      },
    ],
  },
  {
    name: 'rc-temporal-past',
    description: '"used to" is not a current fact.',
    cases: [
      {
        id: 'used-to-smoke',
        seed: [{ role: 'user', content: 'I used to smoke but quit years ago' }],
        queries: [{ query: 'do I smoke', expectIncludes: [], expectExcludes: ['smoke'] }],
      },
    ],
  },
  {
    name: 'rc-multi-topic',
    description: 'Several independent facts in one thread; all recalled correctly.',
    cases: [
      {
        id: 'mixed-facts',
        seed: [
          { role: 'user', content: 'I live in Pune and work at Zomato' },
          { role: 'user', content: 'My favorite cuisine is Thai' },
          { role: 'user', content: 'I have a dog named Bruno' },
        ],
        queries: [
          { query: 'where do I live', expectIncludes: ['Pune'] },
          { query: 'where do I work', expectIncludes: ['Zomato'] },
          { query: 'favorite cuisine', expectIncludes: ['Thai'] },
          { query: 'do I have a pet', expectIncludes: ['Bruno'] },
        ],
      },
    ],
  },
  {
    name: 'rc-conflicting-preference',
    description: 'A preference flip within a thread.',
    cases: [
      {
        id: 'coffee-then-tea',
        seed: [
          { role: 'user', content: 'I love coffee' },
          { role: 'user', content: 'actually I prefer tea now' },
        ],
        queries: [{ query: 'what do I like to drink', expectIncludes: ['tea'] }],
      },
    ],
  },
  {
    name: 'rc-long-thread',
    description: 'A longer multi-turn thread with one buried durable fact.',
    cases: [
      {
        id: 'buried-allergy',
        seed: [
          { role: 'user', content: 'hey' },
          { role: 'user', content: 'can you help me plan a trip' },
          { role: 'user', content: 'somewhere warm' },
          { role: 'user', content: 'by the way I am allergic to shellfish' },
          { role: 'user', content: 'maybe a beach' },
          { role: 'user', content: 'thanks for the help' },
        ],
        queries: [{ query: 'what am I allergic to', expectIncludes: ['shellfish'] }],
      },
    ],
  },
];

/** Difficulty categories represented (for reporting coverage). */
export const CORPUS_CATEGORIES = [
  'correction',
  'hinglish',
  'typos',
  'negation',
  'third-party',
  'temporal-past',
  'multi-topic',
  'conflicting-preference',
  'long-thread',
] as const;

/**
 * IMMUTABLE per-scenario metadata (treat the corpus like source: never silently
 * edit; add new entries or bump CORPUS_VERSION). Lets us compare models fairly
 * years later and route failures to an expected owner.
 */
export type MemoryLifetime = 'temporary' | 'session' | 'persistent';
export type GroundTruthSource = 'user' | 'system' | 'verified' | 'external';

export interface CorpusMeta {
  scenarioId: string;
  language: 'en' | 'hinglish' | string;
  difficulty: 'easy' | 'medium' | 'hard';
  conversationLength: number; // seed turn count
  /** The failure category we EXPECT if this scenario regresses (for triage). */
  expectedFailureCategory: 'extractor' | 'policy' | 'retrieval' | 'infrastructure';
  /** How long the target memory should live (matters for forgetting/GC later). */
  expectedLifetime: MemoryLifetime;
  /** Where the ground-truth fact comes from (matters for trust evolution later). */
  groundTruthSource: GroundTruthSource;
  corpusVersion: string;
}

export const CORPUS_META: Record<string, Omit<CorpusMeta, 'scenarioId' | 'corpusVersion'>> = {
  'rc-correction-multi-turn': {
    language: 'en',
    difficulty: 'medium',
    conversationLength: 4,
    expectedFailureCategory: 'policy',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-hinglish': {
    language: 'hinglish',
    difficulty: 'hard',
    conversationLength: 1,
    expectedFailureCategory: 'extractor',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-typos': {
    language: 'en',
    difficulty: 'hard',
    conversationLength: 1,
    expectedFailureCategory: 'extractor',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-negation': {
    language: 'en',
    difficulty: 'medium',
    conversationLength: 2,
    expectedFailureCategory: 'extractor',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-third-party': {
    language: 'en',
    difficulty: 'hard',
    conversationLength: 1,
    expectedFailureCategory: 'extractor',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-temporal-past': {
    language: 'en',
    difficulty: 'hard',
    conversationLength: 1,
    expectedFailureCategory: 'extractor',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-multi-topic': {
    language: 'en',
    difficulty: 'medium',
    conversationLength: 3,
    expectedFailureCategory: 'retrieval',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-conflicting-preference': {
    language: 'en',
    difficulty: 'medium',
    conversationLength: 2,
    expectedFailureCategory: 'policy',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
  'rc-long-thread': {
    language: 'en',
    difficulty: 'hard',
    conversationLength: 6,
    expectedFailureCategory: 'retrieval',
    expectedLifetime: 'persistent',
    groundTruthSource: 'user',
  },
};

/** Resolve the full immutable metadata for a corpus scenario. */
export function corpusMetaFor(scenarioName: string): CorpusMeta | null {
  const m = CORPUS_META[scenarioName];
  return m ? { scenarioId: scenarioName, corpusVersion: CORPUS_VERSION, ...m } : null;
}
