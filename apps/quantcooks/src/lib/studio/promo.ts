// ============================================================================
// QuantCooks Studio — Promo Studio data & flow logic (spec §4, G-9)
//
// Pure helpers behind the Promo Studio screen. What is REAL today:
//  - The product slot fills from the caller's own assets (listAssets,
//    READY only, P0-3) and from real uploads through the P0-3 three-step
//    flow (the page injects useAssetUpload).
//  - Brand kits are REAL: the backend brand-kit CRUD predates Phase 0 and
//    the P0-2 inventory verified it end-to-end; the page reads kits via
//    the existing useBrandKit hook and this module shapes them.
// What is NOT real today, and never faked here:
//  - Ad generation. quantcooks.create_food_ad is registered in the CP-1
//    manifest but its provider tier is fail-closed (Tier B), so the screen
//    prices through pricing.ts and renders NOT_CONFIGURED.
//  - Link-to-Ad extraction rides the same tool's productUrl path — also
//    Tier B. A submitted link is validated for real, then lands on the
//    honest NOT_CONFIGURED state; no product is ever "extracted", and no
//    name, price or image is ever invented from a URL.
//  - Chef Personas exist as Voice Studio drafts (G-5, Unit 7): shared-
//    file batch #2 wired the presenter slot to that library (read-only,
//    via the voice draft mirror), and batch #3 persists the selection
//    itself in this draft (presenterId below). A persona is a draft —
//    never a trained, pickable-as-ready presenter — until its training
//    engine exists.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from './jobs';
import {
  computeQuote,
  type ComposerSettings,
  type CreditQuote,
} from './pricing';
import { IMAGE_UPLOAD_MAX_BYTES } from './image';

/** The registered QuantAI tool twin of this screen (CP-1 manifest §3 #45). */
export const PROMO_AD_TOOL = 'quantcooks.create_food_ad';
/** Variations twin (CP-1 #46) — the results rail's iteration path. */
export const PROMO_VARY_TOOL = 'quantcooks.vary_ad';
/** Talking-presenter clips twin (CP-1 #47), Promo's presenter-led runs. */
export const PROMO_UGC_TOOL = 'quantcooks.create_ugc_clip';
/** Presenter creation twin (CP-1 #41, G-5) — the presenter slot's source. */
export const PROMO_PERSONA_TOOL = 'quantcooks.create_chef_persona';
/** Brand-kit read twin (CP-1 #17) — the brief's kit comes from this data. */
export const PROMO_BRAND_KIT_TOOL = 'quantcooks.get_brand_kit';
/** Brand-kit apply twin (CP-1 #19). */
export const PROMO_BRAND_APPLY_TOOL = 'quantcooks.apply_brand_kit';
/** Product objects list via the assets tools (spec §4.4). */
export const PROMO_ASSETS_TOOL = 'quantcooks.list_assets';

// ---------------------------------------------------------------------------
// Ad formats (spec §4.3). The ids are exactly the adFormat enum values the
// registered create_food_ad tool takes (CP-1 #45) — the modal, the chip
// and the tool can never disagree about what a format is called.
// ---------------------------------------------------------------------------

export type PromoFormatCategory = 'Social UGC' | 'Commercial';

export interface PromoFormat {
  /** The create_food_ad adFormat enum value. */
  id: string;
  name: string;
  /** One line of plain language: what this format feels like. */
  description: string;
  category: PromoFormatCategory;
  /** Where the finished ad is headed. */
  platform: string;
  /** Output ratio the format writes into the composer (spec §4.2). */
  ratio: string;
  /** Output duration the format writes into the composer (spec §4.2). */
  durationSeconds: number;
  /**
   * Priced options tier (0–2). Composed into the quote through pricing.ts's
   * stacked-extras term — the same mechanism Video Studio's camera stack
   * uses — never a parallel price table.
   */
  priceTier: 0 | 1 | 2;
}

export const PROMO_FORMATS: PromoFormat[] = [
  {
    id: 'tasting_ugc',
    name: 'Tasting UGC',
    description: 'A real-feel first bite on camera — handheld, honest, straight to the table.',
    category: 'Social UGC',
    platform: 'Reels · Shorts · feeds',
    ratio: '9:16',
    durationSeconds: 15,
    priceTier: 0,
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    description: 'Step-by-step how-it-is-made, from raw ingredients to the finished plate.',
    category: 'Social UGC',
    platform: 'Reels · Shorts · feeds',
    ratio: '9:16',
    durationSeconds: 15,
    priceTier: 0,
  },
  {
    id: 'unboxing',
    name: 'Unboxing',
    description: 'The box opens, the meal kit or product comes out piece by piece.',
    category: 'Commercial',
    platform: 'Reels · product pages · feeds',
    ratio: '9:16',
    durationSeconds: 10,
    priceTier: 1,
  },
  {
    id: 'hyper_motion',
    name: 'Hyper Motion',
    description: 'Fast cuts and punchy moves — energy first, appetite immediately after.',
    category: 'Commercial',
    platform: 'Reels · Shorts · feeds',
    ratio: '9:16',
    durationSeconds: 8,
    priceTier: 1,
  },
  {
    id: 'big_screen_spot',
    name: 'Big-Screen Spot',
    description: 'A wide, polished spot cut for the biggest screen in the room.',
    category: 'Commercial',
    platform: 'Big screens · 16:9 placements',
    ratio: '16:9',
    durationSeconds: 15,
    priceTier: 2,
  },
];

export const PROMO_FORMAT_FILTERS: Array<'All' | PromoFormatCategory> = ['All', 'Social UGC', 'Commercial'];

export function promoFormatById(id: string | null | undefined): PromoFormat | null {
  if (!id) return null;
  return PROMO_FORMATS.find((f) => f.id === id) ?? null;
}

export function promoFormatsForFilter(filter: 'All' | PromoFormatCategory): PromoFormat[] {
  if (filter === 'All') return PROMO_FORMATS;
  return PROMO_FORMATS.filter((f) => f.category === filter);
}

// ---------------------------------------------------------------------------
// Hook styles + settings (spec §4.2 chip row). Plain brief choices: they
// ride on create_food_ad as its hookStyle / setting params and do not
// price on their own.
// ---------------------------------------------------------------------------

export const PROMO_HOOK_STYLES: string[] = ['First Bite', 'Giant Portion', 'ASMR Close-Up', 'Before / After'];

export const PROMO_SETTING_OPTIONS: string[] = ['Home Kitchen', 'Restaurant Counter', 'Street Stall', 'Studio Table'];

// ---------------------------------------------------------------------------
// Quote composition — the format writes ratio/duration into the composer
// settings and its priced tier rides pricing.ts's stacked-extras term, so
// the Promo quote IS computeQuote('ad', …) with those settings composed
// in (the video.ts pattern). No format → the composer's own defaults.
// ---------------------------------------------------------------------------

export function promoComposerSettings(format: PromoFormat | null): Partial<ComposerSettings> {
  if (!format) return {};
  return {
    ratio: format.ratio,
    durationSeconds: format.durationSeconds,
    stackedExtras: format.priceTier,
  };
}

export function promoQuoteSettings(settings: ComposerSettings, format: PromoFormat | null): ComposerSettings {
  return { ...settings, ...promoComposerSettings(format) };
}

export function promoQuote(settings: ComposerSettings, format: PromoFormat | null): CreditQuote {
  return computeQuote('ad', promoQuoteSettings(settings, format));
}

// ---------------------------------------------------------------------------
// Product slot — real assets only, READY only (P0-3). The slot is a dish
// or product photo: images whose bytes actually landed. A PENDING row has
// no object behind it yet, so the picker never offers one.
// ---------------------------------------------------------------------------

export interface PromoProduct {
  assetId: string;
  filename: string;
  /** Fresh signed URL for preview; null only if the backend minted none. */
  url: string | null;
}

export function pickableProductAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'image' && a.uploadStatus === 'READY');
}

export function productFromAsset(asset: ServerAsset): PromoProduct {
  return { assetId: asset.id, filename: asset.filename, url: asset.url };
}

// ---------------------------------------------------------------------------
// Product upload validation + orchestration (the P0-3 flow, via an
// injected uploader — the same seam Image/Video tests use). The product
// slot takes a photo, so uploads are image-only here; failures pass the
// real error message through untouched.
// ---------------------------------------------------------------------------

export interface ProductFileLike {
  name: string;
  type: string;
  size: number;
}

/** Same backend cap as every asset upload (P0-3, 512 MiB). */
export const PRODUCT_UPLOAD_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;

export function validateProductFile(file: ProductFileLike): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" is not an image — the Dish / Product slot takes a photo of the dish or product (image files only).`;
  }
  if (file.size > PRODUCT_UPLOAD_MAX_BYTES) {
    return `"${file.name}" is larger than the 512 MB upload limit.`;
  }
  if (file.size <= 0) {
    return `"${file.name}" looks empty — pick a photo with something in it.`;
  }
  return null;
}

export type ProductUploadOutcome =
  | { status: 'done'; asset: ServerAsset }
  | { status: 'error'; message: string };

export async function runProductUpload(
  file: ProductFileLike,
  upload: (file: ProductFileLike) => Promise<ServerAsset>,
): Promise<ProductUploadOutcome> {
  const invalid = validateProductFile(file);
  if (invalid) return { status: 'error', message: invalid };
  try {
    const asset = await upload(file);
    return { status: 'done', asset };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'The upload failed.' };
  }
}

/** Upload phases the slot renders; no percentage is ever invented. */
export type ProductUploadPhase = 'idle' | 'working' | 'error';

export function productUploadPhaseLabel(phase: ProductUploadPhase): string | null {
  if (phase === 'working') return 'Uploading your photo — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That upload did not land.';
  return null;
}

// ---------------------------------------------------------------------------
// Brand kits — the caller's real kits (useBrandKit → apiClient.listBrand
// Kits, verified in the P0-2 inventory). This module only shapes them:
// the prop type is the structural subset the screen reads, swatches are
// the kit's real colour values with blanks dropped.
// ---------------------------------------------------------------------------

export interface PromoBrandKit {
  id: string;
  name: string;
  isDefault: boolean;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts?: { heading: string; body: string; accent: string };
  logos?: Array<{ id: string; url: string; variant: string }>;
}

export interface BrandKitSwatch {
  role: string;
  hex: string;
}

const SWATCH_ROLES: Array<keyof PromoBrandKit['colors']> = ['primary', 'secondary', 'accent', 'background', 'text'];

export function brandKitSwatches(kit: PromoBrandKit): BrandKitSwatch[] {
  return SWATCH_ROLES.filter((role) => kit.colors[role].trim() !== '').map((role) => ({
    role,
    hex: kit.colors[role],
  }));
}

export function brandKitById(kits: PromoBrandKit[], id: string | null | undefined): PromoBrandKit | null {
  if (!id) return null;
  return kits.find((k) => k.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Link-to-Ad (spec §4.6). The URL validation is REAL: the link must parse
// and be http(s). Submission then lands on the registered tool's
// NOT_CONFIGURED state — the extraction tier is fail-closed today, so
// this function can never return a product, a name, a price or an image.
// ---------------------------------------------------------------------------

export type LinkUrlValidation = { ok: true; url: string; host: string } | { ok: false; message: string };

export function validateProductUrl(input: string): LinkUrlValidation {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Paste a menu or product link first — or pick a saved dish instead.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: `"${trimmed}" does not read as a link — check for a missing https:// or a stray space.` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'That link is not a web page — Link-to-Ad reads http and https pages only.' };
  }
  return { ok: true, url: parsed.toString(), host: parsed.host };
}

/** Style cards for the Link-to-Ad flow (spec §4.6, original names). */
export const LINK_AD_STYLES: string[] = ['Tasting UGC', 'One Bite Hook', 'Giant Portion', 'Unboxing Try-On', 'ASMR Unbox'];

export type LinkToAdOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'not-configured'; tool: string; url: string; host: string; message: string };

export function submitLinkToAd(input: string): LinkToAdOutcome {
  const validation = validateProductUrl(input);
  if (!validation.ok) return { status: 'invalid', message: validation.message };
  return {
    status: 'not-configured',
    tool: PROMO_AD_TOOL,
    url: validation.url,
    host: validation.host,
    message:
      `Link received — but reading a page and pulling a dish out of it runs through ${PROMO_AD_TOOL}, ` +
      'whose provider is not configured yet (NOT_CONFIGURED). Nothing was extracted, no product was ' +
      'invented from this link, and nothing will be charged.',
  };
}

// ---------------------------------------------------------------------------
// Results rail — only real job outputs become result cards (ads are
// clips, so completed video outputs; spec §4.7's rail is fed by jobs).
// ---------------------------------------------------------------------------

export interface PromoResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

export function promoResultsFromJobs(jobs: StudioJob[]): PromoResultCard[] {
  const cards: PromoResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== 'video') continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Generated ad',
      });
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Draft mirror — the slots are the composer's memory (spec §4.2): they
// survive view switches inside the screen because the state lives in the
// screen component, and the draft mirror keeps the same state across a
// reload — including the presenter selection (presenterId, batch #3),
// so a reload keeps the pick. Pure serialize/parse here; the component
// owns storage access. A mirror NEVER carries a signed URL as identity
// — the product is its assetId; the URL is only a preview hint and may
// be stale. The same rule applies to presenterId: it is an id only, and
// the screen re-resolves it against the Voice Studio library on load.
// ---------------------------------------------------------------------------

export interface PromoDraft {
  product: PromoProduct | null;
  formatId: string | null;
  hookStyle: string | null;
  setting: string | null;
  brandKitId: string | null;
  /**
   * The presenter selection: a Chef Persona id from the Voice Studio
   * library (batch #3). The persona record itself stays in Voice
   * Studio's own mirror — this draft carries only the id, and the
   * screen resolves it against the library on load; an id that no
   * longer resolves is no selection (batch #2's stale rule).
   */
  presenterId: string | null;
  prompt: string;
}

export const EMPTY_PROMO_DRAFT: PromoDraft = {
  product: null,
  formatId: null,
  hookStyle: null,
  setting: null,
  brandKitId: null,
  presenterId: null,
  prompt: '',
};

export const PROMO_DRAFT_KEY = 'quantcooks.promo.draft.v1';

export function serializePromoDraft(draft: PromoDraft): string {
  return JSON.stringify(draft);
}

/**
 * Parse a mirrored draft. Anything malformed, unknown or half-shaped is
 * dropped field-by-field rather than trusted — a stale mirror must never
 * crash the screen or resurrect a format/hook that no longer exists.
 */
export function parsePromoDraft(raw: string | null | undefined): PromoDraft {
  if (!raw) return EMPTY_PROMO_DRAFT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_PROMO_DRAFT;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_PROMO_DRAFT;
  const record = data as Record<string, unknown>;

  const rawProduct = record.product;
  let product: PromoProduct | null = null;
  if (typeof rawProduct === 'object' && rawProduct !== null) {
    const p = rawProduct as Record<string, unknown>;
    if (typeof p.assetId === 'string' && p.assetId !== '' && typeof p.filename === 'string') {
      product = {
        assetId: p.assetId,
        filename: p.filename,
        url: typeof p.url === 'string' ? p.url : null,
      };
    }
  }

  const formatId =
    typeof record.formatId === 'string' && promoFormatById(record.formatId) ? record.formatId : null;
  const hookStyle =
    typeof record.hookStyle === 'string' && PROMO_HOOK_STYLES.includes(record.hookStyle) ? record.hookStyle : null;
  const setting =
    typeof record.setting === 'string' && PROMO_SETTING_OPTIONS.includes(record.setting) ? record.setting : null;
  const brandKitId = typeof record.brandKitId === 'string' && record.brandKitId !== '' ? record.brandKitId : null;
  const presenterId =
    typeof record.presenterId === 'string' && record.presenterId !== '' ? record.presenterId : null;
  const prompt = typeof record.prompt === 'string' ? record.prompt : '';

  return { product, formatId, hookStyle, setting, brandKitId, presenterId, prompt };
}
