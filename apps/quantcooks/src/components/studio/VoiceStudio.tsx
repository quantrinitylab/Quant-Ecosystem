// ============================================================================
// QuantCooks Studio — Voice Studio screen (spec §7.1–7.2, checklist #53–#54)
//
// Anatomy (per the unit brief): a script-first workspace. The script is a
// list of LINES (left), each with its own text, voice and price; the
// control rail (right) holds the two controls the Audio pattern keeps
// apart — the voice DIAL (who speaks: mode + slot) and the ENGINE
// dropdown (what renders it) — plus the language selector, the Reference
// Video slot for dubbing, and the results rail. JobStrip docks above the
// Generate bar. "My Presenters" and "Voice Library" are in-screen views
// (VoicePersonas / VoiceLibrary), the spec's sidebar destinations.
//
// What is REAL on this screen today:
//  - The script: line CRUD, per-line quotes and the total, composed on
//    pricing.ts; the too-long rule with a real Split action.
//  - Picks from the caller's own READY assets (the dub slot).
// What is NOT configured, and says so on the surface:
//  - Every generation. Generate attempts quantcooks.add_voiceover (or
//    quantcooks.dub_video in Translate mode) and lands on the honest
//    PROVIDER_NOT_CONFIGURED outcome — the script stays on screen, word
//    for word, and nothing is charged. The voice slots are unassigned
//    starter slots: no invented voice, no fake preview to play.
// ============================================================================

import React, { useEffect, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import { DEFAULT_COMPOSER_SETTINGS } from '../../lib/studio/pricing';
import {
  DIAL_MODES,
  DUB_QUOTE_NOTE,
  DUB_TOOL,
  EMPTY_VOICE_DRAFT,
  VOICE_ENGINES,
  VOICE_LANGUAGES,
  VOICE_SLOTS,
  VOICE_DRAFT_KEY,
  VOICEOVER_TOOL,
  addLine,
  attemptDub,
  attemptVoiceover,
  dialModeTool,
  emptyLine,
  estimateSpeechSeconds,
  lineQuote,
  lineTextError,
  moveLine,
  nextLineId,
  parseVoiceDraft,
  pickableDubAssets,
  removeLine,
  scriptQuote,
  serializeVoiceDraft,
  splitLineText,
  updateLine,
  voiceEngineById,
  voiceLanguageById,
  voiceResultsFromJobs,
  withDialMode,
  withEnginePick,
  withLanguage,
  withVoicePick,
  type DubOutcome,
  type VoiceDraft,
  type VoiceoverOutcome,
} from '../../lib/studio/voice';
import { JobStrip } from './JobStrip';
import { VoicePersonas } from './VoicePersonas';
import { VoiceLibrary } from './VoiceLibrary';

export type VoiceAssetsState = 'loading' | 'ready' | 'error';
export type VoiceView = 'script' | 'presenters' | 'voices';

/** The sample script chip on the empty state (spec §7.2). */
export const VOICE_STARTER_LINE = "Welcome to today's recipe — let's get everything on the counter before we light the stove.";

export interface VoiceStudioProps {
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: VoiceAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** Real jobs for the strip/results (export-shaped today; [] is honest). */
  jobs?: StudioJob[];
  initialView?: VoiceView;
  initialDraft?: VoiceDraft;
}

function readMirror(): VoiceDraft {
  if (typeof window === 'undefined' || !window.localStorage) return EMPTY_VOICE_DRAFT;
  try {
    return parseVoiceDraft(window.localStorage.getItem(VOICE_DRAFT_KEY));
  } catch {
    return EMPTY_VOICE_DRAFT;
  }
}

export const VoiceStudio: React.FC<VoiceStudioProps> = ({
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  jobs = [],
  initialView = 'script',
  initialDraft,
}) => {
  const [mirror] = useState(() => readMirror());
  const [draft, setDraft] = useState<VoiceDraft>(() => initialDraft ?? mirror);
  const [view, setView] = useState<VoiceView>(initialView);
  const [voiceoverOutcome, setVoiceoverOutcome] = useState<VoiceoverOutcome | null>(null);
  const [dubOutcome, setDubOutcome] = useState<DubOutcome | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(VOICE_DRAFT_KEY, serializeVoiceDraft(draft));
    } catch {
      // A full/blocked storage is not fatal: the studio keeps working in memory.
    }
  }, [draft]);

  const { session, lines } = draft;
  const engine = voiceEngineById(session.engineId) ?? VOICE_ENGINES[0]!;
  const language = voiceLanguageById(session.languageId);
  const quote = scriptQuote(DEFAULT_COMPOSER_SETTINGS, engine, lines);
  const dubbable = pickableDubAssets(assets);
  const referenceVideo = dubbable.find((a) => a.id === draft.referenceVideoAssetId) ?? null;
  const results = voiceResultsFromJobs(jobs);
  const isTranslate = session.dialMode === 'translate';

  const setSession = (next: VoiceDraft['session']) =>
    setDraft((d) => ({ ...d, session: next }));

  const handleGenerate = () => {
    if (isTranslate) {
      setDubOutcome(attemptDub({ asset: referenceVideo, session }));
      setVoiceoverOutcome(null);
    } else {
      setVoiceoverOutcome(attemptVoiceover(session, lines));
      setDubOutcome(null);
    }
  };

  const handleSplit = (lineId: string, text: string) => {
    const [head, tail] = splitLineText(text);
    setDraft((d) => {
      const first = updateLine(d.lines, lineId, { text: head });
      if (tail === '') return { ...d, lines: first };
      const index = first.findIndex((l) => l.id === lineId);
      const newLine = { ...emptyLine(nextLineId(first)), text: tail };
      const next = [...first];
      next.splice(index + 1, 0, newLine);
      return { ...d, lines: next };
    });
  };

  return (
    <section className="studio-voice" data-testid="voice-studio">
      <header className="studio-voice-head">
        <h1><span className="studio-title-accent">Voice</span> Studio</h1>
        <p>
          Give your dish a voice — recipe narration, ad voiceovers and dubbing for a new audience,
          line by line. Scripts, personas and voice drafts are saved as a draft on this device
          until their server home lands.
        </p>
      </header>

      <nav className="studio-voice-views" aria-label="Voice Studio views">
        <button type="button" data-testid="voice-nav-script" aria-pressed={view === 'script'} onClick={() => setView('script')}>
          Script
        </button>
        <button type="button" data-testid="voice-nav-presenters" aria-pressed={view === 'presenters'} onClick={() => setView('presenters')}>
          My Presenters
        </button>
        <button type="button" data-testid="voice-nav-voices" aria-pressed={view === 'voices'} onClick={() => setView('voices')}>
          Voice Library
        </button>
      </nav>

      {view === 'presenters' && (
        <VoicePersonas
          personas={draft.personas}
          assets={assets}
          assetsState={assetsState}
          assetsError={assetsError}
          onRetryAssets={onRetryAssets}
          onPersonasChange={(personas) => setDraft((d) => ({ ...d, personas }))}
        />
      )}

      {view === 'voices' && (
        <VoiceLibrary
          voiceClones={draft.voiceClones}
          assets={assets}
          assetsState={assetsState}
          assetsError={assetsError}
          onRetryAssets={onRetryAssets}
          onVoiceClonesChange={(voiceClones) => setDraft((d) => ({ ...d, voiceClones }))}
        />
      )}

      {view === 'script' && (
        <div className="studio-voice-layout">
          {/* ------------------------------------------------ script lines */}
          <div className="studio-voice-script" data-testid="voice-script">
            <h2>Script</h2>
            {lines.length === 0 && (
              <div className="studio-voice-empty" data-testid="voice-script-empty">
                <p>No lines yet. A script is a list of lines — each line is narrated, voiced and priced on its own.</p>
                <button
                  type="button"
                  data-testid="voice-starter-line"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      lines: addLine(d.lines, { ...emptyLine(nextLineId(d.lines)), text: VOICE_STARTER_LINE }),
                    }))
                  }
                >
                  Try: “Welcome to today&rsquo;s recipe…”
                </button>
              </div>
            )}
            <ol className="studio-voice-lines">
              {lines.map((line, index) => {
                const perLine = lineQuote(DEFAULT_COMPOSER_SETTINGS, engine, line);
                const error = lineTextError(line.text);
                return (
                  <li key={line.id} className="studio-voice-line" data-testid={`voice-line-${line.id}`}>
                    <span className="studio-voice-line-number">Line {index + 1}</span>
                    <textarea
                      aria-label={`Line ${index + 1} text`}
                      value={line.text}
                      rows={3}
                      onChange={(e) => setDraft((d) => ({ ...d, lines: updateLine(d.lines, line.id, { text: e.target.value }) }))}
                    />
                    <div className="studio-voice-line-meta">
                      <label>
                        Voice
                        <select
                          aria-label={`Line ${index + 1} voice`}
                          value={line.voiceSlotId ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              lines: updateLine(d.lines, line.id, {
                                voiceSlotId: e.target.value === '' ? null : e.target.value,
                              }),
                            }))
                          }
                        >
                          <option value="">Studio voice ({voiceSlotLabel(session.voiceSlotId)})</option>
                          {VOICE_SLOTS.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="studio-voice-line-quote" data-testid={`voice-line-quote-${line.id}`}>
                        {perLine
                          ? `${perLine.credits} credit${perLine.credits === 1 ? '' : 's'} · ≈${estimateSpeechSeconds(line.text)}s of speech`
                          : 'Blank lines are not narrated or priced.'}
                      </span>
                      <span className="studio-voice-line-actions">
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, lines: moveLine(d.lines, line.id, -1) }))}>
                          Earlier
                        </button>
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, lines: moveLine(d.lines, line.id, 1) }))}>
                          Later
                        </button>
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, lines: removeLine(d.lines, line.id) }))}>
                          Remove
                        </button>
                      </span>
                    </div>
                    {error && (
                      <p className="studio-voice-line-error" role="alert" data-testid={`voice-line-error-${line.id}`}>
                        {error}{' '}
                        <button type="button" onClick={() => handleSplit(line.id, line.text)}>
                          Split this line
                        </button>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              data-testid="voice-add-line"
              onClick={() => setDraft((d) => ({ ...d, lines: addLine(d.lines, emptyLine(nextLineId(d.lines))) }))}
            >
              Add a line
            </button>
          </div>

          {/* ------------------------------------------------ control rail */}
          <aside className="studio-voice-rail">
            <div
              className="studio-voice-dial"
              data-testid="voice-dial"
              aria-label="Voice dial"
              data-mode={session.dialMode}
            >
              <h2>Voice dial</h2>
              {/* Design upgrade Phase B (D-9): the dial is now a dial —
                  an original arc + ticks + needle (decorative; the
                  needle rests at the picked mode via data-mode in CSS).
                  The mode buttons below remain the actual controls. */}
              <div className="studio-voice-dial-face" aria-hidden="true">
                <svg viewBox="0 0 120 74" focusable="false">
                  <g className="studio-voice-dial-scale">
                    <path d="M14 64 A46 46 0 0 1 106 64" fill="none" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M10 64h7M24.6 28.6l5 5M60 14v7M95.4 28.6l-5 5M110 64h-7"
                      fill="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                  <g className="studio-voice-dial-needle">
                    <line x1="60" y1="64" x2="60" y2="27" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="60" cy="64" r="4" />
                  </g>
                </svg>
              </div>
              <div className="studio-voice-dial-modes" role="group" aria-label="Dial mode">
                {DIAL_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`voice-dial-mode-${mode.id}`}
                    aria-pressed={session.dialMode === mode.id}
                    onClick={() => setSession(withDialMode(session, mode.id))}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="studio-voice-dial-slots" role="group" aria-label="Voice">
                {VOICE_SLOTS.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    data-testid={`voice-slot-${slot.id}`}
                    aria-pressed={session.voiceSlotId === slot.id}
                    onClick={() => setSession(withVoicePick(session, slot.id))}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              <div className="studio-voice-slot-card" data-testid="voice-slot-card">
                <strong>{voiceSlotLabel(session.voiceSlotId)}</strong>
                <p>{VOICE_SLOTS.find((s) => s.id === session.voiceSlotId)?.note}</p>
                <p>
                  This slot is unassigned — no voice fills it yet, so there is no sample to preview.
                  Voices arrive with the voice provider, or from your own trained clone in the
                  Voice Library.
                </p>
              </div>
            </div>

            <div className="studio-voice-engine" data-testid="voice-engine">
              <h2>Engine</h2>
              <label>
                Rendering engine
                <select
                  aria-label="Rendering engine"
                  value={session.engineId}
                  onChange={(e) => setSession(withEnginePick(session, e.target.value))}
                >
                  {VOICE_ENGINES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <p data-testid="voice-engine-note">{engine.description}</p>
              <p>The dial picks who speaks; this dropdown picks what renders it. Neither changes the other.</p>
            </div>

            <div className="studio-voice-language" data-testid="voice-language">
              <h2>Language</h2>
              <label>
                Narration / dub language
                <select
                  aria-label="Language"
                  value={session.languageId}
                  onChange={(e) => setSession(withLanguage(session, e.target.value))}
                >
                  {VOICE_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              {language && <p>{language.note}</p>}
            </div>

            <div className="studio-voice-reference" data-testid="voice-reference-video">
              <h2>Reference Video</h2>
              <p>For dubbing: the clip whose voice gets replaced. Pick one of your ready videos.</p>
              {assetsState === 'loading' && <p data-testid="voice-assets-loading">Loading your library…</p>}
              {assetsState === 'error' && (
                <p role="alert" data-testid="voice-assets-error">
                  {assetsError ?? 'Your library could not be loaded.'}{' '}
                  <button type="button" onClick={() => onRetryAssets?.()}>
                    Retry
                  </button>
                </p>
              )}
              {assetsState === 'ready' && dubbable.length === 0 && (
                <p data-testid="voice-reference-empty">No ready videos in your library yet — an uploaded, finished clip will appear here.</p>
              )}
              {assetsState === 'ready' && dubbable.length > 0 && (
                <label>
                  Reference clip
                  <select
                    aria-label="Reference clip"
                    value={draft.referenceVideoAssetId ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, referenceVideoAssetId: e.target.value === '' ? null : e.target.value }))
                    }
                  >
                    <option value="">None picked</option>
                    {dubbable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.filename}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="studio-voice-results" data-testid="voice-results">
              <h2>Finished narration</h2>
              {results.length === 0 ? (
                <p data-testid="voice-results-empty">
                  Nothing rendered yet. A finished voiceover lands here and in Assets as an audio
                  asset — generation is not connected, so this rail stays honestly empty until a
                  voice provider lands.
                </p>
              ) : (
                <ul>
                  {results.map((card) => (
                    <li key={card.outputId} data-testid={`voice-result-${card.outputId}`}>
                      {card.url ? <audio controls src={card.url} /> : null}
                      <span>{card.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {view === 'script' && (
        <div className="studio-voice-generatebar">
          <JobStrip jobs={jobs} />
          {isTranslate ? (
            <>
              <p className="studio-voice-dub-quote" data-testid="voice-dub-quote-note">
                {DUB_QUOTE_NOTE}
              </p>
              <button type="button" data-testid="voice-generate" onClick={handleGenerate}>
                Dub this clip
              </button>
              {dubOutcome && (
                <p
                  className="studio-voice-outcome"
                  role={dubOutcome.status === 'invalid' ? 'alert' : 'status'}
                  data-testid="voice-dub-outcome"
                >
                  {dubOutcome.message}
                </p>
              )}
            </>
          ) : (
            <>
              <ul className="studio-voice-quote-lines" data-testid="voice-quote-lines">
                {quote.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button type="button" data-testid="voice-generate" onClick={handleGenerate}>
                {quote.credits > 0
                  ? `Generate · ${quote.credits} credit${quote.credits === 1 ? '' : 's'}`
                  : 'Generate · —'}
              </button>
              <span className="studio-voice-tool-note">
                Runs through {dialModeTool(session.dialMode)} — quote before spend, always.
              </span>
              {voiceoverOutcome && (
                <div className="studio-voice-outcome" data-testid="voice-outcome">
                  <p role={voiceoverOutcome.status === 'invalid' ? 'alert' : 'status'}>{voiceoverOutcome.message}</p>
                  {voiceoverOutcome.status === 'not-configured' && (
                    <ol className="studio-voice-preserved" data-testid="voice-preserved-script">
                      {voiceoverOutcome.lines.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}
          <span className="studio-voice-tool-note" data-testid="voice-tool-note">
            Twins: {VOICEOVER_TOOL} · {DUB_TOOL}
          </span>
        </div>
      )}
    </section>
  );
};

function voiceSlotLabel(slotId: string): string {
  return VOICE_SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
}

export default VoiceStudio;
