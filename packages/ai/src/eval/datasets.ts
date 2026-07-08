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

export const employment: EvalScenario = {
  name: 'employment',
  description: 'A new employer supersedes the previous one.',
  cases: [
    {
      id: 'job-change',
      seed: [
        { role: 'user', content: 'I work at Google' },
        { role: 'user', content: 'I work at OpenAI' },
      ],
      queries: [
        { query: 'where do I work', expectIncludes: ['OpenAI'], expectExcludes: ['Google'] },
      ],
    },
  ],
};

export const corrections: EvalScenario = {
  name: 'corrections',
  description: 'A later statement supersedes an earlier fact.',
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
  description: 'Most-recent value wins for a changing attribute.',
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

// ─── FRONTIER: messy real-world inputs (KNOWN HARD — measured, not gated) ─────
// These probe what real users actually type. Most FAIL today — that is the
// point. They are the backlog; the CI gate runs on `coreScenarios` only so these
// can be added without breaking the build, and each one that gets solved graduates.

export const negation: EvalScenario = {
  name: 'negation',
  description: 'A negated statement should retract an earlier fact (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'no-longer-there',
      seed: [
        { role: 'user', content: 'I live in Patna' },
        { role: 'user', content: "I don't live in Patna anymore" },
      ],
      queries: [{ query: 'where do I live', expectIncludes: [], expectExcludes: ['Patna'] }],
    },
  ],
};

export const hinglish: EvalScenario = {
  name: 'hinglish',
  description: 'Code-mixed Hindi/English facts (KNOWN HARD — extractor is English-only).',
  knownHard: true,
  cases: [
    {
      id: 'rehta-hu',
      seed: [{ role: 'user', content: 'Ab main Bangalore me rehta hu' }],
      queries: [{ query: 'where do I live', expectIncludes: ['Bangalore'] }],
    },
    {
      id: 'favourite-ab',
      seed: [{ role: 'user', content: 'Mera favourite language ab Rust nahi Go hai' }],
      queries: [{ query: 'favorite language', expectIncludes: ['Go'], expectExcludes: ['Rust'] }],
    },
  ],
};

export const typos: EvalScenario = {
  name: 'typos',
  description: 'Misspelled entities should still be recalled by correct spelling (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'banglore',
      seed: [{ role: 'user', content: 'I live in Banglore' }],
      queries: [{ query: 'where do I live', expectIncludes: ['Bangalore'] }],
    },
  ],
};

export const temporalComplex: EvalScenario = {
  name: 'temporal-complex',
  description: '"used to be X, now Y" phrasing (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'used-to-now',
      seed: [{ role: 'user', content: 'My favorite language used to be Rust, now mostly Go' }],
      queries: [{ query: 'favorite language', expectIncludes: ['Go'], expectExcludes: ['Rust'] }],
    },
  ],
};

export const multiClauseCurrent: EvalScenario = {
  name: 'multi-current',
  description: 'A multi-clause sentence whose CURRENT value is buried (KNOWN HARD).',
  knownHard: true,
  cases: [
    {
      id: 'shifted-but-currently',
      seed: [
        {
          role: 'user',
          content: "I shifted from Patna to Bangalore last year, but currently I'm in Hyderabad",
        },
      ],
      queries: [
        {
          query: 'where do I live',
          expectIncludes: ['Hyderabad'],
          expectExcludes: ['Patna', 'Bangalore'],
        },
      ],
    },
  ],
};

/** Core scenarios — the CI regression gate runs on these. Must stay green. */
export const coreScenarios: EvalScenario[] = [
  facts,
  preferences,
  noise,
  isolation,
  employment,
  corrections,
  temporal,
];

/** Frontier scenarios — measured and reported, NOT gated. The quality backlog. */
export const frontierScenarios: EvalScenario[] = [
  negation,
  hinglish,
  typos,
  temporalComplex,
  multiClauseCurrent,
];

/** All scenarios, in reporting order. */
export const allScenarios: EvalScenario[] = [...coreScenarios, ...frontierScenarios];
