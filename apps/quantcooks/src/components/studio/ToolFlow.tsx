// ============================================================================
// QuantCooks Studio — the shared Quick Tool flow pieces (spec §8.2)
//
// Every Quick Tool page is the same shape: breadcrumb → one-line
// explainer → ONE input zone → options → one big costed action → result
// area → Previous runs. Those shared pieces live here, built once; the
// per-tool components (DishPhotoFix, ExpandPhoto, HookScoreTool,
// PresenterSwap) supply only their options and their attempt.
//
// The input zone rides the real P0-3 seam exactly as Units 2–3 built it:
// pick from the caller's READY assets of the tool's kind, or upload
// through the page-injected useAssetUpload — stage labels only (no
// invented percentage), real errors passed through untouched.
// ============================================================================

import React, { useRef, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { CreditQuote } from '../../lib/studio/pricing';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  pickableToolAssets,
  runToolUpload,
  toolUploadPhaseLabel,
  type QuickTool,
  type ToolResultCard,
  type ToolUploadPhase,
} from '../../lib/studio/tools';
import { JobStrip } from './JobStrip';

export type ToolAssetsState = 'loading' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// Page shell: breadcrumb, title, explainer, limits, job strip.
// ---------------------------------------------------------------------------

export interface ToolPageShellProps {
  tool: QuickTool;
  explainer: string;
  /** Limits stated BEFORE upload (spec §8.2), e.g. Hook Score's 15 s. */
  limitNote?: string;
  jobs?: StudioJob[];
  children: React.ReactNode;
}

export const ToolPageShell: React.FC<ToolPageShellProps> = ({
  tool,
  explainer,
  limitNote,
  jobs = [],
  children,
}) => (
  <section className="studio-tools-flow" data-testid={`tool-flow-${tool.id}`}>
    <nav className="studio-tools-breadcrumb" aria-label="Breadcrumb">
      <a href="/tools">Quick Tools</a> <span aria-hidden="true">/</span> <span>{tool.name}</span>
    </nav>
    <header className="studio-tools-flow-head">
      <h1>{tool.name}</h1>
      <p>{explainer}</p>
      {limitNote && (
        <p className="studio-tools-limit" data-testid="tool-limit-note" role="note">
          {limitNote}
        </p>
      )}
      <p className="studio-tools-twin" role="note">
        Runs as {tool.tool}
        {tool.toolMode ? ` (${tool.toolMode} mode)` : ''} — QuantAI can run this exact tool with
        these exact options.
      </p>
    </header>
    <JobStrip jobs={jobs} />
    {children}
  </section>
);

// ---------------------------------------------------------------------------
// The one input zone: pick a READY asset of the tool's kind, or upload.
// ---------------------------------------------------------------------------

export interface AssetInputZoneProps {
  tool: QuickTool;
  /** Slot language, e.g. "Dish photo" / "Target clip". */
  slotLabel: string;
  assets?: ServerAsset[];
  assetsState: ToolAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  projectId?: string | null;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = uploads off. */
  upload?: (file: File) => Promise<ServerAsset>;
  selected: ServerAsset | null;
  onSelect: (asset: ServerAsset | null) => void;
  testIdPrefix: string;
}

export const AssetInputZone: React.FC<AssetInputZoneProps> = ({
  tool,
  slotLabel,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  projectId,
  upload,
  selected,
  onSelect,
  testIdPrefix,
}) => {
  const [uploadPhase, setUploadPhase] = useState<ToolUploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickable = pickableToolAssets(assets, tool.inputKind);
  const uploadsEnabled = Boolean(projectId && upload);
  const kindWord = tool.inputKind === 'image' ? 'photo' : 'clip';

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !upload) return;
    setUploadPhase('working');
    setUploadError(null);
    const outcome = await runToolUpload(file, tool.inputKind, (f) => upload(f as File));
    if (outcome.status === 'done') {
      onSelect(outcome.asset);
      setUploadPhase('idle');
    } else {
      setUploadPhase('error');
      setUploadError(outcome.message);
    }
  };

  return (
    <div className="studio-tools-input" data-testid={`${testIdPrefix}-input`}>
      <h2>{slotLabel}</h2>

      {selected ? (
        <div className="studio-tools-selected" data-testid={`${testIdPrefix}-selected`}>
          {selected.url && tool.inputKind === 'image' && (
            <img src={selected.url} alt={selected.filename} />
          )}
          <span className="studio-tools-selected-name">{selected.filename}</span>
          <button type="button" onClick={() => onSelect(null)}>
            Use a different {kindWord}
          </button>
        </div>
      ) : (
        <div
          className="studio-tools-dropzone"
          data-testid={`${testIdPrefix}-dropzone`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (uploadsEnabled) void handleFiles(e.dataTransfer.files);
          }}
        >
          <p>
            Drop a {kindWord} here, or pick one — it fills the {slotLabel.toLowerCase()} slot.
          </p>
          <label>
            Choose a {kindWord}
            <input
              ref={fileInputRef}
              type="file"
              accept={tool.inputKind === 'image' ? 'image/*' : 'video/*'}
              data-testid={`${testIdPrefix}-file-input`}
              disabled={!uploadsEnabled}
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
              }}
            />
          </label>
        </div>
      )}

      {!uploadsEnabled && (
        <p className="studio-tools-upload-off" data-testid={`${testIdPrefix}-upload-unavailable`} role="note">
          Uploads are saved into a project. Open this tool with a project chosen, or create one
          first — <a href="/projects">go to Projects</a> — and picking from your library below
          works either way.
        </p>
      )}

      {uploadPhase !== 'idle' && (
        <p className="studio-tools-upload-state" data-testid={`${testIdPrefix}-upload-state`} role="status">
          {toolUploadPhaseLabel(uploadPhase)}
        </p>
      )}
      {uploadPhase === 'error' && uploadError && (
        <p className="studio-tools-upload-error" data-testid={`${testIdPrefix}-upload-error`} role="alert">
          {uploadError}
        </p>
      )}

      <div className="studio-tools-picker" aria-label={`Your ${kindWord}s`}>
        <h3>Your {kindWord}s</h3>
        {assetsState === 'loading' && (
          <div className="studio-tools-skeletons" data-testid={`${testIdPrefix}-assets-loading`} aria-label="Loading your library">
            <span className="studio-skeleton-tile" />
            <span className="studio-skeleton-tile" />
            <span className="studio-skeleton-tile" />
          </div>
        )}
        {assetsState === 'error' && (
          <div className="studio-tools-assets-error" data-testid={`${testIdPrefix}-assets-error`} role="alert">
            <p>{assetsError ?? 'Your library could not be loaded.'}</p>
            <button type="button" onClick={() => onRetryAssets?.()}>
              Retry
            </button>
          </div>
        )}
        {assetsState === 'ready' && pickable.length === 0 && (
          <p data-testid={`${testIdPrefix}-assets-empty`}>
            No ready {kindWord}s in your library yet — upload one above and it will live here.
          </p>
        )}
        {assetsState === 'ready' && pickable.length > 0 && (
          <ul className="studio-tools-asset-grid">
            {pickable.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-asset-pick-${asset.id}`}
                  aria-pressed={selected?.id === asset.id}
                  onClick={() => onSelect(asset)}
                >
                  {asset.url && tool.inputKind === 'image' && (
                    <img src={asset.url} alt={asset.filename} />
                  )}
                  <span>{asset.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The quote + the one big costed action (quote-before-spend, §0.1 rule).
// ---------------------------------------------------------------------------

export interface QuotePanelProps {
  /** The composed quote; null when the tool's rate rule refuses a total. */
  quote: CreditQuote | null;
  /** Shown when quote is null (the per-second refusal), or alongside it. */
  quoteNote?: string;
  actionLabel: string;
  /** Greyed until the input is valid (spec §8.2). */
  canRun: boolean;
  onRun: () => void;
  testIdPrefix: string;
}

export const QuotePanel: React.FC<QuotePanelProps> = ({
  quote,
  quoteNote,
  actionLabel,
  canRun,
  onRun,
  testIdPrefix,
}) => (
  <div className="studio-tools-quote" data-testid={`${testIdPrefix}-quote`}>
    {quote ? (
      <>
        <ul className="studio-tools-quote-lines">
          {quote.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="studio-tools-quote-total" data-testid={`${testIdPrefix}-quote-total`}>
          {quote.credits} credit{quote.credits === 1 ? '' : 's'} — quoted before anything runs;
          a failed run refunds in full.
        </p>
      </>
    ) : (
      quoteNote && (
        <p className="studio-tools-quote-note" data-testid={`${testIdPrefix}-quote-note`} role="note">
          {quoteNote}
        </p>
      )
    )}
    {quote && quoteNote && (
      <p className="studio-tools-quote-note" role="note">
        {quoteNote}
      </p>
    )}
    <button
      type="button"
      className="studio-tools-run"
      data-testid={`${testIdPrefix}-run`}
      disabled={!canRun}
      onClick={() => onRun()}
    >
      {quote ? `${actionLabel} · ${quote.credits} credit${quote.credits === 1 ? '' : 's'}` : actionLabel}
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Outcome notes: invalid (fixable), blocked (stacked reasons, each
// printed separately), not-configured (the twin refuses, nothing charged).
// ---------------------------------------------------------------------------

export type FlowOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'blocked'; reasons: string[]; chargedCredits: 0 }
  | { status: 'not-configured'; tool: string; code: string; chargedCredits: 0; message: string };

export const OutcomeNote: React.FC<{ outcome: FlowOutcome | null; testIdPrefix: string }> = ({
  outcome,
  testIdPrefix,
}) => {
  if (!outcome) return null;
  if (outcome.status === 'invalid') {
    return (
      <p className="studio-tools-outcome studio-tools-outcome-invalid" data-testid={`${testIdPrefix}-outcome-invalid`} role="alert">
        {outcome.message}
      </p>
    );
  }
  if (outcome.status === 'blocked') {
    return (
      <div className="studio-tools-outcome studio-tools-outcome-blocked" data-testid={`${testIdPrefix}-outcome-blocked`} role="alert">
        <p>This run cannot start yet — each block is listed on its own:</p>
        <ul>
          {outcome.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p>Nothing was charged.</p>
      </div>
    );
  }
  return (
    <p className="studio-tools-outcome studio-tools-outcome-not-configured" data-testid={`${testIdPrefix}-outcome-not-configured`} role="note">
      {outcome.message}
    </p>
  );
};

// ---------------------------------------------------------------------------
// Result area: real completed-job outputs only. Empty is stated, never
// filled with a placeholder.
// ---------------------------------------------------------------------------

export const ToolResultsRail: React.FC<{
  cards: ToolResultCard[];
  kind: 'image' | 'video';
  emptyCopy: string;
  testIdPrefix: string;
}> = ({ cards, kind, emptyCopy, testIdPrefix }) => (
  <aside className="studio-tools-results" data-testid={`${testIdPrefix}-results`} aria-label="Results">
    <h2>Result</h2>
    {cards.length === 0 ? (
      <p data-testid={`${testIdPrefix}-results-empty`}>{emptyCopy}</p>
    ) : (
      <ul className="studio-tools-results-grid">
        {cards.map((card) => (
          <li key={card.outputId} data-testid={`${testIdPrefix}-result-${card.outputId}`}>
            {card.url && kind === 'image' && <img src={card.url} alt={card.label} />}
            {card.url && kind === 'video' && <video src={card.url} preload="metadata" />}
            <span>{card.label}</span>
          </li>
        ))}
      </ul>
    )}
  </aside>
);

// ---------------------------------------------------------------------------
// Before/after split (Presenter Swap's result shape, spec §8.3 item 4).
// Rendered ONLY when a real completed output exists for a real source —
// the component itself is a pure projection of its two URLs.
// ---------------------------------------------------------------------------

export const BeforeAfterSplit: React.FC<{
  sourceUrl: string;
  sourceLabel: string;
  outputUrl: string;
  outputLabel: string;
  /** 0–100: how much of the AFTER side shows. Controlled by the slider. */
  split: number;
  onSplitChange?: (value: number) => void;
  testIdPrefix: string;
}> = ({ sourceUrl, sourceLabel, outputUrl, outputLabel, split, onSplitChange, testIdPrefix }) => (
  <div className="studio-tools-before-after" data-testid={`${testIdPrefix}-before-after`}>
    <div className="studio-tools-before-after-stage">
      <video src={sourceUrl} preload="metadata" aria-label={sourceLabel} />
      <div
        className="studio-tools-before-after-top"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <video src={outputUrl} preload="metadata" aria-label={outputLabel} />
      </div>
      <span className="studio-tools-before-after-tag studio-tools-before-after-tag-before">Before</span>
      <span className="studio-tools-before-after-tag studio-tools-before-after-tag-after">After</span>
    </div>
    <label>
      Compare
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        data-testid={`${testIdPrefix}-before-after-slider`}
        onChange={(e) => onSplitChange?.(Number(e.target.value))}
      />
    </label>
  </div>
);

// ---------------------------------------------------------------------------
// Previous runs (spec §8.2): the caller's real jobs for this tool,
// re-openable through get_job_status. Empty is stated plainly.
// ---------------------------------------------------------------------------

export const PreviousRuns: React.FC<{ runs: StudioJob[]; testIdPrefix: string }> = ({
  runs,
  testIdPrefix,
}) => (
  <div className="studio-tools-previous" data-testid={`${testIdPrefix}-previous`}>
    <h2>Previous runs</h2>
    {runs.length === 0 ? (
      <p data-testid={`${testIdPrefix}-previous-empty`}>
        No runs yet — finished runs will be listed here and in Assets, permanently yours.
      </p>
    ) : (
      <ul className="studio-tools-previous-list">
        {runs.map((job) => (
          <li key={job.job_id} data-testid={`${testIdPrefix}-previous-${job.job_id}`}>
            <span>{job.label ?? job.job_id}</span>
            <span>{job.status}</span>
            {job.error && <span>{job.error}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);
