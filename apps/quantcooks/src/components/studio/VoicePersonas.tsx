// ============================================================================
// QuantCooks Studio — Chef Persona library, builder and detail
// (spec §7.3, checklist #55–#56; the "My Presenters" view of Voice Studio)
//
// The builder is the picker stack: presenter type → guided Face / Body /
// Style pickers → a reference photo set picked from the caller's READY
// images → the consent gate → Train. The gate is structural, not copy:
// create_chef_persona refuses a consent-less call with CONSENT_REQUIRED
// before configuration is even checked (CP-1 §8), and its training
// engine then refuses with TRAINING_NOT_CONFIGURED — so a persona here
// honestly tops out at "draft", and its record's status type has no
// other value a toggle could set.
//
// The detail view carries the spec's finisher toolbar and the Speak
// action (make_presenter_speak): the generation gate's three blocks —
// consent, training, provider — print as separate reasons, and past the
// gate the first-use policy acknowledgement stands before the tool,
// exactly where the spec puts it.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import {
  PERSONA_PICKER_GROUPS,
  PERSONA_TOOL,
  PERSONA_TRAINING_CREDITS,
  PRESENTER_TYPES,
  SPEAK_TOOL,
  acknowledgePersonaUse,
  applyTrainingOutcome,
  attemptPersonaSpeak,
  attemptPersonaTraining,
  createPersonaDraft,
  defaultPersonaPicks,
  nextPersonaId,
  personaGenerationGate,
  pickablePersonaReferenceAssets,
  recordPersonaConsent,
  removePersona,
  type ChefPersona,
  type PersonaSpeakOutcome,
  type PersonaTrainingOutcome,
} from '../../lib/studio/voice';
import type { VoiceAssetsState } from './VoiceStudio';

export interface VoicePersonasProps {
  personas: ChefPersona[];
  assets?: ServerAsset[];
  assetsState: VoiceAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  onPersonasChange: (personas: ChefPersona[]) => void;
  initialSelectedId?: string | null;
  initialBuilderOpen?: boolean;
}

/** Today's external facts, stated once: neither has ever been true yet. */
const GATE_FACTS = { trainingCompleted: false, providerConfigured: false } as const;

const FINISHERS = ['Colour Grade', 'Upscale', 'Enhance', 'Relight', 'Inpaint', 'Angles'] as const;

export const VoicePersonas: React.FC<VoicePersonasProps> = ({
  personas,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  onPersonasChange,
  initialSelectedId = null,
  initialBuilderOpen = false,
}) => {
  const [builderOpen, setBuilderOpen] = useState(initialBuilderOpen);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [name, setName] = useState('');
  const [presenterType, setPresenterType] = useState<string>(PRESENTER_TYPES[0]!);
  const [picks, setPicks] = useState<Record<string, string>>(() => defaultPersonaPicks());
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [trainOutcome, setTrainOutcome] = useState<PersonaTrainingOutcome | null>(null);
  const [consentDraftChecked, setConsentDraftChecked] = useState(false);
  const [speakText, setSpeakText] = useState('');
  const [speakAckChecked, setSpeakAckChecked] = useState(false);
  const [speakOutcome, setSpeakOutcome] = useState<PersonaSpeakOutcome | null>(null);

  const references = pickablePersonaReferenceAssets(assets);
  const selected = personas.find((p) => p.id === selectedId) ?? null;
  const selectedPreview = selected
    ? (assets.find((a) => a.id === selected.referenceAssetIds[0]) ?? null)
    : null;
  const selectedGate = selected ? personaGenerationGate(selected, GATE_FACTS) : null;

  const toggleReference = (assetId: string) =>
    setReferenceIds((ids) => (ids.includes(assetId) ? ids.filter((i) => i !== assetId) : [...ids, assetId]));

  const handleSaveDraft = () => {
    if (name.trim() === '') {
      setBuilderError('Give the persona a name first — the library is searched and cast by name.');
      return;
    }
    const persona = createPersonaDraft({
      id: nextPersonaId(personas),
      name,
      presenterType,
      picks,
      referenceAssetIds: referenceIds,
      consent: consentChecked ? { ownLikeness: true, confirmedAt: new Date().toISOString() } : null,
      createdAt: new Date().toISOString(),
    });
    onPersonasChange([...personas, persona]);
    setSelectedId(persona.id);
    setBuilderOpen(false);
    setBuilderError(null);
    setTrainOutcome(null);
  };

  const handleTrain = (persona: ChefPersona) => {
    const outcome = attemptPersonaTraining(persona);
    setTrainOutcome(outcome);
    onPersonasChange(applyTrainingOutcome(personas, persona.id, outcome));
  };

  const handleSpeak = (persona: ChefPersona) => {
    const outcome = attemptPersonaSpeak({
      persona,
      scriptText: speakText,
      facts: GATE_FACTS,
      acknowledgeNow: speakAckChecked,
    });
    setSpeakOutcome(outcome);
    if (outcome.status === 'not-configured' && speakAckChecked && !persona.useAcknowledged) {
      onPersonasChange(acknowledgePersonaUse(personas, persona.id));
    }
  };

  return (
    <div className="studio-voice-personas" data-testid="voice-personas">
      <p className="studio-voice-personas-note">
        A Chef Persona is your own likeness, trained once and cast everywhere — the Presenter slot
        in Promo, the Persona chip in Image and Video, Elements in Film. Personas are drafts on
        this device: training runs through {PERSONA_TOOL} under an own-likeness consent gate, and
        no persona can be marked trained from this screen.
      </p>

      {/* ------------------------------------------------------ library */}
      <div className="studio-voice-persona-library" data-testid="persona-library">
        <h2>My Presenters</h2>
        {personas.length === 0 ? (
          <p data-testid="persona-library-empty">
            No personas yet. Build one below from your own photos — it stays a draft until the
            training engine connects and the consent-gated training actually runs.
          </p>
        ) : (
          <ul className="studio-voice-persona-grid">
            {personas.map((persona) => (
              <li key={persona.id} className="studio-voice-persona-card" data-testid={`persona-card-${persona.id}`}>
                <strong>{persona.name}</strong>
                <span>{persona.presenterType}</span>
                <span data-testid={`persona-status-${persona.id}`}>Draft on this device</span>
                <span>{persona.consent ? 'Consent recorded' : 'Consent not recorded'}</span>
                <span>
                  {persona.trainingState === 'not-configured'
                    ? 'Training attempted — engine not configured'
                    : persona.trainingState === 'consent-required'
                      ? 'Training refused — consent required first'
                      : 'Not trained'}
                </span>
                <button type="button" onClick={() => setSelectedId(persona.id)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" data-testid="persona-builder-open" onClick={() => setBuilderOpen((open) => !open)}>
          Create a Chef Persona
        </button>
      </div>

      {/* ------------------------------------------------------ builder */}
      {builderOpen && (
        <div className="studio-voice-persona-builder" data-testid="persona-builder">
          <h2>Persona builder</h2>
          <label>
            Persona name
            <input
              type="text"
              aria-label="Persona name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chef Ravi — home kitchen"
            />
          </label>
          <label>
            Presenter type
            <select aria-label="Presenter type" value={presenterType} onChange={(e) => setPresenterType(e.target.value)}>
              {PRESENTER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          {PERSONA_PICKER_GROUPS.map((group) => (
            <fieldset key={group.id} className="studio-voice-persona-pickers" data-testid={`persona-picker-${group.id}`}>
              <legend>{group.label}</legend>
              {group.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={picks[group.id] === option}
                  onClick={() => setPicks((p) => ({ ...p, [group.id]: option }))}
                >
                  {option}
                </button>
              ))}
            </fieldset>
          ))}

          <div className="studio-voice-persona-references" data-testid="persona-references">
            <h3>Reference photos</h3>
            <p>
              Pick your own ready photos — the training set. The checks this screen can honestly
              run are: your photos, finished uploads, images only. Per-photo quality checks
              (blur, occlusion, face framing) run at training time, before the training charge,
              never after.
            </p>
            {assetsState === 'loading' && <p data-testid="persona-assets-loading">Loading your library…</p>}
            {assetsState === 'error' && (
              <p role="alert" data-testid="persona-assets-error">
                {assetsError ?? 'Your library could not be loaded.'}{' '}
                <button type="button" onClick={() => onRetryAssets?.()}>
                  Retry
                </button>
              </p>
            )}
            {assetsState === 'ready' && references.length === 0 && (
              <p data-testid="persona-references-empty">No ready photos yet — upload one in a studio and it will be pickable here.</p>
            )}
            {assetsState === 'ready' &&
              references.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  data-testid={`persona-reference-${asset.id}`}
                  aria-pressed={referenceIds.includes(asset.id)}
                  onClick={() => toggleReference(asset.id)}
                >
                  {asset.filename}
                </button>
              ))}
          </div>

          <label className="studio-voice-consent" data-testid="persona-consent">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
            This is my own likeness. I confirm these references are photos of me, and I understand
            QuantCooks trains personas only on the likeness of the person who confirms it.
          </label>

          {builderError && (
            <p role="alert" data-testid="persona-builder-error">
              {builderError}
            </p>
          )}
          <button type="button" data-testid="persona-save" onClick={handleSaveDraft}>
            Save persona draft
          </button>
          <p>
            Training is a separate, costed step on the saved persona —{' '}
            {PERSONA_TRAINING_CREDITS} credits one-off, shown on its Train button before anything
            runs (quote-before-spend).
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ detail */}
      {selected && (
        <div className="studio-voice-persona-detail" data-testid="persona-detail">
          <h2>{selected.name}</h2>
          {selectedPreview?.url ? (
            <img src={selectedPreview.url} alt={selected.name} />
          ) : (
            <p data-testid="persona-no-preview">
              No preview — the preview is the persona&rsquo;s first reference photo, resolved from
              your live library.
            </p>
          )}
          <p>
            {selected.presenterType} · Draft on this device · References: {selected.referenceAssetIds.length} photo
            {selected.referenceAssetIds.length === 1 ? '' : 's'}
          </p>
          <p>
            Honest note: identity can drift on complex multi-shot work even after training; a
            re-roll is priced on its own button, never hidden.
          </p>

          <div className="studio-voice-finishers" data-testid="persona-finishers">
            <h3>Finishers</h3>
            {FINISHERS.map((finisher) => (
              <button key={finisher} type="button" disabled>
                {finisher}
              </button>
            ))}
            <p>Finishers run on a trained persona — this one is a draft, so they stay off with the reason stated.</p>
          </div>

          {!selected.consent ? (
            <div className="studio-voice-persona-consent" data-testid="persona-consent-panel">
              <h3>Consent</h3>
              <p>No consent is recorded for this persona yet.</p>
              <label>
                <input
                  type="checkbox"
                  checked={consentDraftChecked}
                  onChange={(e) => setConsentDraftChecked(e.target.checked)}
                />
                This is my own likeness, and I confirm it for training.
              </label>
              <button
                type="button"
                data-testid="persona-record-consent"
                disabled={!consentDraftChecked}
                onClick={() => {
                  onPersonasChange(recordPersonaConsent(personas, selected.id, new Date().toISOString()));
                  setConsentDraftChecked(false);
                }}
              >
                Record consent
              </button>
            </div>
          ) : (
            <p data-testid="persona-consent-recorded">
              Consent recorded {selected.consent.confirmedAt} — own likeness confirmed.
            </p>
          )}

          <div className="studio-voice-persona-train" data-testid="persona-train">
            <h3>Training</h3>
            <button type="button" data-testid="persona-train-button" onClick={() => handleTrain(selected)}>
              Train · {PERSONA_TRAINING_CREDITS} credits (one-off)
            </button>
            {trainOutcome && (
              <p role="status" data-testid="persona-train-outcome">
                {trainOutcome.message}
              </p>
            )}
          </div>

          <div className="studio-voice-persona-use" data-testid="persona-use">
            <h3>Use this persona</h3>
            {selectedGate && !selectedGate.armed && (
              <ul className="studio-voice-gate-reasons" data-testid="persona-gate-reasons">
                {selectedGate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <label>
              Line for this persona to say
              <textarea
                aria-label="Line for this persona to say"
                value={speakText}
                rows={2}
                onChange={(e) => setSpeakText(e.target.value)}
              />
            </label>
            <label>
              <input type="checkbox" checked={speakAckChecked} onChange={(e) => setSpeakAckChecked(e.target.checked)} />
              I acknowledge the first-use policy: outputs use my own trained likeness, and identity
              can drift on complex work.
            </label>
            <button type="button" data-testid="persona-speak" onClick={() => handleSpeak(selected)}>
              Speak · via {SPEAK_TOOL}
            </button>
            {speakOutcome && (
              <div data-testid="persona-speak-outcome">
                {speakOutcome.status === 'blocked' ? (
                  <ul>
                    {speakOutcome.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p role={speakOutcome.status === 'invalid' ? 'alert' : 'status'}>{speakOutcome.message}</p>
                )}
              </div>
            )}
            <p>
              <a href="/studio/video">Open in Video Studio</a> to animate this persona — casting it
              there rides the same gate above.
            </p>
            <button
              type="button"
              data-testid="persona-remove"
              onClick={() => {
                onPersonasChange(removePersona(personas, selected.id));
                setSelectedId(null);
              }}
            >
              Delete persona draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoicePersonas;
