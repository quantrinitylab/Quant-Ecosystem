// ============================================================================
// QuantCooks Studio — Presenter Swap (spec §8.3 item 4, checklist #63)
//
// The two-input pattern: Target Clip + Your Presenter → one big action →
// the result as a before/after split. The twin is
// quantcooks.transform_video (object_swap, presenter target — CP-1
// tool 48), which carries the G-5 consent rule: the reference must be
// the caller's own consented persona or photo.
//
// The presenter slot reads the Voice Studio library (Unit 7): personas
// there are DRAFTS by type — trained nowhere — so the pick list labels
// them as drafts and the gate stacks its reasons separately, in CP-1
// §8's order: consent, then training, then provider. Training and
// provider are external facts no client record can assert; both are
// false today, so the action can never arm — the machine is honest
// about each block on its own line.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import type { ChefPersona } from '../../lib/studio/voice';
import {
  PRESENTER_SWAP_QUOTE_NOTE,
  attemptPresenterSwap,
  presenterSwapGate,
  previousRunsFor,
  toolById,
  toolResultsFromJobs,
  type QuickTool,
  type SwapOutcome,
  type SwapReference,
} from '../../lib/studio/tools';
import {
  AssetInputZone,
  BeforeAfterSplit,
  OutcomeNote,
  PreviousRuns,
  QuotePanel,
  ToolPageShell,
  ToolResultsRail,
  type ToolAssetsState,
} from './ToolFlow';

const TOOL = toolById('presenter-swap')!;

/** The photo slot reuses the input zone with the image kind. */
const PHOTO_SLOT_TOOL: QuickTool = { ...TOOL, id: 'presenter-swap-photo', inputKind: 'image' };

export interface PresenterSwapProps {
  projectId?: string | null;
  assets?: ServerAsset[];
  assetsState: ToolAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  upload?: (file: File) => Promise<ServerAsset>;
  /** The caller's Chef Personas from the Voice Studio library (drafts). */
  personas?: ChefPersona[];
  initialClip?: ServerAsset | null;
  initialPersonaId?: string | null;
  initialPhoto?: ServerAsset | null;
  initialPhotoConsent?: boolean;
  initialOutcome?: SwapOutcome | null;
  initialSplit?: number;
  /** External facts (Unit 7 pattern); both false until servers say so. */
  trainingCompleted?: boolean;
  providerConfigured?: boolean;
  jobs?: StudioJob[];
}

export const PresenterSwap: React.FC<PresenterSwapProps> = ({
  projectId,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  upload,
  personas = [],
  initialClip = null,
  initialPersonaId = null,
  initialPhoto = null,
  initialPhotoConsent = false,
  initialOutcome = null,
  initialSplit = 50,
  trainingCompleted = false,
  providerConfigured = false,
  jobs = [],
}) => {
  const [clip, setClip] = useState<ServerAsset | null>(initialClip);
  const [mode, setMode] = useState<'persona' | 'photo'>(initialPhoto ? 'photo' : 'persona');
  const [personaId, setPersonaId] = useState<string | null>(initialPersonaId);
  const [photo, setPhoto] = useState<ServerAsset | null>(initialPhoto);
  const [photoConsent, setPhotoConsent] = useState(initialPhotoConsent);
  const [outcome, setOutcome] = useState<SwapOutcome | null>(initialOutcome);
  const [split, setSplit] = useState(initialSplit);

  const persona = personas.find((p) => p.id === personaId) ?? null;
  const reference: SwapReference | null =
    mode === 'persona'
      ? persona
        ? { kind: 'persona', persona }
        : null
      : photo
        ? { kind: 'photo', asset: photo, consentRecorded: photoConsent }
        : null;

  const gate = reference
    ? presenterSwapGate({ reference, trainingCompleted, providerConfigured })
    : null;
  const results = toolResultsFromJobs(jobs, 'video');
  const runs = previousRunsFor(jobs, TOOL.name);
  const firstResult = results[0] ?? null;

  return (
    <ToolPageShell
      tool={TOOL}
      explainer="The dish, the kitchen and the words stay the same — the person presenting becomes you, or your own trained presenter."
      limitNote="Only your own likeness can ever be swapped in: your trained persona, or your own photo with the own-likeness confirmation recorded. Nobody else's face, ever."
      jobs={jobs}
    >
      <div className="studio-tools-flow-layout">
        <AssetInputZone
          tool={TOOL}
          slotLabel="Target clip"
          assets={assets}
          assetsState={assetsState}
          assetsError={assetsError}
          onRetryAssets={onRetryAssets}
          projectId={projectId}
          upload={upload}
          selected={clip}
          onSelect={(a) => {
            setClip(a);
            setOutcome(null);
          }}
          testIdPrefix="swap-clip"
        />

        <div className="studio-tools-options" data-testid="swap-presenter">
          <h2>Your presenter</h2>
          <div className="studio-tools-swap-mode" role="group" aria-label="Presenter source">
            <button
              type="button"
              data-testid="swap-mode-persona"
              aria-pressed={mode === 'persona'}
              onClick={() => {
                setMode('persona');
                setOutcome(null);
              }}
            >
              A Chef Persona
            </button>
            <button
              type="button"
              data-testid="swap-mode-photo"
              aria-pressed={mode === 'photo'}
              onClick={() => {
                setMode('photo');
                setOutcome(null);
              }}
            >
              Your photo
            </button>
          </div>

          {mode === 'persona' &&
            (personas.length === 0 ? (
              <p className="studio-tools-personas-empty" data-testid="swap-personas-empty" role="note">
                No Chef Personas yet. Personas are created in{' '}
                <a href="/studio/voice">Voice Studio</a> — a draft there appears here, labelled
                as the draft it is, until its training can run.
              </p>
            ) : (
              <ul className="studio-tools-persona-list">
                {personas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      data-testid={`swap-persona-pick-${p.id}`}
                      aria-pressed={personaId === p.id}
                      onClick={() => {
                        setPersonaId(p.id);
                        setOutcome(null);
                      }}
                    >
                      <strong>{p.name}</strong> · {p.presenterType} ·{' '}
                      <span className="studio-tools-persona-status">
                        Draft — not trained
                      </span>{' '}
                      · {p.consent ? 'consent recorded' : 'no consent recorded'}
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {mode === 'photo' && (
            <>
              <AssetInputZone
                tool={PHOTO_SLOT_TOOL}
                slotLabel="Your photo"
                assets={assets}
                assetsState={assetsState}
                assetsError={assetsError}
                onRetryAssets={onRetryAssets}
                projectId={projectId}
                upload={upload}
                selected={photo}
                onSelect={(a) => {
                  setPhoto(a);
                  setOutcome(null);
                }}
                testIdPrefix="swap-photo"
              />
              <label className="studio-tools-consent">
                <input
                  type="checkbox"
                  data-testid="swap-photo-consent"
                  checked={photoConsent}
                  onChange={(e) => {
                    setPhotoConsent(e.target.checked);
                    setOutcome(null);
                  }}
                />{' '}
                This is my own photo and my own likeness, and I confirm the swap may use it.
              </label>
            </>
          )}

          {gate && !gate.armed && (
            <div className="studio-tools-gate" data-testid="swap-gate" role="note">
              <p>Why this cannot run yet — each reason on its own:</p>
              <ul>
                {gate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <QuotePanel
            quote={null}
            quoteNote={PRESENTER_SWAP_QUOTE_NOTE}
            actionLabel="Swap the presenter"
            canRun={Boolean(clip) && Boolean(reference)}
            onRun={() =>
              setOutcome(
                attemptPresenterSwap({ clip, reference, trainingCompleted, providerConfigured }),
              )
            }
            testIdPrefix="swap"
          />
          <OutcomeNote outcome={outcome} testIdPrefix="swap" />
        </div>

        {firstResult && clip?.url && firstResult.url ? (
          <aside className="studio-tools-results" data-testid="swap-results" aria-label="Result">
            <h2>Result</h2>
            <BeforeAfterSplit
              sourceUrl={clip.url}
              sourceLabel={`Before — ${clip.filename}`}
              outputUrl={firstResult.url}
              outputLabel={`After — ${firstResult.label}`}
              split={split}
              onSplitChange={setSplit}
              testIdPrefix="swap"
            />
          </aside>
        ) : (
          <ToolResultsRail
            cards={results}
            kind="video"
            emptyCopy="No swapped clip yet. A swap needs a trained identity and a connected transform provider, so this area stays honestly empty until a run really finishes."
            testIdPrefix="swap"
          />
        )}
      </div>

      <PreviousRuns runs={runs} testIdPrefix="swap" />
    </ToolPageShell>
  );
};

export default PresenterSwap;
