// ============================================================================
// QuantCooks Studio — local pricing table (Phase 2, Unit 1)
//
// Quote-before-spend starts here: every studio surface prices its Generate
// button from THIS table and shows the number before anything runs. These
// are QuantCooks' own local catalogue rates (whole Quant Credits — the CP-1
// spec verified the live ledger only supports whole-credit debits today);
// when CP-2 wires the real ledger + PricingEngine rate table, this module is
// the one place that swaps its source. Nothing here talks to a backend.
// ============================================================================

export type StudioGenerationKind = 'image' | 'video' | 'audio' | 'ad';

export interface StudioModelRate {
  id: string;
  /** Plain-language name shown on the model chip. Original QuantCooks copy. */
  label: string;
  /** One-line capability note shown next to the model chip. */
  note: string;
  /** Base credits for one standard run of this kind, before multipliers. */
  baseCredits: number;
  /** Credit multiplier per second beyond the base duration (video/audio). */
  perSecondCredits: number;
  /** Duration already covered by baseCredits. */
  baseDurationSeconds: number;
}

export const STUDIO_MODEL_RATES: Record<StudioGenerationKind, StudioModelRate[]> = {
  image: [
    { id: 'qc-still-standard', label: 'QC Still', note: 'Everyday dish photography', baseCredits: 2, perSecondCredits: 0, baseDurationSeconds: 0 },
    { id: 'qc-still-detail', label: 'QC Still Detail', note: 'Finer texture for hero shots', baseCredits: 4, perSecondCredits: 0, baseDurationSeconds: 0 },
  ],
  video: [
    { id: 'qc-motion-standard', label: 'QC Motion', note: 'Short dish clips up to 720p', baseCredits: 8, perSecondCredits: 1, baseDurationSeconds: 5 },
    { id: 'qc-motion-cinema', label: 'QC Motion Cinema', note: 'Smoother moves, richer light', baseCredits: 14, perSecondCredits: 2, baseDurationSeconds: 5 },
  ],
  audio: [
    { id: 'qc-voice-standard', label: 'QC Voice', note: 'Recipe narration and voiceovers', baseCredits: 1, perSecondCredits: 0, baseDurationSeconds: 30 },
  ],
  ad: [
    { id: 'qc-ad-standard', label: 'QC Ad Cut', note: 'Short-form dish ads', baseCredits: 10, perSecondCredits: 1, baseDurationSeconds: 5 },
  ],
};

export interface ComposerSettings {
  modelId: string;
  /** e.g. '16:9' | '1:1' | '9:16' | '4:5' */
  ratio: string;
  /** e.g. '720p' | '1080p' | 'Draft' | 'Standard' | 'High' */
  resolution: string;
  /** Seconds; 0/undefined for stills. */
  durationSeconds: number;
  /** 1–4 generations per run. */
  batch: number;
  audioOn: boolean;
  /** Number of stacked camera moves / extra priced options (0 when none). */
  stackedExtras: number;
}

export const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  modelId: 'qc-motion-standard',
  ratio: '9:16',
  resolution: '720p',
  durationSeconds: 5,
  batch: 1,
  audioOn: true,
  stackedExtras: 0,
};

const RESOLUTION_MULTIPLIERS: Record<string, number> = {
  '720p': 1,
  '1080p': 1.5,
  '4k': 2.5,
  Draft: 0.5,
  Standard: 1,
  High: 1.5,
};

/** Credits added per stacked camera move / extra priced option. */
export const STACKED_EXTRA_CREDITS = 2;

export interface CreditQuote {
  /** Whole credits — the ledger cannot debit fractions today (CP-1 §6). */
  credits: number;
  modelId: string;
  modelLabel: string;
  /** Human-readable line items, shown in the quote state before spending. */
  lines: string[];
}

export function modelRateFor(kind: StudioGenerationKind, modelId: string): StudioModelRate {
  const rates = STUDIO_MODEL_RATES[kind];
  return rates.find((r) => r.id === modelId) ?? rates[0]!;
}

/**
 * Live quote for the Generate button. Pure: the same settings always price
 * the same, in the UI, in tests, and (per the tool-twin rule) in the quote a
 * QuantAI tool would return for identical parameters.
 */
export function computeQuote(kind: StudioGenerationKind, settings: ComposerSettings): CreditQuote {
  const rate = modelRateFor(kind, settings.modelId);
  const lines: string[] = [`${rate.label} base · ${rate.baseCredits} credits`];

  let perRun = rate.baseCredits;
  const extraSeconds = Math.max(0, settings.durationSeconds - rate.baseDurationSeconds);
  if (extraSeconds > 0 && rate.perSecondCredits > 0) {
    const durationCost = extraSeconds * rate.perSecondCredits;
    perRun += durationCost;
    lines.push(`+${extraSeconds}s beyond ${rate.baseDurationSeconds}s · ${durationCost} credits`);
  }

  const multiplier = RESOLUTION_MULTIPLIERS[settings.resolution] ?? 1;
  if (multiplier !== 1) {
    perRun = Math.round(perRun * multiplier);
    lines.push(`${settings.resolution} · ×${multiplier}`);
  }

  if (settings.stackedExtras > 0) {
    const extrasCost = settings.stackedExtras * STACKED_EXTRA_CREDITS;
    perRun += extrasCost;
    lines.push(`${settings.stackedExtras} stacked extra${settings.stackedExtras > 1 ? 's' : ''} · ${extrasCost} credits`);
  }

  const batch = Math.min(4, Math.max(1, settings.batch));
  const total = perRun * batch;
  if (batch > 1) lines.push(`Batch of ${batch} · ${total} credits total`);

  // Whole-credit floor: a run never prices below 1 credit.
  return { credits: Math.max(1, total), modelId: rate.id, modelLabel: rate.label, lines };
}

/** The label printed on the Generate button itself (spec §0.1 rule 4). */
export function generateButtonLabel(quote: CreditQuote | null, hasInput: boolean): string {
  if (!hasInput || !quote) return 'Generate · —';
  return `Generate · ${quote.credits} credit${quote.credits === 1 ? '' : 's'}`;
}
