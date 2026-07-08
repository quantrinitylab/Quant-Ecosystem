// ============================================================================
// Extraction-quality datasets (PR-M11c)
//
// Labeled turns for measuring EXTRACTION quality (distinct from retrieval).
// `expected` lists the USER-owned memories a turn should produce. An empty
// `expected` means the turn must produce NO user memory (third-party /
// hypothetical / past). Producing a user memory there is a hallucination.
// ============================================================================

export interface ExpectedMemory {
  /** Substring that a correct user-owned candidate's content must include. */
  contentIncludes: string;
}

export interface ExtractionCase {
  id: string;
  role?: string; // default 'user'
  content: string;
  expected: ExpectedMemory[];
}

export const extractionCases: ExtractionCase[] = [
  // Should extract a user memory:
  { id: 'residence', content: 'I live in Patna', expected: [{ contentIncludes: 'Patna' }] },
  { id: 'employer', content: 'I work at OpenAI', expected: [{ contentIncludes: 'OpenAI' }] },
  {
    id: 'favorite',
    content: 'My favorite language is Rust',
    expected: [{ contentIncludes: 'Rust' }],
  },

  // Should extract NOTHING about the user (hallucination probes):
  { id: 'third-person-residence', content: 'My brother lives in Delhi', expected: [] },
  { id: 'third-person-employer', content: 'My friend John works at Google', expected: [] },
  { id: 'hypothetical', content: 'I wish I lived in Japan', expected: [] },
  { id: 'past-favorite', content: 'My favorite movie used to be Interstellar', expected: [] },

  // Noise:
  { id: 'ack', content: 'thanks!', expected: [] },
];
