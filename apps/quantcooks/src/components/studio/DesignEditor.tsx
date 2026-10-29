// ============================================================================
// QuantCooks Studio — Screens editor surface (plan unit C-7 step 3,
// route: /studio/design/screens/[designId]). designId is the EditAsset
// id of the .figcraft document, or the reserved id "new".
//
// Honesty contract (lib/studio/figcraft.ts carries the spike proof):
//  - The embedded editor renders ONLY when the availability probe has
//    confirmed the installed bundle's index page at its serving path —
//    until then this screen shows the DESIGN_EDITOR_NOT_SERVED blocker
//    panel naming the install recipe, never a blank iframe.
//  - The editor starts with a blank document every time and has NO
//    channel to QuantCooks: it cannot be handed the saved design file,
//    and QuantCooks cannot read its canvas. Save-back is therefore
//    explicit: the editor's Save downloads the .figcraft file, the
//    user attaches it below, and it is uploaded through the P0-3 seam
//    as a NEW asset — a new version beside the old one, which is never
//    overwritten. The copy on this screen says all of that plainly;
//    no live sync is implied anywhere.
//  - No QuantAI twin is claimed for the embedded UI (no control
//    surface exists). Design generation/editing by QuantAI arrives
//    with the companion (step 4), after the CP-1 contract lands — the
//    note below is disabled-with-reason, never a fake control.
//  - No upstream branding appears on this surface (trademark terms);
//    attribution lives in lib/studio/figcraft-attribution.ts.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset, ServerProject } from '../../services/api-client';
import {
  DESIGN_DOCUMENT_CONTENT_TYPE,
  DESIGN_EDITOR_NOT_SERVED,
  DESIGN_EDITOR_IFRAME_ALLOW,
  DESIGN_EDITOR_IFRAME_SANDBOX,
  FIGCRAFT_PIN,
  NEW_DESIGN_ID,
  designDisplayName,
  designEditorSrc,
  designSavePhaseLabel,
  isDesignDocument,
  planDesignSaveBack,
  runDesignSaveBack,
  type DesignEmbedProbe,
  type DesignSavePhase,
} from '../../lib/studio/figcraft';

export type DesignDataState = 'loading' | 'ready' | 'error';

export interface DesignEditorProps {
  /** The route's design id: an EditAsset id, or NEW_DESIGN_ID. */
  designId: string;
  /** The caller's assets (the source design is resolved from these). */
  assets?: ServerAsset[];
  assetsState: DesignDataState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** The caller's projects — the save-back target for a NEW design. */
  projects?: ServerProject[];
  projectsState?: DesignDataState;
  /**
   * Availability of the embedded editor at its serving path, from
   * probeDesignEditor (the page runs it on mount). null = still checking.
   */
  embedProbe?: DesignEmbedProbe | null;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = save-back off. */
  upload?: (projectId: string, file: File) => Promise<ServerAsset>;
  initialExportFile?: File | null;
  initialSavedAsset?: ServerAsset | null;
  initialTargetProjectId?: string | null;
}

export const DesignEditor: React.FC<DesignEditorProps> = ({
  designId,
  assets = [],
  assetsState,
  assetsError = null,
  onRetryAssets,
  projects = [],
  projectsState = 'ready',
  embedProbe = null,
  upload,
  initialExportFile = null,
  initialSavedAsset = null,
  initialTargetProjectId = null,
}) => {
  const isNew = designId === NEW_DESIGN_ID;
  const source = !isNew
    ? (assets.find((a) => a.id === designId && isDesignDocument(a)) ?? null)
    : null;
  const sourceMissing = !isNew && assetsState === 'ready' && source === null;

  const [exportFile, setExportFile] = useState<File | null>(initialExportFile);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(initialTargetProjectId);
  const [savePhase, setSavePhase] = useState<DesignSavePhase>(initialSavedAsset ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAsset, setSavedAsset] = useState<ServerAsset | null>(initialSavedAsset);

  const plan =
    exportFile && (source || isNew)
      ? planDesignSaveBack({ source, targetProjectId, file: exportFile })
      : null;
  const phaseLabel = designSavePhaseLabel(savePhase);
  const targetProject = projects.find((p) => p.id === targetProjectId) ?? null;

  const onPickExport = (file: File | null) => {
    setExportFile(file);
    setSaveError(null);
    setSavedAsset(null);
    setSavePhase('idle');
  };

  const onSaveCopy = async () => {
    if (!exportFile || !upload || !plan?.ok) return;
    setSavePhase('working');
    setSaveError(null);
    const outcome = await runDesignSaveBack(
      { source, targetProjectId, file: exportFile },
      {
        upload,
        renameFile: (f, filename) =>
          new File([f], filename, { type: DESIGN_DOCUMENT_CONTENT_TYPE }),
      },
    );
    if (outcome.status === 'saved') {
      setSavedAsset(outcome.asset);
      setSavePhase('saved');
    } else {
      setSaveError(outcome.message);
      setSavePhase('error');
    }
  };

  return (
    <section className="studio-design-editor" data-testid="design-editor">
      <nav className="studio-design-breadcrumb" aria-label="Breadcrumb">
        <a href="/studio/design">Design Studio</a>
        <span aria-hidden="true"> / </span>
        <span>Screens</span>
        <span aria-hidden="true"> / </span>
        <span>{isNew ? 'New design' : source ? designDisplayName(source) : 'Design'}</span>
      </nav>

      <header className="studio-design-head">
        <h1>{isNew ? 'New design' : source ? designDisplayName(source) : 'Screens editor'}</h1>
        <p className="studio-design-save-state" role="note">
          The editor runs on your device and starts with a blank document — it has no live
          link to QuantCooks, and there is <strong>no sync</strong> between them. Saving
          inside the editor downloads the design file; the panel below stores that copy in
          your library as a new asset, and the previous version is never overwritten.
        </p>
        <p className="studio-design-quantai-note" role="note">
          QuantAI cannot drive this embedded editor — it exposes no control channel. Design
          creation and export by QuantAI arrive with the companion step, after the
          control-plane contract lands.{' '}
          <span
            className="studio-design-quantai-chip"
            data-testid="design-editor-quantai-unavailable"
            aria-disabled="true"
          >
            QuantAI design tools — not configured yet
          </span>
        </p>
      </header>

      {/* ---- Editor stage: probe-gated iframe or the named blocker ---- */}
      <div className="studio-design-stage" data-testid="design-stage">
        {!isNew && assetsState === 'loading' && (
          <p className="studio-design-loading" data-testid="design-loading" role="status">
            Loading your design…
          </p>
        )}
        {!isNew && assetsState === 'error' && (
          <div className="studio-design-error" data-testid="design-assets-error" role="alert">
            <p>{assetsError ?? 'Your design could not be loaded.'}</p>
            {onRetryAssets && (
              <button type="button" className="studio-design-retry" onClick={onRetryAssets}>
                Try again
              </button>
            )}
          </div>
        )}
        {sourceMissing && (
          <div className="studio-design-not-found" data-testid="design-not-found" role="note">
            <h2>This design is not in your library.</h2>
            <p>
              It may still be uploading, or the link points at something that is not a design
              document. Your saved designs live in the{' '}
              <a href="/studio/design">Design Studio library</a>.
            </p>
          </div>
        )}
        {!sourceMissing && assetsState !== 'error' && embedProbe === null && (
          <p className="studio-design-checking" data-testid="design-editor-checking" role="status">
            Checking whether the embedded editor is served…
          </p>
        )}
        {!sourceMissing && embedProbe?.status === 'unavailable' && (
          <div className="studio-design-not-served" data-testid="design-editor-not-served" role="note">
            <h2>{DESIGN_EDITOR_NOT_SERVED.summary}</h2>
            <p>{DESIGN_EDITOR_NOT_SERVED.detail}</p>
            <p className="studio-design-blocker-code">
              Blocker: <code>{DESIGN_EDITOR_NOT_SERVED.code}</code>
            </p>
            <p className="studio-design-version-note">
              Verified editor build: web build v{FIGCRAFT_PIN.version}, checksum recorded
              in-repo ({FIGCRAFT_PIN.license}). What remains is a serving step, not a search
              for an editor.
            </p>
            {source?.url && (
              <p className="studio-design-source-link">
                Your saved copy stays available meanwhile:{' '}
                <a href={source.url} target="_blank" rel="noreferrer">
                  download {source.filename}
                </a>
                .
              </p>
            )}
          </div>
        )}
        {!sourceMissing && embedProbe?.status === 'available' && (
          <div className="studio-design-frame-wrap">
            <iframe
              className="studio-design-frame"
              data-testid="design-editor-frame"
              src={designEditorSrc()}
              title="Design Studio — Screens editor"
              allow={DESIGN_EDITOR_IFRAME_ALLOW}
              sandbox={DESIGN_EDITOR_IFRAME_SANDBOX}
              allowFullScreen
            />
            <p className="studio-design-frame-note" role="note">
              {source ? (
                <>
                  The editor cannot be handed your saved file — it starts blank, and its file
                  dialogs are not wired in the web build. Your saved copy stays an asset:{' '}
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      download {source.filename}
                    </a>
                  ) : (
                    source.filename
                  )}{' '}
                  — and when you save new work in the editor, store the downloaded file below
                  as this design&rsquo;s next version.
                </>
              ) : (
                <>
                  The editor starts with a blank document. When you save inside it, the design
                  downloads as a <code>.figcraft</code> file — store that file below so it
                  lands in your library.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ---- Save-back: the editor's downloaded file → a NEW asset ---- */}
      {(source || isNew) && (
        <div className="studio-design-saveback" data-testid="design-saveback">
          <h2>Save the design back</h2>
          <p className="studio-design-saveback-note" role="note">
            The editor has no direct save into QuantCooks — its saves arrive as downloads.
            Attach the downloaded design file here and it is uploaded as a new asset
            {source
              ? ' in this design’s project, as its next version; the version you opened is never overwritten.'
              : ' in the project you pick; it appears in the Design Studio library with the preview embedded in the file.'}
          </p>
          {isNew && (
            <>
              <label className="studio-design-project-label">
                Project for this design
                <select
                  className="studio-design-project-select"
                  data-testid="design-project-select"
                  value={targetProjectId ?? ''}
                  onChange={(e) => setTargetProjectId(e.target.value || null)}
                >
                  <option value="">Pick a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {projectsState === 'ready' && projects.length === 0 && (
                <p className="studio-design-project-off" data-testid="design-project-empty" role="note">
                  You have no projects yet — create one in <a href="/projects">Projects</a>{' '}
                  first; a design is stored as a project asset.
                </p>
              )}
              {projectsState === 'error' && (
                <p className="studio-design-project-off" data-testid="design-project-error" role="note">
                  Your projects could not be loaded, so a target for this design cannot be
                  picked yet.
                </p>
              )}
            </>
          )}
          <label className="studio-design-export-label">
            Design file from the editor (.figcraft)
            <input
              className="studio-design-export-input"
              data-testid="design-export-input"
              type="file"
              accept=".figcraft,application/x-figcraft"
              onChange={(e) => onPickExport(e.target.files?.[0] ?? null)}
            />
          </label>
          {exportFile && plan?.ok && (
            <p className="studio-design-save-name" data-testid="design-save-name" role="note">
              Will save as <strong>{plan.filename}</strong>
              {source ? (
                <> — a new version of {source.filename}.</>
              ) : targetProject ? (
                <> — a new design in {targetProject.name}.</>
              ) : (
                <> — a new design.</>
              )}
            </p>
          )}
          {exportFile && plan && !plan.ok && (
            <p className="studio-design-save-invalid" data-testid="design-save-invalid" role="alert">
              {plan.message}
            </p>
          )}
          {!upload && (
            <p className="studio-design-save-off" data-testid="design-save-off" role="note">
              Uploads are not wired on this screen yet, so a design cannot be saved from here.
            </p>
          )}
          {upload && (
            <button
              type="button"
              className="studio-design-save-button"
              data-testid="design-save-button"
              disabled={!plan?.ok || savePhase === 'working'}
              onClick={() => void onSaveCopy()}
            >
              Save design as new asset
            </button>
          )}
          {phaseLabel && (
            <p className="studio-design-save-state" data-testid="design-save-state" role="status">
              {phaseLabel}
            </p>
          )}
          {savePhase === 'error' && saveError && (
            <p className="studio-design-save-error" data-testid="design-save-error" role="alert">
              {saveError}
            </p>
          )}
          {savePhase === 'saved' && savedAsset && (
            <p className="studio-design-saved" data-testid="design-saved" role="status">
              Saved: <strong>{savedAsset.filename}</strong> — find it in the{' '}
              <a href="/studio/design">Design Studio library</a>.
            </p>
          )}
        </div>
      )}

      <footer className="studio-design-attribution">
        <p role="note">
          Editor: open-source, dual-licensed MIT OR Apache-2.0; attribution is recorded in the
          project notices.
        </p>
      </footer>
    </section>
  );
};

export default DesignEditor;
