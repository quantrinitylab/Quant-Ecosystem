// ============================================================================
// QuantCooks Studio — Episodic Stories logic (deep plan G-16, checklist #64)
//
// Checklist row #64 arrived with NO spec'd screen: the deep plan (G-16)
// and the CP-1 manifest (tool 49) both cover episodic stories, but the
// Phase 2 studio specs spec no route for it. This module is the design,
// taken from the two sources of truth that do exist:
//  - CP-1 tool 49 `quantcooks.create_story_episode`: In { premise, tone?,
//    lengthSec, episodeCount 1–8, seriesId? } → job kind EPISODE, priced
//    PROVIDER with "the per-length breakdown line per episode (the
//    published-price-table pattern, in our own numbers)".
//  - Deep plan G-16 (Content Factory pattern): a "what-if" premise →
//    story progression, narration and ending drafted FOR REVIEW →
//    narrated episodes at per-length pricing shown upfront; done when a
//    4-episode batch generates from one approved premise at a quoted
//    per-length cost.
//
// The honest reconciliation of G-16's "the system drafts … for review":
// no drafting system exists today (the tool is Tier B), so the review
// surface is the USER's own plan — premise, per-episode titles, and a
// story bible with progression / narration / ending fields the user
// writes and reviews before any spend. Nothing on these screens claims
// an AI drafted, read or improved any of it.
//
// What is REAL today:
//  - The series library and workspace as a per-device draft mirror,
//    labelled "Draft on this device" (the film.ts / board.ts / voice.ts
//    precedent): a series document has NO server home yet — no Prisma
//    model, no endpoint, and CP-1's `seriesId?` is an optional param no
//    executor persists — so the mirror says so and names the follow-up.
//  - The episode plan: user-written titles, per-episode lengths from the
//    published table below, full CRUD/reorder within the tool's 1–8
//    episode bound (CP-1's schema range, enforced in the plan itself).
//  - The quote: per-length rate × episodes, one breakdown line per
//    episode, whole credits only — the published-price-table pattern in
//    our own numbers, set here as local catalogue data exactly as Voice
//    Studio set its flat training rows and Quick Tools its Hook Score
//    row (CP-1 leaves PROVIDER rate values to land with the provider;
//    the table is re-priceable data, and no attempt charges anything).
// What is NOT real today, and never faked here:
//  - Generation. create_story_episode is Tier B: its executor refuses
//    with PROVIDER_NOT_CONFIGURED until a story provider lands. The
//    attempt below lands on that outcome, preserves the premise
//    verbatim, and its TYPE carries no episodes, no outputs and no job
//    — nothing downstream can render a fabricated episode from it.
//  - Episode state. An episode's status union has exactly one member,
//    'planned', and the mirror parser FORCES it on parse (the Unit 7
//    status-forcing precedent): no client code path — and no hand-
//    edited mirror — can mark an episode generated. The same forcing
//    applies to the series status ('draft').
//
// One design note on lengths: the registered tool takes ONE lengthSec
// per invoke, so a plan whose episodes run at different lengths prices
// as the plain sum of its per-episode lines and would execute as one
// invoke per distinct length when the provider lands. The plan surface
// does not hide that: the quote prints every episode's own line.
// ============================================================================

import type { CreditQuote } from './pricing';

/** The registered QuantAI tool twin of this studio (CP-1 tool 49). */
export const STORY_EPISODE_TOOL = 'quantcooks.create_story_episode';

// ---------------------------------------------------------------------------
// The published per-length price table (CP-1 tool 49: "the published-
// price-table pattern, in our own numbers"; deep plan G-16: "per-length
// pricing shown upfront"). One row per selectable episode length; whole
// credits per CP-1 §6.4. These are local catalogue starting rates in
// exactly the pricing.ts sense — Krish/CEO re-price them as data.
// ---------------------------------------------------------------------------

export interface EpisodeLengthRate {
  /** The tool's lengthSec param value. */
  lengthSec: number;
  label: string;
  /** Whole credits for ONE narrated episode at this length. */
  creditsPerEpisode: number;
  /** One line: what this length is for, in series terms. */
  note: string;
}

export const EPISODE_LENGTH_RATES: EpisodeLengthRate[] = [
  { lengthSec: 30, label: '30 seconds', creditsPerEpisode: 6, note: 'A single-beat teaser episode — one craving, one payoff.' },
  { lengthSec: 60, label: '1 minute', creditsPerEpisode: 10, note: 'The standard story beat: setup, sizzle, resolution.' },
  { lengthSec: 90, label: '90 seconds', creditsPerEpisode: 14, note: 'Room for a second character beat or a detour.' },
  { lengthSec: 120, label: '2 minutes', creditsPerEpisode: 18, note: 'A full mini-arc with a cliffhanger landing.' },
  { lengthSec: 180, label: '3 minutes', creditsPerEpisode: 26, note: 'The long episode — finale length, full progression.' },
];

/** The length a new episode starts at (the standard story beat). */
export const DEFAULT_EPISODE_LENGTH_SEC = 60;

export function episodeRateFor(lengthSec: number | null | undefined): EpisodeLengthRate | null {
  if (typeof lengthSec !== 'number') return null;
  return EPISODE_LENGTH_RATES.find((r) => r.lengthSec === lengthSec) ?? null;
}

// ---------------------------------------------------------------------------
// Tones (the tool's optional `tone?` param). A small guided list — the
// series' register, picked not typed — plus "no tone" (the param is
// optional in the schema, so the surface must be able to omit it).
// ---------------------------------------------------------------------------

export interface StoryTone {
  id: string;
  label: string;
  note: string;
}

export const STORY_TONES: StoryTone[] = [
  { id: 'cosy', label: 'Cosy & Warm', note: 'Home-kitchen comfort; every episode ends at the table.' },
  { id: 'comic', label: 'Comic & Chaotic', note: 'Kitchen disasters, big reactions, nothing truly burns.' },
  { id: 'dramatic', label: 'Dramatic & High-Stakes', note: 'Rival kitchens, secret recipes, cliffhanger endings.' },
  { id: 'folktale', label: 'Folktale & Whimsical', note: 'Talking spices and grandmother wisdom, gently told.' },
  { id: 'documentary', label: 'Grounded & Real', note: 'True-to-life stories from real stalls and kitchens.' },
];

export function storyToneById(id: string | null | undefined): StoryTone | null {
  if (!id) return null;
  return STORY_TONES.find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Episodes. A plan row is the user's own work: a title THEY write (no
// surface anywhere invents episode titles) and a length from the table.
// Status has one member by design — see the header note.
// ---------------------------------------------------------------------------

/** CP-1 tool 49's schema range for episodeCount. */
export const MIN_EPISODES = 1;
export const MAX_EPISODES = 8;

/** G-16's done-when batch size — the count a new series starts with. */
export const DEFAULT_EPISODE_COUNT = 4;

export interface StoryEpisode {
  id: string;
  /** Written by the user; blank until they name the episode. */
  title: string;
  /** A lengthSec from EPISODE_LENGTH_RATES. */
  lengthSec: number;
  /** One member by design — an episode can never be "generated" here. */
  status: 'planned';
}

export function nextEpisodeId(episodes: StoryEpisode[]): string {
  let max = 0;
  for (const episode of episodes) {
    const match = /^ep-(\d+)$/.exec(episode.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `ep-${max + 1}`;
}

export function emptyEpisode(id: string, lengthSec: number = DEFAULT_EPISODE_LENGTH_SEC): StoryEpisode {
  return { id, title: '', lengthSec, status: 'planned' };
}

/** Seed a fresh plan of `count` blank episodes at one length. */
export function seedEpisodes(count: number, lengthSec: number = DEFAULT_EPISODE_LENGTH_SEC): StoryEpisode[] {
  const n = Math.min(MAX_EPISODES, Math.max(MIN_EPISODES, Math.floor(count) || DEFAULT_EPISODE_COUNT));
  const episodes: StoryEpisode[] = [];
  for (let i = 0; i < n; i += 1) episodes.push(emptyEpisode(`ep-${i + 1}`, lengthSec));
  return episodes;
}

/** True while one more episode fits inside the tool's 1–8 range. */
export function canAddEpisode(episodes: StoryEpisode[]): boolean {
  return episodes.length < MAX_EPISODES;
}

/** True while one episode can be removed without leaving the range. */
export function canRemoveEpisode(episodes: StoryEpisode[]): boolean {
  return episodes.length > MIN_EPISODES;
}

/** Append a blank episode; at the 8 cap the plan is returned unchanged. */
export function addEpisode(episodes: StoryEpisode[], lengthSec: number = DEFAULT_EPISODE_LENGTH_SEC): StoryEpisode[] {
  if (!canAddEpisode(episodes)) return episodes;
  const length = episodeRateFor(lengthSec) ? lengthSec : DEFAULT_EPISODE_LENGTH_SEC;
  return [...episodes, emptyEpisode(nextEpisodeId(episodes), length)];
}

/** Remove one episode; the plan never drops below the tool's minimum. */
export function removeEpisode(episodes: StoryEpisode[], id: string): StoryEpisode[] {
  if (!canRemoveEpisode(episodes)) return episodes;
  return episodes.filter((e) => e.id !== id);
}

export function updateEpisode(
  episodes: StoryEpisode[],
  id: string,
  patch: Partial<Pick<StoryEpisode, 'title' | 'lengthSec'>>,
): StoryEpisode[] {
  return episodes.map((episode) => {
    if (episode.id !== id) return episode;
    const next = { ...episode };
    if (typeof patch.title === 'string') next.title = patch.title;
    if (patch.lengthSec !== undefined && episodeRateFor(patch.lengthSec)) next.lengthSec = patch.lengthSec;
    return next;
  });
}

/** Move one step earlier (-1) or later (+1); edges are no-ops. */
export function moveEpisode(episodes: StoryEpisode[], id: string, direction: -1 | 1): StoryEpisode[] {
  const index = episodes.findIndex((e) => e.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= episodes.length) return episodes;
  const next = [...episodes];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

// ---------------------------------------------------------------------------
// The story bible — the continuity record the USER maintains. Every
// field is the user's own writing; the surface states plainly that the
// bible travels as context with a generation request (it maps to the
// premise the tool call carries) and that nothing reads, checks or
// continues it automatically today.
// ---------------------------------------------------------------------------

export interface StoryBible {
  /** Who the series follows — names and one-line identities. */
  characters: string;
  /** Where it happens — the kitchen, stall, town. */
  setting: string;
  /** How the story moves across episodes (G-16's progression, user's draft). */
  progression: string;
  /** Narration voice and style notes (G-16's narration, user's draft). */
  narration: string;
  /** Where the series is heading (G-16's ending, user's draft). */
  ending: string;
  /** The "previously on…" recap the user keeps current between episodes. */
  previouslyOn: string;
}

export type StoryBibleField = keyof StoryBible;

export const STORY_BIBLE_FIELDS: Array<{
  id: StoryBibleField;
  label: string;
  hint: string;
}> = [
  { id: 'characters', label: 'Characters', hint: 'Who the series follows — a name and one line each.' },
  { id: 'setting', label: 'Setting', hint: 'The kitchen, stall or street the story lives in.' },
  { id: 'progression', label: 'Story progression', hint: 'How the story moves, episode to episode — your draft, reviewed before any spend.' },
  { id: 'narration', label: 'Narration', hint: 'Who tells it and how — warm, breathless, deadpan.' },
  { id: 'ending', label: 'Ending', hint: 'Where the series is heading, so every episode can lean toward it.' },
  { id: 'previouslyOn', label: 'Previously on…', hint: 'The recap you keep current — what a returning viewer must remember.' },
];

export function emptyBible(): StoryBible {
  return { characters: '', setting: '', progression: '', narration: '', ending: '', previouslyOn: '' };
}

export function updateBible(bible: StoryBible, field: StoryBibleField, value: string): StoryBible {
  return { ...bible, [field]: value };
}

/** How many bible fields carry the user's writing (a continuity gauge). */
export function bibleCompleteness(bible: StoryBible): { filled: number; total: number } {
  const filled = STORY_BIBLE_FIELDS.filter((f) => bible[f.id].trim() !== '').length;
  return { filled, total: STORY_BIBLE_FIELDS.length };
}

// ---------------------------------------------------------------------------
// The series record — a DRAFT by type, exactly the voice.ts precedent:
// its status union has one member, so no code path in this app can mark
// a series produced. Generation state records only what an attempt
// honestly reported.
// ---------------------------------------------------------------------------

export interface StorySeries {
  id: string;
  /** The series name the user gives it. */
  name: string;
  /** The tool's `premise` param — the "what-if" the series runs on. */
  premise: string;
  /** A STORY_TONES id, or null (the param is optional). */
  toneId: string | null;
  episodes: StoryEpisode[];
  bible: StoryBible;
  /** One member by design — see the section header. */
  status: 'draft';
  /** What the last Generate attempt honestly reported. */
  generationState: 'not-started' | 'not-configured';
  createdAt: string;
}

export function nextSeriesId(series: StorySeries[]): string {
  let max = 0;
  for (const s of series) {
    const match = /^series-(\d+)$/.exec(s.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `series-${max + 1}`;
}

export function createSeriesDraft(input: {
  id: string;
  name: string;
  premise: string;
  toneId: string | null;
  episodeCount: number;
  lengthSec: number;
  createdAt: string;
}): StorySeries {
  return {
    id: input.id,
    name: input.name.trim(),
    premise: input.premise.trim(),
    toneId: storyToneById(input.toneId) ? input.toneId : null,
    episodes: seedEpisodes(input.episodeCount, input.lengthSec),
    bible: emptyBible(),
    status: 'draft',
    generationState: 'not-started',
    createdAt: input.createdAt,
  };
}

export function updateSeries(series: StorySeries[], id: string, patch: Partial<StorySeries>): StorySeries[] {
  return series.map((s) => (s.id === id ? { ...s, ...patch, id: s.id, status: 'draft' as const } : s));
}

export function removeSeries(series: StorySeries[], id: string): StorySeries[] {
  return series.filter((s) => s.id !== id);
}

export function seriesById(series: StorySeries[], id: string | null | undefined): StorySeries | null {
  if (!id) return null;
  return series.find((s) => s.id === id) ?? null;
}

/** Total planned runtime of a series, in seconds (display only). */
export function seriesRuntimeSeconds(series: StorySeries): number {
  return series.episodes.reduce((sum, e) => sum + e.lengthSec, 0);
}

/** Planned runtime as "2m 30s" / "2m" / "45s" (display only). */
export function formatRuntimeSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// The quote (CP-1 tool 49): per-length rate × episodes, with the
// breakdown line PER EPISODE printed before any spend — the published-
// price-table pattern. Shape follows pricing.ts's CreditQuote so the
// Generate button and quote panel render exactly like every other
// studio's (Unit 8's hookScoreQuote precedent for a catalogue-priced
// tool). Whole credits; nothing is charged by an attempt today.
// ---------------------------------------------------------------------------

export function episodeQuote(episodes: StoryEpisode[]): CreditQuote {
  const lines: string[] = [];
  let credits = 0;
  episodes.forEach((episode, index) => {
    const rate = episodeRateFor(episode.lengthSec) ?? episodeRateFor(DEFAULT_EPISODE_LENGTH_SEC)!;
    credits += rate.creditsPerEpisode;
    const title = episode.title.trim() === '' ? 'untitled' : `“${episode.title.trim()}”`;
    lines.push(`Episode ${index + 1} · ${title} · ${rate.label} · ${rate.creditsPerEpisode} credits`);
  });
  if (episodes.length === 0) lines.push('No episodes planned yet — add at least one to price a batch.');
  return {
    credits,
    modelId: 'qc-story-episode-table',
    modelLabel: 'Story episode · per-length table',
    lines,
  };
}

export function seriesQuote(series: StorySeries): CreditQuote {
  return episodeQuote(series.episodes);
}

// ---------------------------------------------------------------------------
// The generation attempt. create_story_episode is Tier B (CP-1 §3.9):
// its executor refuses with PROVIDER_NOT_CONFIGURED until a story
// provider lands. Validation runs first, in the tool's own schema order
// (premise, then a batch inside 1–8); a valid attempt preserves the
// premise VERBATIM — the words are the user's work — and the outcome
// type carries no episodes, no outputs, no job and no series id minted
// by a server, so no surface built on it can invent a result.
// ---------------------------------------------------------------------------

export type StoryGenerationOutcome =
  | { status: 'invalid'; message: string }
  | {
      status: 'not-configured';
      tool: string;
      code: 'PROVIDER_NOT_CONFIGURED';
      /** The premise, word for word as the user wrote it. */
      premise: string;
      episodeCount: number;
      chargedCredits: 0;
      message: string;
    };

export function attemptStoryGeneration(series: StorySeries): StoryGenerationOutcome {
  if (series.premise.trim() === '') {
    return {
      status: 'invalid',
      message: 'Write the premise first — the "what-if" this series runs on. There is nothing to generate from yet.',
    };
  }
  if (series.episodes.length < MIN_EPISODES || series.episodes.length > MAX_EPISODES) {
    return {
      status: 'invalid',
      message:
        `A batch is ${MIN_EPISODES}–${MAX_EPISODES} episodes (${STORY_EPISODE_TOOL}'s range) — ` +
        `this plan has ${series.episodes.length}. Adjust the plan and try again.`,
    };
  }
  const tone = storyToneById(series.toneId);
  return {
    status: 'not-configured',
    tool: STORY_EPISODE_TOOL,
    code: 'PROVIDER_NOT_CONFIGURED',
    premise: series.premise,
    episodeCount: series.episodes.length,
    chargedCredits: 0,
    message:
      `Your premise and plan are kept below, exactly as written. Episodes are generated through ` +
      `${STORY_EPISODE_TOOL}${tone ? ` in a ${tone.label.toLowerCase()} tone` : ''}, whose story ` +
      'provider is not configured yet (PROVIDER_NOT_CONFIGURED). Nothing was charged. When the ' +
      'provider connects, this same premise, bible and episode plan will price and generate ' +
      'exactly as quoted.',
  };
}

/** Fold a Generate attempt's honest result back into the draft record. */
export function applyGenerationOutcome(
  series: StorySeries[],
  id: string,
  outcome: StoryGenerationOutcome,
): StorySeries[] {
  if (outcome.status === 'invalid') return series;
  return series.map((s) => (s.id === id ? { ...s, generationState: 'not-configured' as const } : s));
}

// ---------------------------------------------------------------------------
// The stories draft mirror. The whole series library has no server home
// yet (see the header note), so it mirrors to localStorage on this
// device under one key — the voice.ts single-mirror pattern (film's is
// per-project because film projects are real server rows; a series is
// not one yet). Parsing is defensive field by field — and episode /
// series status is FORCED on parse: even a hand-edited mirror cannot
// resurrect a generated state no server ever wrote. Episode counts are
// also clamped back into the tool's 1–8 range on parse.
// ---------------------------------------------------------------------------

export interface StoriesDraft {
  series: StorySeries[];
}

export const EMPTY_STORIES_DRAFT: StoriesDraft = { series: [] };

export const STORIES_DRAFT_KEY = 'quantcooks.stories.draft.v1';

export function serializeStoriesDraft(draft: StoriesDraft): string {
  return JSON.stringify(draft);
}

function parseBible(raw: unknown): StoryBible {
  const bible = emptyBible();
  if (typeof raw !== 'object' || raw === null) return bible;
  const record = raw as Record<string, unknown>;
  for (const field of STORY_BIBLE_FIELDS) {
    const value = record[field.id];
    if (typeof value === 'string') bible[field.id] = value;
  }
  return bible;
}

function parseEpisodes(raw: unknown): StoryEpisode[] {
  if (!Array.isArray(raw)) return [];
  const episodes: StoryEpisode[] = [];
  for (const item of raw) {
    if (episodes.length >= MAX_EPISODES) break;
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id === '') continue;
    episodes.push({
      id: e.id,
      title: typeof e.title === 'string' ? e.title : '',
      lengthSec:
        typeof e.lengthSec === 'number' && episodeRateFor(e.lengthSec)
          ? e.lengthSec
          : DEFAULT_EPISODE_LENGTH_SEC,
      // Forced, never read from the mirror (see the section header).
      status: 'planned',
    });
  }
  return episodes;
}

function parseSeriesList(raw: unknown): StorySeries[] {
  if (!Array.isArray(raw)) return [];
  const out: StorySeries[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || s.id === '' || typeof s.name !== 'string') continue;
    out.push({
      id: s.id,
      name: s.name,
      premise: typeof s.premise === 'string' ? s.premise : '',
      toneId:
        typeof s.toneId === 'string' && storyToneById(s.toneId) ? s.toneId : null,
      episodes: parseEpisodes(s.episodes),
      bible: parseBible(s.bible),
      // Forced, exactly as episodes: a mirror cannot mint a produced series.
      status: 'draft',
      generationState: s.generationState === 'not-configured' ? 'not-configured' : 'not-started',
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : '',
    });
  }
  return out;
}

/**
 * Parse a mirrored stories draft. Anything malformed is dropped field
 * by field rather than trusted — a stale or edited mirror must never
 * crash the studio or resurrect a state no server wrote.
 */
export function parseStoriesDraft(raw: string | null | undefined): StoriesDraft {
  if (!raw) return EMPTY_STORIES_DRAFT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_STORIES_DRAFT;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_STORIES_DRAFT;
  const record = data as Record<string, unknown>;
  return { series: parseSeriesList(record.series) };
}
