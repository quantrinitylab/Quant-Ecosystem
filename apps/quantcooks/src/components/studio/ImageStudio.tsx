// ============================================================================
// QuantCooks Studio — Image Studio screen (spec §2.1, checklist #20, G-2)
//
// Anatomy (per the unit brief): left = input panel, centre = the shared
// Composer brief, right = results rail + JobStrip. The shared grammar (§0)
// is reused, never reinvented: Composer for the brief, JobStrip for jobs,
// pricing.ts for the quote on Generate.
//
// What is REAL on this screen today:
//  - Reference upload through the P0-3 three-step flow (the page injects
//    useAssetUpload) and picking from the caller's real image assets.
// What is NOT configured, and says so on the surface:
//  - Generation. quantcooks.generate_dish_image is registered (CP-1) but
//    its provider tier is fail-closed, so the Composer is passed
//    generation='not-configured': Generate stays disabled, the price still
//    re-prices live, and nothing is ever charged or faked.
// ============================================================================

import React, { useRef, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  IMAGE_BRAND_KIT_TOOL,
  IMAGE_GENERATE_TOOL,
  IMAGE_PERSONA_TOOL,
  IMAGE_STYLE_PRESETS,
  pickableImageAssets,
  referenceFromAsset,
  runReferenceUpload,
  stylePresetById,
  uploadPhaseLabel,
  type ReferenceImage,
  type UploadPhase,
} from '../../lib/studio/image';
import { Composer, type ComposerChip } from './Composer';
import { JobStrip } from './JobStrip';
import { imageResultsFromJobs } from '../../lib/studio/image';

export type ImageAssetsState = 'loading' | 'ready' | 'error';

export interface ImageStudioProps {
  /** Project the upload saves into (uploads are project assets, P0-3). */
  projectId?: string | null;
  projectName?: string | null;
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: ImageAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = uploads off. */
  upload?: (file: File) => Promise<ServerAsset>;
  initialReferenceAsset?: ServerAsset | null;
  initialStylePresetId?: string | null;
  /** Real jobs for the strip/results (export-shaped today; [] is honest). */
  jobs?: StudioJob[];
}

export const ImageStudio: React.FC<ImageStudioProps> = ({
  projectId,
  projectName,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  upload,
  initialReferenceAsset,
  initialStylePresetId,
  jobs = [],
}) => {
  const [reference, setReference] = useState<ReferenceImage | null>(() =>
    initialReferenceAsset ? referenceFromAsset(initialReferenceAsset) : null,
  );
  const [stylePresetId, setStylePresetId] = useState<string | null>(initialStylePresetId ?? null);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [brandMatch, setBrandMatch] = useState(false);
  const [personaNoteOpen, setPersonaNoteOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickable = pickableImageAssets(assets);
  const stylePreset = stylePresetById(stylePresetId);
  const results = imageResultsFromJobs(jobs);
  const uploadsEnabled = Boolean(projectId && upload);
  const isEmpty = !reference && results.length === 0 && assetsState === 'ready' && pickable.length === 0;

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !upload) return;
    setUploadPhase('working');
    setUploadError(null);
    const outcome = await runReferenceUpload(file, (f) => upload(f as File));
    if (outcome.status === 'done') {
      setReference(referenceFromAsset(outcome.asset));
      setUploadPhase('idle');
    } else {
      setUploadPhase('error');
      setUploadError(outcome.message);
    }
  };

  const chips: ComposerChip[] = [
    {
      id: 'style',
      label: 'Style preset',
      value: stylePreset?.name,
      onPick: () => setStylePickerOpen((open) => !open),
      onClear: () => setStylePresetId(null),
    },
    {
      id: 'reference',
      label: 'Reference',
      value: reference?.filename,
      onPick: () => fileInputRef.current?.click(),
      onClear: () => setReference(null),
    },
    {
      id: 'persona',
      label: 'Chef Persona',
      onPick: () => setPersonaNoteOpen((open) => !open),
    },
    {
      id: 'brand-kit',
      label: 'Brand kit',
      value: brandMatch ? 'Match my brand kit' : undefined,
      onPick: () => setBrandMatch((on) => !on),
      onClear: () => setBrandMatch(false),
    },
  ];

  return (
    <section className="studio-image" data-testid="image-studio">
      <header className="studio-image-head">
        <h1><span className="studio-title-accent">Image</span> Studio</h1>
        <p>
          Dish hero stills, menu photography and recipe-card covers. Lock the plated-dish still here first — the
          Hero Frame rule — before any video spend.
        </p>
      </header>

      <div className="studio-image-layout">
        {/* ------------------------------------------------ left: input */}
        <aside className="studio-image-input" data-testid="image-input-panel" aria-label="Reference photo">
          <h2>Start from a photo</h2>

          {reference ? (
            <div className="studio-image-reference" data-testid="image-reference-selected">
              {reference.url && <img src={reference.url} alt={reference.filename} />}
              <span className="studio-image-reference-name">{reference.filename}</span>
              <button type="button" onClick={() => setReference(null)}>
                Remove reference
              </button>
            </div>
          ) : (
            <div
              className="studio-image-dropzone"
              data-testid="image-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploadsEnabled) void handleFiles(e.dataTransfer.files);
              }}
            >
              <p>Drop a dish photo here, or pick one — it becomes the Reference for your brief.</p>
              <label>
                Choose a photo
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  data-testid="image-file-input"
                  disabled={!uploadsEnabled}
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files);
                  }}
                />
              </label>
            </div>
          )}

          {!uploadsEnabled && (
            <p className="studio-image-upload-off" data-testid="image-upload-unavailable" role="note">
              Uploads are saved into a project.
              {projectName
                ? ' This surface was opened without an upload connection, so picking a photo is off for now.'
                : ' Open Image Studio with a project chosen, or create one first — '}{' '}
              {!projectName && <a href="/projects">go to Projects</a>}
            </p>
          )}

          {uploadPhase !== 'idle' && (
            <p className="studio-image-upload-state" data-testid="image-upload-state" role="status">
              {uploadPhaseLabel(uploadPhase)}
            </p>
          )}
          {uploadPhase === 'error' && uploadError && (
            <p className="studio-image-upload-error" data-testid="image-upload-error" role="alert">
              {uploadError}
            </p>
          )}

          <div className="studio-image-picker" aria-label="Your photos">
            <h3>Your photos</h3>
            {assetsState === 'loading' && (
              <div className="studio-image-skeletons" data-testid="image-assets-loading" aria-label="Loading your photos">
                <span className="studio-skeleton-tile" />
                <span className="studio-skeleton-tile" />
                <span className="studio-skeleton-tile" />
              </div>
            )}
            {assetsState === 'error' && (
              <div className="studio-image-assets-error" data-testid="image-assets-error" role="alert">
                <p>{assetsError ?? 'Your photos could not be loaded.'}</p>
                <button type="button" onClick={() => onRetryAssets?.()}>
                  Retry
                </button>
              </div>
            )}
            {assetsState === 'ready' && pickable.length === 0 && (
              <p data-testid="image-assets-empty">No photos in your library yet — upload one above and it will live here.</p>
            )}
            {assetsState === 'ready' && pickable.length > 0 && (
              <ul className="studio-image-asset-grid">
                {pickable.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      data-testid={`image-asset-pick-${asset.id}`}
                      onClick={() => setReference(referenceFromAsset(asset))}
                    >
                      {asset.url && <img src={asset.url} alt={asset.filename} />}
                      <span>{asset.filename}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ------------------------------------------------ centre: brief */}
        <div className="studio-image-centre" data-testid="image-composer-region">
          {isEmpty && (
            <div className="studio-image-empty" data-testid="image-empty-state">
              <h2>Describe the dish shot you need</h2>
              <p>
                Say the plate, the light and the surface — or start from a style below and a photo on the left.
                Every still you make will land in Assets, permanently yours.
              </p>
            </div>
          )}

          {(stylePickerOpen || isEmpty) && (
            <div className="studio-image-styles" data-testid="image-style-picker" aria-label="Style presets">
              {IMAGE_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="studio-image-style-tile"
                  data-testid={`image-style-tile-${preset.id}`}
                  aria-pressed={stylePresetId === preset.id}
                  onClick={() => {
                    setStylePresetId(preset.id);
                    setStylePickerOpen(false);
                  }}
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          )}

          {personaNoteOpen && (
            <p className="studio-image-persona-note" data-testid="image-persona-note" role="note">
              Chef Personas are saved presenters you cast into a shot (the {IMAGE_PERSONA_TOOL} tool). None exist
              in your library yet — personas are created in Voice Studio (which lives at /studio/voice) — so
              this chip stays empty rather than inventing one.
            </p>
          )}

          {brandMatch && (
            <p className="studio-image-brand-note" data-testid="image-brand-note" role="note">
              Noted: when generation connects, your saved brand kit ({IMAGE_BRAND_KIT_TOOL}) will supply the
              colours and logo rules for this run. Today the choice is recorded on the brief only.
            </p>
          )}

          <JobStrip jobs={jobs} />

          <Composer
            kind="image"
            chips={chips}
            placeholder="Describe the dish shot you need — the plate, the light, the surface… @ a dish or persona, / a collection"
            showSettings={{ duration: false, audio: false }}
            generation="not-configured"
            notConfiguredReason={`Image generation is not connected yet — the ${IMAGE_GENERATE_TOOL} tool has no provider configured (NOT_CONFIGURED). Your uploads and photos are real; nothing will be charged.`}
          />
        </div>

        {/* ------------------------------------------------ right: results */}
        <aside className="studio-image-results" data-testid="image-results-rail" aria-label="Results">
          <h2>Results</h2>
          {results.length === 0 ? (
            <p data-testid="image-results-empty">
              No generated stills yet. Generation is not connected, so this rail stays honestly empty until a
              provider lands — nothing here is a placeholder image. Finished stills will appear here and in
              Assets, each with an “Animate this” action into Video Studio.
            </p>
          ) : (
            <ul className="studio-image-results-grid">
              {results.map((card) => (
                <li key={card.outputId} data-testid={`image-result-${card.outputId}`}>
                  {card.url && <img src={card.url} alt={card.label} />}
                  <span>{card.label}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
};

export default ImageStudio;
