// ============================================================================
// AI Core — DefaultMemoryExtractor / ExtractionPipeline (PR-M03)
//
// The memory INTELLIGENCE layer. Decides what to remember, what to ignore, and
// what kind of memory a turn produces. Backend-independent (no DB, no vector
// store) and MODEL-AGNOSTIC (LLM extraction is an injectable port, never
// hardcoded — see ADR-003).
//
// It is NOT one monolithic class. It is a pipeline of small, composable units:
//
//   ExtractionPipeline (implements MemoryExtractor)
//        │
//        ├── IgnoreFilter[]        → short-circuit (e.g. "thanks!", non-user)
//        ├── CandidateExtractor[]  → rule-based producers (fact/preference/…)
//        ├── ExtractionModel?      → optional LLM-backed producer (pluggable)
//        └── DuplicateFilter       → collapse near-identical candidates
//
// Adding a new capability = add a unit to the array. No edits to the pipeline.
// ============================================================================

import type { MemoryRecord, MemoryExtractor } from './memory-port';
import { asKind, asLevel } from './memory-port';

// ─── Shared types ─────────────────────────────────────────────────────────────

/** A turn presented to the extraction pipeline. */
export interface ExtractionInput {
  actor: string;
  session: string;
  role: string;
  content: string;
}

/** A memory ready to be stored (store assigns id/createdAt/version). */
export type MemoryCandidate = Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>;

/** Short-circuits extraction for turns not worth processing at all. */
export interface IgnoreFilter {
  /** Return true to ignore this turn entirely. */
  shouldIgnore(input: ExtractionInput): boolean;
}

/** Produces zero or more memory candidates from a turn. */
export interface CandidateExtractor {
  extract(input: ExtractionInput): MemoryCandidate[] | Promise<MemoryCandidate[]>;
}

/** Removes near-duplicate candidates within a single extraction batch. */
export interface DuplicateFilter {
  filter(candidates: MemoryCandidate[]): MemoryCandidate[];
}

/**
 * Model-agnostic LLM extraction port. When injected, its candidates are merged
 * with the rule-based ones. The concrete model (GPT / Claude / Gemini / a Quant
 * model / a local LLM) lives BEHIND this interface — the pipeline never knows.
 */
export interface ExtractionModel {
  extract(input: ExtractionInput): Promise<MemoryCandidate[]>;
}

/**
 * Decides whether a session should be summarized now. Kept as a pure predicate
 * of turn count so it carries NO hidden state; MemoryService (which owns the
 * ConversationLog) drives it in a later PR.
 */
export interface SummarizerTrigger {
  shouldSummarize(turnCount: number, input: ExtractionInput): boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function candidate(
  owner: string,
  content: string,
  kind: string,
  level: string,
  metadata: Record<string, unknown>,
): MemoryCandidate {
  return {
    content,
    kind: asKind(kind),
    level: asLevel(level),
    owner,
    pinned: false,
    expiresAt: null,
    metadata,
  };
}

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (s: string): string =>
  s
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();

// ─── Default IgnoreFilters ─────────────────────────────────────────────────────

/** Ignore turns that are not from the user (memory is about the user by default). */
export class RoleIgnoreFilter implements IgnoreFilter {
  constructor(private readonly rememberRoles: string[] = ['user']) {}
  shouldIgnore(input: ExtractionInput): boolean {
    return !this.rememberRoles.includes(input.role);
  }
}

/** Ignore pure pleasantries / acknowledgements that carry no durable meaning. */
export class AcknowledgementIgnoreFilter implements IgnoreFilter {
  private static readonly ACKS = new Set([
    'thanks',
    'thank you',
    'thankyou',
    'thx',
    'ty',
    'ok',
    'okay',
    'k',
    'kk',
    'cool',
    'great',
    'nice',
    'awesome',
    'perfect',
    'got it',
    'gotit',
    'sure',
    'yes',
    'yeah',
    'yep',
    'no',
    'nope',
    'lol',
    'haha',
    'hmm',
    'hi',
    'hey',
    'hello',
    'bye',
    'goodbye',
    'good morning',
    'good night',
  ]);
  shouldIgnore(input: ExtractionInput): boolean {
    const n = normalize(input.content).replace(/[!.?,]+$/g, '');
    if (n.length === 0) return true;
    return AcknowledgementIgnoreFilter.ACKS.has(n);
  }
}

// ─── Default CandidateExtractors (rule-based, zero dependencies) ────────────────

/** Personal facts: where the user lives, their name, where they work. */
export class FactExtractor implements CandidateExtractor {
  private static readonly PATTERNS: Array<{ re: RegExp; phrase: (m: string) => string }> = [
    { re: /\bI live in ([A-Za-z][\w\s,'-]{1,60})/i, phrase: (m) => `lives in ${clean(m)}` },
    { re: /\bmy name is ([A-Za-z][\w\s'-]{1,60})/i, phrase: (m) => `name is ${clean(m)}` },
    { re: /\bI(?:'m| am) called ([A-Za-z][\w\s'-]{1,60})/i, phrase: (m) => `name is ${clean(m)}` },
    {
      re: /\bI work (?:at|for) ([A-Za-z][\w\s&.'-]{1,60})/i,
      phrase: (m) => `works at ${clean(m)}`,
    },
    {
      re: /\bmy (?:phone|mobile) (?:number )?is ([\d\s+()-]{6,20})/i,
      phrase: (m) => `phone number is ${clean(m)}`,
    },
  ];
  extract(input: ExtractionInput): MemoryCandidate[] {
    const out: MemoryCandidate[] = [];
    for (const { re, phrase } of FactExtractor.PATTERNS) {
      const match = re.exec(input.content);
      const group = match?.[1];
      if (group) {
        out.push(
          candidate(input.actor, phrase(group), 'fact', 'user', {
            extractor: 'fact',
            session: input.session,
            original: input.content,
          }),
        );
      }
    }
    return out;
  }
}

/** Preferences: likes, loves, favourites, dislikes. */
export class PreferenceExtractor implements CandidateExtractor {
  private static readonly PATTERNS: Array<{ re: RegExp; phrase: (m: string) => string }> = [
    { re: /\bmy favou?rite ([\w\s]+?) (?:is|are) ([\w\s'-]{1,60})/i, phrase: () => '' }, // handled specially
    {
      re: /\bI (?:really )?(?:like|love|enjoy) ([\w\s'-]{1,60})/i,
      phrase: (m) => `likes ${clean(m)}`,
    },
    {
      re: /\bI (?:really )?(?:hate|dislike|can't stand) ([\w\s'-]{1,60})/i,
      phrase: (m) => `dislikes ${clean(m)}`,
    },
    { re: /\bI prefer ([\w\s'-]{1,60})/i, phrase: (m) => `prefers ${clean(m)}` },
  ];
  extract(input: ExtractionInput): MemoryCandidate[] {
    const out: MemoryCandidate[] = [];

    // Special case: "my favourite <thing> is <value>"
    const fav = /\bmy favou?rite ([\w\s]+?) (?:is|are) ([\w\s'-]{1,60})/i.exec(input.content);
    if (fav?.[1] && fav?.[2]) {
      out.push(
        candidate(
          input.actor,
          `favourite ${clean(fav[1])} is ${clean(fav[2])}`,
          'preference',
          'user',
          {
            extractor: 'preference',
            session: input.session,
            original: input.content,
          },
        ),
      );
    }

    for (const { re, phrase } of PreferenceExtractor.PATTERNS.slice(1)) {
      const match = re.exec(input.content);
      const group = match?.[1];
      if (group) {
        out.push(
          candidate(input.actor, phrase(group), 'preference', 'user', {
            extractor: 'preference',
            session: input.session,
            original: input.content,
          }),
        );
      }
    }
    return out;
  }
}

/** Relationships between named entities, e.g. "Alice works at OpenAI". */
export class EntityExtractor implements CandidateExtractor {
  private static readonly REL =
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?) works (?:at|for) ([A-Z][\w&.'-]+(?:\s[A-Z][\w&.'-]+)?)/;
  extract(input: ExtractionInput): MemoryCandidate[] {
    const match = EntityExtractor.REL.exec(input.content);
    const subject = match?.[1];
    const object = match?.[2];
    if (subject && object && normalize(subject) !== 'i') {
      return [
        candidate(
          input.actor,
          `${clean(subject)} works at ${clean(object)}`,
          'entity',
          'knowledge',
          {
            extractor: 'entity',
            relation: 'works_at',
            subject: clean(subject),
            object: clean(object),
            session: input.session,
            original: input.content,
          },
        ),
      ];
    }
    return [];
  }
}

/** Time-bound episodic events: "yesterday I…", "I just…", "I met…". */
export class EpisodicExtractor implements CandidateExtractor {
  private static readonly CUES =
    /\b(yesterday|today|this morning|this evening|last night|just now|earlier|last week|met|visited|went to)\b/i;
  extract(input: ExtractionInput): MemoryCandidate[] {
    if (!EpisodicExtractor.CUES.test(input.content)) return [];
    return [
      candidate(input.actor, clean(input.content), 'episodic', 'conversation', {
        extractor: 'episodic',
        session: input.session,
      }),
    ];
  }
}

// ─── Default DuplicateFilter ────────────────────────────────────────────────────

/** Collapse candidates with identical normalized content (keeps the first). */
export class ContentDuplicateFilter implements DuplicateFilter {
  filter(candidates: MemoryCandidate[]): MemoryCandidate[] {
    const seen = new Set<string>();
    const out: MemoryCandidate[] = [];
    for (const c of candidates) {
      const key = `${c.kind}:${normalize(c.content)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }
}

// ─── Default SummarizerTrigger ──────────────────────────────────────────────────

/** Fire every N turns (default 200), as suggested for long-conversation summarization. */
export class TurnCountSummarizerTrigger implements SummarizerTrigger {
  constructor(private readonly everyNTurns = 200) {}
  shouldSummarize(turnCount: number): boolean {
    return turnCount > 0 && turnCount % this.everyNTurns === 0;
  }
}

// ─── The pipeline ────────────────────────────────────────────────────────────

export interface ExtractionPipelineDeps {
  /** Short-circuit filters (defaults: role + acknowledgement). */
  ignoreFilters?: IgnoreFilter[];
  /** Candidate producers (defaults: fact, preference, entity, episodic). */
  extractors?: CandidateExtractor[];
  /** Duplicate collapser (default: content-based). */
  duplicateFilter?: DuplicateFilter;
  /** Optional model-agnostic LLM extractor. */
  model?: ExtractionModel;
  /** Optional summarization trigger (exposed via shouldSummarize). */
  summarizerTrigger?: SummarizerTrigger;
}

/**
 * DefaultMemoryExtractor — the reference ExtractionPipeline.
 *
 * Orchestrates ignore filters, rule-based extractors, an optional LLM model,
 * and a duplicate filter. Implements the frozen MemoryExtractor port so it
 * drops straight into DefaultMemoryService.
 */
export class DefaultMemoryExtractor implements MemoryExtractor {
  private readonly ignoreFilters: IgnoreFilter[];
  private readonly extractors: CandidateExtractor[];
  private readonly duplicateFilter: DuplicateFilter;
  private readonly model: ExtractionModel | undefined;
  private readonly summarizerTrigger: SummarizerTrigger | undefined;

  constructor(deps: ExtractionPipelineDeps = {}) {
    this.ignoreFilters = deps.ignoreFilters ?? [
      new RoleIgnoreFilter(),
      new AcknowledgementIgnoreFilter(),
    ];
    this.extractors = deps.extractors ?? [
      new FactExtractor(),
      new PreferenceExtractor(),
      new EntityExtractor(),
      new EpisodicExtractor(),
    ];
    this.duplicateFilter = deps.duplicateFilter ?? new ContentDuplicateFilter();
    this.model = deps.model;
    this.summarizerTrigger = deps.summarizerTrigger;
  }

  async extract(
    actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<MemoryCandidate[]> {
    const input: ExtractionInput = { actor, session, role, content };

    // 1. Ignore short-circuit.
    for (const f of this.ignoreFilters) {
      if (f.shouldIgnore(input)) return [];
    }

    // 2. Rule-based extractors (parallel; each independent).
    const ruleBased = (await Promise.all(this.extractors.map((e) => e.extract(input)))).flat();

    // 3. Optional model-backed extraction (merged in, never hardcoded).
    const modelBased = this.model ? await this.model.extract(input) : [];

    // 4. Collapse duplicates across all producers.
    return this.duplicateFilter.filter([...ruleBased, ...modelBased]);
  }

  /** Consult the summarization trigger (if configured). Driven by the caller's turn count. */
  shouldSummarize(turnCount: number, input: ExtractionInput): boolean {
    return this.summarizerTrigger?.shouldSummarize(turnCount, input) ?? false;
  }
}
