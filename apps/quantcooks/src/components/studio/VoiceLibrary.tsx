// ============================================================================
// QuantCooks Studio — Voice Library + Clone-a-voice (spec §7.4, #57)
//
// Voices are library objects: stock voices and the caller's own. The
// stock catalogue is quantcooks.list_models data, and that tool refuses
// until a provider catalogue exists (PROVIDER_NOT_CONFIGURED) rather
// than listing voices that do not exist — so the stock grid renders its
// honest empty state here: no invented voice names, no sample that is
// not real. The caller's own side is real: their READY audio clips
// (playable, because their URLs are real) and their clone drafts.
//
// Cloning follows the persona consent family (CP-1 §4.2): creation is
// quantcooks.clone_voice, a TRAINING job separate from the tools that
// USE a voice; consent is validated before configuration is checked, so
// a consent-less clone is refused with CONSENT_REQUIRED and only then
// does the unconfigured engine answer VOICE_TRAINING_NOT_CONFIGURED. A
// draft's status type has one member — nothing here can mint a voice.
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import {
  CLONE_VOICE_TOOL,
  VOICE_CLONE_TRAINING_CREDITS,
  VOICE_LANGUAGES,
  applyCloneOutcome,
  attemptVoiceClone,
  createVoiceCloneDraft,
  nextVoiceCloneId,
  pickableAudioAssets,
  recordVoiceConsent,
  removeVoiceClone,
  voiceLanguageById,
  type VoiceCloneDraft,
  type VoiceCloneOutcome,
} from '../../lib/studio/voice';
import type { VoiceAssetsState } from './VoiceStudio';

export interface VoiceLibraryProps {
  voiceClones: VoiceCloneDraft[];
  assets?: ServerAsset[];
  assetsState: VoiceAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  onVoiceClonesChange: (clones: VoiceCloneDraft[]) => void;
}

export const VoiceLibrary: React.FC<VoiceLibraryProps> = ({
  voiceClones,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  onVoiceClonesChange,
}) => {
  const [name, setName] = useState('');
  const [languageId, setLanguageId] = useState('hinglish');
  const [sampleIds, setSampleIds] = useState<string[]>([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cloneOutcome, setCloneOutcome] = useState<VoiceCloneOutcome | null>(null);
  const [retryConsentId, setRetryConsentId] = useState<string | null>(null);

  const samples = pickableAudioAssets(assets);

  const toggleSample = (assetId: string) =>
    setSampleIds((ids) => (ids.includes(assetId) ? ids.filter((i) => i !== assetId) : [...ids, assetId]));

  const handleClone = () => {
    if (name.trim() === '') {
      setFormError('Give the voice a name first — it joins your library under that name.');
      return;
    }
    const draft = createVoiceCloneDraft({
      id: nextVoiceCloneId(voiceClones),
      name,
      sampleAssetIds: sampleIds,
      languageId,
      consent: consentChecked ? { ownVoice: true, confirmedAt: new Date().toISOString() } : null,
      createdAt: new Date().toISOString(),
    });
    const outcome = attemptVoiceClone(draft);
    setCloneOutcome(outcome);
    setFormError(null);
    onVoiceClonesChange(applyCloneOutcome([...voiceClones, draft], draft.id, outcome));
  };

  const handleRetry = (draft: VoiceCloneDraft) => {
    const outcome = attemptVoiceClone(draft);
    setCloneOutcome(outcome);
    onVoiceClonesChange(applyCloneOutcome(voiceClones, draft.id, outcome));
  };

  return (
    <div className="studio-voice-library" data-testid="voice-library">
      {/* ------------------------------------------------------ stock */}
      <div className="studio-voice-stock" data-testid="voice-stock">
        <h2>Stock voices</h2>
        <p data-testid="voice-stock-empty">
          Stock voices arrive with the voice provider — no catalogue is configured yet, so this
          grid stays honestly empty rather than inventing voices, names or samples. Your own
          cloned voices will live below, and the dial&rsquo;s slots are where a voice gets cast.
        </p>
      </div>

      {/* ------------------------------------------------------ clone */}
      <div className="studio-voice-clone" data-testid="voice-clone-form">
        <h2>Clone a voice</h2>
        <p>
          Clone is trained from your own recordings, on your own voice only — the same consent
          gate family as Chef Personas, enforced inside {CLONE_VOICE_TOOL} itself.
        </p>
        <label>
          Voice name
          <input
            type="text"
            aria-label="Voice name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My kitchen voice"
          />
        </label>
        <label>
          Voice language
          <select aria-label="Voice language" value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
            {VOICE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="studio-voice-samples" data-testid="voice-clone-samples">
          <h3>Sample clips</h3>
          {assetsState === 'loading' && <p data-testid="voice-samples-loading">Loading your library…</p>}
          {assetsState === 'error' && (
            <p role="alert" data-testid="voice-samples-error">
              {assetsError ?? 'Your library could not be loaded.'}{' '}
              <button type="button" onClick={() => onRetryAssets?.()}>
                Retry
              </button>
            </p>
          )}
          {assetsState === 'ready' && samples.length === 0 && (
            <p data-testid="voice-samples-empty">
              No ready audio clips yet — record or upload a clip of your own voice and it becomes
              pickable here once its upload finishes.
            </p>
          )}
          {assetsState === 'ready' &&
            samples.map((asset) => (
              <button
                key={asset.id}
                type="button"
                data-testid={`voice-sample-${asset.id}`}
                aria-pressed={sampleIds.includes(asset.id)}
                onClick={() => toggleSample(asset.id)}
              >
                {asset.filename}
              </button>
            ))}
        </div>

        <label className="studio-voice-consent" data-testid="voice-clone-consent">
          <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
          This is my own voice. I confirm the samples are recordings of me, and I understand
          QuantCooks clones only the voice of the person who confirms it.
        </label>

        {formError && (
          <p role="alert" data-testid="voice-clone-error">
            {formError}
          </p>
        )}
        <button type="button" data-testid="voice-clone-button" onClick={handleClone}>
          Clone voice · {VOICE_CLONE_TRAINING_CREDITS} credits (one-off)
        </button>
        {cloneOutcome && cloneOutcome.status !== 'invalid' && (
          <p role="status" data-testid="voice-clone-outcome">
            {cloneOutcome.message}
          </p>
        )}
        {cloneOutcome?.status === 'invalid' && (
          <p role="alert" data-testid="voice-clone-outcome">
            {cloneOutcome.message}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ drafts */}
      <div className="studio-voice-clones" data-testid="voice-clone-list">
        <h2>Your voices</h2>
        {voiceClones.length === 0 ? (
          <p data-testid="voice-clones-empty">No cloned voices yet — your drafts will live here.</p>
        ) : (
          <ul>
            {voiceClones.map((draft) => (
              <li key={draft.id} className="studio-voice-clone-card" data-testid={`voice-clone-card-${draft.id}`}>
                <strong>{draft.name}</strong>
                <span>{voiceLanguageById(draft.languageId)?.label ?? draft.languageId}</span>
                <span>Draft on this device</span>
                <span>
                  {draft.sampleAssetIds.length} sample{draft.sampleAssetIds.length === 1 ? '' : 's'} ·{' '}
                  {draft.consent ? 'Consent recorded' : 'Consent not recorded'}
                </span>
                <span>
                  {draft.cloneState === 'not-configured'
                    ? 'Training attempted — engine not configured'
                    : draft.cloneState === 'consent-required'
                      ? 'Refused — consent required first'
                      : 'Not trained'}
                </span>
                {!draft.consent &&
                  (retryConsentId === draft.id ? (
                    <button
                      type="button"
                      data-testid={`voice-record-consent-${draft.id}`}
                      onClick={() => {
                        onVoiceClonesChange(recordVoiceConsent(voiceClones, draft.id, new Date().toISOString()));
                        setRetryConsentId(null);
                      }}
                    >
                      Confirm this is my own voice
                    </button>
                  ) : (
                    <button type="button" onClick={() => setRetryConsentId(draft.id)}>
                      Record consent
                    </button>
                  ))}
                <button type="button" data-testid={`voice-retry-clone-${draft.id}`} onClick={() => handleRetry(draft)}>
                  Try training · {VOICE_CLONE_TRAINING_CREDITS} credits (one-off)
                </button>
                <button
                  type="button"
                  onClick={() => onVoiceClonesChange(removeVoiceClone(voiceClones, draft.id))}
                >
                  Delete draft
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------ your audio */}
      <div className="studio-voice-your-audio" data-testid="voice-your-audio">
        <h2>Your audio</h2>
        {assetsState === 'loading' && <p>Loading your library…</p>}
        {assetsState === 'error' && (
          <p role="alert">
            {assetsError ?? 'Your library could not be loaded.'}{' '}
            <button type="button" onClick={() => onRetryAssets?.()}>
              Retry
            </button>
          </p>
        )}
        {assetsState === 'ready' && samples.length === 0 && (
          <p data-testid="voice-your-audio-empty">No audio in your library yet.</p>
        )}
        {assetsState === 'ready' && (
          <ul>
            {samples.map((asset) => (
              <li key={asset.id} data-testid={`voice-audio-${asset.id}`}>
                <span>{asset.filename}</span>
                {asset.url ? <audio controls src={asset.url} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default VoiceLibrary;
