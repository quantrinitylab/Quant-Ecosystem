// ============================================================================
// QuantCooks Studio — Explore home (spec §1.2) + 3-step wizard (§1.3)
//
// The front door is a preset feed, not a blank canvas. The feed renders the
// local preset catalogue (labelled as presets — a template catalogue, never
// dressed up as user/community content) with category chips and search.
// The wizard is the consumer on-ramp: 1 pick a preset → 2 write the brief
// in the shared Composer → 3 create a REAL project through the api-client.
// F-2: the success state stays on screen — it offers the editor deep-link
// and the projects gallery as explicit choices, plus the optional dish
// photo step (a real P0-3 upload into the just-created project; uploads
// need a project, so the photo honestly comes after the create, never
// before it). Generation is honestly not configured yet; project
// creation and the photo upload are real end-to-end.
//
// All five §0.3 states are implemented: loading (skeleton grid), empty
// (no catalogue / no matches), error (feed failed, Retry), not-configured
// (the wizard's Composer), populated (rows of preset cards).
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Composer } from './Composer';
import { JobStrip } from './JobStrip';
import {
  EXPLORE_ROW_TITLES,
  PRESET_CATEGORIES,
  STUDIO_PRESETS,
  featuredPreset,
  filterPresets,
  presetsForRow,
  type PresetCategory,
  type StudioPreset,
} from '../../lib/studio/presets';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  canAttachPhoto,
  canCreateProject,
  editorRouteFor,
  initialWizardState,
  runWizardCreate,
  runWizardPhotoUpload,
  selectPreset,
  setBrief,
  skipWizardPhoto,
  type WizardPhotoClient,
  type WizardProjectClient,
  type WizardState,
} from '../../lib/studio/wizard';

export type ExploreFeedState = 'loading' | 'error' | 'ready';

export interface ExploreHomeProps {
  feedState: ExploreFeedState;
  onRetryFeed?: () => void;
  /** Catalogue override (tests / a future list_presets feed). */
  presets?: StudioPreset[];
  /** Search text from the shell's top bar. */
  query?: string;
  /** The real project client (the page passes the api-client). */
  createProject: WizardProjectClient['createProject'];
  /**
   * The real P0-3 upload for the post-create photo step (the page wires
   * useAssetUpload). Omit = the photo step explains itself as unavailable
   * in this view rather than offering a dead control.
   */
  uploadPhoto?: WizardPhotoClient['uploadPhoto'];
  /** Pre-set wizard state (deep links / tests); defaults to a fresh wizard. */
  initialWizard?: WizardState;
  /** Real jobs to show in the strip (e.g. recent exports). Optional. */
  jobs?: StudioJob[];
}

function PresetCard({ preset, onTry }: { preset: StudioPreset; onTry: (preset: StudioPreset) => void }) {
  return (
    <article className="studio-preset-card" data-testid={`preset-${preset.id}`}>
      <p className="studio-preset-kind">Preset · {preset.category}</p>
      <h3>{preset.name}</h3>
      <p>{preset.description}</p>
      <p className="studio-preset-meta">
        Typical run · {preset.typicalCredits} credits · {preset.ratio}
        {preset.needsPhoto ? ' · starts from your dish photo' : ''}
      </p>
      <button type="button" onClick={() => onTry(preset)}>
        Try {preset.name}
      </button>
    </article>
  );
}

export const ExploreHome: React.FC<ExploreHomeProps> = ({
  feedState,
  onRetryFeed,
  presets = STUDIO_PRESETS,
  query = '',
  createProject,
  uploadPhoto,
  initialWizard,
  jobs = [],
}) => {
  const [category, setCategory] = useState<'All' | PresetCategory>('All');
  const [wizard, setWizard] = useState<WizardState>(() => initialWizard ?? initialWizardState());
  const [creating, setCreating] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const filtering = query.trim().length > 0 || category !== 'All';
  const matches = useMemo(
    () => filterPresets(presets, { query, category }),
    [presets, query, category],
  );
  const featured = useMemo(() => featuredPreset(presets), [presets]);

  const startWizard = (preset: StudioPreset) => setWizard((w) => selectPreset(w, preset));

  const handleCreate = async () => {
    setCreating(true);
    const result = await runWizardCreate(wizard, { createProject });
    setWizard(result.state);
    setCreating(false);
    // F-2: no automatic navigation on success — the success state below
    // offers the editor deep-link, the projects gallery and the photo
    // step as explicit choices.
  };

  const handlePhotoFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !uploadPhoto) return;
    setPhotoUploading(true);
    const uploading: WizardState = {
      ...wizard,
      photo: { ...wizard.photo, phase: 'uploading', error: null },
    };
    setWizard(uploading);
    const next = await runWizardPhotoUpload(uploading, file, { uploadPhoto });
    setWizard(next);
    setPhotoUploading(false);
  };

  // -- State: loading -------------------------------------------------------
  if (feedState === 'loading') {
    return (
      <section className="studio-explore" data-testid="explore-loading" aria-busy="true">
        <p>Loading presets…</p>
        <div className="studio-skeleton-row" aria-hidden="true">
          {['a', 'b', 'c', 'd'].map((key) => (
            <div key={key} className="studio-skeleton-card" />
          ))}
        </div>
      </section>
    );
  }

  // -- State: error ---------------------------------------------------------
  if (feedState === 'error') {
    return (
      <section className="studio-explore" data-testid="explore-error" role="alert">
        <h2>The preset feed could not be loaded</h2>
        <p>Your projects and assets are untouched — this only affects the Explore feed.</p>
        <button type="button" onClick={() => onRetryFeed?.()}>
          Retry
        </button>
      </section>
    );
  }

  // -- State: empty catalogue ----------------------------------------------
  if (presets.length === 0) {
    return (
      <section className="studio-explore" data-testid="explore-empty">
        <h2>Start cooking up your first clip</h2>
        <p>
          Explore is where ready-made food presets live. The catalogue is empty right now — start from a
          project instead, and presets will appear here as they are published.
        </p>
        <a href="/projects">Open your projects</a>
      </section>
    );
  }

  // -- State: populated (with the wizard; generation not-configured) -------
  return (
    <section className="studio-explore" data-testid="explore-home">
      {featured && !filtering && (
        <div className="studio-explore-hero" data-testid="explore-hero">
          <p className="studio-preset-kind">Featured preset</p>
          <h2>{featured.name}</h2>
          <p>{featured.description}</p>
          <button type="button" onClick={() => startWizard(featured)}>
            Try {featured.name} · typical run {featured.typicalCredits} credits
          </button>
        </div>
      )}

      <div className="studio-category-chips" role="group" aria-label="Preset categories">
        {PRESET_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            data-testid={`category-${cat}`}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtering ? (
        matches.length === 0 ? (
          <div className="studio-explore-nomatch" data-testid="explore-no-matches">
            <h3>No presets match that search</h3>
            <p>Try a dish, a move or a mood — or browse the closest categories instead:</p>
            <button
              type="button"
              onClick={() => setCategory('All')}
            >
              Show every preset
            </button>
          </div>
        ) : (
          <div className="studio-preset-grid" data-testid="explore-results">
            {matches.map((preset) => (
              <PresetCard key={preset.id} preset={preset} onTry={startWizard} />
            ))}
          </div>
        )
      ) : (
        EXPLORE_ROW_TITLES.map((rowTitle) => {
          const availableIds = new Set(presets.map((p) => p.id));
          const rowPresets = presetsForRow(rowTitle).filter((p) => availableIds.has(p.id));
          if (rowPresets.length === 0) return null;
          return (
            <div key={rowTitle} className="studio-preset-row">
              <h3>{rowTitle}</h3>
              <div className="studio-preset-row-cards">
                {rowPresets.map((preset) => (
                  <PresetCard key={preset.id} preset={preset} onTry={startWizard} />
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="studio-wizard" data-testid="explore-wizard">
        <h2>Make your first clip <span className="studio-title-accent">in three steps</span></h2>

        <div className="studio-wizard-step" data-testid="wizard-step-1">
          <h3>1 · Pick a preset</h3>
          {wizard.preset ? (
            <p>
              Selected: <strong>{wizard.preset.name}</strong> — pick another card above to change it.
            </p>
          ) : (
            <p>Choose any preset card above and press Try. No prompt needed to begin.</p>
          )}
        </div>

        <div className="studio-wizard-step" data-testid="wizard-step-2">
          <h3>2 · Add your brief</h3>
          <p>
            Say what is on the plate and the mood you want. This brief names and seeds your project — and
            right after you create it, you can attach the dish photo for real, saved into the project.
          </p>
          <Composer
            kind="video"
            placeholder="e.g. Butter chicken, steam rising, cosy dinner mood — @my-kitchen /festival-menu"
            onPromptChange={(text) => setWizard((w) => setBrief(w, text))}
          />
        </div>

        <div className="studio-wizard-step" data-testid="wizard-step-3">
          <h3>3 · Create your project</h3>
          <p>
            This creates a real project in your workspace right now. Turning the brief into a finished
            clip starts when generation is connected — nothing is charged today.
          </p>
          <JobStrip jobs={jobs} />
          <button
            type="button"
            data-testid="wizard-create"
            disabled={!canCreateProject(wizard) || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating…' : 'Create project'}
          </button>
          {wizard.phase === 'created' && wizard.createdProjectId && (
            <div className="studio-wizard-success">
              <p className="studio-wizard-created" data-testid="wizard-created">
                Project created. Open it in the editor, head to your projects — or first attach the dish
                photo this clip starts from.
              </p>
              <p className="studio-wizard-actions">
                <a data-testid="wizard-open-editor" href={editorRouteFor(wizard.createdProjectId)}>
                  Open in editor
                </a>{' '}
                <a data-testid="wizard-open-projects" href="/projects">
                  Go to projects
                </a>
              </p>

              <div className="studio-wizard-photo" data-testid="wizard-photo-step">
                <h4>Add your dish photo · optional</h4>
                {wizard.photo.phase === 'attached' ? (
                  <p data-testid="wizard-photo-attached">
                    Photo saved into your project: <strong>{wizard.photo.filename}</strong>
                  </p>
                ) : wizard.photo.phase === 'skipped' ? (
                  <p data-testid="wizard-photo-skipped">
                    Photo skipped — you can add one any time from Assets.
                  </p>
                ) : uploadPhoto ? (
                  <>
                    <p>
                      The photo uploads into the project you just created — the same real library your
                      assets live in.
                    </p>
                    <label>
                      Choose a dish photo
                      <input
                        type="file"
                        accept="image/*"
                        data-testid="wizard-photo-input"
                        disabled={!canAttachPhoto(wizard) || photoUploading}
                        onChange={(e) => {
                          if (e.target.files) void handlePhotoFiles(e.target.files);
                        }}
                      />
                    </label>{' '}
                    <button
                      type="button"
                      data-testid="wizard-photo-skip"
                      disabled={photoUploading}
                      onClick={() => setWizard((w) => skipWizardPhoto(w))}
                    >
                      Skip for now
                    </button>
                    {photoUploading && (
                      <p className="studio-wizard-photo-state" data-testid="wizard-photo-uploading" role="status">
                        Uploading your photo…
                      </p>
                    )}
                    {wizard.photo.phase === 'error' && wizard.photo.error && (
                      <p className="studio-wizard-photo-error" data-testid="wizard-photo-error" role="alert">
                        {wizard.photo.error}
                      </p>
                    )}
                  </>
                ) : (
                  <p data-testid="wizard-photo-unavailable" role="note">
                    Photo attach is not wired in this view — add the photo from Assets after opening the
                    project.
                  </p>
                )}
              </div>
            </div>
          )}
          {wizard.phase === 'error' && wizard.error && (
            <p className="studio-wizard-error" data-testid="wizard-error" role="alert">
              {wizard.error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ExploreHome;
