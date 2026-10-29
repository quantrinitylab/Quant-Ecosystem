// ============================================================================
// QuantCooks Studio — Episodic Stories home (route: /studio/stories,
// deep plan G-16, checklist #64)
//
// The series library. A series has NO server home yet (no Prisma model,
// no endpoint — CP-1's `seriesId?` is an optional param no executor
// persists), so the library lives in the labelled per-device draft
// mirror (stories.ts; the film/board/voice precedent) and says so on
// the surface. What is real here: creating, naming, planning and
// deleting series drafts, each card showing only the user's own local
// data — premise, tone, planned episode count and runtime, and the
// real composed quote. Generation is named and honestly not-configured:
// quantcooks.create_story_episode's provider is not connected, so no
// card shows an episode, a thumbnail or a "ready" state — there are
// none, and this screen cannot invent one.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  DEFAULT_EPISODE_COUNT,
  DEFAULT_EPISODE_LENGTH_SEC,
  EPISODE_LENGTH_RATES,
  EMPTY_STORIES_DRAFT,
  MAX_EPISODES,
  MIN_EPISODES,
  STORIES_DRAFT_KEY,
  STORY_EPISODE_TOOL,
  STORY_TONES,
  createSeriesDraft,
  episodeRateFor,
  formatRuntimeSeconds,
  nextSeriesId,
  parseStoriesDraft,
  removeSeries,
  seriesQuote,
  seriesRuntimeSeconds,
  serializeStoriesDraft,
  storyToneById,
  type StoriesDraft,
} from '../../lib/studio/stories';

export type StoriesLibraryState = 'loading' | 'ready' | 'error';

export interface StoriesHomeProps {
  /** Test/SSR seam: the library to start from (skips the mirror read). */
  initialDraft?: StoriesDraft;
  /** Page-driven state (router/mount); defaults to the mirror's own. */
  libraryState?: StoriesLibraryState;
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

const EPISODE_COUNT_OPTIONS = Array.from(
  { length: MAX_EPISODES - MIN_EPISODES + 1 },
  (_, i) => MIN_EPISODES + i,
);



export const StoriesHome: React.FC<StoriesHomeProps> = ({ initialDraft, libraryState }) => {
  const [initialRead] = useState<MirrorRead>(() =>
    initialDraft ? { draft: initialDraft, failed: false } : readMirror(),
  );
  const [draft, setDraft] = useState<StoriesDraft>(initialRead.draft);
  const [mirrorFailed, setMirrorFailed] = useState(initialRead.failed);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  // New-series form state.
  const [name, setName] = useState('');
  const [premise, setPremise] = useState('');
  const [toneId, setToneId] = useState<string>('');
  const [episodeCount, setEpisodeCount] = useState(DEFAULT_EPISODE_COUNT);
  const [lengthSec, setLengthSec] = useState(DEFAULT_EPISODE_LENGTH_SEC);
  const [formNote, setFormNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORIES_DRAFT_KEY, serializeStoriesDraft(draft));
    } catch {
      // A full/blocked storage is not fatal: the library keeps working in memory.
    }
  }, [draft]);

  // The page passes a state only for the pre-mount loading moment and
  // defers (undefined) after that — then the mirror's own read result
  // decides ready vs error.
  const state: StoriesLibraryState = libraryState ?? (mirrorFailed ? 'error' : 'ready');
  const series = draft.series;

  const handleRetry = () => {
    const read = readMirror();
    setDraft(read.draft);
    setMirrorFailed(read.failed);
  };

  const handleCreate = () => {
    if (name.trim() === '') {
      setFormNote('Give the series a name first — the premise and episode titles can grow inside the workspace.');
      return;
    }
    const created = createSeriesDraft({
      id: nextSeriesId(series),
      name,
      premise,
      toneId: toneId === '' ? null : toneId,
      episodeCount,
      lengthSec,
      createdAt: new Date().toISOString(),
    });
    setDraft((d) => ({ series: [...d.series, created] }));
    setLastCreatedId(created.id);
    setFormNote(null);
    setName('');
    setPremise('');
  };

  const handleRemove = (id: string) => {
    setDraft((d) => ({ series: removeSeries(d.series, id) }));
    setConfirmingRemoveId(null);
    if (lastCreatedId === id) setLastCreatedId(null);
  };

  return (
    <section className="studio-stories" data-testid="stories-home">
      <header className="studio-stories-header">
        <h1><span className="studio-title-accent">Story</span> Series</h1>
        <p className="studio-stories-lede">
          Episodic food stories, planned episode by episode: one “what-if” premise, a story bible
          you keep, and a batch priced per episode length before anything runs.
        </p>
        <p className="studio-stories-device-note">
          Series drafts live on this device for now — there is no server home for a series yet, so
          nothing here syncs or backs up. The follow-up that changes this is a server-side series
          document behind <code>{STORY_EPISODE_TOOL}</code>.
        </p>
        <p className="studio-stories-notconfigured" role="note">
          Generation is not configured yet: episodes are generated through{' '}
          <code>{STORY_EPISODE_TOOL}</code>, whose story provider is not connected
          (PROVIDER_NOT_CONFIGURED). Planning, the bible and pricing below are fully real; a
          Generate attempt charges nothing and produces nothing until the provider lands.
        </p>
      </header>

      {state === 'loading' && (
        <div className="studio-stories-state" data-testid="stories-loading">
          <p>Loading your series library…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="studio-stories-state" data-testid="stories-error">
          <p>
            This device&apos;s saved series could not be read — the browser refused access to its
            local storage. Nothing was deleted; retrying usually clears it.
          </p>
          <button type="button" className="studio-stories-button" onClick={handleRetry}>
            Retry reading this device
          </button>
        </div>
      )}

      {state === 'ready' && (
        <>
          {series.length === 0 ? (
            <div className="studio-stories-state" data-testid="stories-empty">
              <h2>No series yet</h2>
              <p>
                Start with a “what-if”: what if a tiffin box travelled across the city, changing one
                lunch — and one cook — at a time? Name the series below, set how many episodes the
                first batch plans, and the workspace opens with the premise, bible and episode plan
                ready to write.
              </p>
            </div>
          ) : (
            <ul className="studio-stories-list" data-testid="stories-list">
              {series.map((s) => {
                const tone = storyToneById(s.toneId);
                const quote = seriesQuote(s);
                const runtime = seriesRuntimeSeconds(s);
                return (
                  <li key={s.id} className="studio-stories-card" data-testid={`series-card-${s.id}`}>
                    <h2 className="studio-stories-card-name">{s.name}</h2>
                    <p className="studio-stories-card-premise">
                      {s.premise.trim() === '' ? 'No premise written yet — open the workspace to add the “what-if”.' : s.premise}
                    </p>
                    <p className="studio-stories-card-meta">
                      {tone ? `${tone.label} · ` : ''}
                      {s.episodes.length} episode{s.episodes.length === 1 ? '' : 's'} planned ·{' '}
                      {formatRuntimeSeconds(runtime)} total · batch quote{' '}
                      {quote.credits} credit{quote.credits === 1 ? '' : 's'}
                    </p>
                    <p className="studio-stories-card-status">
                      <span className="studio-stories-chip">Draft on this device</span>{' '}
                      <span className="studio-stories-chip">Episodes: planned — none generated</span>
                    </p>
                    <div className="studio-stories-card-actions">
                      <a className="studio-stories-button" href={`/studio/stories/${s.id}`}>
                        Open workspace
                      </a>
                      {confirmingRemoveId === s.id ? (
                        <>
                          <span>Remove this draft from this device?</span>
                          <button type="button" className="studio-stories-button" onClick={() => handleRemove(s.id)}>
                            Yes, remove it
                          </button>
                          <button type="button" className="studio-stories-button" onClick={() => setConfirmingRemoveId(null)}>
                            Keep it
                          </button>
                        </>
                      ) : (
                        <button type="button" className="studio-stories-button" onClick={() => setConfirmingRemoveId(s.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                    {lastCreatedId === s.id && (
                      <p className="studio-stories-created" data-testid="stories-created">
                        Series created as a draft on this device — open the workspace to write the
                        bible and name its episodes.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="studio-stories-new"
            data-testid="stories-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <h2>Start a series</h2>
            <label className="studio-stories-field">
              <span>Series name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Travelling Tiffin"
                data-testid="stories-new-name"
              />
            </label>
            <label className="studio-stories-field">
              <span>Premise — the “what-if” (you can refine it in the workspace)</span>
              <textarea
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                placeholder="What if one tiffin box crossed the city every day, and every cook who opened it added a dish — and a secret?"
                data-testid="stories-new-premise"
                rows={3}
              />
            </label>
            <div className="studio-stories-field-row">
              <label className="studio-stories-field">
                <span>Tone</span>
                <select value={toneId} onChange={(e) => setToneId(e.target.value)} data-testid="stories-new-tone">
                  <option value="">No set tone</option>
                  {STORY_TONES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="studio-stories-field">
                <span>Episodes in the first batch</span>
                <select
                  value={episodeCount}
                  onChange={(e) => setEpisodeCount(Number(e.target.value))}
                  data-testid="stories-new-count"
                >
                  {EPISODE_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} episode{n === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="studio-stories-field">
                <span>Episode length</span>
                <select
                  value={lengthSec}
                  onChange={(e) => setLengthSec(Number(e.target.value))}
                  data-testid="stories-new-length"
                >
                  {EPISODE_LENGTH_RATES.map((r) => (
                    <option key={r.lengthSec} value={r.lengthSec}>
                      {r.label} · {r.creditsPerEpisode} credits each
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(() => {
              const rate = episodeRateFor(lengthSec);
              return rate ? (
                <p className="studio-stories-new-quote">
                  First batch at this length: {rate.creditsPerEpisode} credits × {episodeCount}{' '}
                  episode{episodeCount === 1 ? '' : 's'} = {rate.creditsPerEpisode * episodeCount}{' '}
                  credits — the per-length table, priced before anything runs. Lengths can differ
                  per episode inside the workspace.
                </p>
              ) : null;
            })()}
            {formNote && (
              <p className="studio-stories-form-note" role="alert">
                {formNote}
              </p>
            )}
            <button type="submit" className="studio-stories-button studio-stories-button-primary">
              Create series draft
            </button>
          </form>
        </>
      )}
    </section>
  );
};
