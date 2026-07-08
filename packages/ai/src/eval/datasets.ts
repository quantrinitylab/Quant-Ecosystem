// ============================================================================
// Memory Evaluation — datasets (PR-M06)
//
// Grouped by the memory problem they probe. `knownHard` scenarios exercise
// problems the current system is NOT expected to solve yet (fact supersession,
// conflicting statements) — the eval reports them honestly rather than hiding
// them. They become the backlog for the next quality work.
// ============================================================================

import type { EvalScenario } from './types';

export const facts: EvalScenario = {
  name: 'facts',
  description: 'Plain personal facts should be recalled by a natural query.',
  cases: [
    {
      id: 'home-city',
      seed: [{ role: 'user', content: 'I live in Patna' }],
      queries: [{ query: 'where do I live', expectIncludes: ['Patna'] }],
    },
    {
      id: 'name',
      seed: [{ role: 'user', content: 'My name is Kundan' }],
      queries: [{ query: 'what is my name', expectIncludes: ['Kundan'] }],
    },
    {
      id: 'workplace',
      seed: [{ role: 'user', content: 'I work at OpenAI' }],
      queries: [{ query: 'where do I work', expectIncludes: ['OpenAI'] }],
    },
  ],
};

export const preferences: EvalScenario = {
  name: 'preferences',
  description: 'Preferences recalled via a paraphrased query.',
  cases: [
    {
      id: 'fav-language',
      seed: [{ role: 'user', content: 'My favorite language is Rust' }],
      queries: [{ query: 'what programming language do I like', expectIncludes: ['Rust'] }],
    },
    {
      id: 'likes',
      seed: [{ role: 'user', content: 'I love hiking' }],
      queries: [{ query: 'what do I like', expectIncludes: ['hiking'] }],
    },
  ],
};

export const noise: EvalScenario = {
  name: 'noise',
  description: 'Acknowledgements must not become memories.',
  cases: [
    {
      id: 'thanks',
      seed: [
        { role: 'user', content: 'thanks!' },
        { role: 'user', content: 'ok cool' },
      ],
      queries: [{ query: 'thanks', expectIncludes: [] }],
    },
  ],
};

export const isolation: EvalScenario = {
  name: 'isolation',
  description: 'Memories must never leak across owners (probed at runner level).',
  cases: [
    {
      id: 'owner-scope',
      seed: [{ role: 'user', content: 'I live in Patna' }],
      // The runner queries this case as a DIFFERENT actor; expect nothing.
      queries: [{ query: 'where do I live', expectIncludes: [] }],
    },
  ],
};

export const corrections: EvalScenario = {
  name: 'corrections',
  description: 'A later statement supersedes an earlier fact (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'moved-city',
      seed: [
        { role: 'user', content: 'I live in Patna' },
        { role: 'user', content: 'I moved from Patna to Bangalore' },
      ],
      queries: [
        { query: 'where do I live', expectIncludes: ['Bangalore'], expectExcludes: ['Patna'] },
      ],
    },
  ],
};

export const temporal: EvalScenario = {
  name: 'temporal',
  description: 'Most-recent value wins for a changing attribute (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'changing-favorite',
      seed: [
        { role: 'user', content: 'My favorite language is Python' },
        { role: 'user', content: 'Actually my favorite language is Rust now' },
      ],
      queries: [
        { query: 'favorite language', expectIncludes: ['Rust'], expectExcludes: ['Python'] },
      ],
    },
  ],
};

/** All scenarios, in reporting order. */
export const allScenarios: EvalScenario[] = [
  facts,
  preferences,
  noise,
  isolation,
  corrections,
  temporal,
];
