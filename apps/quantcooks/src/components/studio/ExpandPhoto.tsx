// ============================================================================
// QuantCooks Studio — Expand Photo (spec §8.3 item 3, checklist #62)
//
// Outpainting for menu boards and banners: one photo + a target canvas →
// the photo extended sideways into that canvas. The expansion is the
// outpaint mode of quantcooks.generate_dish_image (CP-1 tool 36) — one
// tool, no parallel name. The quote moves with the canvas: wider
// canvases price at the image quote's High tier.
//
// Real today: the input (READY photos + the P0-3 upload seam), the
// canvas choice and the quote. The run lands on PROVIDER_NOT_CONFIGURED
// and charges nothing; results can only come from real completed jobs.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  EXPAND_TARGETS,
  attemptExpand,
  expandQuote,
  expandTargetById,
  previousRunsFor,
  toolById,
  toolResultsFromJobs,
  type ImageToolOutcome,
} from '../../lib/studio/tools';
import {
  AssetInputZone,
  OutcomeNote,
  PreviousRuns,
  QuotePanel,
  ToolPageShell,
  ToolResultsRail,
  type ToolAssetsState,
} from './ToolFlow';

const TOOL = toolById('expand-photo')!;

export interface ExpandPhotoProps {
  projectId?: string | null;
  assets?: ServerAsset[];
  assetsState: ToolAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  upload?: (file: File) => Promise<ServerAsset>;
  initialAsset?: ServerAsset | null;
  initialTargetId?: string | null;
  initialOutcome?: ImageToolOutcome | null;
  jobs?: StudioJob[];
}

export const ExpandPhoto: React.FC<ExpandPhotoProps> = ({
  projectId,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  upload,
  initialAsset = null,
  initialTargetId = null,
  initialOutcome = null,
  jobs = [],
}) => {
  const [asset, setAsset] = useState<ServerAsset | null>(initialAsset);
  const [targetId, setTargetId] = useState<string | null>(initialTargetId);
  const [outcome, setOutcome] = useState<ImageToolOutcome | null>(initialOutcome);

  const target = expandTargetById(targetId);
  const quote = expandQuote(targetId);
  const results = toolResultsFromJobs(jobs, 'image');
  const runs = previousRunsFor(jobs, TOOL.name);

  return (
    <ToolPageShell
      tool={TOOL}
      explainer="One photo, stretched honestly into a wider canvas — the dish stays exactly as shot, the table grows around it."
      jobs={jobs}
    >
      <div className="studio-tools-flow-layout">
        <AssetInputZone
          tool={TOOL}
          slotLabel="Photo to expand"
          assets={assets}
          assetsState={assetsState}
          assetsError={assetsError}
          onRetryAssets={onRetryAssets}
          projectId={projectId}
          upload={upload}
          selected={asset}
          onSelect={(a) => {
            setAsset(a);
            setOutcome(null);
          }}
          testIdPrefix="expand"
        />

        <div className="studio-tools-options" data-testid="expand-options">
          <h2>Canvas</h2>
          <ul className="studio-tools-targets">
            {EXPAND_TARGETS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-testid={`expand-target-${t.id}`}
                  aria-pressed={targetId === t.id}
                  onClick={() => {
                    setTargetId(t.id);
                    setOutcome(null);
                  }}
                >
                  <strong>
                    {t.label} · {t.ratio}
                  </strong>
                  <span>{t.description}</span>
                </button>
              </li>
            ))}
          </ul>

          <QuotePanel
            quote={quote}
            actionLabel={target ? `Expand to ${target.ratio}` : 'Expand photo'}
            canRun={Boolean(asset) && Boolean(target)}
            onRun={() => setOutcome(attemptExpand({ asset, targetId }))}
            testIdPrefix="expand"
          />
          <OutcomeNote outcome={outcome} testIdPrefix="expand" />
        </div>

        <ToolResultsRail
          cards={results}
          kind="image"
          emptyCopy="No expanded photo yet. The image provider is not connected, so this area stays honestly empty until a run really finishes — nothing here is a placeholder."
          testIdPrefix="expand"
        />
      </div>

      <PreviousRuns runs={runs} testIdPrefix="expand" />
    </ToolPageShell>
  );
};

export default ExpandPhoto;
