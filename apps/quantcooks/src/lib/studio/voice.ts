// ============================================================================
// QuantCooks Studio — Voice Studio + Chef Persona logic (spec §7, G-6/G-5)
//
// Pure helpers behind the Voice Studio screen (Voice Studio home #53, the
// voice dial + engine dropdown #54, the Chef Persona builder #55, the
// persona detail #56 and the voice library + clone-a-voice flow #57).
//
// What is REAL today:
//  - The script itself: lines with full client-side CRUD, per-line quotes
//    and a summed total, composed on pricing.ts exactly as every other
//    studio composes (film.ts / promo.ts pattern) — quote-before-spend.
//  - The caller's own assets (P0-3): READY audio clips as clone samples
//    and voice references, READY video for the dub slot, READY images as
//    persona references. PENDING bytes never bind to anything.
//  - The consent records: a persona/voice draft carries its attestation
//    (own likeness / own voice + timestamp) as data, and the gates below
//    read it structurally — no consent, no training, no generation.
// What is NOT real today, and never faked here:
//  - Every executor behind this screen is Tier B in the CP-1 manifest:
//    add_voiceover / dub_video / make_presenter_speak refuse with
//    PROVIDER_NOT_CONFIGURED, create_chef_persona with
//    TRAINING_NOT_CONFIGURED and clone_voice with
//    VOICE_TRAINING_NOT_CONFIGURED. The attempts below land on those
//    honest outcomes; their types cannot carry an audio URL, a voice id
//    or a trained status, so no surface built on them can invent one.
//  - There is NO stock-voice catalogue: quantcooks.list_models refuses
//    (PROVIDER_NOT_CONFIGURED) rather than list voices that do not
//    exist, so the dial offers unassigned starter slots and the caller's
//    own drafts — never a grid of invented voices with invented samples.
//  - Personas and cloned voices have NO server home yet: no Prisma model
//    or tool executor persists them (the training tools are Tier B), so
//    they live in the device draft mirror below, labelled "draft on this
//    device" (the film.ts / board.ts precedent). A persona's status type
//    has exactly one member — 'draft' — so a client-side toggle, or even
//    a forged mirror, can never mark one trained/ready.
//
// Credits reconciliation (CP-1 §6.4, recorded): the studio spec's §7.1
// fractional display ("Generate · 0.3 credits") is superseded — the
// ecosystem ledger debits whole credits only, so every price here is a
// whole credit, minimum 1. CP-1 §6.3 leaves the G-5/G-6 rate values to
// this unit; the flat starting rates below are local catalogue data in
// exactly the pricing.ts sense, for Krish/CEO to re-price as data.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from './jobs';
import { computeQuote, type ComposerSettings, type CreditQuote } from './pricing';

/** The registered QuantAI tool twins of these screens (CP-1 manifest §3). */
export const VOICEOVER_TOOL = 'quantcooks.add_voiceover';
/**
 * The dub twin is `quantcooks.dub_video` (CP-1 tool 44) — verified in the
 * manifest; earlier drafts of this unit's brief said "dub_clip", a name
 * the registry never held.
 */
export const DUB_TOOL = 'quantcooks.dub_video';
export const SPEAK_TOOL = 'quantcooks.make_presenter_speak';
export const PERSONA_TOOL = 'quantcooks.create_chef_persona';
export const CLONE_VOICE_TOOL = 'quantcooks.clone_voice';
/** Assets are listed through the assets tools (spec §7.4). */
export const VOICE_ASSETS_TOOL = 'quantcooks.list_assets';

/** The audio model row every voiceover quote composes on (pricing.ts). */
export const VOICE_MODEL_ID = 'qc-voice-standard';

/**
 * Local starting flat rates for the two training tools (CP-1 §6.3 leaves
 * these values to G-5/G-6; whole credits per §6.4). Shown on the Train /
 * Clone buttons before any attempt; never charged while the training
 * engines refuse.
 */
export const PERSONA_TRAINING_CREDITS = 25;
export const VOICE_CLONE_TRAINING_CREDITS = 15;

// ---------------------------------------------------------------------------
// Languages (spec §7.1: the selector is flag + name; Hindi/Hinglish are
// first-class — dubbing a recipe video for a new audience is the food
// differentiator). Ids are the language params of the §7 tools.
// ---------------------------------------------------------------------------

export interface VoiceLanguage {
  id: string;
  label: string;
  /** One line: where this language choice earns its place in a kitchen. */
  note: string;
}

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { id: 'hinglish', label: 'Hinglish', note: 'Hindi-English mix, the way most home cooks actually talk.' },
  { id: 'hindi', label: 'Hindi', note: 'Full Hindi narration and dubbing.' },
  { id: 'english', label: 'English', note: 'English narration and dubbing.' },
  { id: 'bengali', label: 'Bengali', note: 'For the mishti-and-machh audience.' },
  { id: 'marathi', label: 'Marathi', note: 'Marathi narration and dubbing.' },
  { id: 'tamil', label: 'Tamil', note: 'Tamil narration and dubbing.' },
  { id: 'telugu', label: 'Telugu', note: 'Telugu narration and dubbing.' },
  { id: 'kannada', label: 'Kannada', note: 'Kannada narration and dubbing.' },
  { id: 'malayalam', label: 'Malayalam', note: 'Malayalam narration and dubbing.' },
  { id: 'punjabi', label: 'Punjabi', note: 'Punjabi narration and dubbing.' },
];

export function voiceLanguageById(id: string | null | undefined): VoiceLanguage | null {
  if (!id) return null;
  return VOICE_LANGUAGES.find((l) => l.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Engines (spec §7.2) — the engine dropdown, a control SEPARATE from the
// voice dial: the dial chooses WHO speaks, the dropdown chooses WHAT
// renders the speech, and neither pick ever writes the other's state.
// An engine's delivery tier prices through the same Draft/Standard/High
// multiplier pricing.ts uses for quality — no second price table.
// ---------------------------------------------------------------------------

export interface VoiceEngine {
  id: string;
  name: string;
  /** One line of plain language: this engine's character (spec §7.2). */
  description: string;
  /** Delivery tier fed into computeQuote as the settings resolution. */
  tier: 'Draft' | 'Standard' | 'High';
}

export const VOICE_ENGINES: VoiceEngine[] = [
  { id: 'expressive', name: 'Expressive Cast', description: 'Emotion-forward delivery — hooks, ads and big reactions.', tier: 'Standard' },
  { id: 'studio-cast', name: 'Studio Cast', description: 'Polished studio-quality narration for flagship pieces.', tier: 'High' },
  { id: 'many-tongues', name: 'Many Tongues', description: 'The multilingual engine — one consistent voice across languages.', tier: 'Standard' },
  { id: 'long-table', name: 'Long Table', description: 'Steady, unhurried pacing for full recipe walkthroughs.', tier: 'Standard' },
];

export function voiceEngineById(id: string | null | undefined): VoiceEngine | null {
  if (!id) return null;
  return VOICE_ENGINES.find((e) => e.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// The dial (spec §7.2): modes Voiceover · Change Voice · Translate, and
// the voice it lands on. Voices are library objects; with no catalogue
// configured, the dial's positions are the two unassigned starter slots
// below plus the caller's own clone drafts (shown in the library, greyed
// until trained). A slot is an INTENT to cast, never an invented voice:
// it has no sample, no preview and no voiceId.
// ---------------------------------------------------------------------------

export type DialMode = 'voiceover' | 'change-voice' | 'translate';

export const DIAL_MODES: Array<{ id: DialMode; label: string }> = [
  { id: 'voiceover', label: 'Voiceover' },
  { id: 'change-voice', label: 'Change Voice' },
  { id: 'translate', label: 'Translate' },
];

/** Which registered tool a dial mode's Generate attempts. */
export function dialModeTool(mode: DialMode): string {
  return mode === 'translate' ? DUB_TOOL : VOICEOVER_TOOL;
}

export interface VoiceSlot {
  id: string;
  label: string;
  /** What this slot is for, stated until a real voice fills it. */
  note: string;
}

export const VOICE_SLOTS: VoiceSlot[] = [
  { id: 'narrator', label: 'Narrator', note: 'The neutral storytelling slot — filled by a stock or cloned voice when the voice provider connects.' },
  { id: 'chef-host', label: 'Chef Host', note: 'The warm presenter slot for recipe walkthroughs — unassigned until a voice fills it.' },
];

export function voiceSlotById(id: string | null | undefined): VoiceSlot | null {
  if (!id) return null;
  return VOICE_SLOTS.find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// The studio session — dial mode, voice pick, engine pick, language.
// Four independent fields with four independent setters: picking an
// engine cannot move the dial (the Audio pattern's core distinction,
// spec §7.2), and the tests pin each setter to its own field.
// ---------------------------------------------------------------------------

export interface VoiceSession {
  dialMode: DialMode;
  /** A VOICE_SLOTS id — the dial's current landing. */
  voiceSlotId: string;
  /** A VOICE_ENGINES id — the dropdown's current pick. */
  engineId: string;
  /** A VOICE_LANGUAGES id. */
  languageId: string;
}

export const DEFAULT_VOICE_SESSION: VoiceSession = {
  dialMode: 'voiceover',
  voiceSlotId: 'chef-host',
  engineId: 'expressive',
  languageId: 'hinglish',
};

export function withDialMode(session: VoiceSession, mode: DialMode): VoiceSession {
  return { ...session, dialMode: mode };
}

export function withVoicePick(session: VoiceSession, voiceSlotId: string): VoiceSession {
  if (!voiceSlotById(voiceSlotId)) return session;
  return { ...session, voiceSlotId };
}

export function withEnginePick(session: VoiceSession, engineId: string): VoiceSession {
  if (!voiceEngineById(engineId)) return session;
  return { ...session, engineId };
}

export function withLanguage(session: VoiceSession, languageId: string): VoiceSession {
  if (!voiceLanguageById(languageId)) return session;
  return { ...session, languageId };
}

// ---------------------------------------------------------------------------
// Script lines (spec §7.1's script field, structured): the script is a
// list of lines, each with its own text, its own voice (a slot override,
// or the session voice) and its own quote. CRUD mirrors film.ts's shots.
// ---------------------------------------------------------------------------

export interface ScriptLine {
  id: string;
  text: string;
  /** Per-line voice override (a VOICE_SLOTS id); null = the session voice. */
  voiceSlotId: string | null;
}

export function emptyLine(id: string): ScriptLine {
  return { id, text: '', voiceSlotId: null };
}

/** Next deterministic line id (line-1, line-2, …) — stable across saves. */
export function nextLineId(lines: ScriptLine[]): string {
  let max = 0;
  for (const line of lines) {
    const match = /^line-(\d+)$/.exec(line.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `line-${max + 1}`;
}

export function addLine(lines: ScriptLine[], line: ScriptLine): ScriptLine[] {
  return [...lines, line];
}

export function updateLine(lines: ScriptLine[], id: string, patch: Partial<ScriptLine>): ScriptLine[] {
  return lines.map((line) => (line.id === id ? { ...line, ...patch } : line));
}

export function removeLine(lines: ScriptLine[], id: string): ScriptLine[] {
  return lines.filter((line) => line.id !== id);
}

/** Move one step earlier (-1) or later (+1); edges are no-ops. */
export function moveLine(lines: ScriptLine[], id: string, direction: -1 | 1): ScriptLine[] {
  const index = lines.findIndex((l) => l.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= lines.length) return lines;
  const next = [...lines];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/** The voice a line will use: its own override, else the session's pick. */
export function lineVoiceSlotId(line: ScriptLine, session: VoiceSession): string {
  return line.voiceSlotId ?? session.voiceSlotId;
}

// ---------------------------------------------------------------------------
// Script length rules (spec §7.2's Error state): a line longer than the
// limit is an error stated WITH the limit, plus a Split action — never a
// silent truncation. The estimate below is a planning figure for spoken
// length (display only); pricing is FLAT per line (CP-1 tool 43), so the
// estimate never moves a price.
// ---------------------------------------------------------------------------

/** Per-line character limit for one narration pass. */
export const LINE_TEXT_LIMIT = 500;

/** Roughly 14 characters per second of spoken narration. */
export const SPEECH_CHARS_PER_SECOND = 14;

export function estimateSpeechSeconds(text: string): number {
  const chars = text.trim().length;
  if (chars === 0) return 0;
  return Math.max(1, Math.ceil(chars / SPEECH_CHARS_PER_SECOND));
}

/** The honest too-long message for a line, or null when it fits. */
export function lineTextError(text: string): string | null {
  if (text.length <= LINE_TEXT_LIMIT) return null;
  return (
    `This line is ${text.length} characters — one narration pass takes at most ${LINE_TEXT_LIMIT}. ` +
    'Split it into two lines; nothing was shortened for you.'
  );
}

/**
 * Split an over-long line's text into two parts at the last sentence end
 * (or last space) inside the limit. Concatenating the parts with a space
 * returns the original words — splitting never drops text.
 */
export function splitLineText(text: string, limit: number = LINE_TEXT_LIMIT): [string, string] {
  if (text.length <= limit) return [text, ''];
  const window = text.slice(0, limit);
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  const cut = sentenceEnd >= Math.floor(limit / 3) ? sentenceEnd + 1 : window.lastIndexOf(' ');
  const at = cut > 0 ? cut : limit;
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}

// ---------------------------------------------------------------------------
// Quotes — per line and summed. A line prices through pricing.ts's own
// composition: the audio model row, the engine's delivery tier as the
// settings resolution, the line's estimated spoken length as duration
// (the row is FLAT, so length informs the display, not the price — the
// registered CP-1 rule for add_voiceover). Blank lines are not narrated
// and never priced. The script total is the plain sum (quote-before-
// spend: the Generate button shows it before anything runs).
// ---------------------------------------------------------------------------

export function lineQuoteSettings(
  base: ComposerSettings,
  engine: VoiceEngine,
  line: ScriptLine,
): ComposerSettings {
  return {
    ...base,
    modelId: VOICE_MODEL_ID,
    resolution: engine.tier,
    durationSeconds: estimateSpeechSeconds(line.text),
    batch: 1,
    stackedExtras: 0,
  };
}

/** One line's quote, or null for a blank line (nothing to narrate). */
export function lineQuote(
  base: ComposerSettings,
  engine: VoiceEngine,
  line: ScriptLine,
): CreditQuote | null {
  if (line.text.trim() === '') return null;
  return computeQuote('audio', lineQuoteSettings(base, engine, line));
}

export interface ScriptQuote {
  credits: number;
  lines: string[];
  /** Estimated total spoken length of the priced lines, in seconds. */
  spokenSeconds: number;
}

export function scriptQuote(
  base: ComposerSettings,
  engine: VoiceEngine,
  lines: ScriptLine[],
): ScriptQuote {
  const out: string[] = [];
  let credits = 0;
  let spokenSeconds = 0;
  lines.forEach((line, index) => {
    const quote = lineQuote(base, engine, line);
    if (!quote) return;
    credits += quote.credits;
    spokenSeconds += estimateSpeechSeconds(line.text);
    out.push(
      `Line ${index + 1} · ≈${estimateSpeechSeconds(line.text)}s of speech · ${quote.credits} credit${quote.credits === 1 ? '' : 's'}`,
    );
  });
  return { credits, lines: out, spokenSeconds };
}

// ---------------------------------------------------------------------------
// Assets — the pickers read the caller's own library (P0-3). Only READY
// assets bind: PENDING rows have no object behind them yet, and a picker
// never offers something the tool could not read.
// ---------------------------------------------------------------------------

/** READY audio: clone samples, voice references, finished narrations. */
export function pickableAudioAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'audio' && a.uploadStatus === 'READY');
}

/** READY video: the Reference Video slot for dubbing. */
export function pickableDubAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'video' && a.uploadStatus === 'READY');
}

/** READY images: Chef Persona reference photos. */
export function pickablePersonaReferenceAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'image' && a.uploadStatus === 'READY');
}

// ---------------------------------------------------------------------------
// The voiceover attempt. add_voiceover is Tier B: its executor refuses
// with PROVIDER_NOT_CONFIGURED until a voice provider lands (CP-1 §8).
// The outcome preserves the script VERBATIM — the words are the user's
// work and the surface keeps them in view — and its type carries no
// output, no audio URL and no job, so nothing downstream can fake one.
// ---------------------------------------------------------------------------

export type VoiceoverOutcome =
  | { status: 'invalid'; message: string }
  | {
      status: 'not-configured';
      tool: string;
      code: 'PROVIDER_NOT_CONFIGURED';
      /** The script lines, word for word, in order. */
      lines: string[];
      chargedCredits: 0;
      message: string;
    };

export function attemptVoiceover(session: VoiceSession, lines: ScriptLine[]): VoiceoverOutcome {
  const spoken = lines.filter((l) => l.text.trim() !== '');
  if (spoken.length === 0) {
    return {
      status: 'invalid',
      message: 'Write at least one script line first — there is nothing to narrate yet.',
    };
  }
  const engine = voiceEngineById(session.engineId);
  return {
    status: 'not-configured',
    tool: VOICEOVER_TOOL,
    code: 'PROVIDER_NOT_CONFIGURED',
    lines: spoken.map((l) => l.text),
    chargedCredits: 0,
    message:
      `Your script is kept below, word for word. Narration runs through ${VOICEOVER_TOOL}` +
      `${engine ? ` on the ${engine.name} engine` : ''}, whose voice provider is not configured yet ` +
      '(PROVIDER_NOT_CONFIGURED). Nothing was charged. When the provider connects, this same ' +
      'script, voice and engine will price and run exactly as quoted.',
  };
}

// ---------------------------------------------------------------------------
// Dubbing (spec §7.1's Reference Video slot + Translate dial mode).
// dub_video is priced PER_SECOND (CP-1 tool 44) from the PROBED source
// duration, and its rate row is unset until a provider cost basis exists
// (§6.3) — so there is no honest total today: the quote refuses rather
// than dress an estimate as a price (the §8 rule for unpriced tools).
// ---------------------------------------------------------------------------

export const DUB_QUOTE_NOTE =
  `Dubbing is priced per second of the source clip once a provider probes it (${DUB_TOOL}); ` +
  'the per-second rate is not set yet, so no total is shown rather than an invented one.';

export type DubOutcome =
  | { status: 'invalid'; message: string }
  | {
      status: 'not-configured';
      tool: string;
      code: 'PROVIDER_NOT_CONFIGURED';
      assetId: string;
      targetLanguageId: string;
      chargedCredits: 0;
      message: string;
    };

export function attemptDub(input: {
  asset: ServerAsset | null;
  session: VoiceSession;
}): DubOutcome {
  const { asset, session } = input;
  if (!asset) {
    return {
      status: 'invalid',
      message: 'Pick a reference video first — dubbing re-voices an existing clip, it does not start from text.',
    };
  }
  if (asset.type !== 'video' || asset.uploadStatus !== 'READY') {
    return {
      status: 'invalid',
      message: 'That clip is not a ready video — pick one whose upload has finished.',
    };
  }
  const language = voiceLanguageById(session.languageId);
  return {
    status: 'not-configured',
    tool: DUB_TOOL,
    code: 'PROVIDER_NOT_CONFIGURED',
    assetId: asset.id,
    targetLanguageId: session.languageId,
    chargedCredits: 0,
    message:
      `Dubbing “${asset.filename}” into ${language ? language.label : session.languageId} runs through ` +
      `${DUB_TOOL}, whose voice provider is not configured yet (PROVIDER_NOT_CONFIGURED). ` +
      'Nothing was charged.',
  };
}

// ---------------------------------------------------------------------------
// Chef Persona (spec §7.3, G-5) — the identity system. Builder grammar is
// the picker stack: presenter type → guided appearance pickers (Face /
// Body / Style groups, never free text for identity) → reference photo
// set → consent → Train. The persona record below is a DRAFT by type:
// its status union has one member, so no code path in this app can mark
// a persona trained or ready — that state exists only on a future
// server record written by the training tool itself.
// ---------------------------------------------------------------------------

export const PRESENTER_TYPES: string[] = [
  'Home Chef',
  'Restaurant Chef',
  'Street-Food Vendor',
  'Grandparent Host',
  'Creator Host',
];

export interface PersonaPickerGroup {
  id: string;
  label: string;
  options: string[];
}

/** The Face / Body / Style picker stack (spec §7.3's Advanced tabs). */
export const PERSONA_PICKER_GROUPS: PersonaPickerGroup[] = [
  { id: 'face', label: 'Face', options: ['Warm & Expressive', 'Calm & Steady', 'Bright & Smiling', 'Serious & Precise'] },
  { id: 'body', label: 'Body', options: ['Apron & Whites', 'Everyday Kitchen Clothes', 'Festive Wear', 'Street Stall Kit'] },
  { id: 'style', label: 'Style', options: ['Home Kitchen', 'Restaurant Pass', 'Street Stall', 'Studio Counter'] },
];

export function defaultPersonaPicks(): Record<string, string> {
  return Object.fromEntries(PERSONA_PICKER_GROUPS.map((g) => [g.id, g.options[0]!]));
}

/** The own-likeness attestation (CP-1 tool 41's consent schema payload). */
export interface PersonaConsent {
  ownLikeness: true;
  /** ISO timestamp of the explicit confirmation step. */
  confirmedAt: string;
}

export interface ChefPersona {
  id: string;
  name: string;
  presenterType: string;
  /** Guided picker choices, by group id. */
  picks: Record<string, string>;
  /** READY image asset ids — references, never copies or URLs. */
  referenceAssetIds: string[];
  consent: PersonaConsent | null;
  /** The first-generation policy acknowledgement (spec §7.3). */
  useAcknowledged: boolean;
  /** One member by design — see the section header. */
  status: 'draft';
  /** What the last Train attempt honestly reported. */
  trainingState: 'not-started' | 'consent-required' | 'not-configured';
  createdAt: string;
}

export function nextPersonaId(personas: ChefPersona[]): string {
  let max = 0;
  for (const persona of personas) {
    const match = /^persona-(\d+)$/.exec(persona.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `persona-${max + 1}`;
}

export function createPersonaDraft(input: {
  id: string;
  name: string;
  presenterType: string;
  picks: Record<string, string>;
  referenceAssetIds: string[];
  consent: PersonaConsent | null;
  createdAt: string;
}): ChefPersona {
  return {
    id: input.id,
    name: input.name.trim(),
    presenterType: input.presenterType,
    picks: { ...input.picks },
    referenceAssetIds: [...input.referenceAssetIds],
    consent: input.consent,
    useAcknowledged: false,
    status: 'draft',
    trainingState: 'not-started',
    createdAt: input.createdAt,
  };
}

export function recordPersonaConsent(
  personas: ChefPersona[],
  id: string,
  confirmedAt: string,
): ChefPersona[] {
  return personas.map((p) =>
    p.id === id ? { ...p, consent: { ownLikeness: true as const, confirmedAt } } : p,
  );
}

export function acknowledgePersonaUse(personas: ChefPersona[], id: string): ChefPersona[] {
  return personas.map((p) => (p.id === id ? { ...p, useAcknowledged: true } : p));
}

export function removePersona(personas: ChefPersona[], id: string): ChefPersona[] {
  return personas.filter((p) => p.id !== id);
}

/**
 * The Train attempt (create_chef_persona, kind TRAINING). CP-1 §8 pins
 * the order: consent validation runs FIRST — a consent-less attempt is
 * refused with CONSENT_REQUIRED even before configuration is checked —
 * and only then does the unconfigured training engine refuse with
 * TRAINING_NOT_CONFIGURED. The outcome carries no personaId and no
 * trained status; the persona stays a draft either way.
 */
export type PersonaTrainingOutcome =
  | {
      status: 'consent-required';
      tool: string;
      code: 'CONSENT_REQUIRED';
      chargedCredits: 0;
      message: string;
    }
  | {
      status: 'not-configured';
      tool: string;
      code: 'TRAINING_NOT_CONFIGURED';
      chargedCredits: 0;
      message: string;
    };

export function attemptPersonaTraining(persona: ChefPersona): PersonaTrainingOutcome {
  if (!persona.consent || persona.consent.ownLikeness !== true) {
    return {
      status: 'consent-required',
      tool: PERSONA_TOOL,
      code: 'CONSENT_REQUIRED',
      chargedCredits: 0,
      message:
        'Training is possible only on your own likeness, with an explicit confirmation recorded ' +
        `first (${PERSONA_TOOL} refuses without it: CONSENT_REQUIRED). Record the confirmation ` +
        'and the Train button will take the next step. Nothing was charged.',
    };
  }
  return {
    status: 'not-configured',
    tool: PERSONA_TOOL,
    code: 'TRAINING_NOT_CONFIGURED',
    chargedCredits: 0,
    message:
      `Consent is on record for “${persona.name}”. Training itself runs through ${PERSONA_TOOL}, ` +
      'whose training engine is not configured yet (TRAINING_NOT_CONFIGURED), so the persona ' +
      'stays a draft on this device and nothing was charged. The moment the engine connects, ' +
      'this same persona — references and consent intact — can train at the quoted one-off rate.',
  };
}

/** Fold a Train attempt's honest result back into the draft record. */
export function applyTrainingOutcome(
  personas: ChefPersona[],
  id: string,
  outcome: PersonaTrainingOutcome,
): ChefPersona[] {
  return personas.map((p) =>
    p.id === id
      ? { ...p, trainingState: outcome.status === 'consent-required' ? 'consent-required' : 'not-configured' }
      : p,
  );
}

// ---------------------------------------------------------------------------
// The persona generation gate (spec §7.3 + the Unit 5 gate pattern).
// Casting a persona (Speak / Animate / any generation) is armed only
// when consent is recorded AND training has completed AND a generation
// provider is configured. The three blocks are returned as separate
// reasons and never collapsed. Training completion and provider
// configuration are EXTERNAL facts passed in — no field on the client
// persona record can assert them, which is what keeps the gate honest
// on a device-mirrored draft. Today both are false, so the gate can
// never arm; the machine itself is fully testable with them true.
// ---------------------------------------------------------------------------

export interface PersonaGateFacts {
  /** From a future server persona record; client code cannot set it. */
  trainingCompleted: boolean;
  providerConfigured: boolean;
}

export interface PersonaGate {
  armed: boolean;
  reasons: string[];
}

export function personaGenerationGate(persona: ChefPersona, facts: PersonaGateFacts): PersonaGate {
  const reasons: string[] = [];
  if (!persona.consent) {
    reasons.push(
      'No consent is recorded for this persona — generation with a likeness needs the own-likeness ' +
        'confirmation first, and it is missing.',
    );
  }
  if (!facts.trainingCompleted) {
    reasons.push(
      `This persona has not been trained — training runs through ${PERSONA_TOOL}, whose engine is ` +
        'not configured yet (TRAINING_NOT_CONFIGURED), so there is no trained identity to cast.',
    );
  }
  if (!facts.providerConfigured) {
    reasons.push(
      'The generation provider is not configured yet (PROVIDER_NOT_CONFIGURED) — no surface can ' +
        'generate with any persona today. Nothing will be charged.',
    );
  }
  return { armed: reasons.length === 0, reasons };
}

/**
 * The Speak attempt (make_presenter_speak). Layered honesty, in order:
 * the gate above blocks with its separate reasons; a gate-clear persona
 * still meets the spec's first-generation policy acknowledgement; only
 * past both does the attempt reach the tool — which refuses with
 * PROVIDER_NOT_CONFIGURED today. The outcome never carries an output.
 */
export type PersonaSpeakOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'blocked'; reasons: string[]; chargedCredits: 0 }
  | {
      status: 'acknowledgement-required';
      tool: string;
      chargedCredits: 0;
      message: string;
    }
  | {
      status: 'not-configured';
      tool: string;
      code: 'PROVIDER_NOT_CONFIGURED';
      chargedCredits: 0;
      message: string;
    };

export function attemptPersonaSpeak(input: {
  persona: ChefPersona;
  scriptText: string;
  facts: PersonaGateFacts;
  /** The acknowledgement given in this attempt (checkbox in the panel). */
  acknowledgeNow: boolean;
}): PersonaSpeakOutcome {
  const { persona, facts } = input;
  if (input.scriptText.trim() === '') {
    return { status: 'invalid', message: 'Write the line this persona should say first.' };
  }
  const gate = personaGenerationGate(persona, facts);
  if (!gate.armed) {
    return { status: 'blocked', reasons: gate.reasons, chargedCredits: 0 };
  }
  if (!persona.useAcknowledged && !input.acknowledgeNow) {
    return {
      status: 'acknowledgement-required',
      tool: SPEAK_TOOL,
      chargedCredits: 0,
      message:
        'First generation with a persona asks for one policy acknowledgement: the output uses ' +
        'your own trained likeness, and identity can drift on complex multi-shot work — re-rolls ' +
        'are priced on their button. Acknowledge it once and this step will not ask again.',
    };
  }
  return {
    status: 'not-configured',
    tool: SPEAK_TOOL,
    code: 'PROVIDER_NOT_CONFIGURED',
    chargedCredits: 0,
    message:
      `Speaking runs through ${SPEAK_TOOL}, whose provider is not configured yet ` +
      '(PROVIDER_NOT_CONFIGURED). Nothing was charged.',
  };
}

// ---------------------------------------------------------------------------
// Voice library + clone-a-voice (spec §7.4, #57). Stock voices would be
// list_models data; that tool refuses until a provider catalogue exists,
// so the stock grid renders its honest empty state in the component and
// this module models only what is real: the caller's clone drafts and
// their own READY audio. Cloning follows the persona consent family
// (CP-1 §4.2): creation is a separate tool from use, consent first.
// ---------------------------------------------------------------------------

/** The own-voice attestation (CP-1 tool 53's consent schema payload). */
export interface VoiceConsent {
  ownVoice: true;
  confirmedAt: string;
}

export interface VoiceCloneDraft {
  id: string;
  name: string;
  /** READY audio asset ids — the caller's own samples, never copies. */
  sampleAssetIds: string[];
  languageId: string;
  consent: VoiceConsent | null;
  /** One member by design — a draft cannot call itself a voice. */
  status: 'draft';
  cloneState: 'not-started' | 'consent-required' | 'not-configured';
  createdAt: string;
}

export function nextVoiceCloneId(clones: VoiceCloneDraft[]): string {
  let max = 0;
  for (const clone of clones) {
    const match = /^voice-(\d+)$/.exec(clone.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `voice-${max + 1}`;
}

export function createVoiceCloneDraft(input: {
  id: string;
  name: string;
  sampleAssetIds: string[];
  languageId: string;
  consent: VoiceConsent | null;
  createdAt: string;
}): VoiceCloneDraft {
  return {
    id: input.id,
    name: input.name.trim(),
    sampleAssetIds: [...input.sampleAssetIds],
    languageId: input.languageId,
    consent: input.consent,
    status: 'draft',
    cloneState: 'not-started',
    createdAt: input.createdAt,
  };
}

export function recordVoiceConsent(
  clones: VoiceCloneDraft[],
  id: string,
  confirmedAt: string,
): VoiceCloneDraft[] {
  return clones.map((c) =>
    c.id === id ? { ...c, consent: { ownVoice: true as const, confirmedAt } } : c,
  );
}

export function removeVoiceClone(clones: VoiceCloneDraft[], id: string): VoiceCloneDraft[] {
  return clones.filter((c) => c.id !== id);
}

/**
 * The Clone attempt (clone_voice, kind TRAINING). Same pinned order as
 * persona training: CONSENT_REQUIRED before configuration is checked;
 * then VOICE_TRAINING_NOT_CONFIGURED. The outcome carries no voiceId —
 * no voice exists until the tool's job completes on a server.
 */
export type VoiceCloneOutcome =
  | {
      status: 'invalid';
      message: string;
    }
  | {
      status: 'consent-required';
      tool: string;
      code: 'CONSENT_REQUIRED';
      chargedCredits: 0;
      message: string;
    }
  | {
      status: 'not-configured';
      tool: string;
      code: 'VOICE_TRAINING_NOT_CONFIGURED';
      chargedCredits: 0;
      message: string;
    };

export function attemptVoiceClone(draft: VoiceCloneDraft): VoiceCloneOutcome {
  if (draft.sampleAssetIds.length === 0) {
    return {
      status: 'invalid',
      message: 'Pick at least one of your own ready audio clips as the sample first — a voice is cloned from your recordings, not from a description.',
    };
  }
  if (!draft.consent || draft.consent.ownVoice !== true) {
    return {
      status: 'consent-required',
      tool: CLONE_VOICE_TOOL,
      code: 'CONSENT_REQUIRED',
      chargedCredits: 0,
      message:
        'Cloning is possible only on your own voice, with an explicit confirmation recorded first ' +
        `(${CLONE_VOICE_TOOL} refuses without it: CONSENT_REQUIRED). Nothing was charged.`,
    };
  }
  return {
    status: 'not-configured',
    tool: CLONE_VOICE_TOOL,
    code: 'VOICE_TRAINING_NOT_CONFIGURED',
    chargedCredits: 0,
    message:
      `Consent is on record for “${draft.name}”. Voice training runs through ${CLONE_VOICE_TOOL}, ` +
      'whose training engine is not configured yet (VOICE_TRAINING_NOT_CONFIGURED), so this stays ' +
      'a draft on this device and nothing was charged.',
  };
}

/** Fold a Clone attempt's honest result back into the draft record. */
export function applyCloneOutcome(
  clones: VoiceCloneDraft[],
  id: string,
  outcome: VoiceCloneOutcome,
): VoiceCloneDraft[] {
  if (outcome.status === 'invalid') return clones;
  return clones.map((c) =>
    c.id === id
      ? { ...c, cloneState: outcome.status === 'consent-required' ? 'consent-required' : 'not-configured' }
      : c,
  );
}

// ---------------------------------------------------------------------------
// Results — only real job outputs become cards. A finished voiceover
// would land as an audio asset on a COMPLETED job; no audio-generation
// jobs exist yet, so in practice this rail is honestly empty until a
// provider lands.
// ---------------------------------------------------------------------------

export interface VoiceResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

export function voiceResultsFromJobs(jobs: StudioJob[]): VoiceResultCard[] {
  const cards: VoiceResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== 'audio') continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Finished narration',
      });
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// The voice draft mirror. The session, script, dub slot pick, personas
// and clone drafts have no server home yet (see the header note), so
// they mirror to localStorage on this device, exactly the film.ts /
// board.ts pattern. Identity inside the mirror is always an id (asset /
// slot / engine / language), never a URL. Parsing is defensive field by
// field — and persona/clone status is FORCED to 'draft' on parse: even
// a hand-edited mirror cannot resurrect a trained state that no server
// ever wrote.
// ---------------------------------------------------------------------------

export interface VoiceDraft {
  session: VoiceSession;
  lines: ScriptLine[];
  /** The Reference Video slot's pick (a READY video asset id). */
  referenceVideoAssetId: string | null;
  personas: ChefPersona[];
  voiceClones: VoiceCloneDraft[];
}

export const EMPTY_VOICE_DRAFT: VoiceDraft = {
  session: DEFAULT_VOICE_SESSION,
  lines: [],
  referenceVideoAssetId: null,
  personas: [],
  voiceClones: [],
};

export const VOICE_DRAFT_KEY = 'quantcooks.voice.draft.v1';

export function serializeVoiceDraft(draft: VoiceDraft): string {
  return JSON.stringify(draft);
}

function parseSession(raw: unknown): VoiceSession {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_VOICE_SESSION;
  const s = raw as Record<string, unknown>;
  return {
    dialMode:
      s.dialMode === 'change-voice' || s.dialMode === 'translate' || s.dialMode === 'voiceover'
        ? s.dialMode
        : DEFAULT_VOICE_SESSION.dialMode,
    voiceSlotId:
      typeof s.voiceSlotId === 'string' && voiceSlotById(s.voiceSlotId)
        ? s.voiceSlotId
        : DEFAULT_VOICE_SESSION.voiceSlotId,
    engineId:
      typeof s.engineId === 'string' && voiceEngineById(s.engineId)
        ? s.engineId
        : DEFAULT_VOICE_SESSION.engineId,
    languageId:
      typeof s.languageId === 'string' && voiceLanguageById(s.languageId)
        ? s.languageId
        : DEFAULT_VOICE_SESSION.languageId,
  };
}

function parseLines(raw: unknown): ScriptLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: ScriptLine[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const l = item as Record<string, unknown>;
    if (typeof l.id !== 'string' || l.id === '') continue;
    lines.push({
      id: l.id,
      text: typeof l.text === 'string' ? l.text : '',
      voiceSlotId:
        typeof l.voiceSlotId === 'string' && voiceSlotById(l.voiceSlotId) ? l.voiceSlotId : null,
    });
  }
  return lines;
}

function parseConsent(raw: unknown): PersonaConsent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.ownLikeness !== true || typeof c.confirmedAt !== 'string' || c.confirmedAt === '') return null;
  return { ownLikeness: true, confirmedAt: c.confirmedAt };
}

function parseVoiceConsent(raw: unknown): VoiceConsent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.ownVoice !== true || typeof c.confirmedAt !== 'string' || c.confirmedAt === '') return null;
  return { ownVoice: true, confirmedAt: c.confirmedAt };
}

function parsePicks(raw: unknown): Record<string, string> {
  const picks = defaultPersonaPicks();
  if (typeof raw !== 'object' || raw === null) return picks;
  const record = raw as Record<string, unknown>;
  for (const group of PERSONA_PICKER_GROUPS) {
    const value = record[group.id];
    if (typeof value === 'string' && group.options.includes(value)) picks[group.id] = value;
  }
  return picks;
}

function parseStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v !== '');
}

function parsePersonas(raw: unknown): ChefPersona[] {
  if (!Array.isArray(raw)) return [];
  const personas: ChefPersona[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || p.id === '' || typeof p.name !== 'string') continue;
    personas.push({
      id: p.id,
      name: p.name,
      presenterType:
        typeof p.presenterType === 'string' && PRESENTER_TYPES.includes(p.presenterType)
          ? p.presenterType
          : PRESENTER_TYPES[0]!,
      picks: parsePicks(p.picks),
      referenceAssetIds: parseStringIds(p.referenceAssetIds),
      consent: parseConsent(p.consent),
      useAcknowledged: p.useAcknowledged === true,
      // Forced, never read from the mirror (see the section header).
      status: 'draft',
      trainingState:
        p.trainingState === 'consent-required' || p.trainingState === 'not-configured'
          ? p.trainingState
          : 'not-started',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
    });
  }
  return personas;
}

function parseVoiceClones(raw: unknown): VoiceCloneDraft[] {
  if (!Array.isArray(raw)) return [];
  const clones: VoiceCloneDraft[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== 'string' || c.id === '' || typeof c.name !== 'string') continue;
    clones.push({
      id: c.id,
      name: c.name,
      sampleAssetIds: parseStringIds(c.sampleAssetIds),
      languageId:
        typeof c.languageId === 'string' && voiceLanguageById(c.languageId)
          ? c.languageId
          : DEFAULT_VOICE_SESSION.languageId,
      consent: parseVoiceConsent(c.consent),
      // Forced, exactly as personas: a mirror cannot mint a ready voice.
      status: 'draft',
      cloneState:
        c.cloneState === 'consent-required' || c.cloneState === 'not-configured'
          ? c.cloneState
          : 'not-started',
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
    });
  }
  return clones;
}

/**
 * Parse a mirrored voice draft. Anything malformed is dropped field by
 * field rather than trusted — a stale or edited mirror must never crash
 * the studio or resurrect a state no server wrote.
 */
export function parseVoiceDraft(raw: string | null | undefined): VoiceDraft {
  if (!raw) return EMPTY_VOICE_DRAFT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_VOICE_DRAFT;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_VOICE_DRAFT;
  const record = data as Record<string, unknown>;
  return {
    session: parseSession(record.session),
    lines: parseLines(record.lines),
    referenceVideoAssetId:
      typeof record.referenceVideoAssetId === 'string' && record.referenceVideoAssetId !== ''
        ? record.referenceVideoAssetId
        : null,
    personas: parsePersonas(record.personas),
    voiceClones: parseVoiceClones(record.voiceClones),
  };
}
