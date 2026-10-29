// ============================================================================
// QuantCooks Studio — Image Studio data & flow logic (spec §2, G-2)
//
// Pure helpers behind the Image Studio screen. What is REAL today rides on
// P0-3: the caller's uploaded assets (listAssets) and the three-step upload
// (requestUploadUrl → direct PUT → completeUpload, wrapped by
// useAssetUpload). What is NOT real today is generation itself:
// quantcooks.generate_dish_image is registered in the CP-1 manifest but its
// provider tier is fail-closed, so the screen prices with pricing.ts and
// renders NOT_CONFIGURED — this module never invents a generated image, a
// progress number, or a result.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from './jobs';

/** The registered QuantAI tool twin of this screen (CP-1 manifest, G-2). */
export const IMAGE_GENERATE_TOOL = 'quantcooks.generate_dish_image';
/** Detail-view twin (spec §2.2): fields come from get_asset. */
export const IMAGE_GET_ASSET_TOOL = 'quantcooks.get_asset';
/** Persona casting twin (spec §2.1 chip; personas themselves land in G-5). */
export const IMAGE_PERSONA_TOOL = 'quantcooks.create_chef_persona';
/** Brand-kit match twin (spec §2.1 libraries). */
export const IMAGE_BRAND_KIT_TOOL = 'quantcooks.get_brand_kit';

// ---------------------------------------------------------------------------
// Style presets (spec §2.1 — original QuantCooks names, written for food).
// These are the stylePresetId values generate_dish_image takes; when the
// real list_presets feed lands (CP-1), this local catalogue is the fallback
// shape, exactly like presets.ts for Explore.
// ---------------------------------------------------------------------------

export interface ImageStylePreset {
  id: string;
  name: string;
  /** One line of plain language: the light/surface/plating this style aims at. */
  description: string;
}

export const IMAGE_STYLE_PRESETS: ImageStylePreset[] = [
  { id: 'editorial-menu', name: 'Editorial Menu', description: 'Clean plating on a plain surface, soft window light, room for menu text.' },
  { id: 'rustic-home-kitchen', name: 'Rustic Home Kitchen', description: 'Warm wood, linen and cast iron — the shot feels cooked at home, because it was.' },
  { id: 'bright-cafe-light', name: 'Bright Café Light', description: 'High, bright daylight and pale colours; coffee cups and brunch plates glow.' },
  { id: 'festival-table-colour', name: 'Festival Table Colour', description: 'Saturated colour and a full table — sweets, garnish and brassware front and centre.' },
];

export function stylePresetById(id: string | null | undefined): ImageStylePreset | null {
  if (!id) return null;
  return IMAGE_STYLE_PRESETS.find((p) => p.id === id) ?? null;
}

/** Ratios the Image Studio offers (spec §2.1 settings row). */
export const IMAGE_RATIOS = ['1:1', '4:5', '16:9', '9:16'] as const;

// ---------------------------------------------------------------------------
// Reference assets — the Reference chip and the asset picker.
// ---------------------------------------------------------------------------

export interface ReferenceImage {
  assetId: string;
  filename: string;
  /** Fresh signed URL for preview; null while the asset is still PENDING. */
  url: string | null;
}

/**
 * Assets the user may pick as a reference: their own image assets whose
 * bytes actually landed (READY). PENDING rows have no object behind them
 * yet and non-images cannot restyle a still, so both are excluded — the
 * picker never offers something the tool could not read.
 */
export function pickableImageAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'image' && a.uploadStatus === 'READY');
}

export function referenceFromAsset(asset: ServerAsset): ReferenceImage {
  return { assetId: asset.id, filename: asset.filename, url: asset.url };
}

// ---------------------------------------------------------------------------
// Upload validation + orchestration (the P0-3 flow, via an injected uploader
// so the screen's wiring is testable without a network).
// ---------------------------------------------------------------------------

export interface ReferenceFileLike {
  name: string;
  type: string;
  size: number;
}

/** Mirrors the backend default ASSET_MAX_UPLOAD_BYTES cap (P0-3, 512 MiB). */
export const IMAGE_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;

/**
 * Pre-flight check before any byte moves: a reference must be an image and
 * inside the storage cap. Returns the honest error to show, or null when
 * the file may go up. (The backend re-checks both and its word is final.)
 */
export function validateReferenceFile(file: ReferenceFileLike): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" is not an image — the Reference slot takes a dish photo (image files only).`;
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return `"${file.name}" is larger than the 512 MB upload limit.`;
  }
  if (file.size <= 0) {
    return `"${file.name}" looks empty — pick a photo with something in it.`;
  }
  return null;
}

export type ReferenceUploadOutcome =
  | { status: 'done'; asset: ServerAsset }
  | { status: 'error'; message: string };

/**
 * Run one reference upload through the injected uploader (the page passes
 * useAssetUpload's mutateAsync). Failures pass the real error message
 * through untouched — a STORAGE_NOT_CONFIGURED 503 must reach the user as
 * itself, never as a generic "something went wrong".
 */
export async function runReferenceUpload(
  file: ReferenceFileLike,
  upload: (file: ReferenceFileLike) => Promise<ServerAsset>,
): Promise<ReferenceUploadOutcome> {
  const invalid = validateReferenceFile(file);
  if (invalid) return { status: 'error', message: invalid };
  try {
    const asset = await upload(file);
    return { status: 'done', asset };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'The upload failed.' };
  }
}

/** Upload phases the input panel renders; no percentage is ever invented. */
export type UploadPhase = 'idle' | 'working' | 'error';

export function uploadPhaseLabel(phase: UploadPhase): string | null {
  if (phase === 'working') return 'Uploading your photo — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That upload did not land.';
  return null;
}

// ---------------------------------------------------------------------------
// Results rail — only real job outputs become result cards.
// ---------------------------------------------------------------------------

export interface ImageResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

/**
 * Result cards come exclusively from COMPLETED jobs' image outputs (the
 * §0.2 job shape, via jobs.ts). A completed job without an image output
 * contributes nothing here, and no other source can put a card on the rail.
 */
export function imageResultsFromJobs(jobs: StudioJob[]): ImageResultCard[] {
  const cards: ImageResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== 'image') continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Generated still',
      });
    }
  }
  return cards;
}
