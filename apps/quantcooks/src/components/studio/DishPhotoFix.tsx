// ============================================================================
// QuantCooks Studio — Dish Photo Fix (spec §8.3 item 1, checklist #60)
//
// One photo in → a cleaned-up, relit, menu-ready still out. The fix is
// the restyle mode of quantcooks.generate_dish_image (CP-1 tool 36) —
// the picker, the intents and this quote are exactly its parameters.
//
// Real today: the input (READY photos + the P0-3 upload seam) and the
// quote. The run is NOT configured and says so: the attempt lands on
// PROVIDER_NOT_CONFIGURED, charges nothing, and the result rail can only
// ever fill from real completed jobs.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  FIX_INTENTS,
  attemptDishFix,
  dishFixQuote,
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

const TOOL = toolById('dish-photo-fix')!;

export interface DishPhotoFixProps {
  projectId?: string | null;
  assets?: ServerAsset[];
  assetsState: ToolAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  upload?: (file: File) => Promise<ServerAsset>;
  initialAsset?: ServerAsset | null;
  initialIntentIds?: string[];
  initialOutcome?: ImageToolOutcome | null;
  jobs?: StudioJob[];
}

export const DishPhotoFix: React.FC<DishPhotoFixProps> = ({
  projectId,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  upload,
  initialAsset = null,
  initialIntentIds = [],
  initialOutcome = null,
  jobs = [],
}) => {
  const [asset, setAsset] = useState<ServerAsset | null>(initialAsset);
  const [intentIds, setIntentIds] = useState<string[]>(initialIntentIds);
  const [outcome, setOutcome] = useState<ImageToolOutcome | null>(initialOutcome);

  const quote = dishFixQuote(intentIds);
  const results = toolResultsFromJobs(jobs, 'image');
  const runs = previousRunsFor(jobs, TOOL.name);

  const toggleIntent = (id: string) => {
    setIntentIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    setOutcome(null);
  };

  return (
    <ToolPageShell
      tool={TOOL}
      explainer="One dish photo in — crumbs tidied, light fixed, colours back — a still your menu can actually use."
      jobs={jobs}
    >
      <div className="studio-tools-flow-layout">
        <AssetInputZone
          tool={TOOL}
          slotLabel="Dish photo"
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
          testIdPrefix="dish-fix"
        />

        <div className="studio-tools-options" data-testid="dish-fix-options">
          <h2>Fixes</h2>
          <ul className="studio-tools-intents">
            {FIX_INTENTS.map((intent) => (
              <li key={intent.id}>
                <label>
                  <input
                    type="checkbox"
                    data-testid={`dish-fix-intent-${intent.id}`}
                    checked={intentIds.includes(intent.id)}
                    onChange={() => toggleIntent(intent.id)}
                  />{' '}
                  <strong>{intent.label}</strong> — {intent.description}
                </label>
              </li>
            ))}
          </ul>

          <QuotePanel
            quote={quote}
            actionLabel="Fix this photo"
            canRun={Boolean(asset) && intentIds.length > 0}
            onRun={() => setOutcome(attemptDishFix({ asset, intentIds }))}
            testIdPrefix="dish-fix"
          />
          <OutcomeNote outcome={outcome} testIdPrefix="dish-fix" />
        </div>

        <ToolResultsRail
          cards={results}
          kind="image"
          emptyCopy="No fixed photo yet. The image provider is not connected, so this area stays honestly empty until a run really finishes — nothing here is a placeholder."
          testIdPrefix="dish-fix"
        />
      </div>

      <PreviousRuns runs={runs} testIdPrefix="dish-fix" />
    </ToolPageShell>
  );
};

export default DishPhotoFix;
