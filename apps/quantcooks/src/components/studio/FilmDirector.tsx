// ============================================================================
// QuantCooks Studio — Recipe Film Studio: Director surfaces (spec §5.3,
// §5.5, §5.6; checklist #41 composer, #42 Director Panel, #44 AI Director,
// #45 Storyboard)
//
// Three surfaces over ONE shot list (the workspace owns the list; this
// component renders and edits it through callbacks):
//  - The film composer: Genre / Style / Camera chips over the shared
//    Composer; its Generate is the per-shot generation face and stays
//    not-configured, naming quantcooks.create_shot_sequence.
//  - The Director Panel: START FRAME / END FRAME slots, Movement, a
//    speed-ramp choice with a mini-graph, Duration. Composing a shot
//    here is REAL — "Add this shot to the plan" appends it to the list.
//    Generating it directly is not configured, and says so.
//  - The AI Director panel + storyboard strip: the ask box lands on the
//    honest NOT_CONFIGURED outcome (both tool twins named, planning
//    never charged, the ask preserved verbatim); the MANUAL shot list
//    under it is fully real — add/edit/reorder/remove, per-shot quotes
//    from film.ts on pricing.ts, frame approval, and a Generate action
//    whose disabled reasons come from the gate state machine and are
//    printed separately, never collapsed into one vague grey.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  DIRECTOR_STARTERS,
  FILM_PLAN_TOOL,
  FILM_SHOTS_TOOL,
  FILM_STORYBOARD_TOOL,
  SHOT_DURATIONS,
  attemptDirectorPlan,
  emptyShot,
  filmGenreById,
  filmStyleSummary,
  generationGate,
  moveShot,
  shotListQuote,
  shotQuote,
  type DirectorPlanOutcome,
  type FilmElement,
  type FilmGenre,
  type FilmShot,
  type FilmStyle,
} from '../../lib/studio/film';
import {
  DEFAULT_COMPOSER_SETTINGS,
  type ComposerSettings,
} from '../../lib/studio/pricing';
import { CAMERA_MOVES, cameraMoveById, type CameraMove } from '../../lib/studio/video';
import { pickableFrameAssets } from '../../lib/studio/video';
import { Composer, type ComposerChip } from './Composer';
import { JobStrip } from './JobStrip';
import { CameraMovePicker, GenrePickerModal, StylePanel } from './FilmPickers';

export interface FilmDirectorProps {
  shots: FilmShot[];
  elements: FilmElement[];
  genreId: string | null;
  style: FilmStyle;
  heroPrompt: string;
  directorAsk: string;
  /** READY assets for the frame slots (unfiltered is fine). */
  assets?: ServerAsset[];
  jobs?: StudioJob[];
  onShotsChange: (shots: FilmShot[]) => void;
  onGenreChange: (genreId: string | null) => void;
  onStyleChange: (style: FilmStyle) => void;
  onHeroPromptChange: (prompt: string) => void;
  onDirectorAskChange: (ask: string) => void;
  /** Test seam: render as if a Director plan was just attempted. */
  initialPlanOutcome?: DirectorPlanOutcome | null;
  initialDirectorPanelShot?: Partial<FilmShot> | null;
}

const RAMP_CHOICES: Array<{ id: string; label: string; points: string }> = [
  { id: 'steady', label: 'Steady', points: '0,18 60,18' },
  { id: 'rush-in', label: 'Rush-In', points: '0,18 42,16 60,2' },
  { id: 'slow-finish', label: 'Slow Finish', points: '0,2 18,14 60,18' },
];

export const FilmDirector: React.FC<FilmDirectorProps> = ({
  shots,
  elements,
  genreId,
  style,
  heroPrompt,
  directorAsk,
  assets = [],
  jobs = [],
  onShotsChange,
  onGenreChange,
  onStyleChange,
  onHeroPromptChange,
  onDirectorAskChange,
  initialPlanOutcome = null,
  initialDirectorPanelShot = null,
}) => {
  const [genreModalOpen, setGenreModalOpen] = useState(false);
  const [manualStyle, setManualStyle] = useState(false);
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const [composerMoveId, setComposerMoveId] = useState<string | null>(null);
  const [planOutcome, setPlanOutcome] = useState<DirectorPlanOutcome | null>(initialPlanOutcome);
  // Director Panel state — one shot being composed.
  const [panelMoveId, setPanelMoveId] = useState<string | null>(initialDirectorPanelShot?.cameraMoveId ?? null);
  const [panelDuration, setPanelDuration] = useState<number>(initialDirectorPanelShot?.durationSeconds ?? 5);
  const [panelRamp, setPanelRamp] = useState<string>('steady');
  const [panelStartFrameId, setPanelStartFrameId] = useState<string | null>(null);
  const [panelEndFrameId, setPanelEndFrameId] = useState<string | null>(null);
  const [panelSubject, setPanelSubject] = useState<string>(initialDirectorPanelShot?.title ?? '');

  const baseSettings: ComposerSettings = DEFAULT_COMPOSER_SETTINGS;
  const total = shotListQuote(baseSettings, shots);
  const gate = generationGate(shots, false);
  const genre = filmGenreById(genreId);
  const composerMove = cameraMoveById(composerMoveId);
  const frames = pickableFrameAssets(assets);

  const patchShot = (id: string, patch: Partial<FilmShot>) =>
    onShotsChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addManualShot = () => {
    const usedIds = new Set(shots.map((s) => s.id));
    let n = shots.length + 1;
    while (usedIds.has(`shot-${n}`)) n += 1;
    onShotsChange([...shots, emptyShot(`shot-${n}`)]);
  };

  const addPanelShot = () => {
    const usedIds = new Set(shots.map((s) => s.id));
    let n = shots.length + 1;
    while (usedIds.has(`shot-${n}`)) n += 1;
    const elementIds = [panelStartFrameId, panelEndFrameId].filter(
      (id): id is string => typeof id === 'string',
    );
    onShotsChange([
      ...shots,
      {
        ...emptyShot(`shot-${n}`),
        title: panelSubject,
        description: panelSubject,
        durationSeconds: panelDuration,
        cameraMoveId: panelMoveId,
        elementIds,
      },
    ]);
  };

  const chips: ComposerChip[] = [
    {
      id: 'genre',
      label: 'Genre',
      value: genre?.name,
      onPick: () => setGenreModalOpen(true),
      onClear: () => onGenreChange(null),
    },
    {
      id: 'style',
      label: 'Style',
      value: manualStyle ? filmStyleSummary(style) : undefined,
      onPick: () => setManualStyle((on) => !on),
      onClear: () => setManualStyle(false),
    },
    {
      id: 'camera',
      label: 'Camera',
      value: composerMove?.name,
      onPick: () => setCameraPickerOpen((open) => !open),
      onClear: () => setComposerMoveId(null),
    },
  ];

  return (
    <div className="studio-film-director" data-testid="film-director">
      {/* ------------------------------------------------ film composer (#41) */}
      <section aria-label="Film composer">
        <h3>Film composer</h3>
        {manualStyle && (
          <StylePanel style={style} onChange={onStyleChange} manual={manualStyle} onManualChange={setManualStyle} />
        )}
        {cameraPickerOpen && (
          <CameraMovePicker
            selectedId={composerMoveId}
            onSelect={(move: CameraMove) => {
              setComposerMoveId(move.id);
              setCameraPickerOpen(false);
            }}
            onClear={() => {
              setComposerMoveId(null);
              setCameraPickerOpen(false);
            }}
          />
        )}
        <Composer
          key={`film-composer-${composerMoveId ?? 'none'}`}
          kind="video"
          chips={chips}
          placeholder="Describe the shot… @ a dish, kitchen or presenter, / a collection"
          initialPrompt={heroPrompt}
          onPromptChange={onHeroPromptChange}
          initialSettings={{ stackedExtras: composerMoveId ? 1 : 0 }}
          generation="not-configured"
          notConfiguredReason={`Shot generation is not connected yet — the ${FILM_SHOTS_TOOL} tool has no provider configured (NOT_CONFIGURED). Your shot list and its prices are real; nothing will be charged.`}
        />
      </section>

      {/* ------------------------------------------------ Director Panel (#42) */}
      <section className="studio-film-director-panel" data-testid="film-director-panel" aria-label="Director panel">
        <h3>Director Panel</h3>
        <p>
          Compose one shot precisely — frames, movement, ramp, duration — then add it to the plan. Adding
          is real; generating the shot on its own runs through {FILM_SHOTS_TOOL} and is not configured yet.
        </p>
        <div className="studio-film-frame-slots">
          <label>
            Start frame
            <select
              data-testid="film-panel-start-frame"
              value={panelStartFrameId ?? ''}
              onChange={(e) => setPanelStartFrameId(e.target.value || null)}
            >
              <option value="">No start frame</option>
              {frames.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </select>
          </label>
          <label>
            End frame
            <select
              data-testid="film-panel-end-frame"
              value={panelEndFrameId ?? ''}
              onChange={(e) => setPanelEndFrameId(e.target.value || null)}
            >
              <option value="">No end frame</option>
              {frames.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </select>
          </label>
        </div>
        {frames.length === 0 && (
          <p role="note" data-testid="film-panel-frames-empty">
            No stills in your library yet — frame slots fill from your READY photos, so they stay empty
            rather than inventing a frame.
          </p>
        )}
        <label>
          Shot subject
          <input
            type="text"
            data-testid="film-panel-subject"
            value={panelSubject}
            onChange={(e) => setPanelSubject(e.target.value)}
            placeholder="e.g. The tadka hits the dal"
          />
        </label>
        <label>
          Movement
          <select
            data-testid="film-panel-movement"
            value={panelMoveId ?? ''}
            onChange={(e) => setPanelMoveId(e.target.value || null)}
          >
            <option value="">Auto — director&rsquo;s choice</option>
            {CAMERA_MOVES.map((move) => (
              <option key={move.id} value={move.id}>
                {move.name}
              </option>
            ))}
          </select>
        </label>
        <div className="studio-film-ramp" role="radiogroup" aria-label="Speed ramp">
          {RAMP_CHOICES.map((ramp) => (
            <label key={ramp.id}>
              <input
                type="radio"
                name="film-ramp"
                data-testid={`film-panel-ramp-${ramp.id}`}
                checked={panelRamp === ramp.id}
                onChange={() => setPanelRamp(ramp.id)}
              />
              <svg viewBox="0 0 60 20" width="60" height="20" aria-hidden="true">
                <polyline points={ramp.points} fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              {ramp.label}
            </label>
          ))}
        </div>
        <label>
          Duration
          <select
            data-testid="film-panel-duration"
            value={panelDuration}
            onChange={(e) => setPanelDuration(Number(e.target.value))}
          >
            {SHOT_DURATIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}s
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-testid="film-panel-add-shot" onClick={addPanelShot}>
          Add this shot to the plan
        </button>
      </section>

      {/* ------------------------------------------------ AI Director (#44) */}
      <section className="studio-film-ai-director" data-testid="film-ai-director" aria-label="AI Director">
        <h3>AI Director</h3>
        <p>
          Describe the film and the Director breaks it into a shot list — framing, camera move, duration
          and element references per shot, with one total price. The Director is {FILM_PLAN_TOOL} in this
          panel and in QuantAI chat: same tool, same price, never two. Planning itself is never charged.
        </p>
        {directorAsk.trim() === '' && !planOutcome && (
          <div className="studio-film-director-starters" data-testid="film-director-starters">
            {DIRECTOR_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                data-testid={`film-director-starter-${DIRECTOR_STARTERS.indexOf(starter)}`}
                onClick={() => onDirectorAskChange(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        )}
        <label>
          Your brief for the Director
          <textarea
            data-testid="film-director-ask"
            value={directorAsk}
            rows={3}
            onChange={(e) => {
              onDirectorAskChange(e.target.value);
              setPlanOutcome(null);
            }}
            placeholder="Break this recipe into shots — establish the kitchen, close on the tadka, hero the plating…"
          />
        </label>
        <button
          type="button"
          data-testid="film-director-plan"
          onClick={() => setPlanOutcome(attemptDirectorPlan(directorAsk))}
        >
          Plan with Director
        </button>
        {planOutcome?.status === 'invalid' && (
          <p className="studio-film-director-error" data-testid="film-director-invalid" role="alert">
            {planOutcome.message}
          </p>
        )}
        {planOutcome?.status === 'not-configured' && (
          <p className="studio-film-director-notconfigured" data-testid="film-director-notconfigured" role="note">
            {planOutcome.message}
          </p>
        )}
      </section>

      {/* ------------------------------------------------ storyboard (#45) */}
      <section className="studio-film-storyboard" data-testid="film-storyboard" aria-label="Storyboard and shot list">
        <h3>Storyboard — frames first, spend second</h3>
        <p>
          Every shot is a frame in the strip ({FILM_STORYBOARD_TOOL}). Edit captions, reorder, approve
          frames — no video credits are spent before approval, and the same strip doubles as a visual
          recipe step-strip.
        </p>
        <JobStrip jobs={jobs} />
        {shots.length === 0 ? (
          <p data-testid="film-shots-empty">
            No shots yet. Add one by hand below, compose one in the Director Panel, or — once the Director
            connects — have it planned from your brief.
          </p>
        ) : (
          <ol className="studio-film-frame-strip">
            {shots.map((shot, index) => {
              const quote = shotQuote(baseSettings, shot);
              const move = cameraMoveById(shot.cameraMoveId);
              return (
                <li key={shot.id} className="studio-film-frame" data-testid={`film-shot-${shot.id}`}>
                  <header>
                    <strong>Frame {index + 1}</strong>
                    <span>
                      {shot.durationSeconds}s{move ? ` · ${move.name}` : ''} · {quote.credits} credits
                    </span>
                  </header>
                  <label>
                    Shot title
                    <input
                      type="text"
                      data-testid={`film-shot-title-${shot.id}`}
                      value={shot.title}
                      onChange={(e) => patchShot(shot.id, { title: e.target.value })}
                      placeholder="e.g. The tadka"
                    />
                  </label>
                  <label>
                    Caption — what happens in this frame
                    <textarea
                      data-testid={`film-shot-caption-${shot.id}`}
                      value={shot.description}
                      rows={2}
                      onChange={(e) => patchShot(shot.id, { description: e.target.value })}
                      placeholder="Hot ghee, mustard seeds crackling, poured over the dal…"
                    />
                  </label>
                  <label>
                    Duration
                    <select
                      data-testid={`film-shot-duration-${shot.id}`}
                      value={shot.durationSeconds}
                      onChange={(e) => patchShot(shot.id, { durationSeconds: Number(e.target.value) })}
                    >
                      {SHOT_DURATIONS.map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds}s
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Camera move
                    <select
                      data-testid={`film-shot-camera-${shot.id}`}
                      value={shot.cameraMoveId ?? ''}
                      onChange={(e) => patchShot(shot.id, { cameraMoveId: e.target.value || null })}
                    >
                      <option value="">Director&rsquo;s choice</option>
                      {CAMERA_MOVES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {elements.length > 0 && (
                    <fieldset>
                      <legend>Elements in this shot</legend>
                      {elements.map((element) => (
                        <label key={element.assetId}>
                          <input
                            type="checkbox"
                            data-testid={`film-shot-element-${shot.id}-${element.assetId}`}
                            checked={shot.elementIds.includes(element.assetId)}
                            onChange={(e) =>
                              patchShot(shot.id, {
                                elementIds: e.target.checked
                                  ? [...shot.elementIds, element.assetId]
                                  : shot.elementIds.filter((id) => id !== element.assetId),
                              })
                            }
                          />
                          {element.filename} ({element.kind})
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="studio-film-frame-actions">
                    <button
                      type="button"
                      data-testid={`film-shot-earlier-${shot.id}`}
                      disabled={index === 0}
                      onClick={() => onShotsChange(moveShot(shots, shot.id, -1))}
                    >
                      Earlier
                    </button>
                    <button
                      type="button"
                      data-testid={`film-shot-later-${shot.id}`}
                      disabled={index === shots.length - 1}
                      onClick={() => onShotsChange(moveShot(shots, shot.id, 1))}
                    >
                      Later
                    </button>
                    <button
                      type="button"
                      data-testid={`film-shot-remove-${shot.id}`}
                      onClick={() => onShotsChange(shots.filter((s) => s.id !== shot.id))}
                    >
                      Remove frame
                    </button>
                    <button
                      type="button"
                      data-testid={`film-shot-approve-${shot.id}`}
                      aria-pressed={shot.frameApproved}
                      onClick={() => patchShot(shot.id, { frameApproved: !shot.frameApproved })}
                    >
                      {shot.frameApproved ? 'Frame approved ✓ — tap to unapprove' : 'Approve frame'}
                    </button>
                  </div>
                  {!shot.frameApproved && (
                    <p className="studio-film-frame-gate" data-testid={`film-shot-gate-${shot.id}`} role="note">
                      Approve frame first — this shot cannot be generated, and no credits can move for it,
                      until its frame is approved.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <button type="button" data-testid="film-shots-add" onClick={addManualShot}>
          Add a frame
        </button>

        <div className="studio-film-generate-all" data-testid="film-generate-all">
          <h4>Generate all shots</h4>
          {total.lines.length > 0 && (
            <ul aria-label="Per-shot prices">
              {total.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p>
            Approved {gate.approvedCount} of {gate.totalShots} frames · Total{' '}
            <strong>{total.credits} credits</strong> if generated today
          </p>
          <button type="button" data-testid="film-generate-all-button" disabled={!gate.armed}>
            Generate all shots · {total.credits} credits
          </button>
          {!gate.armed && (
            <ul className="studio-film-gate-reasons" data-testid="film-gate-reasons" aria-label="Why generation is off">
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <GenrePickerModal
        open={genreModalOpen}
        selectedId={genreId}
        onSelect={(picked: FilmGenre) => {
          onGenreChange(picked.id);
          setGenreModalOpen(false);
        }}
        onClose={() => setGenreModalOpen(false)}
      />
    </div>
  );
};

export default FilmDirector;
