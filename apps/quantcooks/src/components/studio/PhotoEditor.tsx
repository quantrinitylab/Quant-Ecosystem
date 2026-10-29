// ============================================================================
// QuantCooks Studio — Photo Editor surface (checklist row #80, unit C-3)
// Assets-side layered (PSD-grade) editing for dish photos and stills.
//
// Honesty contract (lib/studio/photocraft.ts carries the Phase-1 proof):
//  - The embedded editor is an iframe page (the upstream web build's own
//    documented embed). It renders ONLY when the availability probe has
//    confirmed the build's parts manifest at its serving path — until
//    the serving step lands, this screen shows a not-served state that
//    names the blocker instead of a dead or fabricated editor frame.
//  - That editor has NO save-to-QuantCooks channel: its Save/Export are
//    browser downloads. So save-back here is explicit and real: the
//    exported file is attached below and uploaded through the P0-3 seam
//    as a NEW asset in the same project. The original is never touched.
//  - No upstream branding appears on this surface (trademark terms);
//    attribution lives in lib/studio/photocraft-attribution.ts.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import {
  PHOTO_EDITOR_IFRAME_ALLOW,
  PHOTO_EDITOR_IFRAME_SANDBOX,
  PHOTO_EDITOR_NOT_SERVED,
  PHOTOCRAFT_PIN,
  photoEditorSrc,
  photoSavePhaseLabel,
  pickablePhotoAssets,
  planPhotoSaveBack,
  runPhotoSaveBack,
  type PhotoEmbedProbe,
  type PhotoSavePhase,
} from '../../lib/studio/photocraft';

export type PhotoAssetsState = 'loading' | 'ready' | 'error';

export interface PhotoEditorProps {
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: PhotoAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /**
   * Availability of the embedded editor at its serving path, from
   * probePhotoEditor (the page runs it on mount). null = still checking.
   */
  embedProbe?: PhotoEmbedProbe | null;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = save-back off. */
  upload?: (projectId: string, file: File) => Promise<ServerAsset>;
  initialSourceAsset?: ServerAsset | null;
  initialExportFile?: File | null;
  initialSavedAsset?: ServerAsset | null;
}

export const PhotoEditor: React.FC<PhotoEditorProps> = ({
  assets = [],
  assetsState,
  assetsError = null,
  onRetryAssets,
  embedProbe = null,
  upload,
  initialSourceAsset = null,
  initialExportFile = null,
  initialSavedAsset = null,
}) => {
  const [source, setSource] = useState<ServerAsset | null>(initialSourceAsset);
  const [exportFile, setExportFile] = useState<File | null>(initialExportFile);
  const [savePhase, setSavePhase] = useState<PhotoSavePhase>(initialSavedAsset ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAsset, setSavedAsset] = useState<ServerAsset | null>(initialSavedAsset);

  const pickable = pickablePhotoAssets(assets);
  const plan = source && exportFile ? planPhotoSaveBack(source, exportFile) : null;
  const phaseLabel = photoSavePhaseLabel(savePhase);

  const onPickExport = (file: File | null) => {
    setExportFile(file);
    setSaveError(null);
    setSavedAsset(null);
    setSavePhase('idle');
  };

  const onSaveCopy = async () => {
    if (!source || !exportFile || !upload || !plan?.ok) return;
    setSavePhase('working');
    setSaveError(null);
    const outcome = await runPhotoSaveBack(source, exportFile, {
      upload,
      renameFile: (f, filename) => new File([f], filename, { type: f.type }),
    });
    if (outcome.status === 'saved') {
      setSavedAsset(outcome.asset);
      setSavePhase('saved');
    } else {
      setSaveError(outcome.message);
      setSavePhase('error');
    }
  };

  return (
    <section className="studio-photo" data-testid="photo-editor">
      <nav className="studio-photo-breadcrumb" aria-label="Breadcrumb">
        <a href="/assets">Assets</a>
        <span aria-hidden="true"> / </span>
        <span>Photo Editor</span>
      </nav>

      <header className="studio-photo-head">
        <h1><span className="studio-title-accent">Photo</span> Editor</h1>
        <p className="studio-photo-explainer">
          Layered, PSD-grade editing for dish photos and stills — layers, masks and adjustments,
          right beside the Assets library it saves back into.
        </p>
        <p className="studio-photo-twin" role="note">
          Edits land as <strong>new</strong> assets through QuantAI&rsquo;s{' '}
          <code>quantcooks.upload_asset</code> — the original photo is never overwritten.
        </p>
      </header>

      {/* ---- Source picker: the caller's real, ready photos ---- */}
      <div className="studio-photo-picker" aria-label="Your photos">
        {assetsState === 'loading' && (
          <div className="studio-photo-loading" data-testid="photo-assets-loading" aria-label="Loading your library">
            Loading your photos…
          </div>
        )}
        {assetsState === 'error' && (
          <div className="studio-photo-error" data-testid="photo-assets-error" role="alert">
            <p>{assetsError ?? 'Your photos could not be loaded.'}</p>
            {onRetryAssets && (
              <button type="button" className="studio-photo-retry" onClick={onRetryAssets}>
                Try again
              </button>
            )}
          </div>
        )}
        {assetsState === 'ready' && pickable.length === 0 && (
          <div className="studio-photo-empty" data-testid="photo-assets-empty">
            <p>
              No ready photos yet. Upload a dish photo in <a href="/assets">Assets</a> first —
              once it has finished uploading, it can be opened here for layered editing.
            </p>
          </div>
        )}
        {assetsState === 'ready' && pickable.length > 0 && (
          <ul className="studio-photo-grid">
            {pickable.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="studio-photo-card"
                  data-testid={`photo-pick-${a.id}`}
                  aria-pressed={source?.id === a.id}
                  onClick={() => setSource(a)}
                >
                  {a.url && <img className="studio-photo-thumb" src={a.url} alt="" />}
                  <span className="studio-photo-name">{a.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Editor frame area ---- */}
      <div className="studio-photo-stage" data-testid="photo-stage">
        {!source && (
          <p className="studio-photo-pick-first" data-testid="photo-pick-first" role="note">
            Pick a photo above to start editing it.
          </p>
        )}
        {source && embedProbe === null && (
          <p className="studio-photo-checking" data-testid="photo-editor-checking" role="status">
            Checking whether the embedded editor is served…
          </p>
        )}
        {source && embedProbe?.status === 'unavailable' && (
          <div className="studio-photo-not-served" data-testid="photo-editor-not-served" role="note">
            <h2>{PHOTO_EDITOR_NOT_SERVED.summary}</h2>
            <p>{PHOTO_EDITOR_NOT_SERVED.detail}</p>
            <p className="studio-photo-blocker-code">
              Blocker: <code>{PHOTO_EDITOR_NOT_SERVED.code}</code>
            </p>
            <p className="studio-photo-version-note">
              Verified editor build: web build v{PHOTOCRAFT_PIN.version}, checksum recorded
              in-repo ({PHOTOCRAFT_PIN.license}). What remains is a serving step, not a search
              for an editor.
            </p>
            {source.url && (
              <p className="studio-photo-source-link">
                Your original stays available meanwhile:{' '}
                <a href={source.url} target="_blank" rel="noreferrer">
                  open {source.filename}
                </a>
                .
              </p>
            )}
          </div>
        )}
        {source && embedProbe?.status === 'available' && (
          <div className="studio-photo-frame-wrap">
            <iframe
              className="studio-photo-frame"
              data-testid="photo-editor-frame"
              src={photoEditorSrc()}
              title="Photo Editor"
              allow={PHOTO_EDITOR_IFRAME_ALLOW}
              sandbox={PHOTO_EDITOR_IFRAME_SANDBOX}
              allowFullScreen
            />
            <p className="studio-photo-frame-note" role="note">
              The editor opens files from your device and exports by download. To edit{' '}
              {source.filename}:{' '}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  download the original
                </a>
              ) : (
                'download the original'
              )}{' '}
              first, open it inside the editor, and when you export, save the copy back below.
            </p>
          </div>
        )}
      </div>

      {/* ---- Save-back: the editor's downloaded export → a NEW asset ---- */}
      {source && (
        <div className="studio-photo-saveback" data-testid="photo-saveback">
          <h2>Save the edited copy back</h2>
          <p className="studio-photo-saveback-note" role="note">
            The editor has no direct save into QuantCooks — its exports arrive as downloads.
            Attach the exported file here and it is uploaded as a new asset in this photo&rsquo;s
            project; the original stays exactly as it was.
          </p>
          <label className="studio-photo-export-label">
            Editor export (PNG, JPEG, WebP or PSD)
            <input
              className="studio-photo-export-input"
              data-testid="photo-export-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.psd,image/png,image/jpeg,image/webp"
              onChange={(e) => onPickExport(e.target.files?.[0] ?? null)}
            />
          </label>
          {exportFile && plan?.ok && (
            <p className="studio-photo-save-name" data-testid="photo-save-name" role="note">
              Will save as <strong>{plan.filename}</strong> — a new asset in the same project as{' '}
              {source.filename}.
            </p>
          )}
          {exportFile && plan && !plan.ok && (
            <p className="studio-photo-save-invalid" data-testid="photo-save-invalid" role="alert">
              {plan.message}
            </p>
          )}
          {!upload && (
            <p className="studio-photo-save-off" data-testid="photo-save-off" role="note">
              Uploads are not wired on this screen yet, so a copy cannot be saved from here.
            </p>
          )}
          {upload && (
            <button
              type="button"
              className="studio-photo-save-button"
              data-testid="photo-save-button"
              disabled={!plan?.ok || savePhase === 'working'}
              onClick={() => void onSaveCopy()}
            >
              Save copy as new asset
            </button>
          )}
          {phaseLabel && (
            <p className="studio-photo-save-state" data-testid="photo-save-state" role="status">
              {phaseLabel}
            </p>
          )}
          {savePhase === 'error' && saveError && (
            <p className="studio-photo-save-error" data-testid="photo-save-error" role="alert">
              {saveError}
            </p>
          )}
          {savePhase === 'saved' && savedAsset && (
            <p className="studio-photo-saved" data-testid="photo-saved" role="status">
              Saved: <strong>{savedAsset.filename}</strong> — find it in{' '}
              <a href="/assets">Assets</a>.
            </p>
          )}
        </div>
      )}

      <footer className="studio-photo-attribution">
        <p role="note">
          Editor: open-source, dual-licensed MIT OR Apache-2.0; attribution is recorded in the
          project notices.
        </p>
      </footer>
    </section>
  );
};
