// ============================================================================
// QuantCooks Studio — Video Studio data & flow logic (spec §3, G-3/G-4)
//
// Pure helpers behind the Video Studio screen. What is REAL today rides on
// P0-3: the caller's own assets (listAssets) and the three-step upload
// (useAssetUpload). What is NOT real today is generation itself:
// quantcooks.generate_video_from_text and quantcooks.animate_image are
// registered in the CP-1 manifest but their provider tier is fail-closed,
// so the screen prices with pricing.ts (whole credits) and renders
// NOT_CONFIGURED — this module never invents a generated clip, a progress
// number, or a result.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from './jobs';
import { STUDIO_PRESETS } from './presets';
import {
  computeQuote,
  STACKED_EXTRA_CREDITS,
  type ComposerSettings,
  type CreditQuote,
} from './pricing';
import { IMAGE_UPLOAD_MAX_BYTES } from './image';

/** The registered QuantAI tool twins of this screen (CP-1 manifest §3). */
export const VIDEO_TEXT_TOOL = 'quantcooks.generate_video_from_text';
export const VIDEO_ANIMATE_TOOL = 'quantcooks.animate_image';
/** Camera moves are data + params on the two generation tools (spec §3.3). */
export const VIDEO_CAMERA_PRESETS_TOOL = 'quantcooks.list_camera_presets';
/** Effects ride on the video tools as effect_ids[] (spec §3.4, G-11). */
export const VIDEO_EFFECTS_TOOL = 'quantcooks.list_effects';
/** Persona casting twin (spec §3.1 chip; personas themselves land in G-5). */
export const VIDEO_PERSONA_TOOL = 'quantcooks.create_chef_persona';

export type VideoMode = 'text' | 'image';

/** The generation tool a run in this mode would call (its registered twin). */
export function videoToolForMode(mode: VideoMode): string {
  return mode === 'image' ? VIDEO_ANIMATE_TOOL : VIDEO_TEXT_TOOL;
}

// ---------------------------------------------------------------------------
// Camera moves — the G-4 library (spec §3.3). Names and one-line
// descriptions are the original QuantCooks food vocabulary already carried
// by presets.ts (one source, so Explore and this library never diverge);
// this module adds the library's families and "best for" tags. When the
// real list_camera_presets endpoint lands (CP-1), this local catalogue is
// the fallback shape, exactly like presets.ts for Explore.
// ---------------------------------------------------------------------------

export type CameraMoveFamily =
  | 'Push & Pull'
  | 'Zoom Drama'
  | 'Around the Dish'
  | 'Overhead & Crane'
  | 'Swoop & Fly'
  | 'Human & Handheld'
  | 'Time';

export interface CameraMove {
  id: string;
  name: string;
  description: string;
  family: CameraMoveFamily;
  /** Food contexts this move suits (spec §3.3 "best for" filter chips). */
  bestFor: string[];
  /** Credits for a typical solo run of this move (from the preset card). */
  typicalCredits: number;
}

const MOVE_SHAPE: Record<string, { family: CameraMoveFamily; bestFor: string[] }> = {
  'plate-push-in': { family: 'Push & Pull', bestFor: ['Plated dish'] },
  'spread-reveal-pullback': { family: 'Push & Pull', bestFor: ['Spread/Thali', 'Plated dish'] },
  'cheese-pull-crash-zoom': { family: 'Zoom Drama', bestFor: ['Plated dish', 'Dessert'] },
  'sizzle-vertigo': { family: 'Zoom Drama', bestFor: ['Kitchen action', 'Plated dish'] },
  'cake-orbit': { family: 'Around the Dish', bestFor: ['Dessert', 'Plated dish'] },
  'pack-spin': { family: 'Around the Dish', bestFor: ['Packaged product'] },
  'thali-top-down-drop': { family: 'Overhead & Crane', bestFor: ['Spread/Thali'] },
  'flat-lay-lock': { family: 'Overhead & Crane', bestFor: ['Spread/Thali', 'Plated dish'] },
  'buffet-fly-over': { family: 'Swoop & Fly', bestFor: ['Spread/Thali', 'Kitchen action'] },
  'counter-whip': { family: 'Swoop & Fly', bestFor: ['Kitchen action'] },
  'home-kitchen-handheld': { family: 'Human & Handheld', bestFor: ['Kitchen action', 'Plated dish'] },
  'rise-and-bake-timelapse': { family: 'Time', bestFor: ['Kitchen action', 'Dessert'] },
};

export const CAMERA_MOVE_FAMILIES: CameraMoveFamily[] = [
  'Push & Pull',
  'Zoom Drama',
  'Around the Dish',
  'Overhead & Crane',
  'Swoop & Fly',
  'Human & Handheld',
  'Time',
];

/** Canonical order: the spec §3.3 vocabulary list, not catalogue order. */
const MOVE_ORDER = [
  'plate-push-in',
  'cheese-pull-crash-zoom',
  'cake-orbit',
  'thali-top-down-drop',
  'pack-spin',
  'buffet-fly-over',
  'rise-and-bake-timelapse',
  'home-kitchen-handheld',
  'flat-lay-lock',
  'spread-reveal-pullback',
  'counter-whip',
  'sizzle-vertigo',
];

export const CAMERA_MOVES: CameraMove[] = MOVE_ORDER.flatMap((id) => {
  const preset = STUDIO_PRESETS.find((p) => p.id === id);
  const shape = MOVE_SHAPE[id];
  if (!preset || !shape) return [];
  return [
    {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      family: shape.family,
      bestFor: shape.bestFor,
      typicalCredits: preset.typicalCredits,
    },
  ];
});

export function cameraMoveById(id: string | null | undefined): CameraMove | null {
  if (!id) return null;
  return CAMERA_MOVES.find((m) => m.id === id) ?? null;
}

export function cameraMovesForFamily(family: CameraMoveFamily): CameraMove[] {
  return CAMERA_MOVES.filter((m) => m.family === family);
}

// ---------------------------------------------------------------------------
// Stacking — at most 3 moves, ordered; incompatible pairs block with a
// reason (spec §3.3). The stack is a list of move ids in run order.
// ---------------------------------------------------------------------------

export const MAX_CAMERA_STACK = 3;

export interface IncompatiblePair {
  a: string;
  b: string;
  /** One line, shown inline where the blocked tap happened. */
  reason: string;
}

export const INCOMPATIBLE_PAIRS: IncompatiblePair[] = [
  {
    a: 'flat-lay-lock',
    b: 'buffet-fly-over',
    reason: 'Flat-Lay Lock holds the frame perfectly still overhead; Buffet Fly-Over swoops along the spread — the frame cannot do both.',
  },
  {
    a: 'flat-lay-lock',
    b: 'sizzle-vertigo',
    reason: 'Sizzle Vertigo pushes in while the room stretches; Flat-Lay Lock never moves the frame at all.',
  },
  {
    a: 'flat-lay-lock',
    b: 'counter-whip',
    reason: 'Counter Whip is one fast pan; Flat-Lay Lock is a locked frame — they cancel each other out.',
  },
  {
    a: 'thali-top-down-drop',
    b: 'buffet-fly-over',
    reason: 'Both moves claim the overhead path — the settling top-down drop and the swooping pass would fight over the same airspace.',
  },
  {
    a: 'cake-orbit',
    b: 'pack-spin',
    reason: 'Cake Orbit circles the dish while Pack Spin turns the dish itself — two rotations at once just looks like a wobble.',
  },
  {
    a: 'plate-push-in',
    b: 'spread-reveal-pullback',
    reason: 'Plate Push-In travels toward the dish and Spread Reveal Pullback travels away from it — pick one direction.',
  },
  {
    a: 'cheese-pull-crash-zoom',
    b: 'rise-and-bake-timelapse',
    reason: 'A crash zoom lives in a single second; a timelapse compresses minutes. One shot cannot be both.',
  },
];

/** The blocking reason if these two moves cannot share a stack, else null. */
export function incompatibilityBetween(aId: string, bId: string): string | null {
  const pair = INCOMPATIBLE_PAIRS.find(
    (p) => (p.a === aId && p.b === bId) || (p.a === bId && p.b === aId),
  );
  return pair?.reason ?? null;
}

export type AddMoveResult =
  | { ok: true; stack: string[] }
  | {
      ok: false;
      stack: string[];
      kind: 'full' | 'duplicate' | 'incompatible' | 'unknown';
      message: string;
      conflictsWith?: string;
    };

/**
 * Try to add a move to the stack. A blocked add NEVER silently drops or
 * swaps anything: the stack comes back unchanged with the reason the UI
 * must show (spec §3.3 — blocked inline with a one-line reason).
 */
export function tryAddCameraMove(stack: string[], moveId: string): AddMoveResult {
  const move = cameraMoveById(moveId);
  if (!move) {
    return { ok: false, stack, kind: 'unknown', message: 'That camera move is not in the library.' };
  }
  if (stack.includes(moveId)) {
    return {
      ok: false,
      stack,
      kind: 'duplicate',
      message: `${move.name} is already in your stack — a move only needs to run once per clip.`,
    };
  }
  if (stack.length >= MAX_CAMERA_STACK) {
    return {
      ok: false,
      stack,
      kind: 'full',
      message: `Your stack is full — a clip takes at most ${MAX_CAMERA_STACK} moves. Remove one before adding ${move.name}.`,
    };
  }
  for (const stackedId of stack) {
    const reason = incompatibilityBetween(stackedId, moveId);
    if (reason) {
      return {
        ok: false,
        stack,
        kind: 'incompatible',
        message: reason,
        conflictsWith: cameraMoveById(stackedId)?.name,
      };
    }
  }
  return { ok: true, stack: [...stack, moveId] };
}

export function removeCameraMove(stack: string[], moveId: string): string[] {
  return stack.filter((id) => id !== moveId);
}

/** Move one step earlier (-1) or later (+1) in run order; edges are no-ops. */
export function moveCameraMove(stack: string[], moveId: string, direction: -1 | 1): string[] {
  const index = stack.indexOf(moveId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= stack.length) return stack;
  const next = [...stack];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/** The Camera chip's summary, e.g. "Plate Push-In + Cake Orbit · 2 moves". */
export function stackLabel(stack: string[]): string | null {
  if (stack.length === 0) return null;
  const names = stack.map((id) => cameraMoveById(id)?.name ?? id);
  return `${names.join(' + ')} · ${stack.length} move${stack.length === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Quote composition — the stack prices through pricing.ts's own stacked-
// extras term (STACKED_EXTRA_CREDITS per move), never a parallel table.
// ---------------------------------------------------------------------------

export function videoQuoteSettings(settings: ComposerSettings, stack: string[]): ComposerSettings {
  return { ...settings, stackedExtras: stack.length };
}

export function videoQuote(settings: ComposerSettings, stack: string[]): CreditQuote {
  return computeQuote('video', videoQuoteSettings(settings, stack));
}

export { STACKED_EXTRA_CREDITS };

// ---------------------------------------------------------------------------
// Source picking — real assets only, READY only (P0-3). A PENDING row has
// no bytes behind it yet, so the pickers never offer one.
// ---------------------------------------------------------------------------

export interface SourceAsset {
  assetId: string;
  filename: string;
  kind: 'video' | 'image';
  /** Fresh signed URL for preview; null only if the backend minted none. */
  url: string | null;
}

export function pickableVideoAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'video' && a.uploadStatus === 'READY');
}

export function pickableFrameAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'image' && a.uploadStatus === 'READY');
}

export function sourceFromAsset(asset: ServerAsset): SourceAsset {
  return {
    assetId: asset.id,
    filename: asset.filename,
    kind: asset.type === 'video' ? 'video' : 'image',
    url: asset.url,
  };
}

// ---------------------------------------------------------------------------
// Upload validation + orchestration (the P0-3 flow, via an injected
// uploader — the same seam Image Studio tests through). A source file may
// be a clip or a still; failures pass the real error message through
// untouched (a STORAGE_NOT_CONFIGURED 503 reaches the user as itself).
// ---------------------------------------------------------------------------

export interface SourceFileLike {
  name: string;
  type: string;
  size: number;
}

/** Same backend cap as every asset upload (P0-3, 512 MiB). */
export const VIDEO_UPLOAD_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;

export function validateSourceFile(file: SourceFileLike): string | null {
  if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
    return `"${file.name}" is not a clip or a photo — a source must be a video or image file.`;
  }
  if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
    return `"${file.name}" is larger than the 512 MB upload limit.`;
  }
  if (file.size <= 0) {
    return `"${file.name}" looks empty — pick a file with something in it.`;
  }
  return null;
}

export type SourceUploadOutcome =
  | { status: 'done'; asset: ServerAsset }
  | { status: 'error'; message: string };

export async function runSourceUpload(
  file: SourceFileLike,
  upload: (file: SourceFileLike) => Promise<ServerAsset>,
): Promise<SourceUploadOutcome> {
  const invalid = validateSourceFile(file);
  if (invalid) return { status: 'error', message: invalid };
  try {
    const asset = await upload(file);
    return { status: 'done', asset };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'The upload failed.' };
  }
}

/** Upload phases the source panel renders; no percentage is ever invented. */
export type SourceUploadPhase = 'idle' | 'working' | 'error';

export function sourceUploadPhaseLabel(phase: SourceUploadPhase): string | null {
  if (phase === 'working') return 'Uploading your file — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That upload did not land.';
  return null;
}

// ---------------------------------------------------------------------------
// Results rail — only real job outputs become result cards (spec §3.2's
// workspace is fed by jobs; generation jobs do not exist yet, so in
// practice this rail is honestly empty until a provider lands).
// ---------------------------------------------------------------------------

export interface VideoResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

export function videoResultsFromJobs(jobs: StudioJob[]): VideoResultCard[] {
  const cards: VideoResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== 'video') continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Generated clip',
      });
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Create-tab starters (spec §3.1 empty state — dish moments, original
// copy; the first card is the Hero Frame on-ramp: a photo before a prompt).
// ---------------------------------------------------------------------------

export interface VideoStarter {
  id: string;
  title: string;
  description: string;
  /** Mode the starter lands the user in. */
  mode: VideoMode;
  /** Example brief the starter writes into the composer. */
  prompt: string;
}

export const VIDEO_STARTERS: VideoStarter[] = [
  {
    id: 'animate-photo',
    title: 'Animate a dish photo',
    description: 'Start from a photo you already have and give it one camera move — the cheapest way to a hero clip.',
    mode: 'image',
    prompt: '',
  },
  {
    id: 'steam-moment',
    title: 'Steam off the bowl',
    description: 'Steam rising off a bowl of ramen at night, the city soft behind the glass.',
    mode: 'text',
    prompt: 'Steam rising off a bowl of ramen at night',
  },
  {
    id: 'sauce-pour',
    title: 'The sauce pour',
    description: 'A slow sauce pour over a sizzler, caught at the second it starts to bubble.',
    mode: 'text',
    prompt: 'Sauce pour over a sizzler, close on the bubbles',
  },
];
