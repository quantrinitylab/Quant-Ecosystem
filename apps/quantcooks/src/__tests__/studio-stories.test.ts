// ============================================================================
// QuantCooks Studio (Phase 2 Unit 9) — Episodic Stories: lib logic +
// rendering. Same approach as Units 1–8: react-dom/server against the
// established vitest setup, no new dependencies, no DOM environment.
// Interaction-only state is proven the Units 1–8 way: the pure lib
// functions carry the rules (episode plan CRUD inside the tool's 1–8
// range, the per-length quote, the bible, the mirror), and components
// render with the initial props a click would have produced. The
// honesty proofs this unit owes:
//  - the generation attempt preserves the premise verbatim and its
//    outcome type carries no episodes, no outputs and no job;
//  - an episode can never be marked generated client-side — the status
//    union has one member ('planned') and the mirror parser forces it,
//    for the series status ('draft') too;
//  - episode titles are the user's writing only — the plan invents
//    none, and no rendered surface shows a generated episode, a player
//    or a "ready" episode state;
//  - every price is a whole credit from the published per-length table,
//    with one breakdown line per episode summing to the total.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EPISODE_COUNT,
  EPISODE_LENGTH_RATES,
  EMPTY_STORIES_DRAFT,
  MAX_EPISODES,
  STORIES_DRAFT_KEY,
  STORY_EPISODE_TOOL,
  addEpisode,
  applyGenerationOutcome,
  attemptStoryGeneration,
  bibleCompleteness,
  canAddEpisode,
  canRemoveEpisode,
  createSeriesDraft,
  emptyBible,
  episodeQuote,
  episodeRateFor,
  formatRuntimeSeconds,
  moveEpisode,
  parseStoriesDraft,
  removeEpisode,
  removeSeries,
  seedEpisodes,
  seriesById,
  seriesQuote,
  seriesRuntimeSeconds,
  serializeStoriesDraft,
  storyToneById,
  updateBible,
  updateEpisode,
  updateSeries,
  type StoriesDraft,
  type StorySeries,
} from '../lib/studio/stories';
import { StoriesHome } from '../components/studio/StoriesHome';
import { StoriesWorkspace } from '../components/studio/StoriesWorkspace';

const NOW = '2026-10-29T08:30:00.000Z';

function makeSeries(patch: Partial<Parameters<typeof createSeriesDraft>[0]> = {}): StorySeries {
  return createSeriesDraft({
    id: 'series-1',
    name: 'The Travelling Tiffin',
    premise: 'What if one tiffin box crossed the city every day?',
    toneId: 'cosy',
    episodeCount: 4,
    lengthSec: 60,
    createdAt: NOW,
    ...patch,
  });
}

function draftWith(series: StorySeries[]): StoriesDraft {
  return { series };
}

// ---------------------------------------------------------------------------
// The per-length table + quote math
// ---------------------------------------------------------------------------

describe('episodeQuote — per-length rate × episodes, one line per episode', () => {
  it('prices a uniform batch as rate × count with a breakdown line per episode', () => {
    const series = makeSeries();
    const quote = seriesQuote(series);
    const rate = episodeRateFor(60)!;
    expect(quote.credits).toBe(rate.creditsPerEpisode * 4);
    expect(quote.lines).toHaveLength(4);
    quote.lines.forEach((line, i) => {
      expect(line).toContain(`Episode ${i + 1}`);
      expect(line).toContain('1 minute');
      expect(line).toContain(`${rate.creditsPerEpisode} credits`);
    });
  });

  it('breakdown credits sum exactly to the total when lengths differ per episode', () => {
    let episodes = seedEpisodes(3, 30);
    episodes = updateEpisode(episodes, episodes[1]!.id, { lengthSec: 120 });
    episodes = updateEpisode(episodes, episodes[2]!.id, { lengthSec: 180 });
    const quote = episodeQuote(episodes);
    const expected =
      episodeRateFor(30)!.creditsPerEpisode +
      episodeRateFor(120)!.creditsPerEpisode +
      episodeRateFor(180)!.creditsPerEpisode;
    expect(quote.credits).toBe(expected);
    // Parse the per-line credit figures back out and sum them — the
    // printed breakdown must reconcile with the printed total.
    const lineSum = quote.lines.reduce((sum, line) => {
      const match = /· (\d+) credits$/.exec(line);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    expect(lineSum).toBe(quote.credits);
  });

  it('changing one episode length re-prices the batch', () => {
    const before = episodeQuote(seedEpisodes(2, 60));
    const changed = updateEpisode(seedEpisodes(2, 60), 'ep-1', { lengthSec: 180 });
    const after = episodeQuote(changed);
    expect(after.credits).toBe(
      before.credits - episodeRateFor(60)!.creditsPerEpisode + episodeRateFor(180)!.creditsPerEpisode,
    );
  });

  it('shows the user-written title in the line, and "untitled" only for a blank one', () => {
    let episodes = seedEpisodes(2, 60);
    episodes = updateEpisode(episodes, 'ep-1', { title: 'The First Dabba' });
    const quote = episodeQuote(episodes);
    expect(quote.lines[0]).toContain('“The First Dabba”');
    expect(quote.lines[1]).toContain('untitled');
  });

  it('prices an empty plan at 0 with an explanatory line, never a number dressed as a quote', () => {
    const quote = episodeQuote([]);
    expect(quote.credits).toBe(0);
    expect(quote.lines[0]).toContain('No episodes planned yet');
  });

  it('every table row is whole credits and every length is selectable data', () => {
    for (const row of EPISODE_LENGTH_RATES) {
      expect(Number.isInteger(row.creditsPerEpisode)).toBe(true);
      expect(row.creditsPerEpisode).toBeGreaterThan(0);
      expect(episodeRateFor(row.lengthSec)).toBe(row);
    }
    expect(episodeRateFor(45)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The episode plan: CRUD inside the tool's 1–8 schema range
// ---------------------------------------------------------------------------

describe('episode plan rules (CP-1 episodeCount 1–8)', () => {
  it('a new series seeds the G-16 done-when batch size by default', () => {
    expect(DEFAULT_EPISODE_COUNT).toBe(4);
    expect(makeSeries().episodes).toHaveLength(4);
    expect(makeSeries().episodes.every((e) => e.status === 'planned')).toBe(true);
    expect(makeSeries().episodes.every((e) => e.title === '')).toBe(true);
  });

  it('seedEpisodes clamps counts into 1–8 and treats 0 as unset (the default batch)', () => {
    expect(seedEpisodes(0)).toHaveLength(DEFAULT_EPISODE_COUNT);
    expect(seedEpisodes(99)).toHaveLength(MAX_EPISODES);
    expect(seedEpisodes(8)).toHaveLength(8);
    expect(seedEpisodes(1)).toHaveLength(1);
  });

  it('addEpisode appends up to the 8 cap and then returns the plan unchanged', () => {
    let episodes = seedEpisodes(MAX_EPISODES - 1, 60);
    expect(canAddEpisode(episodes)).toBe(true);
    episodes = addEpisode(episodes);
    expect(episodes).toHaveLength(MAX_EPISODES);
    expect(canAddEpisode(episodes)).toBe(false);
    const capped = addEpisode(episodes);
    expect(capped).toBe(episodes);
    expect(capped).toHaveLength(MAX_EPISODES);
  });

  it('removeEpisode never drops the plan below the tool minimum of 1', () => {
    let episodes = seedEpisodes(2, 60);
    expect(canRemoveEpisode(episodes)).toBe(true);
    episodes = removeEpisode(episodes, 'ep-2');
    expect(episodes).toHaveLength(1);
    expect(canRemoveEpisode(episodes)).toBe(false);
    expect(removeEpisode(episodes, 'ep-1')).toBe(episodes);
  });

  it('updateEpisode writes titles and refuses a length that is not in the table', () => {
    let episodes = seedEpisodes(2, 60);
    episodes = updateEpisode(episodes, 'ep-1', { title: 'Monsoon Market' });
    expect(episodes[0]!.title).toBe('Monsoon Market');
    episodes = updateEpisode(episodes, 'ep-1', { lengthSec: 45 });
    expect(episodes[0]!.lengthSec).toBe(60);
    episodes = updateEpisode(episodes, 'ep-1', { lengthSec: 90 });
    expect(episodes[0]!.lengthSec).toBe(90);
  });

  it('moveEpisode reorders and treats the edges as no-ops', () => {
    const episodes = seedEpisodes(3, 60);
    const moved = moveEpisode(episodes, 'ep-2', -1);
    expect(moved.map((e) => e.id)).toEqual(['ep-2', 'ep-1', 'ep-3']);
    expect(moveEpisode(episodes, 'ep-1', -1)).toBe(episodes);
    expect(moveEpisode(episodes, 'ep-3', 1)).toBe(episodes);
  });

  it('episode numbers are positional — removing one renumbers the rest in the quote', () => {
    let episodes = seedEpisodes(3, 60);
    episodes = updateEpisode(episodes, 'ep-3', { title: 'Finale' });
    episodes = removeEpisode(episodes, 'ep-1');
    const quote = episodeQuote(episodes);
    expect(quote.lines[1]).toContain('Episode 2');
    expect(quote.lines[1]).toContain('“Finale”');
  });
});

// ---------------------------------------------------------------------------
// Series + story bible
// ---------------------------------------------------------------------------

describe('series draft + story bible', () => {
  it('createSeriesDraft trims, validates the tone and starts as an ungenerated draft', () => {
    const series = makeSeries({ name: '  Tiffin  ', toneId: 'not-a-tone' });
    expect(series.name).toBe('Tiffin');
    expect(series.toneId).toBeNull();
    expect(series.status).toBe('draft');
    expect(series.generationState).toBe('not-started');
    expect(storyToneById(makeSeries().toneId)?.label).toBe('Cosy & Warm');
  });

  it('the bible fields are the user\'s writing; completeness counts filled fields', () => {
    let bible = emptyBible();
    expect(bibleCompleteness(bible)).toEqual({ filled: 0, total: 6 });
    bible = updateBible(bible, 'characters', 'Meera, a tiffin carrier.');
    bible = updateBible(bible, 'previouslyOn', 'The box reached the docks.');
    expect(bibleCompleteness(bible).filled).toBe(2);
    expect(bible.setting).toBe('');
  });

  it('updateSeries cannot move a series out of draft status', () => {
    const series = makeSeries();
    const updated = updateSeries([series], series.id, {
      premise: 'A new what-if.',
      status: 'draft',
    });
    expect(updated[0]!.premise).toBe('A new what-if.');
    expect(updated[0]!.status).toBe('draft');
  });

  it('removeSeries and seriesById operate on the caller\'s own library only', () => {
    const a = makeSeries();
    const b = makeSeries({ id: 'series-2', name: 'Second' });
    expect(seriesById([a, b], 'series-2')).toBe(b);
    expect(seriesById([a, b], 'series-99')).toBeNull();
    expect(removeSeries([a, b], a.id)).toEqual([b]);
  });

  it('runtime sums the per-episode lengths and formats plainly', () => {
    const series = makeSeries({ episodeCount: 3, lengthSec: 90 });
    expect(seriesRuntimeSeconds(series)).toBe(270);
    expect(formatRuntimeSeconds(270)).toBe('4m 30s');
    expect(formatRuntimeSeconds(120)).toBe('2m');
    expect(formatRuntimeSeconds(45)).toBe('45s');
  });
});

// ---------------------------------------------------------------------------
// The generation attempt — the honesty core
// ---------------------------------------------------------------------------

describe('attemptStoryGeneration', () => {
  it('refuses a blank premise before anything else', () => {
    const outcome = attemptStoryGeneration(makeSeries({ premise: '   ' }));
    expect(outcome.status).toBe('invalid');
  });

  it('refuses an out-of-range batch (0 episodes) with the tool range stated', () => {
    const bare: StorySeries = { ...makeSeries(), episodes: [] };
    const outcome = attemptStoryGeneration(bare);
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') expect(outcome.message).toContain('1–8');
  });

  it('a valid attempt lands NOT_CONFIGURED, premise verbatim, nothing charged', () => {
    const series = makeSeries();
    const outcome = attemptStoryGeneration(series);
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') return;
    expect(outcome.tool).toBe(STORY_EPISODE_TOOL);
    expect(outcome.code).toBe('PROVIDER_NOT_CONFIGURED');
    expect(outcome.premise).toBe(series.premise);
    expect(outcome.episodeCount).toBe(4);
    expect(outcome.chargedCredits).toBe(0);
    expect(outcome.message).toContain('PROVIDER_NOT_CONFIGURED');
  });

  it('the outcome type provably carries no episodes, outputs, job or URL', () => {
    const outcome = attemptStoryGeneration(makeSeries());
    expect('episodes' in outcome).toBe(false);
    expect('outputs' in outcome).toBe(false);
    expect('job' in outcome).toBe(false);
    expect('url' in outcome).toBe(false);
    expect('seriesId' in outcome).toBe(false);
  });

  it('applyGenerationOutcome records the honest state and never touches episodes', () => {
    const series = makeSeries();
    const outcome = attemptStoryGeneration(series);
    const next = applyGenerationOutcome([series], series.id, outcome);
    expect(next[0]!.generationState).toBe('not-configured');
    expect(next[0]!.episodes).toEqual(series.episodes);
    expect(next[0]!.episodes.every((e) => e.status === 'planned')).toBe(true);
    const invalid = attemptStoryGeneration(makeSeries({ premise: '' }));
    expect(applyGenerationOutcome([series], series.id, invalid)).toEqual([series]);
  });
});

// ---------------------------------------------------------------------------
// The draft mirror — round-trip and status forcing
// ---------------------------------------------------------------------------

describe('stories draft mirror', () => {
  it('round-trips a full library (premise, tone, episodes, bible) unchanged', () => {
    let series = makeSeries();
    series = {
      ...series,
      bible: updateBible(series.bible, 'characters', 'Meera, a tiffin carrier.'),
      episodes: updateEpisode(series.episodes, 'ep-1', { title: 'First Run', lengthSec: 120 }),
    };
    const parsed = parseStoriesDraft(serializeStoriesDraft(draftWith([series])));
    expect(parsed.series).toEqual([series]);
  });

  it('FORCES forged statuses back: no mirror can mint a generated episode', () => {
    const forged = JSON.stringify({
      series: [
        {
          id: 'series-1',
          name: 'Forged',
          premise: 'P',
          toneId: 'cosy',
          status: 'published',
          generationState: 'completed',
          episodes: [
            { id: 'ep-1', title: 'T', lengthSec: 60, status: 'generated' },
            { id: 'ep-2', title: 'U', lengthSec: 60, status: 'ready' },
          ],
          bible: {},
          createdAt: NOW,
        },
      ],
    });
    const parsed = parseStoriesDraft(forged);
    expect(parsed.series[0]!.status).toBe('draft');
    expect(parsed.series[0]!.generationState).toBe('not-started');
    expect(parsed.series[0]!.episodes.every((e) => e.status === 'planned')).toBe(true);
  });

  it('coerces an unknown episode length to the default and clamps the plan to 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `ep-${i + 1}`,
      title: '',
      lengthSec: i === 0 ? 45 : 60,
      status: 'planned',
    }));
    const parsed = parseStoriesDraft(
      JSON.stringify({ series: [{ id: 'series-1', name: 'S', episodes: many }] }),
    );
    expect(parsed.series[0]!.episodes).toHaveLength(MAX_EPISODES);
    expect(parsed.series[0]!.episodes[0]!.lengthSec).toBe(60);
  });

  it('drops malformed entries field by field and survives garbage input', () => {
    expect(parseStoriesDraft(null)).toEqual(EMPTY_STORIES_DRAFT);
    expect(parseStoriesDraft('not json')).toEqual(EMPTY_STORIES_DRAFT);
    expect(parseStoriesDraft('{"series": 42}')).toEqual(EMPTY_STORIES_DRAFT);
    const parsed = parseStoriesDraft(
      JSON.stringify({ series: [{ name: 'no id' }, { id: 'series-7', name: 'Kept', toneId: 'bogus' }] }),
    );
    expect(parsed.series).toHaveLength(1);
    expect(parsed.series[0]!.id).toBe('series-7');
    expect(parsed.series[0]!.toneId).toBeNull();
  });

  it('the mirror key is the versioned stories key', () => {
    expect(STORIES_DRAFT_KEY).toBe('quantcooks.stories.draft.v1');
  });
});

// ---------------------------------------------------------------------------
// Rendering — home: the five states
// ---------------------------------------------------------------------------

describe('StoriesHome rendering', () => {
  it('loading state renders alone', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: EMPTY_STORIES_DRAFT, libraryState: 'loading' as const }),
    );
    expect(html).toContain('data-testid="stories-loading"');
    expect(html).not.toContain('data-testid="stories-list"');
  });

  it('error state explains the device read failure and offers a retry', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: EMPTY_STORIES_DRAFT, libraryState: 'error' as const }),
    );
    expect(html).toContain('data-testid="stories-error"');
    expect(html).toContain('Retry reading this device');
  });

  it('empty state invites the first series and shows the new-series form', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: EMPTY_STORIES_DRAFT }),
    );
    expect(html).toContain('data-testid="stories-empty"');
    expect(html).toContain('data-testid="stories-new-form"');
    expect(html).toContain('No series yet');
  });

  it('names the tool twin and the not-configured truth on the surface', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: EMPTY_STORIES_DRAFT }),
    );
    expect(html).toContain(STORY_EPISODE_TOOL);
    expect(html).toContain('PROVIDER_NOT_CONFIGURED');
    expect(html).toContain('no server home for a series yet');
  });

  it('populated state renders only real local data per card', () => {
    const series = makeSeries();
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: draftWith([series]) }),
    );
    expect(html).toContain('data-testid="stories-list"');
    expect(html).toContain('The Travelling Tiffin');
    expect(html).toContain('4 episodes planned');
    expect(html).toContain('4m total');
    expect(html).toContain(`batch quote ${seriesQuote(series).credits} credits`);
    expect(html).toContain('Episodes: planned — none generated');
    expect(html).toContain('Draft on this device');
    expect(html).toContain(`href="/studio/stories/${series.id}"`);
  });

  it('no card anywhere renders a generated episode, a player or a watch action', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesHome, { initialDraft: draftWith([makeSeries()]) }),
    );
    expect(html).not.toContain('<video');
    expect(html).not.toContain('Watch episode');
    expect(html).not.toContain('Play episode');
  });
});

// ---------------------------------------------------------------------------
// Rendering — workspace: states, plan, bible, quote, not-configured
// ---------------------------------------------------------------------------

describe('StoriesWorkspace rendering', () => {
  it('loading and error states render alone', () => {
    const loading = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: 'series-1', workspaceState: 'loading' as const }),
    );
    expect(loading).toContain('data-testid="stories-workspace-loading"');
    const error = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: 'series-1', workspaceState: 'error' as const }),
    );
    expect(error).toContain('data-testid="stories-workspace-error"');
  });

  it('an unknown series id renders the honest not-on-this-device state', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: 'series-99', initialDraft: draftWith([makeSeries()]) }),
    );
    expect(html).toContain('data-testid="stories-workspace-notfound"');
    expect(html).toContain('not on this device');
    expect(html).toContain('href="/studio/stories"');
  });

  it('populated workspace renders premise, bible, plan, quote and the not-configured banner', () => {
    const series = makeSeries();
    const html = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: series.id, initialDraft: draftWith([series]) }),
    );
    expect(html).toContain('data-testid="stories-notconfigured"');
    expect(html).toContain(STORY_EPISODE_TOOL);
    expect(html).toContain(series.premise);
    expect(html).toContain('data-testid="stories-bible"');
    expect(html).toContain('data-testid="stories-episodes"');
    expect(html).toContain('data-testid="stories-quote"');
    // One breakdown line per episode + the costed Generate label.
    for (const line of seriesQuote(series).lines) {
      expect(html).toContain(line.replace(/"/g, '&quot;'));
    }
    expect(html).toContain(`Generate 4 episodes · ${seriesQuote(series).credits} credits`);
    // The bible note states the context rule and the no-auto-read truth.
    expect(html).toContain('travels with the request as context');
    expect(html).toContain('Nothing reads, checks or continues it automatically today');
  });

  it('every episode row renders Planned — never a generated or ready state', () => {
    const series = makeSeries();
    const html = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: series.id, initialDraft: draftWith([series]) }),
    );
    const plannedCount = (html.match(/studio-stories-chip">Planned</g) ?? []).length;
    expect(plannedCount).toBe(series.episodes.length);
    expect(html).not.toContain('<video');
    expect(html).not.toContain('Watch episode');
    expect(html).not.toContain('Episode ready');
    expect(html).not.toContain('Generated ✓');
  });

  it('a series with a recorded failed attempt says so, with nothing charged', () => {
    const series: StorySeries = { ...makeSeries(), generationState: 'not-configured' };
    const html = renderToStaticMarkup(
      React.createElement(StoriesWorkspace, { seriesId: series.id, initialDraft: draftWith([series]) }),
    );
    expect(html).toContain('data-testid="stories-generation-state"');
    expect(html).toContain('nothing was charged');
  });
});
