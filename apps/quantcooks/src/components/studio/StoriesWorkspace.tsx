// ============================================================================
// QuantCooks Studio — Story series workspace
// (route: /studio/stories/[seriesId], deep plan G-16, checklist #64)
//
// Anatomy: premise + tone composer → story bible → episode plan →
// per-episode quote breakdown → Generate. This is row #64's "draft
// review" made honest: G-16 imagines the system drafting progression,
// narration and ending for review, but no drafting system exists today
// — so the review surface is the USER's own plan (premise, bible fields
// for progression / narration / ending, user-written episode titles),
// reviewed and edited before any spend. Nothing here claims an AI
// drafted, read or improved any of it.
//
// What is REAL: every edit (premise, tone, bible, episode titles and
// lengths, add/remove/reorder inside the tool's 1–8 range) and the
// quote — per-length rate per episode, one breakdown line per episode,
// whole credits (stories.ts). The draft persists to the labelled
// per-device mirror; there is no server home for a series yet.
//
// What is NOT configured, and says so on the surface: generation.
// Generate attempts quantcooks.create_story_episode and lands on the
// honest PROVIDER_NOT_CONFIGURED outcome — the premise stays on screen
// word for word, nothing is charged, and every episode stays "Planned":
// an episode can never be marked generated on this client (the status
// type has one member and the mirror parser forces it).
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  EPISODE_LENGTH_RATES,
  EMPTY_STORIES_DRAFT,
  MAX_EPISODES,
  MIN_EPISODES,
  STORIES_DRAFT_KEY,
  STORY_BIBLE_FIELDS,
  STORY_EPISODE_TOOL,
  STORY_TONES,
  addEpisode,
  applyGenerationOutcome,
  attemptStoryGeneration,
  bibleCompleteness,
  canAddEpisode,
  canRemoveEpisode,
  episodeRateFor,
  formatRuntimeSeconds,
  moveEpisode,
  parseStoriesDraft,
  removeEpisode,
  seriesById,
  seriesQuote,
  seriesRuntimeSeconds,
  serializeStoriesDraft,
  storyToneById,
  updateBible,
  updateEpisode,
  updateSeries,
  type StoriesDraft,
  type StoryGenerationOutcome,
  type StorySeries,
} from '../../lib/studio/stories';

export type StoriesWorkspaceState = 'loading' | 'ready' | 'error';

export interface StoriesWorkspaceProps {
  seriesId: string;
  /** Test/SSR seam: the library to start from (skips the mirror read). */
  initialDraft?: StoriesDraft;
  /** Page-driven state (router readiness); defaults to the mirror's own. */
  workspaceState?: StoriesWorkspaceState;
}

interface MirrorRead {
  draft: StoriesDraft;
  failed: boolean;
}

function readMirror(): MirrorRead {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { draft: EMPTY_STORIES_DRAFT, failed: false };
  }
  try {
    return { draft: parseStoriesDraft(window.localStorage.getItem(STORIES_DRAFT_KEY)), failed: false };
  } catch {
    return { draft: EMPTY_STORIES_DRAFT, failed: true };
  }
}

export const StoriesWorkspace: React.FC<StoriesWorkspaceProps> = ({
  seriesId,
  initialDraft,
  workspaceState,
}) => {
  const [initialRead] = useState<MirrorRead>(() =>
    initialDraft ? { draft: initialDraft, failed: false } : readMirror(),
  );
  const [draft, setDraft] = useState<StoriesDraft>(initialRead.draft);
  const [mirrorFailed, setMirrorFailed] = useState(initialRead.failed);
  const [outcome, setOutcome] = useState<StoryGenerationOutcome | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORIES_DRAFT_KEY, serializeStoriesDraft(draft));
    } catch {
      // A full/blocked storage is not fatal: the workspace keeps working in memory.
    }
  }, [draft]);

  // The page passes a state only while the router is not ready and
  // defers (undefined) after that — then the mirror's own read result
  // decides ready vs error.
  const state: StoriesWorkspaceState = workspaceState ?? (mirrorFailed ? 'error' : 'ready');
  const series: StorySeries | null = seriesById(draft.series, seriesId);

  const handleRetry = () => {
    const read = readMirror();
    setDraft(read.draft);
    setMirrorFailed(read.failed);
  };

  if (state === 'loading') {
    return (
      <section className="studio-stories" data-testid="stories-workspace">
        <div className="studio-stories-state" data-testid="stories-workspace-loading">
          <p>Loading this series…</p>
        </div>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="studio-stories" data-testid="stories-workspace">
        <div className="studio-stories-state" data-testid="stories-workspace-error">
          <p>
            This device&apos;s saved series could not be read — the browser refused access to its
            local storage. Nothing was deleted; retrying usually clears it.
          </p>
          <button type="button" className="studio-stories-button" onClick={handleRetry}>
            Retry reading this device
          </button>
        </div>
      </section>
    );
  }

  if (!series) {
    return (
      <section className="studio-stories" data-testid="stories-workspace">
        <div className="studio-stories-state" data-testid="stories-workspace-notfound">
          <h1>This series is not on this device</h1>
          <p>
            Series drafts are saved per device while they have no server home, so a link from
            another device — or a cleared browser — lands here. Nothing was lost anywhere else;
            the series simply was never on this device.
          </p>
          <a className="studio-stories-button" href="/studio/stories">
            Back to your series library
          </a>
        </div>
      </section>
    );
  }

  const tone = storyToneById(series.toneId);
  const quote = seriesQuote(series);
  const bibleCount = bibleCompleteness(series.bible);
  const runtime = seriesRuntimeSeconds(series);

  const patchSeries = (patch: Partial<StorySeries>) =>
    setDraft((d) => ({ series: updateSeries(d.series, series.id, patch) }));

  const handleGenerate = () => {
    const result = attemptStoryGeneration(series);
    setOutcome(result);
    if (result.status === 'not-configured') {
      setDraft((d) => ({ series: applyGenerationOutcome(d.series, series.id, result) }));
    }
  };

  return (
    <section className="studio-stories" data-testid="stories-workspace">
      <header className="studio-stories-header">
        <a className="studio-stories-back" href="/studio/stories">
          ← All series
        </a>
        <label className="studio-stories-field">
          <span className="sr-only">Series name</span>
          <input
            type="text"
            className="studio-stories-name-input"
            value={series.name}
            onChange={(e) => patchSeries({ name: e.target.value })}
            data-testid="stories-name"
          />
        </label>
        <p className="studio-stories-card-meta">
          <span className="studio-stories-chip">Draft on this device</span>{' '}
          {series.episodes.length} episode{series.episodes.length === 1 ? '' : 's'} planned ·{' '}
          {formatRuntimeSeconds(runtime)} total planned runtime
        </p>
        <p className="studio-stories-notconfigured" role="note" data-testid="stories-notconfigured">
          Episode generation runs through <code>{STORY_EPISODE_TOOL}</code>, whose story provider
          is not configured yet (PROVIDER_NOT_CONFIGURED). Plan, bible and pricing are real;
          Generate charges nothing and produces nothing today.
        </p>
      </header>

      <div className="studio-stories-panel" data-testid="stories-composer">
        <h2>Premise &amp; tone</h2>
        <label className="studio-stories-field">
          <span>Premise — the “what-if” this series runs on (sent as the generation premise)</span>
          <textarea
            value={series.premise}
            onChange={(e) => patchSeries({ premise: e.target.value })}
            placeholder="What if one tiffin box crossed the city every day, and every cook who opened it added a dish — and a secret?"
            rows={3}
            data-testid="stories-premise"
          />
        </label>
        <label className="studio-stories-field">
          <span>Tone{tone ? ` — ${tone.note}` : ''}</span>
          <select
            value={series.toneId ?? ''}
            onChange={(e) => patchSeries({ toneId: e.target.value === '' ? null : e.target.value })}
            data-testid="stories-tone"
          >
            <option value="">No set tone</option>
            {STORY_TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="studio-stories-panel" data-testid="stories-bible">
        <h2>Story bible</h2>
        <p className="studio-stories-bible-note">
          The continuity record YOU keep — {bibleCount.filled} of {bibleCount.total} fields carry
          your writing. When generation connects, this bible travels with the request as context
          alongside the premise. Nothing reads, checks or continues it automatically today: if an
          episode changes a character, updating the bible is your edit, not the machine&apos;s.
        </p>
        {STORY_BIBLE_FIELDS.map((field) => (
          <label key={field.id} className="studio-stories-field">
            <span>
              {field.label} — {field.hint}
            </span>
            <textarea
              value={series.bible[field.id]}
              onChange={(e) => patchSeries({ bible: updateBible(series.bible, field.id, e.target.value) })}
              rows={2}
              data-testid={`stories-bible-${field.id}`}
            />
          </label>
        ))}
      </div>

      <div className="studio-stories-panel" data-testid="stories-episodes">
        <h2>Episode plan</h2>
        <p className="studio-stories-plan-note">
          A batch is {MIN_EPISODES}–{MAX_EPISODES} episodes — that is {STORY_EPISODE_TOOL}&apos;s own
          range. Titles are yours to write; the plan invents none. Every episode stays{' '}
          <strong>Planned</strong> until a real generation job completes on a server — this screen
          cannot mark one generated.
        </p>
        <ol className="studio-stories-episode-list">
          {series.episodes.map((episode, index) => {
            const rate = episodeRateFor(episode.lengthSec);
            return (
              <li key={episode.id} className="studio-stories-episode" data-testid={`stories-episode-${episode.id}`}>
                <span className="studio-stories-episode-number">Episode {index + 1}</span>
                <label className="studio-stories-field">
                  <span className="sr-only">Episode {index + 1} title</span>
                  <input
                    type="text"
                    value={episode.title}
                    onChange={(e) =>
                      patchSeries({ episodes: updateEpisode(series.episodes, episode.id, { title: e.target.value }) })
                    }
                    placeholder="Name this episode — your title"
                    data-testid={`stories-episode-title-${episode.id}`}
                  />
                </label>
                <label className="studio-stories-field">
                  <span className="sr-only">Episode {index + 1} length</span>
                  <select
                    value={episode.lengthSec}
                    onChange={(e) =>
                      patchSeries({
                        episodes: updateEpisode(series.episodes, episode.id, { lengthSec: Number(e.target.value) }),
                      })
                    }
                    data-testid={`stories-episode-length-${episode.id}`}
                  >
                    {EPISODE_LENGTH_RATES.map((r) => (
                      <option key={r.lengthSec} value={r.lengthSec}>
                        {r.label} · {r.creditsPerEpisode} credits
                      </option>
                    ))}
                  </select>
                </label>
                <span className="studio-stories-episode-price">
                  {rate ? `${rate.creditsPerEpisode} credits` : ''}
                </span>
                <span className="studio-stories-chip">Planned</span>
                <span className="studio-stories-episode-actions">
                  <button
                    type="button"
                    className="studio-stories-button"
                    disabled={index === 0}
                    onClick={() => patchSeries({ episodes: moveEpisode(series.episodes, episode.id, -1) })}
                  >
                    Earlier
                  </button>
                  <button
                    type="button"
                    className="studio-stories-button"
                    disabled={index === series.episodes.length - 1}
                    onClick={() => patchSeries({ episodes: moveEpisode(series.episodes, episode.id, 1) })}
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    className="studio-stories-button"
                    disabled={!canRemoveEpisode(series.episodes)}
                    onClick={() => patchSeries({ episodes: removeEpisode(series.episodes, episode.id) })}
                  >
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="studio-stories-button"
          disabled={!canAddEpisode(series.episodes)}
          onClick={() => patchSeries({ episodes: addEpisode(series.episodes) })}
          data-testid="stories-add-episode"
        >
          Add episode
        </button>
        {!canAddEpisode(series.episodes) && (
          <p className="studio-stories-form-note">
            The plan is at the {MAX_EPISODES}-episode batch limit — start a second series for the
            next batch.
          </p>
        )}
      </div>

      <div className="studio-stories-panel studio-stories-quote" data-testid="stories-quote">
        <h2>Batch quote — per-length table, before any spend</h2>
        <ul className="studio-stories-quote-lines">
          {quote.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="studio-stories-quote-total">
          Total if generated today: {quote.credits} credit{quote.credits === 1 ? '' : 's'} (whole
          credits; lengths can differ per episode, so the total is the sum of the lines above).
        </p>
        <button
          type="button"
          className="studio-stories-button studio-stories-button-primary"
          onClick={handleGenerate}
          data-testid="stories-generate"
        >
          Generate {series.episodes.length} episode{series.episodes.length === 1 ? '' : 's'} ·{' '}
          {quote.credits} credit{quote.credits === 1 ? '' : 's'}
        </button>

        {outcome?.status === 'invalid' && (
          <p className="studio-stories-outcome" role="alert" data-testid="stories-outcome-invalid">
            {outcome.message}
          </p>
        )}
        {outcome?.status === 'not-configured' && (
          <div className="studio-stories-outcome" data-testid="stories-outcome-notconfigured">
            <p>{outcome.message}</p>
            <blockquote className="studio-stories-premise-kept">{outcome.premise}</blockquote>
            <p>Charged: {outcome.chargedCredits} credits. All episodes remain Planned.</p>
          </div>
        )}
        {series.generationState === 'not-configured' && !outcome && (
          <p className="studio-stories-outcome" data-testid="stories-generation-state">
            A Generate attempt was made for this series: {STORY_EPISODE_TOOL} answered
            PROVIDER_NOT_CONFIGURED and nothing was charged.
          </p>
        )}
      </div>
    </section>
  );
};
