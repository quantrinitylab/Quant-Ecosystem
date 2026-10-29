// ============================================================================
// QuantCooks Studio — the shared Composer (spec §0.1)
//
// One grammar for every generation surface: context chips above the field,
// a prompt field with @-mentions and / references, a settings row below,
// and a Generate button that always shows its live Quant Credits cost and
// goes through a quote state before anything is spent (quote-before-spend).
//
// Generation availability is explicit: until a real generation endpoint is
// configured for a surface, `generation` is 'not-configured' and Generate
// stays disabled with the reason printed on the surface — the composer
// never fakes a generation, a progress bar, or a success.
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  computeQuote,
  generateButtonLabel,
  modelRateFor,
  STUDIO_MODEL_RATES,
  type ComposerSettings,
  type CreditQuote,
  type StudioGenerationKind,
} from '../../lib/studio/pricing';
import {
  parsePromptMentions,
  promptHasInput,
  removeMention,
  type PromptMention,
} from '../../lib/studio/mentions';

export interface ComposerChip {
  id: string;
  /** Slot label, e.g. "Camera move". */
  label: string;
  /** Filled value; empty/undefined renders the slot's pick affordance. */
  value?: string;
  onClear?: (chip: ComposerChip) => void;
  onPick?: (chip: ComposerChip) => void;
}

export type GenerationAvailability = 'ready' | 'not-configured';

export interface ComposerProps {
  kind: StudioGenerationKind;
  /** Context chips rendered above the prompt field (slots are props, §0.1). */
  chips?: ComposerChip[];
  placeholder?: string;
  /** Pre-filled prompt (e.g. a preset brief handed over from Explore). */
  initialPrompt?: string;
  /** Which settings controls the settings row shows; defaults fit the kind. */
  showSettings?: Partial<Record<'model' | 'ratio' | 'resolution' | 'duration' | 'batch' | 'audio', boolean>>;
  initialSettings?: Partial<ComposerSettings>;
  /**
   * Controlled settings (F-U3-2). When `settings` is provided the parent
   * owns the settings state: the Composer renders exactly these values and
   * reports every change through `onSettingsChange` instead of keeping its
   * own copy — `initialSettings` is then ignored. When `settings` is
   * absent the Composer is uncontrolled and behaves exactly as it always
   * has (internal state seeded from `initialSettings`).
   */
  settings?: ComposerSettings;
  onSettingsChange?: (settings: ComposerSettings) => void;
  /** Generation backend state for THIS surface. Default: not-configured. */
  generation?: GenerationAvailability;
  /** Plain reason shown when generation is not configured. */
  notConfiguredReason?: string;
  /** Called only after the user confirms the quote. Never called otherwise. */
  onGenerate?: (args: { prompt: string; mentions: PromptMention[]; settings: ComposerSettings; quote: CreditQuote }) => void;
  onMentionsChange?: (mentions: PromptMention[]) => void;
  onPromptChange?: (prompt: string) => void;
}

const RATIOS = ['16:9', '1:1', '9:16', '4:5'];
const RESOLUTIONS: Record<StudioGenerationKind, string[]> = {
  image: ['Draft', 'Standard', 'High'],
  video: ['720p', '1080p'],
  audio: ['Standard'],
  ad: ['720p', '1080p'],
};
const DURATIONS = [3, 5, 8, 10, 15];

/**
 * The Composer's default settings for a kind, with optional overrides —
 * exactly the seed the uncontrolled Composer has always started from.
 * Controlled parents (F-U3-2) build their initial settings state with
 * this so a controlled Composer opens on the same values an uncontrolled
 * one would.
 */
export function defaultComposerSettings(
  kind: StudioGenerationKind,
  overrides?: Partial<ComposerSettings>,
): ComposerSettings {
  const fallback: ComposerSettings = {
    modelId: STUDIO_MODEL_RATES[kind][0]!.id,
    ratio: kind === 'image' ? '1:1' : '9:16',
    resolution: RESOLUTIONS[kind][0]!,
    durationSeconds: kind === 'image' ? 0 : 5,
    batch: 1,
    audioOn: true,
    stackedExtras: 0,
  };
  return { ...fallback, ...overrides };
}

export const Composer: React.FC<ComposerProps> = ({
  kind,
  chips = [],
  placeholder = 'Describe what you want to make… use @ to attach a dish or presenter, / for a collection',
  initialPrompt = '',
  showSettings,
  initialSettings,
  settings: settingsProp,
  onSettingsChange,
  generation = 'not-configured',
  notConfiguredReason = 'Generation is not connected yet — no provider is configured for this surface (NOT_CONFIGURED). Nothing will be charged.',
  onGenerate,
  onMentionsChange,
  onPromptChange,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [internalSettings, setInternalSettings] = useState<ComposerSettings>(() =>
    defaultComposerSettings(kind, initialSettings),
  );
  // Controlled when the parent passes `settings` (F-U3-2); otherwise the
  // internal state above is the settings, exactly as before.
  const settings = settingsProp ?? internalSettings;
  const [quoteOpen, setQuoteOpen] = useState(false);

  const mentions = useMemo(() => parsePromptMentions(prompt), [prompt]);
  const hasInput = promptHasInput(prompt) || chips.some((c) => Boolean(c.value));
  const quote = useMemo(() => (hasInput ? computeQuote(kind, settings) : null), [kind, settings, hasInput]);
  const notConfigured = generation === 'not-configured';
  const generateDisabled = notConfigured || !hasInput;

  const show = (key: 'model' | 'ratio' | 'resolution' | 'duration' | 'batch' | 'audio') =>
    showSettings?.[key] ?? (key === 'duration' ? kind !== 'image' : key === 'audio' ? kind === 'video' || kind === 'ad' : true);

  const updatePrompt = (next: string) => {
    setPrompt(next);
    setQuoteOpen(false);
    onPromptChange?.(next);
    onMentionsChange?.(parsePromptMentions(next));
  };

  const patchSettings = (patch: Partial<ComposerSettings>) => {
    if (settingsProp !== undefined) {
      // Controlled: the parent owns the state — hand it the full next
      // settings; the re-render with the new prop is what re-prices.
      onSettingsChange?.({ ...settingsProp, ...patch });
    } else {
      setInternalSettings((prev) => ({ ...prev, ...patch }));
    }
    setQuoteOpen(false); // any change re-prices; the old quote no longer stands
  };

  return (
    <div className="studio-composer" data-testid="studio-composer">
      {chips.length > 0 && (
        <div className="studio-composer-chips" aria-label="Context">
          {chips.map((chip) => (
            <span key={chip.id} className="studio-chip" data-testid={`chip-${chip.id}`}>
              <button type="button" onClick={() => chip.onPick?.(chip)}>
                {chip.label}
                {chip.value ? `: ${chip.value}` : ' · pick'}
              </button>
              {chip.value && chip.onClear && (
                <button type="button" aria-label={`Clear ${chip.label}`} onClick={() => chip.onClear?.(chip)}>
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="studio-composer-field">
        <button type="button" className="studio-composer-attach" aria-label="Attach a photo or asset" title="Attach">
          +
        </button>
        <textarea
          data-testid="composer-prompt"
          value={prompt}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => updatePrompt(e.target.value)}
          aria-label="Prompt"
        />
      </div>

      {mentions.length > 0 && (
        <div className="studio-composer-mentions" aria-label="Attached mentions">
          {mentions.map((mention) => (
            <span key={`${mention.start}-${mention.raw}`} className="studio-chip" data-testid={`mention-${mention.name}`}>
              {mention.kind === 'mention' ? '@' : '/'}
              {mention.name}
              <button
                type="button"
                aria-label={`Remove ${mention.raw}`}
                onClick={() => updatePrompt(removeMention(prompt, mention))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="studio-composer-settings" aria-label="Settings">
        {show('model') && (
          <label>
            Model
            <select
              data-testid="composer-model"
              value={settings.modelId}
              onChange={(e) => patchSettings({ modelId: e.target.value })}
            >
              {STUDIO_MODEL_RATES[kind].map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.label} — {rate.note}
                </option>
              ))}
            </select>
          </label>
        )}
        {show('ratio') && (
          <label>
            Ratio
            <select data-testid="composer-ratio" value={settings.ratio} onChange={(e) => patchSettings({ ratio: e.target.value })}>
              {RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
          </label>
        )}
        {show('resolution') && (
          <label>
            {kind === 'image' ? 'Quality' : 'Resolution'}
            <select
              data-testid="composer-resolution"
              value={settings.resolution}
              onChange={(e) => patchSettings({ resolution: e.target.value })}
            >
              {RESOLUTIONS[kind].map((res) => (
                <option key={res} value={res}>
                  {res}
                </option>
              ))}
            </select>
          </label>
        )}
        {show('duration') && (
          <label>
            Duration
            <select
              data-testid="composer-duration"
              value={settings.durationSeconds}
              onChange={(e) => patchSettings({ durationSeconds: Number(e.target.value) })}
            >
              {DURATIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}s
                </option>
              ))}
            </select>
          </label>
        )}
        {show('batch') && (
          <label>
            Batch
            <input
              data-testid="composer-batch"
              type="number"
              min={1}
              max={4}
              value={settings.batch}
              onChange={(e) => patchSettings({ batch: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </label>
        )}
        {show('audio') && (
          <label>
            Audio
            <input
              data-testid="composer-audio"
              type="checkbox"
              checked={settings.audioOn}
              onChange={(e) => patchSettings({ audioOn: e.target.checked })}
            />
          </label>
        )}
      </div>

      <div className="studio-composer-actions">
        <button
          type="button"
          className="studio-generate"
          data-testid="composer-generate"
          disabled={generateDisabled}
          onClick={() => setQuoteOpen(true)}
        >
          {generateButtonLabel(quote, hasInput)}
        </button>
        {notConfigured ? (
          <p className="studio-composer-notconfigured" data-testid="composer-not-configured" role="note">
            {notConfiguredReason}
          </p>
        ) : (
          !hasInput && <p className="studio-composer-hint">Add a prompt or fill a slot to see the price.</p>
        )}
      </div>

      {quoteOpen && quote && !notConfigured && (
        <div className="studio-composer-quote" data-testid="composer-quote" role="dialog" aria-label="Confirm your quote">
          <p>
            <strong>Quote before you spend</strong> — {modelRateFor(kind, settings.modelId).label}, {settings.ratio}
            {settings.durationSeconds > 0 ? `, ${settings.durationSeconds}s` : ''}
          </p>
          <ul>
            {quote.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            Total: <strong>{quote.credits} credits</strong>. If the job fails, the credits come back automatically.
          </p>
          <button
            type="button"
            data-testid="composer-confirm"
            onClick={() => {
              setQuoteOpen(false);
              onGenerate?.({ prompt, mentions, settings, quote });
            }}
          >
            Confirm · {quote.credits} credits
          </button>
          <button type="button" onClick={() => setQuoteOpen(false)}>
            Keep editing
          </button>
        </div>
      )}
    </div>
  );
};

export default Composer;
