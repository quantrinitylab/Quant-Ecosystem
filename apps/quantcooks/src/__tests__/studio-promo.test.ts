// ============================================================================
// QuantCooks Studio (Phase 2 Unit 4) — Promo Studio: lib logic + rendering.
// Same approach as Units 1–3: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. Interaction-only
// state (clicks) is proven the Units 1–3 way: the pure lib functions carry
// the rules, and the component is rendered with the same initial props a
// click would have produced. The upload flow is tested at its seam —
// runProductUpload with a mocked uploader — so a real P0-3 error
// (STORAGE_NOT_CONFIGURED 503) is proven to reach the user untouched, and
// Link-to-Ad is proven to fabricate nothing from a URL.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, type ComposerSettings } from '../lib/studio/pricing';
import {
  EMPTY_PROMO_DRAFT,
  LINK_AD_STYLES,
  PROMO_FORMATS,
  brandKitById,
  brandKitSwatches,
  parsePromoDraft,
  pickableProductAssets,
  productFromAsset,
  productUploadPhaseLabel,
  promoComposerSettings,
  promoFormatById,
  promoFormatsForFilter,
  promoQuote,
  promoQuoteSettings,
  promoResultsFromJobs,
  runProductUpload,
  serializePromoDraft,
  submitLinkToAd,
  validateProductFile,
  validateProductUrl,
  type PromoBrandKit,
  type PromoDraft,
} from '../lib/studio/promo';
import { PromoStudio, type PromoStudioProps } from '../components/studio/PromoStudio';
import { PromoFormatModal, type PromoFormatModalProps } from '../components/studio/PromoFormatModal';
import {
  createPersonaDraft,
  defaultPersonaPicks,
  type ChefPersona,
} from '../lib/studio/voice';

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'thali-hero.jpg',
  type: 'image',
  size: 4096,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/thali-hero.jpg',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/thali-hero.jpg',
  ...over,
});

const kit = (over: Partial<PromoBrandKit>): PromoBrandKit => ({
  id: 'kit-1',
  name: 'Monsoon Thali House',
  isDefault: true,
  colors: { primary: '#C2410C', secondary: '#7C2D12', accent: '#F59E0B', background: '#FFF7ED', text: '#1C1917' },
  fonts: { heading: 'Fraunces', body: 'Inter', accent: 'Fraunces' },
  logos: [],
  ...over,
});

const render = (props: Partial<PromoStudioProps>) =>
  renderToStaticMarkup(
    React.createElement(PromoStudio, {
      assetsState: 'ready',
      assets: [],
      brandKits: [],
      brandKitsState: 'ready',
      projectId: 'proj-1',
      upload: async () => asset({}),
      ...props,
    }),
  );

const renderModal = (props: Partial<PromoFormatModalProps>) =>
  renderToStaticMarkup(
    React.createElement(PromoFormatModal, {
      open: true,
      selectedId: null,
      onSelect: () => {},
      onClose: () => {},
      ...props,
    }),
  );

// ---------------------------------------------------------------------------
// Lib: formats — ids are the registered create_food_ad adFormat enum
// ---------------------------------------------------------------------------

describe('promo lib — ad formats', () => {
  it('ships exactly the five spec formats, with the CP-1 enum ids', () => {
    expect(PROMO_FORMATS.map((f) => f.id)).toEqual([
      'tasting_ugc',
      'tutorial',
      'unboxing',
      'hyper_motion',
      'big_screen_spot',
    ]);
    expect(PROMO_FORMATS.map((f) => f.name)).toEqual([
      'Tasting UGC',
      'Tutorial',
      'Unboxing',
      'Hyper Motion',
      'Big-Screen Spot',
    ]);
    expect(promoFormatById('big_screen_spot')?.ratio).toBe('16:9');
    expect(promoFormatById('tasting_ugc')?.ratio).toBe('9:16');
    expect(promoFormatById('nope')).toBeNull();
    expect(promoFormatById(null)).toBeNull();
  });

  it('the modal filters are All · Social UGC · Commercial and cover every format once', () => {
    expect(promoFormatsForFilter('All')).toHaveLength(5);
    expect(promoFormatsForFilter('Social UGC').map((f) => f.id)).toEqual(['tasting_ugc', 'tutorial']);
    expect(promoFormatsForFilter('Commercial').map((f) => f.id)).toEqual([
      'unboxing',
      'hyper_motion',
      'big_screen_spot',
    ]);
  });

  it('a format writes ratio, duration and its priced tier into the composer settings', () => {
    expect(promoComposerSettings(promoFormatById('big_screen_spot'))).toEqual({
      ratio: '16:9',
      durationSeconds: 15,
      stackedExtras: 2,
    });
    expect(promoComposerSettings(promoFormatById('unboxing'))).toEqual({
      ratio: '9:16',
      durationSeconds: 10,
      stackedExtras: 1,
    });
    expect(promoComposerSettings(null)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Lib: the quote composes ON pricing.ts — never a parallel table
// ---------------------------------------------------------------------------

describe('promo lib — quote composition on computeQuote', () => {
  const settings = (over: Partial<ComposerSettings>): ComposerSettings => ({
    modelId: 'qc-ad-standard',
    ratio: '9:16',
    resolution: '720p',
    durationSeconds: 5,
    batch: 1,
    audioOn: true,
    stackedExtras: 0,
    ...over,
  });

  it('base ad run is the ad table’s 10 credits; duration beyond 5s prices per second', () => {
    expect(promoQuote(settings({}), null).credits).toBe(10);
    expect(promoQuote(settings({}), promoFormatById('tasting_ugc')).credits).toBe(20); // 15s: 10 + 10×1
  });

  it('promoQuote is exactly computeQuote with the format settings composed in', () => {
    const format = promoFormatById('big_screen_spot');
    expect(promoQuoteSettings(settings({}), format)).toEqual({
      ...settings({}),
      ratio: '16:9',
      durationSeconds: 15,
      stackedExtras: 2,
    });
    expect(promoQuote(settings({}), format)).toEqual(
      computeQuote('ad', settings({ ratio: '16:9', durationSeconds: 15, stackedExtras: 2 })),
    );
    // 10 base + 10 extra seconds + 2 priced tiers × 2 = 24.
    expect(promoQuote(settings({}), format).credits).toBe(24);
    // Unboxing: 10 + 5 extra seconds + 1 tier × 2 = 17.
    expect(promoQuote(settings({}), promoFormatById('unboxing')).credits).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// Lib: product picking (READY images only) + upload seam
// ---------------------------------------------------------------------------

describe('promo lib — product picking and upload', () => {
  it('pickable products are READY images only — no PENDING rows, no clips', () => {
    const ready = asset({ id: 'i-ready' });
    const pending = asset({ id: 'i-pending', uploadStatus: 'PENDING', url: null, filename: 'pending.jpg' });
    const clip = asset({ id: 'v-ready', type: 'video', filename: 'pour.mp4' });
    expect(pickableProductAssets([ready, pending, clip]).map((a) => a.id)).toEqual(['i-ready']);
    expect(productFromAsset(ready)).toEqual({
      assetId: 'i-ready',
      filename: 'thali-hero.jpg',
      url: 'https://signed.example/thali-hero.jpg',
    });
  });

  it('the product slot takes photos only; oversize and empty files are rejected', () => {
    expect(validateProductFile({ name: 'dish.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateProductFile({ name: 'pour.mp4', type: 'video/mp4', size: 1000 })).toContain('not an image');
    expect(validateProductFile({ name: 'huge.jpg', type: 'image/jpeg', size: 600 * 1024 * 1024 })).toContain('512 MB');
    expect(validateProductFile({ name: 'zero.jpg', type: 'image/jpeg', size: 0 })).toContain('empty');
  });

  it('a successful upload resolves to the created asset', async () => {
    const created = asset({ id: 'a-new', filename: 'packshot.jpg' });
    const upload = vi.fn(async () => created);
    const outcome = await runProductUpload({ name: 'packshot.jpg', type: 'image/jpeg', size: 10 }, upload);
    expect(outcome).toEqual({ status: 'done', asset: created });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('a storage failure reaches the caller with its REAL message (503 passthrough)', async () => {
    const upload = vi.fn(async () => {
      throw new Error('STORAGE_NOT_CONFIGURED: object storage is not configured on this server');
    });
    const outcome = await runProductUpload({ name: 'packshot.jpg', type: 'image/jpeg', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') expect(outcome.message).toContain('STORAGE_NOT_CONFIGURED');
  });

  it('an invalid file never reaches the uploader; phase labels never invent a percentage', async () => {
    const upload = vi.fn(async () => asset({}));
    const outcome = await runProductUpload({ name: 'clip.mp4', type: 'video/mp4', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    expect(upload).not.toHaveBeenCalled();
    expect(productUploadPhaseLabel('working')).toContain('Uploading your photo');
    expect(productUploadPhaseLabel('working')).not.toMatch(/%/);
    expect(productUploadPhaseLabel('idle')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lib: brand kits — real shapes, swatches drop blanks
// ---------------------------------------------------------------------------

describe('promo lib — brand kits', () => {
  it('swatches list the kit’s real colours in role order, blanks dropped', () => {
    expect(brandKitSwatches(kit({})).map((s) => s.role)).toEqual([
      'primary',
      'secondary',
      'accent',
      'background',
      'text',
    ]);
    const sparse = kit({
      colors: { primary: '#111111', secondary: '', accent: '  ', background: '#EEEEEE', text: '#222222' },
    });
    expect(brandKitSwatches(sparse)).toEqual([
      { role: 'primary', hex: '#111111' },
      { role: 'background', hex: '#EEEEEE' },
      { role: 'text', hex: '#222222' },
    ]);
    expect(brandKitById([kit({})], 'kit-1')?.name).toBe('Monsoon Thali House');
    expect(brandKitById([kit({})], 'missing')).toBeNull();
    expect(brandKitById([kit({})], null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lib: Link-to-Ad — real validation, honest landing, zero fabrication
// ---------------------------------------------------------------------------

describe('promo lib — Link-to-Ad', () => {
  it('validates links for real: parseable http(s) only', () => {
    expect(validateProductUrl('')).toEqual({
      ok: false,
      message: expect.stringContaining('Paste a menu or product link'),
    });
    expect(validateProductUrl('notaurl').ok).toBe(false);
    expect(validateProductUrl('ftp://files.example.com/x').ok).toBe(false);
    const ok = validateProductUrl('  https://menu.example.com/thali  ');
    expect(ok).toEqual({ ok: true, url: 'https://menu.example.com/thali', host: 'menu.example.com' });
  });

  it('a valid link lands on NOT_CONFIGURED naming the registered twin — and invents nothing', () => {
    const outcome = submitLinkToAd('https://menu.example.com/thali');
    expect(outcome.status).toBe('not-configured');
    if (outcome.status === 'not-configured') {
      expect(outcome.tool).toBe('quantcooks.create_food_ad');
      expect(outcome.message).toContain('NOT_CONFIGURED');
      expect(outcome.message).toContain('no product was invented');
    }
    // No product-shaped data can come out of a URL in this flow, ever.
    expect(Object.keys(outcome)).not.toContain('product');
    expect(JSON.stringify(outcome)).not.toMatch(/price|imageUrl|productName/);
  });

  it('an invalid link never reaches the not-configured landing', () => {
    expect(submitLinkToAd('::not a link::')).toEqual({
      status: 'invalid',
      message: expect.stringContaining('does not read as a link'),
    });
    expect(LINK_AD_STYLES).toEqual(['Tasting UGC', 'One Bite Hook', 'Giant Portion', 'Unboxing Try-On', 'ASMR Unbox']);
  });
});

// ---------------------------------------------------------------------------
// Lib: draft mirror — slots survive, junk does not
// ---------------------------------------------------------------------------

describe('promo lib — draft mirror', () => {
  const draft: PromoDraft = {
    product: { assetId: 'a-9', filename: 'dish.jpg', url: 'https://signed.example/dish.jpg' },
    formatId: 'unboxing',
    hookStyle: 'First Bite',
    setting: 'Street Stall',
    brandKitId: 'kit-1',
    presenterId: 'persona-1',
    prompt: 'Steam off the thali',
  };

  it('round-trips the full slot + brief state', () => {
    expect(parsePromoDraft(serializePromoDraft(draft))).toEqual(draft);
  });

  it('malformed mirrors fall back field-by-field, never resurrect unknown choices', () => {
    expect(parsePromoDraft(null)).toEqual(EMPTY_PROMO_DRAFT);
    expect(parsePromoDraft('{oops')).toEqual(EMPTY_PROMO_DRAFT);
    expect(parsePromoDraft('42')).toEqual(EMPTY_PROMO_DRAFT);
    const partial = parsePromoDraft(
      JSON.stringify({ formatId: 'gone-format', hookStyle: 'First Bite', product: { assetId: '', filename: 'x.jpg' } }),
    );
    expect(partial.formatId).toBeNull();
    expect(partial.hookStyle).toBe('First Bite');
    expect(partial.product).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lib: results rail only renders real job outputs
// ---------------------------------------------------------------------------

describe('promo lib — results from jobs', () => {
  const job = (over: Partial<StudioJob>): StudioJob => ({
    job_id: 'job-1',
    status: 'COMPLETED',
    progress: 100,
    credit_cost: 20,
    outputs: [],
    error: null,
    ...over,
  });

  it('completed jobs contribute their video outputs, nothing else does', () => {
    const done = job({ outputs: [{ id: 'o-1', kind: 'video', url: 'https://signed.example/ad.mp4', label: 'Thali spot' }] });
    const imageDone = job({ job_id: 'job-2', outputs: [{ id: 'o-2', kind: 'image', url: 'https://signed.example/x.jpg' }] });
    const processing = job({ job_id: 'job-3', status: 'PROCESSING', progress: null, outputs: [{ id: 'o-3', kind: 'video', url: null }] });
    expect(promoResultsFromJobs([done, imageDone, processing])).toEqual([
      { jobId: 'job-1', outputId: 'o-1', url: 'https://signed.example/ad.mp4', label: 'Thali spot' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Component: format modal — a picker that writes back, never a workflow
// ---------------------------------------------------------------------------

describe('PromoFormatModal', () => {
  it('renders all five format cards and the three filter chips', () => {
    const html = renderModal({});
    expect(html).toContain('data-testid="promo-format-modal"');
    for (const f of PROMO_FORMATS) {
      expect(html).toContain(`data-testid="promo-format-card-${f.id}"`);
    }
    expect(html).toContain('data-testid="promo-format-filter-All"');
    expect(html).toContain('data-testid="promo-format-filter-Social UGC"');
    expect(html).toContain('data-testid="promo-format-filter-Commercial"');
    expect(html).toContain('16:9 · 15s');
  });

  it('marks the format already in the brief, and renders nothing when closed', () => {
    const html = renderModal({ selectedId: 'tutorial' });
    expect(html).toContain('In your brief');
    expect(renderModal({ open: false })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Component: Promo Studio — slots, brand kits, grammar, five states
// ---------------------------------------------------------------------------

describe('PromoStudio screen', () => {
  it('renders the persistent slots row above the views, both slots honest', () => {
    const html = render({});
    expect(html).toContain('data-testid="promo-studio"');
    expect(html).toContain('data-testid="promo-slots"');
    expect(html).toContain('data-testid="promo-product-empty-slot"');
    expect(html).toContain('Add your dish');
    expect(html).toContain('data-testid="promo-tab-create"');
    expect(html).toContain('data-testid="promo-tab-link"');
  });

  it('presenter slot: honest empty naming its twin, with the way to Voice Studio', () => {
    const html = render({});
    expect(html).toContain('data-testid="promo-presenter-empty"');
    expect(html).toContain('quantcooks.create_chef_persona');
    // Batch #3 copy fix: Voice Studio has landed (Unit 7), so the slot
    // no longer calls it "still in build", and the dead Pick/Create
    // buttons are replaced by the Manage presenters link (the same
    // link the populated state carries).
    expect(html).not.toContain('still in build');
    expect(html).toContain('data-testid="promo-presenter-manage"');
    expect(html).toContain('href="/studio/voice"');
    expect(html).not.toContain('data-testid="promo-presenter-pick"');
    expect(html).not.toContain('data-testid="promo-presenter-create"');
    expect(html).toContain('this screen will not fabricate one');
  });

  it('not-configured state: Generate disabled, reason names create_food_ad, nothing charged', () => {
    const html = render({ initialPrompt: 'Steam off the thali' });
    expect(html).toContain('data-testid="composer-not-configured"');
    expect(html).toContain('quantcooks.create_food_ad');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('nothing will be charged');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
    expect(html).not.toContain('data-testid="composer-confirm"');
  });

  it('slots survive view switches: the filled product slot renders identically in Create and Link views', () => {
    const productAsset = asset({ id: 'dish-1', filename: 'thali-hero.jpg' });
    const create = render({ initialProductAsset: productAsset, initialFormatId: 'unboxing' });
    const link = render({ initialProductAsset: productAsset, initialFormatId: 'unboxing', initialView: 'link' });
    for (const html of [create, link]) {
      expect(html).toContain('data-testid="promo-product-selected"');
      expect(html).toContain('thali-hero.jpg');
      expect(html).toContain('data-testid="promo-product-remove"');
    }
    expect(create).toContain('data-testid="chip-product"');
    expect(create).toContain('Dish / Product: thali-hero.jpg');
    expect(link).toContain('data-testid="promo-link-panel"');
  });

  it('format write-back: the modal’s choice lands on the chip AND re-prices Generate via the composer settings', () => {
    const html = render({ initialPrompt: 'A thali ad', initialFormatId: 'big_screen_spot' });
    expect(html).toContain('data-testid="chip-format"');
    expect(html).toContain('Format: Big-Screen Spot');
    // 24 credits can only arise if ratio 16:9 + 15s + tier-2 all wrote back.
    expect(html).toContain('Generate · 24 credits');
    const tasting = render({ initialPrompt: 'A thali ad', initialFormatId: 'tasting_ugc' });
    expect(tasting).toContain('Format: Tasting UGC');
    expect(tasting).toContain('Generate · 20 credits');
    const noFormat = render({ initialPrompt: 'A thali ad' });
    expect(noFormat).toContain('Generate · 10 credits');
    expect(noFormat).not.toContain('Format:');
  });

  it('the “generate across formats” cards and the modal share one format state', () => {
    const html = render({ initialFormatId: 'hyper_motion' });
    expect(html).toContain('data-testid="promo-format-cards"');
    expect(html).toMatch(/data-testid="promo-format-quick-hyper_motion"[^>]*aria-pressed="true"/);
    expect(html).toContain('Format: Hyper Motion');
  });

  it('brand kits: loading state shows while the real list is in flight', () => {
    const html = render({ brandKitsState: 'loading' });
    expect(html).toContain('data-testid="promo-brandkit-loading"');
    expect(html).not.toContain('data-testid="promo-brandkit-empty"');
  });

  it('brand kits: error state shows the real error with a Retry action', () => {
    const html = render({ brandKitsState: 'error', brandKitsError: 'Failed to load brand kits (503)' });
    expect(html).toContain('data-testid="promo-brandkit-error"');
    expect(html).toContain('Failed to load brand kits (503)');
    expect(html).toContain('Retry');
  });

  it('brand kits: an empty library is an honest empty state pointing at Brand Kit, never an invented kit', () => {
    const html = render({ brandKits: [] });
    expect(html).toContain('data-testid="promo-brandkit-empty"');
    expect(html).toContain('href="/brand-kit"');
    expect(html).not.toContain('data-testid="promo-brandkit-selected"');
  });

  it('brand kits: populated list, and selecting one puts its real colours and name on the brief', () => {
    const html = render({ brandKits: [kit({}), kit({ id: 'kit-2', name: 'Café North', isDefault: false })], initialBrandKitId: 'kit-1' });
    expect(html).toContain('data-testid="promo-brandkit-pick-kit-1"');
    expect(html).toContain('data-testid="promo-brandkit-pick-kit-2"');
    expect(html).toContain('data-testid="promo-brandkit-selected"');
    expect(html).toContain('data-testid="promo-brandkit-swatch-primary"');
    expect(html).toContain('primary · #C2410C');
    expect(html).toContain('Headings in Fraunces');
    expect(html).toContain('data-testid="chip-brand-kit"');
    expect(html).toContain('Brand kit: Monsoon Thali House');
    expect(html).toContain('quantcooks.get_brand_kit');
  });

  it('product picker: READY dish photos are pickable, PENDING rows and clips are not offered', () => {
    const html = render({
      assets: [
        asset({ id: 'i-ready', filename: 'dish.jpg' }),
        asset({ id: 'i-pending', filename: 'pending.jpg', uploadStatus: 'PENDING', url: null }),
        asset({ id: 'v-ready', filename: 'pour.mp4', type: 'video' }),
      ],
    });
    expect(html).toContain('data-testid="promo-product-pick-i-ready"');
    expect(html).not.toContain('promo-product-pick-i-pending');
    expect(html).not.toContain('pending.jpg');
    expect(html).not.toContain('pour.mp4');
  });

  it('product picker states: loading skeletons, error with retry, honest empty', () => {
    expect(render({ assetsState: 'loading' })).toContain('data-testid="promo-product-loading"');
    const err = render({ assetsState: 'error', assetsError: 'Failed to load assets (503)' });
    expect(err).toContain('data-testid="promo-product-error"');
    expect(err).toContain('Failed to load assets (503)');
    expect(err).toContain('Retry');
    const empty = render({ assets: [] });
    expect(empty).toContain('data-testid="promo-product-empty"');
    expect(empty).toContain('No dish added yet');
  });

  it('uploads are honestly unavailable without a project: input disabled, reason on the surface', () => {
    const html = render({ projectId: null, projectName: null, upload: undefined });
    expect(html).toContain('data-testid="promo-product-upload-unavailable"');
    expect(html).toContain('Uploads are saved into a project');
    expect(html).toMatch(/data-testid="promo-product-file-input"[^>]*disabled/);
  });

  it('empty state: starter framing, results rail and job strip are honestly empty', () => {
    const html = render({});
    expect(html).toContain('data-testid="promo-empty-state"');
    expect(html).toContain('data-testid="promo-results-empty"');
    expect(html).toContain('no placeholder ads, ever');
    expect(html).toContain('data-testid="jobstrip-empty"');
    expect(html).toContain('data-testid="promo-vary-note"');
    expect(html).toContain('quantcooks.vary_ad');
  });

  it('results rail renders real completed ad outputs and failed-job refunds truthfully', () => {
    const jobs: StudioJob[] = [
      {
        job_id: 'job-ok',
        status: 'COMPLETED',
        progress: 100,
        credit_cost: 24,
        outputs: [{ id: 'out-1', kind: 'video', url: 'https://signed.example/ad.mp4', label: 'Thali spot' }],
        error: null,
        label: 'Ad · QC Ad Cut',
      },
      {
        job_id: 'job-bad',
        status: 'FAILED',
        progress: null,
        credit_cost: 24,
        outputs: [],
        error: 'Provider timed out',
        label: 'Ad · QC Ad Cut',
      },
    ];
    const html = render({ jobs });
    expect(html).toContain('data-testid="promo-result-out-1"');
    expect(html).toContain('https://signed.example/ad.mp4');
    expect(html).not.toContain('data-testid="promo-results-empty"');
    expect(html).toContain('Provider timed out');
    expect(html).toContain('Refunded');
  });

  it('Link-to-Ad: Build stays greyed until a link exists, and the style cards are the spec set', () => {
    const html = render({ initialView: 'link' });
    expect(html).toContain('data-testid="promo-link-panel"');
    expect(html).toMatch(/data-testid="promo-link-build"[^>]*disabled/);
    expect(html).toContain('data-testid="promo-link-style-one-bite-hook"');
    expect(html).toContain('data-testid="promo-link-style-asmr-unbox"');
    expect(html).not.toContain('data-testid="promo-link-notconfigured"');
  });

  it('Link-to-Ad: a bad link shows its validation error inline, never a landing', () => {
    const html = render({ initialView: 'link', initialLinkUrl: 'ftp://files.example.com/x', initialLinkSubmitted: true });
    expect(html).toContain('data-testid="promo-link-error"');
    expect(html).toContain('http and https pages only');
    expect(html).not.toContain('data-testid="promo-link-notconfigured"');
  });

  it('Link-to-Ad: a good link lands on NOT_CONFIGURED naming the twin — no extracted product appears', () => {
    const html = render({
      initialView: 'link',
      initialLinkUrl: 'https://menu.example.com/thali',
      initialLinkSubmitted: true,
      initialLinkStyle: 'One Bite Hook',
    });
    expect(html).toContain('data-testid="promo-link-notconfigured"');
    expect(html).toContain('quantcooks.create_food_ad');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('Nothing was extracted');
    expect(html).toContain('One Bite Hook');
  });
});

// ---------------------------------------------------------------------------
// Presenter wiring (shared-file batch #2): the slot reads the Voice
// Studio persona library (Unit 7). Personas arrive through the initial-*
// seam here, the same props a deep link would produce; the component's
// own mirror read is the established readDraftMirror pattern. A persona
// is a draft by type — its status union has one member — so nothing in
// these renders may call one trained or ready.
// ---------------------------------------------------------------------------

describe('PromoStudio presenter wiring (batch #2)', () => {
  const persona = (over: Partial<ChefPersona> = {}): ChefPersona => ({
    ...createPersonaDraft({
      id: 'persona-1',
      name: 'Meera',
      presenterType: 'Home Chef',
      picks: defaultPersonaPicks(),
      referenceAssetIds: [],
      consent: null,
      createdAt: '2026-10-29T00:00:00.000Z',
    }),
    ...over,
  });

  /** The presenter slot's markup only (up to the next surface). */
  const slotSegment = (html: string): string => {
    const after = html.split('data-testid="promo-presenter-slot"')[1] ?? '';
    const ends = ['promo-product-panel', 'promo-brandkit']
      .map((m) => after.indexOf(`data-testid="${m}"`))
      .filter((i) => i >= 0);
    return ends.length ? after.slice(0, Math.min(...ends)) : after;
  };

  it('an explicitly empty persona library renders the honest empty slot, unchanged', () => {
    const html = render({ initialPersonas: [] });
    expect(html).toContain('data-testid="promo-presenter-empty"');
    expect(html).toContain('quantcooks.create_chef_persona');
    expect(html).not.toContain('data-testid="promo-presenter-list"');
    expect(html).not.toContain('data-testid="promo-presenter-selected"');
  });

  it('a populated library lists the drafts with their status, a real reference thumbnail and the manage link', () => {
    const html = render({
      initialPersonas: [
        persona({ referenceAssetIds: ['ref-1'] }),
        persona({ id: 'persona-2', name: 'Arjun', presenterType: 'Street-Food Vendor' }),
      ],
      assets: [asset({ id: 'ref-1', filename: 'meera-ref.jpg', url: 'https://signed.example/meera-ref.jpg' })],
    });
    expect(html).not.toContain('data-testid="promo-presenter-empty"');
    expect(html).toContain('data-testid="promo-presenter-list"');
    expect(html).toContain('data-testid="promo-presenter-pick-persona-1"');
    expect(html).toContain('data-testid="promo-presenter-pick-persona-2"');
    expect(html).toContain('Meera');
    expect(html).toContain('Arjun');
    expect(html).toContain('Draft — training not configured');
    expect(html).toContain('src="https://signed.example/meera-ref.jpg"');
    expect(html).toContain('data-testid="promo-presenter-manage"');
    expect(html).toContain('href="/studio/voice"');
    expect(html).not.toContain('data-testid="promo-presenter-selected"');
  });

  it('a persona whose reference does not resolve shows no thumbnail — never a fabricated portrait', () => {
    const html = render({ initialPersonas: [persona({ referenceAssetIds: ['ghost-asset'] })], assets: [] });
    const segment = slotSegment(html);
    expect(segment).toContain('Meera');
    expect(segment).toContain('data-testid="promo-presenter-pick-persona-1"');
    expect(segment).not.toContain('<img');
  });

  it('a selected draft is recorded on the brief with its status stated, and Generate stays off', () => {
    const html = render({
      initialPersonas: [persona({ referenceAssetIds: ['ref-1'] })],
      initialPresenterId: 'persona-1',
      assets: [asset({ id: 'ref-1', filename: 'meera-ref.jpg', url: 'https://signed.example/meera-ref.jpg' })],
      initialPrompt: 'Meera presents the thali',
    });
    expect(html).toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('Meera');
    expect(html).toContain('Draft — training not configured');
    expect(html).toContain('src="https://signed.example/meera-ref.jpg"');
    // The chip mirrors the slot, exactly like the product chip does.
    expect(html).toContain('data-testid="chip-presenter"');
    expect(html).toContain('Presenter: Meera');
    // Generate stays not-configured; the draft's own block (its training
    // has not run) is stated on the slot alongside the provider block.
    expect(html).toContain('data-testid="composer-not-configured"');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
    expect(html).toContain('cannot present in an ad today');
    expect(html).toContain('Nothing will be charged');
  });

  it('a selection that no longer resolves against the library is no selection', () => {
    const html = render({ initialPersonas: [persona({})], initialPresenterId: 'persona-gone' });
    expect(html).not.toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('data-testid="promo-presenter-list"');
    expect(html).not.toContain('Presenter:');
  });

  it('the populated presenter slot never calls a draft trained or ready', () => {
    const renders: Array<Partial<PromoStudioProps>> = [
      { initialPersonas: [persona({})] },
      { initialPersonas: [persona({})], initialPresenterId: 'persona-1' },
    ];
    for (const props of renders) {
      const segment = slotSegment(render(props));
      expect(segment).toContain('Draft — training not configured');
      expect(segment).not.toMatch(/\b(trained|ready)\b/i);
    }
  });
});
