// ============================================================================
// QuantCooks Studio — Quick Tools data & flow logic (spec §8, G-13)
//
// The Apps pattern as a food-tool directory: single-purpose tools, each a
// small focused flow (pick input → options → costed run → result). This
// module is the catalogue and the rules; the screens in components/studio
// are projections of it.
//
// Tool twins are CP-1 registrations, never parallel names (spec §8 rule):
//  - Dish Photo Fix and Expand Photo are MODES of the one image tool,
//    quantcooks.generate_dish_image (restyle / outpaint — CP-1 tool 36
//    confirms "one tool, three modes").
//  - Hook Score is quantcooks.score_hook (CP-1 tool 52, kind ANALYSIS):
//    its output schema carries framing:'modelled_estimate', and its
//    executor refuses with ANALYSIS_NOT_CONFIGURED until the analysis
//    engine is wired. It must never return a plausible-looking score.
//  - Presenter Swap is quantcooks.transform_video (CP-1 tool 48,
//    mode object_swap, target presenter), carrying the G-5 consent rule.
//
// Every generation/analysis twin here is Tier B (registered, fail-closed),
// so every run attempt below lands on an honest NOT_CONFIGURED outcome
// whose TYPE carries no result, no output and no score — nothing
// downstream can render a fabrication from it. Quotes are real and are
// composed on pricing.ts (whole credits, minimum 1) wherever the CP-1
// rate rule is priced; where CP-1 leaves a rate unset (transform_video's
// per-second row) the quote refuses rather than inventing a total — the
// same rule Voice Studio's dub follows.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import { computeQuote, type CreditQuote } from './pricing';
import type { StudioJob } from './jobs';
import type { ChefPersona } from './voice';

/** The one image tool, in its restyle mode (CP-1 tool 36). */
export const DISH_FIX_TOOL = 'quantcooks.generate_dish_image';
/** The same one image tool, in its outpaint mode (CP-1 tool 36). */
export const EXPAND_PHOTO_TOOL = 'quantcooks.generate_dish_image';
/** The analysis tool (CP-1 tool 52, kind ANALYSIS, §4.1). */
export const HOOK_SCORE_TOOL = 'quantcooks.score_hook';
/** The transform tool, presenter object-swap (CP-1 tool 48). */
export const PRESENTER_SWAP_TOOL = 'quantcooks.transform_video';
/** Persona creation — the training step a swap reference must pass (CP-1 tool 41). */
export const PERSONA_TOOL = 'quantcooks.create_chef_persona';
/** The shared run/job surface every Previous runs list re-opens through (§0.5). */
export const TOOL_JOBS_TOOL = 'quantcooks.get_job_status';

// ---------------------------------------------------------------------------
// The catalogue (spec §8.1). Only tools whose flow is BUILT get a card —
// a card for an unbuilt flow would be a dead door. Availability is the
// CP-1 tier fact (Tier B = registered, provider not configured), carried
// as data so the directory renders it from the catalogue, not from a
// hard-coded UI flag (the AITools.tsx anti-pattern §8.3 retires).
// ---------------------------------------------------------------------------

export type ToolCategoryId =
  | 'pro-finish'
  | 'enhance-style'
  | 'face-presenter'
  | 'video-fixes'
  | 'ads-products'
  | 'fun-trends';

export interface ToolCategory {
  id: ToolCategoryId;
  label: string;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: 'pro-finish', label: 'Pro Finish' },
  { id: 'enhance-style', label: 'Enhance & Style' },
  { id: 'face-presenter', label: 'Face & Presenter' },
  { id: 'video-fixes', label: 'Video Fixes' },
  { id: 'ads-products', label: 'Ads & Products' },
  { id: 'fun-trends', label: 'Fun & Trends' },
];

export function toolCategoryById(id: ToolCategoryId | null | undefined): ToolCategory | null {
  if (!id) return null;
  return TOOL_CATEGORIES.find((c) => c.id === id) ?? null;
}

export interface QuickTool {
  /** Route segment under /tools/[toolId]. */
  id: string;
  name: string;
  /** One line: the job this tool does, in plain food-creator language. */
  jobLine: string;
  category: ToolCategoryId;
  /** The registered QuantAI twin (CP-1). QuantAI can call everything here. */
  tool: string;
  /** The twin's mode, where the tool is one mode of a shared registration. */
  toolMode?: 'restyle' | 'outpaint' | 'object_swap';
  /** The media kind the single input zone accepts. */
  inputKind: 'image' | 'video';
  /** CP-1 tier fact: every twin in this batch is Tier B today. */
  availability: 'not-configured';
  availabilityNote: string;
}

const TIER_B_NOTE =
  'Registered with QuantAI, provider not configured yet — the flow, inputs and quote are real; the run itself lands on a not-configured answer and charges nothing.';

export const QUICK_TOOLS: QuickTool[] = [
  {
    id: 'dish-photo-fix',
    name: 'Dish Photo Fix',
    jobLine: 'One dish photo in — cleaned up, relit and menu-ready.',
    category: 'pro-finish',
    tool: DISH_FIX_TOOL,
    toolMode: 'restyle',
    inputKind: 'image',
    availability: 'not-configured',
    availabilityNote: TIER_B_NOTE,
  },
  {
    id: 'expand-photo',
    name: 'Expand Photo',
    jobLine: 'Stretch a dish photo sideways into a board or banner canvas.',
    category: 'enhance-style',
    tool: EXPAND_PHOTO_TOOL,
    toolMode: 'outpaint',
    inputKind: 'image',
    availability: 'not-configured',
    availabilityNote: TIER_B_NOTE,
  },
  {
    id: 'hook-score',
    name: 'Hook Score',
    jobLine: 'A short clip in — a modelled estimate of how hard its opening hook pulls.',
    category: 'fun-trends',
    tool: HOOK_SCORE_TOOL,
    inputKind: 'video',
    availability: 'not-configured',
    availabilityNote: TIER_B_NOTE,
  },
  {
    id: 'presenter-swap',
    name: 'Presenter Swap',
    jobLine: 'Your clip, your trained presenter — the face of the dish changes, the dish does not.',
    category: 'face-presenter',
    tool: PRESENTER_SWAP_TOOL,
    toolMode: 'object_swap',
    inputKind: 'video',
    availability: 'not-configured',
    availabilityNote: TIER_B_NOTE,
  },
];

export function toolById(id: string | null | undefined): QuickTool | null {
  if (!id) return null;
  return QUICK_TOOLS.find((t) => t.id === id) ?? null;
}

/** Directory filtering: category chip + free-text search over name/job. */
export function filterTools(category: ToolCategoryId | 'all', query: string): QuickTool[] {
  const q = query.trim().toLowerCase();
  return QUICK_TOOLS.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (q === '') return true;
    return t.name.toLowerCase().includes(q) || t.jobLine.toLowerCase().includes(q);
  });
}

// ---------------------------------------------------------------------------
// Quotes. Dish Fix and Expand compose on pricing.ts like every studio
// surface (kind 'image'). Hook Score is FLAT in CP-1 (§6.3 leaves the
// row's value to G-13 — this constant IS that row, set here as local
// catalogue data exactly as Voice Studio set the flat training rows).
// Presenter Swap is PER_SECOND in CP-1 with its rate row unset (set
// with G-10) and a source duration nothing on the client has probed —
// so its quote refuses, stating the rule, instead of inventing a total.
// ---------------------------------------------------------------------------

const IMAGE_SETTINGS_BASE = {
  modelId: 'qc-still-standard',
  ratio: '1:1',
  durationSeconds: 0,
  batch: 1,
  audioOn: false,
  stackedExtras: 0,
} as const;

// --- Dish Photo Fix options: fix intents, as data (spec §8.3 item 1) ---

export interface FixIntent {
  id: string;
  label: string;
  description: string;
  /** The pricier pass: choosing it lifts the quote's quality tier. */
  highTier?: boolean;
}

export const FIX_INTENTS: FixIntent[] = [
  { id: 'clean-up', label: 'Clean up', description: 'Crumbs, smears and stray garnish tidied off the plate and board.' },
  { id: 'colour-pop', label: 'Colour pop', description: 'Sauces, herbs and char marks brought back to their real saturation.' },
  { id: 'sharpen-detail', label: 'Sharpen detail', description: 'Steam, crumb and crust texture recovered for close menu crops.' },
  {
    id: 'relight',
    label: 'Relight',
    description: 'Flat kitchen light replaced with soft window light from the left.',
    highTier: true,
  },
];

export function fixIntentById(id: string | null | undefined): FixIntent | null {
  if (!id) return null;
  return FIX_INTENTS.find((i) => i.id === id) ?? null;
}

/**
 * Dish Fix quote = the image tool's quote at Standard quality, lifted to
 * the High tier when the relight pass is among the chosen intents (the
 * relight is the generation-heavy step). Pure computeQuote composition.
 */
export function dishFixQuote(intentIds: string[]): CreditQuote {
  const high = intentIds.some((id) => fixIntentById(id)?.highTier === true);
  return computeQuote('image', {
    ...IMAGE_SETTINGS_BASE,
    resolution: high ? 'High' : 'Standard',
  });
}

// --- Expand Photo options: target canvases (spec §8.3 item 3) ---

export interface ExpandTarget {
  id: string;
  label: string;
  ratio: string;
  description: string;
  /** Wider canvases cost the High tier in the image quote composition. */
  tier: 'Standard' | 'High';
}

export const EXPAND_TARGETS: ExpandTarget[] = [
  { id: 'board-16-9', label: 'Menu board', ratio: '16:9', description: 'The wall board behind the counter — photo centred, room for prices at the sides.', tier: 'Standard' },
  { id: 'banner-21-9', label: 'Wide banner', ratio: '21:9', description: 'A storefront or profile banner — a long, low stretch of table.', tier: 'High' },
  { id: 'strip-3-1', label: 'Web strip', ratio: '3:1', description: 'The thin hero strip at the top of a menu page.', tier: 'High' },
  { id: 'counter-4-3', label: 'Counter card', ratio: '4:3', description: 'A modest widen for printed counter cards and table tents.', tier: 'Standard' },
];

export function expandTargetById(id: string | null | undefined): ExpandTarget | null {
  if (!id) return null;
  return EXPAND_TARGETS.find((t) => t.id === id) ?? null;
}

/** Expand quote = the image tool's quote at the target canvas's tier. */
export function expandQuote(targetId: string | null | undefined): CreditQuote {
  const target = expandTargetById(targetId) ?? EXPAND_TARGETS[0]!;
  return computeQuote('image', { ...IMAGE_SETTINGS_BASE, ratio: target.ratio, resolution: target.tier });
}

// --- Hook Score: the flat G-13 rate row + the CP-1 platform enum ---

/** CP-1 §6.3: tool 52 is FLAT; the row's value is set with G-13 — here. */
export const HOOK_SCORE_FLAT_CREDITS = 3;

export function hookScoreQuote(): CreditQuote {
  return {
    credits: HOOK_SCORE_FLAT_CREDITS,
    modelId: 'hook-score-analysis',
    modelLabel: 'Hook Score analysis',
    lines: [
      `Hook Score analysis · flat ${HOOK_SCORE_FLAT_CREDITS} credits`,
      'A modelled estimate — the framing travels with the result, not a promise of reach.',
    ],
  };
}

export const HOOK_PLATFORMS = [
  { id: 'generic', label: 'Any feed' },
  { id: 'reels', label: 'Reels' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'tiktok', label: 'TikTok' },
] as const;

export type HookPlatform = (typeof HOOK_PLATFORMS)[number]['id'];

/** CP-1 §4.1: clips over 15 s are refused before spend. Stated up front. */
export const HOOK_SCORE_MAX_SECONDS = 15;
export const HOOK_SCORE_LIMIT_NOTE =
  `Clips up to ${HOOK_SCORE_MAX_SECONDS} seconds. ${HOOK_SCORE_TOOL} checks the clip's real ` +
  'length before any spend and refuses a longer one (CLIP_TOO_LONG_FOR_ANALYSIS) at no charge — ' +
  'so trim first if your hook runs long.';

export const HOOK_FRAMING_COPY =
  'A Hook Score is a modelled estimate of how an opening tends to hold attention — ' +
  'learned from patterns, not a promise about your post. Treat it as a second opinion, ' +
  'never a guarantee.';

// --- Presenter Swap: the per-second quote refusal (CP-1 tool 48) ---

export const PRESENTER_SWAP_QUOTE_NOTE =
  `Presenter Swap is priced per second of the target clip (${PRESENTER_SWAP_TOOL}); the ` +
  'per-second rate is set when the transform provider lands, and the clip length is probed ' +
  'by that provider — so no total is shown rather than an invented one. Nothing is charged ' +
  'by an attempt today.';

/**
 * The starting/typical price line a directory card shows. Priced tools
 * show their real composed quote; the per-second swap shows its rule.
 */
export function toolCardPrice(tool: QuickTool): string {
  switch (tool.id) {
    case 'dish-photo-fix':
      return `${dishFixQuote([]).credits} credits`;
    case 'expand-photo':
      return `from ${expandQuote(EXPAND_TARGETS[0]!.id).credits} credits`;
    case 'hook-score':
      return `${HOOK_SCORE_FLAT_CREDITS} credits`;
    case 'presenter-swap':
      return 'per second · priced at run';
    default:
      return '—';
  }
}

// ---------------------------------------------------------------------------
// Input picking + upload (the P0-3 seam, Units 2–3 pattern). Pickers only
// ever offer the caller's READY assets of the tool's kind — a PENDING row
// has no object behind it and the wrong kind cannot feed the tool.
// ---------------------------------------------------------------------------

export function pickableToolAssets(assets: ServerAsset[], kind: 'image' | 'video'): ServerAsset[] {
  return assets.filter((a) => a.type === kind && a.uploadStatus === 'READY');
}

export interface ToolFileLike {
  name: string;
  type: string;
  size: number;
}

/** Mirrors the backend default ASSET_MAX_UPLOAD_BYTES cap (P0-3, 512 MiB). */
export const TOOL_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;

export function validateToolFile(file: ToolFileLike, kind: 'image' | 'video'): string | null {
  if (!file.type.startsWith(`${kind}/`)) {
    return kind === 'image'
      ? `"${file.name}" is not an image — this tool takes a photo (image files only).`
      : `"${file.name}" is not a video — this tool takes a clip (video files only).`;
  }
  if (file.size > TOOL_UPLOAD_MAX_BYTES) {
    return `"${file.name}" is larger than the 512 MB upload limit.`;
  }
  if (file.size <= 0) {
    return `"${file.name}" looks empty — pick a file with something in it.`;
  }
  return null;
}

export type ToolUploadOutcome =
  | { status: 'done'; asset: ServerAsset }
  | { status: 'error'; message: string };

/**
 * Run one upload through the injected uploader (the page passes
 * useAssetUpload's mutateAsync). Failures pass the real error message
 * through untouched — a STORAGE_NOT_CONFIGURED 503 reaches the user as
 * itself, never as a generic failure.
 */
export async function runToolUpload(
  file: ToolFileLike,
  kind: 'image' | 'video',
  upload: (file: ToolFileLike) => Promise<ServerAsset>,
): Promise<ToolUploadOutcome> {
  const invalid = validateToolFile(file, kind);
  if (invalid) return { status: 'error', message: invalid };
  try {
    const asset = await upload(file);
    return { status: 'done', asset };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'The upload failed.' };
  }
}

/** Upload phases the input zone renders; no percentage is ever invented. */
export type ToolUploadPhase = 'idle' | 'working' | 'error';

export function toolUploadPhaseLabel(phase: ToolUploadPhase): string | null {
  if (phase === 'working') return 'Uploading — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That upload did not land.';
  return null;
}

// ---------------------------------------------------------------------------
// Run attempts. Every twin in this batch is Tier B, so a valid attempt
// lands NOT_CONFIGURED — and the outcome TYPES are the honesty proof:
// no result, no output, no score, no URL can be read off them, so no
// surface can accidentally render a fabrication.
// ---------------------------------------------------------------------------

export type ImageToolOutcome =
  | { status: 'invalid'; message: string }
  | {
      status: 'not-configured';
      tool: string;
      mode: 'restyle' | 'outpaint';
      code: 'PROVIDER_NOT_CONFIGURED';
      assetId: string;
      chargedCredits: 0;
      message: string;
    };

export function attemptDishFix(input: {
  asset: ServerAsset | null;
  intentIds: string[];
}): ImageToolOutcome {
  const { asset, intentIds } = input;
  if (!asset) {
    return { status: 'invalid', message: 'Pick or upload a dish photo first — there is nothing to fix yet.' };
  }
  if (asset.type !== 'image' || asset.uploadStatus !== 'READY') {
    return { status: 'invalid', message: 'That photo is not ready — pick one whose upload has finished.' };
  }
  if (intentIds.length === 0) {
    return { status: 'invalid', message: 'Choose at least one fix — Clean up, Colour pop, Sharpen detail or Relight.' };
  }
  const names = intentIds
    .map((id) => fixIntentById(id)?.label)
    .filter((n): n is string => Boolean(n))
    .join(' · ');
  return {
    status: 'not-configured',
    tool: DISH_FIX_TOOL,
    mode: 'restyle',
    code: 'PROVIDER_NOT_CONFIGURED',
    assetId: asset.id,
    chargedCredits: 0,
    message:
      `“${asset.filename}” is ready to fix (${names}). The fix runs through ${DISH_FIX_TOOL} ` +
      'in its restyle mode, whose image provider is not configured yet (PROVIDER_NOT_CONFIGURED). ' +
      'Nothing was charged. When the provider connects, this same photo and these same fixes ' +
      'will price and run exactly as quoted.',
  };
}

export function attemptExpand(input: {
  asset: ServerAsset | null;
  targetId: string | null;
}): ImageToolOutcome {
  const { asset, targetId } = input;
  if (!asset) {
    return { status: 'invalid', message: 'Pick or upload a photo first — there is nothing to expand yet.' };
  }
  if (asset.type !== 'image' || asset.uploadStatus !== 'READY') {
    return { status: 'invalid', message: 'That photo is not ready — pick one whose upload has finished.' };
  }
  const target = expandTargetById(targetId);
  if (!target) {
    return { status: 'invalid', message: 'Choose the canvas to expand into — a menu board, a banner, a strip or a counter card.' };
  }
  return {
    status: 'not-configured',
    tool: EXPAND_PHOTO_TOOL,
    mode: 'outpaint',
    code: 'PROVIDER_NOT_CONFIGURED',
    assetId: asset.id,
    chargedCredits: 0,
    message:
      `“${asset.filename}” is ready to expand into the ${target.label.toLowerCase()} (${target.ratio}). ` +
      `The expansion runs through ${EXPAND_PHOTO_TOOL} in its outpaint mode, whose image provider ` +
      'is not configured yet (PROVIDER_NOT_CONFIGURED). Nothing was charged. When the provider ' +
      'connects, this same photo and canvas will price and run exactly as quoted.',
  };
}

// --- Hook Score: the report shape (CP-1 §4.1) + the attempt ---

/**
 * The ONLY shape a Hook Score result may take (CP-1 §4.1's result
 * object). The framing is part of the type: a report without
 * framing:'modelled_estimate' does not type-check, so no surface can
 * present an estimate as a measurement.
 */
export interface HookScoreReport {
  score: number;
  factors: {
    firstFramePull: number;
    hook: number;
    hold: number;
    motion: number;
    faces: number;
    text: number;
    sound: number;
  };
  framing: 'modelled_estimate';
  analysedDurationSec: number;
}

export const HOOK_SCORE_FACTOR_LABELS: Array<{
  id: keyof HookScoreReport['factors'];
  label: string;
}> = [
  { id: 'firstFramePull', label: 'First-frame pull' },
  { id: 'hook', label: 'Hook strength' },
  { id: 'hold', label: 'Hold rate' },
  { id: 'motion', label: 'Motion' },
  { id: 'faces', label: 'Faces' },
  { id: 'text', label: 'Text on screen' },
  { id: 'sound', label: 'Sound' },
];

export type HookScoreOutcome =
  | { status: 'invalid'; message: string }
  | {
      status: 'not-configured';
      tool: string;
      code: 'ANALYSIS_NOT_CONFIGURED';
      framing: 'modelled_estimate';
      assetId: string;
      platform: HookPlatform;
      /** The opener the user plans to post with, preserved word for word. */
      hookText: string;
      chargedCredits: 0;
      message: string;
    };

export function attemptHookScore(input: {
  asset: ServerAsset | null;
  platform: HookPlatform;
  hookText: string;
}): HookScoreOutcome {
  const { asset, platform, hookText } = input;
  if (!asset) {
    return { status: 'invalid', message: 'Pick or upload a clip first — there is nothing to score yet.' };
  }
  if (asset.type !== 'video' || asset.uploadStatus !== 'READY') {
    return { status: 'invalid', message: 'That clip is not a ready video — pick one whose upload has finished.' };
  }
  return {
    status: 'not-configured',
    tool: HOOK_SCORE_TOOL,
    code: 'ANALYSIS_NOT_CONFIGURED',
    framing: 'modelled_estimate',
    assetId: asset.id,
    platform,
    hookText,
    chargedCredits: 0,
    message:
      `“${asset.filename}” is ready to score. Scoring runs through ${HOOK_SCORE_TOOL} ` +
      '(a modelled estimate, always), whose analysis engine is not configured yet ' +
      '(ANALYSIS_NOT_CONFIGURED) — so no score is shown rather than an invented one. ' +
      'Nothing was charged. When the engine connects, this same clip will be scored at ' +
      'the flat rate quoted here.',
  };
}

// --- Presenter Swap: the dual gate (consent → training → provider) ---

/**
 * What the presenter slot holds. A persona comes from the Voice Studio
 * library (Unit 7's device mirror) and is a DRAFT by type — its consent
 * may or may not be recorded. A photo is a READY image asset plus the
 * §7.3 own-likeness attestation, recorded in the flow.
 */
export type SwapReference =
  | { kind: 'persona'; persona: ChefPersona }
  | { kind: 'photo'; asset: ServerAsset; consentRecorded: boolean };

export interface SwapGate {
  armed: boolean;
  /** Each block is its own reason — never collapsed into one sentence. */
  reasons: string[];
}

/**
 * The swap gate, in CP-1 §8's order (consent first, then the facts no
 * client record can assert). Training completion and provider
 * configuration are EXTERNAL facts passed in; today both are false, so
 * the gate can never arm — and the machine is fully testable with them
 * true, exactly as Unit 7's persona gate is.
 */
export function presenterSwapGate(input: {
  reference: SwapReference;
  trainingCompleted: boolean;
  providerConfigured: boolean;
}): SwapGate {
  const reasons: string[] = [];
  const { reference } = input;
  if (reference.kind === 'persona' && !reference.persona.consent) {
    reasons.push(
      `No consent is recorded for “${reference.persona.name}” — a swap uses a likeness, and the ` +
        'own-likeness confirmation comes first. Record it in Voice Studio, then come back.',
    );
  }
  if (reference.kind === 'photo' && !reference.consentRecorded) {
    reasons.push(
      'The photo needs your own-likeness confirmation first — a swap may only ever put your ' +
        'own face (or your own trained persona) on a clip, never someone else’s.',
    );
  }
  if (!input.trainingCompleted) {
    reasons.push(
      reference.kind === 'persona'
        ? `“${reference.persona.name}” is still a draft — it has not been trained, and training runs ` +
          `through ${PERSONA_TOOL}, whose engine is not configured yet (TRAINING_NOT_CONFIGURED), ` +
          'so there is no trained identity to swap in.'
        : 'A photo on its own is not a trained identity — it becomes one through ' +
          `${PERSONA_TOOL} in Voice Studio, whose training engine is not configured yet ` +
          '(TRAINING_NOT_CONFIGURED), so there is nothing trained to swap in yet.',
    );
  }
  if (!input.providerConfigured) {
    reasons.push(
      `The transform provider is not configured yet (PROVIDER_NOT_CONFIGURED) — ${PRESENTER_SWAP_TOOL} ` +
        'cannot run on any surface today. Nothing will be charged.',
    );
  }
  return { armed: reasons.length === 0, reasons };
}

export type SwapOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'blocked'; reasons: string[]; chargedCredits: 0 }
  | {
      status: 'not-configured';
      tool: string;
      code: 'PROVIDER_NOT_CONFIGURED';
      chargedCredits: 0;
      message: string;
    };

export function attemptPresenterSwap(input: {
  clip: ServerAsset | null;
  reference: SwapReference | null;
  trainingCompleted: boolean;
  providerConfigured: boolean;
}): SwapOutcome {
  const { clip, reference } = input;
  if (!clip) {
    return { status: 'invalid', message: 'Pick the target clip first — the clip whose presenter changes.' };
  }
  if (clip.type !== 'video' || clip.uploadStatus !== 'READY') {
    return { status: 'invalid', message: 'That target is not a ready video — pick one whose upload has finished.' };
  }
  if (!reference) {
    return { status: 'invalid', message: 'Choose who presents instead — one of your personas, or your own photo.' };
  }
  const gate = presenterSwapGate({
    reference,
    trainingCompleted: input.trainingCompleted,
    providerConfigured: input.providerConfigured,
  });
  if (!gate.armed) {
    return { status: 'blocked', reasons: gate.reasons, chargedCredits: 0 };
  }
  return {
    status: 'not-configured',
    tool: PRESENTER_SWAP_TOOL,
    code: 'PROVIDER_NOT_CONFIGURED',
    chargedCredits: 0,
    message:
      `The swap is ready in principle, but ${PRESENTER_SWAP_TOOL} has no executor behind it yet. ` +
      'Nothing was charged.',
  };
}

// ---------------------------------------------------------------------------
// Results + previous runs — real jobs only (the §0.2 shape via jobs.ts).
// A tool's result area reads COMPLETED jobs' outputs of its kind; the
// previous-runs list re-opens through get_job_status. No other source
// can put a card or a row on either surface.
// ---------------------------------------------------------------------------

export interface ToolResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

export function toolResultsFromJobs(jobs: StudioJob[], kind: 'image' | 'video'): ToolResultCard[] {
  const cards: ToolResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== kind) continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Tool result',
      });
    }
  }
  return cards;
}

/** Previous runs of one tool = the caller's jobs carrying its label. */
export function previousRunsFor(jobs: StudioJob[], toolName: string): StudioJob[] {
  return jobs.filter((j) => (j.label ?? '').startsWith(toolName));
}
