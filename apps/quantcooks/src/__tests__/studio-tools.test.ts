// ============================================================================
// QuantCooks Studio (Phase 2 Unit 8) — Quick Tools: lib logic + rendering.
// Same approach as Units 1–7: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. The honesty
// proofs this unit owes:
//  - the directory ships ONLY built tools, each naming its CP-1 twin;
//  - quotes are pricing.ts compositions (equality-tested), whole credits;
//  - run outcomes carry no result/output/score — asserted by shape;
//  - Hook Score renders NO number, gauge or bar without a real analysis
//    object, and frames any real one as a modelled estimate;
//  - Presenter Swap's gate stacks consent / training / provider as
//    separate reasons and can arm only when all three clear.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, type ComposerSettings } from '../lib/studio/pricing';
import {
  createPersonaDraft,
  recordPersonaConsent,
  type ChefPersona,
} from '../lib/studio/voice';
import {
  DISH_FIX_TOOL,
  EXPAND_PHOTO_TOOL,
  EXPAND_TARGETS,
  HOOK_SCORE_FLAT_CREDITS,
  HOOK_SCORE_TOOL,
  PRESENTER_SWAP_TOOL,
  QUICK_TOOLS,
  attemptDishFix,
  attemptExpand,
  attemptHookScore,
  attemptPresenterSwap,
  dishFixQuote,
  expandQuote,
  filterTools,
  hookScoreQuote,
  pickableToolAssets,
  presenterSwapGate,
  previousRunsFor,
  runToolUpload,
  toolById,
  toolCardPrice,
  toolResultsFromJobs,
  validateToolFile,
  type HookScoreReport,
} from '../lib/studio/tools';
import { QuickToolsDirectory } from '../components/studio/QuickToolsDirectory';
import { DishPhotoFix, type DishPhotoFixProps } from '../components/studio/DishPhotoFix';
import { ExpandPhoto, type ExpandPhotoProps } from '../components/studio/ExpandPhoto';
import { HookScoreTool, type HookScoreToolProps } from '../components/studio/HookScoreTool';
import { PresenterSwap, type PresenterSwapProps } from '../components/studio/PresenterSwap';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'thali.jpg',
  type: 'image',
  size: 2048,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/thali.jpg',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/thali.jpg',
  ...over,
});

const readyImage = asset({});
const pendingImage = asset({ id: 'asset-pending', filename: 'pending.jpg', uploadStatus: 'PENDING', url: null });
const readyVideo = asset({ id: 'asset-video', filename: 'hook.mp4', type: 'video', url: 'https://signed.example/hook.mp4' });
const pendingVideo = asset({ id: 'asset-video-pending', filename: 'later.mp4', type: 'video', uploadStatus: 'PENDING', url: null });

const job = (over: Partial<StudioJob>): StudioJob => ({
  job_id: 'job-1',
  status: 'COMPLETED',
  progress: 100,
  credit_cost: 2,
  outputs: [],
  error: null,
  ...over,
});

const personaDraft = (over: Partial<ChefPersona> = {}): ChefPersona => ({
  ...createPersonaDraft({
    id: 'persona-1',
    name: 'Meera',
    presenterType: 'Home Chef',
    picks: {},
    referenceAssetIds: ['asset-1'],
    consent: null,
    createdAt: '2026-10-29T00:00:00.000Z',
  }),
  ...over,
});

const consentedPersona = (): ChefPersona =>
  recordPersonaConsent([personaDraft()], 'persona-1', '2026-10-29T01:00:00.000Z')[0]!;

const imageSettings = (over: Partial<ComposerSettings>): ComposerSettings => ({
  modelId: 'qc-still-standard',
  ratio: '1:1',
  resolution: 'Standard',
  durationSeconds: 0,
  batch: 1,
  audioOn: false,
  stackedExtras: 0,
  ...over,
});

// ---------------------------------------------------------------------------
// Lib: the catalogue + directory filtering
// ---------------------------------------------------------------------------

describe('tools lib — catalogue', () => {
  it('ships exactly the four built tools, each with its CP-1 twin', () => {
    expect(QUICK_TOOLS.map((t) => t.id)).toEqual([
      'dish-photo-fix',
      'expand-photo',
      'hook-score',
      'presenter-swap',
    ]);
    expect(toolById('dish-photo-fix')?.tool).toBe('quantcooks.generate_dish_image');
    expect(toolById('dish-photo-fix')?.toolMode).toBe('restyle');
    expect(toolById('expand-photo')?.tool).toBe('quantcooks.generate_dish_image');
    expect(toolById('expand-photo')?.toolMode).toBe('outpaint');
    expect(toolById('hook-score')?.tool).toBe(HOOK_SCORE_TOOL);
    expect(toolById('presenter-swap')?.tool).toBe(PRESENTER_SWAP_TOOL);
    expect(toolById('presenter-swap')?.toolMode).toBe('object_swap');
    expect(QUICK_TOOLS.every((t) => t.availability === 'not-configured')).toBe(true);
    expect(toolById('upscale')).toBeNull();
    expect(toolById(null)).toBeNull();
  });

  it('filters by category and search; unbuilt categories are honestly empty', () => {
    expect(filterTools('all', '').map((t) => t.id)).toHaveLength(4);
    expect(filterTools('face-presenter', '').map((t) => t.id)).toEqual(['presenter-swap']);
    expect(filterTools('video-fixes', '')).toEqual([]);
    expect(filterTools('ads-products', '')).toEqual([]);
    expect(filterTools('all', 'photo').map((t) => t.id)).toEqual(['dish-photo-fix', 'expand-photo']);
    expect(filterTools('all', 'score').map((t) => t.id)).toEqual(['hook-score']);
    expect(filterTools('all', 'nothing-matches-this')).toEqual([]);
  });

  it('card prices are the real composed quotes or the stated per-second rule', () => {
    expect(toolCardPrice(toolById('dish-photo-fix')!)).toBe('2 credits');
    expect(toolCardPrice(toolById('expand-photo')!)).toBe('from 2 credits');
    expect(toolCardPrice(toolById('hook-score')!)).toBe('3 credits');
    expect(toolCardPrice(toolById('presenter-swap')!)).toBe('per second · priced at run');
  });
});

// ---------------------------------------------------------------------------
// Lib: quotes composed on pricing.ts
// ---------------------------------------------------------------------------

describe('tools lib — quotes', () => {
  it('Dish Fix quote IS computeQuote at Standard, lifted to High by Relight', () => {
    expect(dishFixQuote([])).toEqual(computeQuote('image', imageSettings({})));
    expect(dishFixQuote(['clean-up', 'colour-pop'])).toEqual(computeQuote('image', imageSettings({})));
    expect(dishFixQuote(['relight'])).toEqual(
      computeQuote('image', imageSettings({ resolution: 'High' })),
    );
    expect(dishFixQuote([]).credits).toBe(2);
    expect(dishFixQuote(['relight']).credits).toBe(3);
  });

  it('Expand quote IS computeQuote at the target tier, and varies by canvas', () => {
    expect(expandQuote('board-16-9')).toEqual(
      computeQuote('image', imageSettings({ ratio: '16:9', resolution: 'Standard' })),
    );
    expect(expandQuote('banner-21-9')).toEqual(
      computeQuote('image', imageSettings({ ratio: '21:9', resolution: 'High' })),
    );
    const prices = EXPAND_TARGETS.map((t) => expandQuote(t.id).credits);
    expect(Math.min(...prices)).toBeLessThan(Math.max(...prices));
    expect(prices.every((p) => Number.isInteger(p) && p >= 1)).toBe(true);
  });

  it('Hook Score quote is the flat G-13 rate row, whole credits', () => {
    const quote = hookScoreQuote();
    expect(quote.credits).toBe(HOOK_SCORE_FLAT_CREDITS);
    expect(Number.isInteger(quote.credits)).toBe(true);
    expect(quote.lines.join(' ')).toContain('modelled estimate');
  });
});

// ---------------------------------------------------------------------------
// Lib: picking + upload seam
// ---------------------------------------------------------------------------

describe('tools lib — picking and upload', () => {
  it('pickers offer only READY assets of the tool kind', () => {
    const all = [readyImage, pendingImage, readyVideo, pendingVideo];
    expect(pickableToolAssets(all, 'image').map((a) => a.id)).toEqual(['asset-1']);
    expect(pickableToolAssets(all, 'video').map((a) => a.id)).toEqual(['asset-video']);
  });

  it('validates files by kind, size and emptiness', () => {
    expect(validateToolFile({ name: 'a.mp4', type: 'video/mp4', size: 10 }, 'image')).toContain('not an image');
    expect(validateToolFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, 'video')).toContain('not a video');
    expect(validateToolFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 }, 'image')).toContain('empty');
    expect(
      validateToolFile({ name: 'a.jpg', type: 'image/jpeg', size: 600 * 1024 * 1024 }, 'image'),
    ).toContain('512 MB');
    expect(validateToolFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, 'image')).toBeNull();
  });

  it('upload errors pass through untouched (the 503 keeps its own words)', async () => {
    const failing = async (): Promise<ServerAsset> => {
      throw new Error('STORAGE_NOT_CONFIGURED: storage is not configured (503)');
    };
    const outcome = await runToolUpload({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, 'image', failing);
    expect(outcome).toEqual({
      status: 'error',
      message: 'STORAGE_NOT_CONFIGURED: storage is not configured (503)',
    });
  });

  it('upload validation refuses before the uploader is ever called', async () => {
    let called = false;
    const spy = async (): Promise<ServerAsset> => {
      called = true;
      return readyImage;
    };
    const outcome = await runToolUpload({ name: 'a.mp4', type: 'video/mp4', size: 10 }, 'image', spy);
    expect(outcome.status).toBe('error');
    expect(called).toBe(false);
    const ok = await runToolUpload({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, 'image', spy);
    expect(ok).toEqual({ status: 'done', asset: readyImage });
  });
});

// ---------------------------------------------------------------------------
// Lib: run attempts — outcome shapes carry nothing fabricatable
// ---------------------------------------------------------------------------

describe('tools lib — attempts', () => {
  it('Dish Fix refuses without an asset or an intent; a valid run is not-configured with no outputs', () => {
    expect(attemptDishFix({ asset: null, intentIds: ['clean-up'] }).status).toBe('invalid');
    expect(attemptDishFix({ asset: readyImage, intentIds: [] }).status).toBe('invalid');
    expect(attemptDishFix({ asset: pendingImage, intentIds: ['clean-up'] }).status).toBe('invalid');
    expect(attemptDishFix({ asset: readyVideo, intentIds: ['clean-up'] }).status).toBe('invalid');
    const outcome = attemptDishFix({ asset: readyImage, intentIds: ['clean-up', 'relight'] });
    expect(outcome.status).toBe('not-configured');
    if (outcome.status === 'not-configured') {
      expect(outcome.tool).toBe(DISH_FIX_TOOL);
      expect(outcome.mode).toBe('restyle');
      expect(outcome.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(outcome.chargedCredits).toBe(0);
    }
    expect('outputs' in outcome).toBe(false);
    expect('result' in outcome).toBe(false);
    expect('url' in outcome).toBe(false);
  });

  it('Expand refuses without a canvas; a valid run is the outpaint mode, no outputs', () => {
    expect(attemptExpand({ asset: null, targetId: 'board-16-9' }).status).toBe('invalid');
    expect(attemptExpand({ asset: readyImage, targetId: null }).status).toBe('invalid');
    expect(attemptExpand({ asset: readyImage, targetId: 'nope' }).status).toBe('invalid');
    const outcome = attemptExpand({ asset: readyImage, targetId: 'banner-21-9' });
    expect(outcome.status).toBe('not-configured');
    if (outcome.status === 'not-configured') {
      expect(outcome.tool).toBe(EXPAND_PHOTO_TOOL);
      expect(outcome.mode).toBe('outpaint');
      expect(outcome.chargedCredits).toBe(0);
    }
    expect('outputs' in outcome).toBe(false);
  });

  it('Hook Score outcome can never contain a score — by shape', () => {
    expect(attemptHookScore({ asset: null, platform: 'generic', hookText: '' }).status).toBe('invalid');
    expect(attemptHookScore({ asset: readyImage, platform: 'generic', hookText: '' }).status).toBe('invalid');
    const outcome = attemptHookScore({
      asset: readyVideo,
      platform: 'reels',
      hookText: 'Wait for the cheese pull…',
    });
    expect(outcome.status).toBe('not-configured');
    expect('score' in outcome).toBe(false);
    expect('factors' in outcome).toBe(false);
    expect('outputs' in outcome).toBe(false);
    if (outcome.status === 'not-configured') {
      expect(outcome.tool).toBe(HOOK_SCORE_TOOL);
      expect(outcome.code).toBe('ANALYSIS_NOT_CONFIGURED');
      expect(outcome.framing).toBe('modelled_estimate');
      expect(outcome.hookText).toBe('Wait for the cheese pull…');
      expect(outcome.chargedCredits).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Lib: the Presenter Swap gate — reasons stack separately, in order
// ---------------------------------------------------------------------------

describe('tools lib — presenter swap gate', () => {
  it('a consent-less draft persona stacks all three reasons, separately', () => {
    const gate = presenterSwapGate({
      reference: { kind: 'persona', persona: personaDraft() },
      trainingCompleted: false,
      providerConfigured: false,
    });
    expect(gate.armed).toBe(false);
    expect(gate.reasons).toHaveLength(3);
    expect(gate.reasons[0]).toContain('No consent is recorded');
    expect(gate.reasons[1]).toContain('still a draft');
    expect(gate.reasons[2]).toContain('PROVIDER_NOT_CONFIGURED');
  });

  it('a consented persona leaves exactly the two stacked reasons: untrained + provider', () => {
    const gate = presenterSwapGate({
      reference: { kind: 'persona', persona: consentedPersona() },
      trainingCompleted: false,
      providerConfigured: false,
    });
    expect(gate.armed).toBe(false);
    expect(gate.reasons).toHaveLength(2);
    expect(gate.reasons.join(' ')).not.toContain('No consent is recorded');
    expect(gate.reasons[0]).toContain('still a draft');
    expect(gate.reasons[1]).toContain('PROVIDER_NOT_CONFIGURED');
  });

  it('a photo without its attestation is consent-blocked; with it, training + provider remain', () => {
    const noConsent = presenterSwapGate({
      reference: { kind: 'photo', asset: readyImage, consentRecorded: false },
      trainingCompleted: false,
      providerConfigured: false,
    });
    expect(noConsent.reasons[0]).toContain('own-likeness confirmation');
    const consented = presenterSwapGate({
      reference: { kind: 'photo', asset: readyImage, consentRecorded: true },
      trainingCompleted: false,
      providerConfigured: false,
    });
    expect(consented.reasons).toHaveLength(2);
    expect(consented.reasons[0]).toContain('not a trained identity');
  });

  it('the gate arms only when consent, training and provider all clear', () => {
    const gate = presenterSwapGate({
      reference: { kind: 'persona', persona: consentedPersona() },
      trainingCompleted: true,
      providerConfigured: true,
    });
    expect(gate).toEqual({ armed: true, reasons: [] });
  });

  it('attemptPresenterSwap: invalid without inputs, blocked with the stacked reasons', () => {
    expect(
      attemptPresenterSwap({ clip: null, reference: null, trainingCompleted: false, providerConfigured: false }).status,
    ).toBe('invalid');
    expect(
      attemptPresenterSwap({
        clip: readyVideo,
        reference: null,
        trainingCompleted: false,
        providerConfigured: false,
      }).status,
    ).toBe('invalid');
    const blocked = attemptPresenterSwap({
      clip: readyVideo,
      reference: { kind: 'persona', persona: consentedPersona() },
      trainingCompleted: false,
      providerConfigured: false,
    });
    expect(blocked.status).toBe('blocked');
    if (blocked.status === 'blocked') {
      expect(blocked.reasons).toHaveLength(2);
      expect(blocked.chargedCredits).toBe(0);
    }
    expect('outputs' in blocked).toBe(false);
    const open = attemptPresenterSwap({
      clip: readyVideo,
      reference: { kind: 'persona', persona: consentedPersona() },
      trainingCompleted: true,
      providerConfigured: true,
    });
    expect(open.status).toBe('not-configured');
  });
});

// ---------------------------------------------------------------------------
// Lib: results + previous runs come from real jobs only
// ---------------------------------------------------------------------------

describe('tools lib — results and previous runs', () => {
  it('results read only COMPLETED jobs’ outputs of the tool kind', () => {
    const jobs = [
      job({ job_id: 'j1', outputs: [{ id: 'o1', kind: 'image', url: 'https://x/1.jpg', label: 'Fixed still' }] }),
      job({ job_id: 'j2', status: 'PROCESSING', outputs: [{ id: 'o2', kind: 'image', url: 'https://x/2.jpg' }] }),
      job({ job_id: 'j3', outputs: [{ id: 'o3', kind: 'video', url: 'https://x/3.mp4' }] }),
      job({ job_id: 'j4', status: 'FAILED', outputs: [{ id: 'o4', kind: 'image', url: 'https://x/4.jpg' }] }),
    ];
    expect(toolResultsFromJobs(jobs, 'image').map((c) => c.outputId)).toEqual(['o1']);
    expect(toolResultsFromJobs(jobs, 'video').map((c) => c.outputId)).toEqual(['o3']);
    expect(toolResultsFromJobs([], 'image')).toEqual([]);
  });

  it('previous runs filter by the tool’s job label', () => {
    const jobs = [
      job({ job_id: 'j1', label: 'Dish Photo Fix · thali.jpg' }),
      job({ job_id: 'j2', label: 'Export · mp4 1080p' }),
      job({ job_id: 'j3', label: 'Dish Photo Fix · dosa.jpg' }),
    ];
    expect(previousRunsFor(jobs, 'Dish Photo Fix').map((j) => j.job_id)).toEqual(['j1', 'j3']);
    expect(previousRunsFor(jobs, 'Hook Score')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rendering: the directory
// ---------------------------------------------------------------------------

const renderDirectory = (props: Partial<React.ComponentProps<typeof QuickToolsDirectory>> = {}) =>
  renderToStaticMarkup(React.createElement(QuickToolsDirectory, props));

describe('tools directory — rendering', () => {
  it('renders exactly the four built tools with twins, prices and honest availability', () => {
    const html = renderDirectory();
    expect((html.match(/studio-tools-card"/g) ?? []).length).toBe(4);
    for (const id of ['dish-photo-fix', 'expand-photo', 'hook-score', 'presenter-swap']) {
      expect(html).toContain(`data-testid="tool-card-${id}"`);
      expect(html).toContain(`href="/tools/${id}"`);
    }
    expect(html).toContain('quantcooks.generate_dish_image');
    expect(html).toContain('quantcooks.score_hook');
    expect(html).toContain('quantcooks.transform_video');
    expect(html).toContain('Not available yet');
    expect(html).toContain('per second · priced at run');
    // No unbuilt tool gets a card (no dead doors).
    expect(html).not.toContain('tool-card-upscale');
    expect(html).not.toContain('tool-card-auto-caption');
  });

  it('a category with no built tool renders the plain empty state, never dead cards', () => {
    const html = renderDirectory({ initialCategory: 'video-fixes' });
    expect(html).toContain('data-testid="tools-empty"');
    expect(html).toContain('No Quick Tools live in this category yet.');
    expect(html).not.toContain('studio-tools-card"');
  });

  it('a search with no matches lists the closest categories instead of a dead end', () => {
    const html = renderDirectory({ query: 'zzzz-nothing' });
    expect(html).toContain('data-testid="tools-empty"');
    expect(html).toContain('No Quick Tool matches');
    expect(html).toContain('Face &amp; Presenter');
  });

  it('search narrows to matching tools', () => {
    const html = renderDirectory({ query: 'photo' });
    expect(html).toContain('data-testid="tool-card-dish-photo-fix"');
    expect(html).toContain('data-testid="tool-card-expand-photo"');
    expect(html).not.toContain('data-testid="tool-card-hook-score"');
  });
});

// ---------------------------------------------------------------------------
// Rendering: Dish Photo Fix + Expand Photo flows
// ---------------------------------------------------------------------------

const renderFix = (props: Partial<DishPhotoFixProps>) =>
  renderToStaticMarkup(
    React.createElement(DishPhotoFix, { assetsState: 'ready', assets: [], ...props }),
  );

describe('dish photo fix — rendering', () => {
  it('picker offers only READY images (kind-checked, PENDING never offered)', () => {
    const html = renderFix({ assets: [readyImage, pendingImage, readyVideo], projectId: 'proj-1' });
    expect(html).toContain('data-testid="dish-fix-asset-pick-asset-1"');
    expect(html).not.toContain('dish-fix-asset-pick-asset-pending');
    expect(html).not.toContain('dish-fix-asset-pick-asset-video');
  });

  it('shows loading skeletons and the error state with retry', () => {
    expect(renderFix({ assetsState: 'loading' })).toContain('data-testid="dish-fix-assets-loading"');
    const err = renderFix({ assetsState: 'error', assetsError: 'boom' });
    expect(err).toContain('data-testid="dish-fix-assets-error"');
    expect(err).toContain('boom');
  });

  it('the run button is greyed without a valid input and prices live with the intents', () => {
    const bare = renderFix({});
    expect(bare).toContain('Fix this photo · 2 credits');
    const relight = renderFix({ initialAsset: readyImage, initialIntentIds: ['relight'] });
    expect(relight).toContain('Fix this photo · 3 credits');
    expect(relight).toContain('data-testid="dish-fix-quote-total"');
  });

  it('a not-configured outcome renders the twin refusal; results stay honestly empty', () => {
    const outcome = attemptDishFix({ asset: readyImage, intentIds: ['clean-up'] });
    const html = renderFix({ initialAsset: readyImage, initialIntentIds: ['clean-up'], initialOutcome: outcome });
    expect(html).toContain('data-testid="dish-fix-outcome-not-configured"');
    expect(html).toContain('PROVIDER_NOT_CONFIGURED');
    expect(html).toContain('data-testid="dish-fix-results-empty"');
    expect(html).toContain('data-testid="dish-fix-previous-empty"');
  });
});

const renderExpand = (props: Partial<ExpandPhotoProps>) =>
  renderToStaticMarkup(
    React.createElement(ExpandPhoto, { assetsState: 'ready', assets: [], ...props }),
  );

describe('expand photo — rendering', () => {
  it('renders the four target canvases and re-prices by target tier', () => {
    const html = renderExpand({ initialAsset: readyImage, initialTargetId: 'board-16-9' });
    for (const t of EXPAND_TARGETS) {
      expect(html).toContain(`data-testid="expand-target-${t.id}"`);
    }
    expect(html).toContain('Expand to 16:9 · 2 credits');
    const wide = renderExpand({ initialAsset: readyImage, initialTargetId: 'banner-21-9' });
    expect(wide).toContain('Expand to 21:9 · 3 credits');
  });

  it('a not-configured outcome names the outpaint mode of the one image tool', () => {
    const outcome = attemptExpand({ asset: readyImage, targetId: 'strip-3-1' });
    const html = renderExpand({ initialAsset: readyImage, initialTargetId: 'strip-3-1', initialOutcome: outcome });
    expect(html).toContain('outpaint mode');
    expect(html).toContain('PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// Rendering: Hook Score — the no-fabricated-score proofs
// ---------------------------------------------------------------------------

const renderHook = (props: Partial<HookScoreToolProps>) =>
  renderToStaticMarkup(
    React.createElement(HookScoreTool, { assetsState: 'ready', assets: [], ...props }),
  );

describe('hook score — rendering', () => {
  it('states the limit BEFORE upload and carries the modelled-estimate framing on the surface', () => {
    const html = renderHook({});
    expect(html).toContain('data-testid="tool-limit-note"');
    expect(html).toContain('CLIP_TOO_LONG_FOR_ANALYSIS');
    expect(html).toContain('data-testid="hook-framing"');
    expect(html).toContain('modelled estimate');
    expect(html).toContain('data-testid="hook-how-it-works"');
  });

  it('renders NO score, gauge or factor bar without a real analysis — before or after an attempt', () => {
    const bare = renderHook({ initialAsset: readyVideo });
    expect(bare).not.toContain('hook-report-card');
    expect(bare).not.toContain('hook-report-score');
    expect(bare).not.toContain('studio-tools-factor-bar');
    const outcome = attemptHookScore({ asset: readyVideo, platform: 'generic', hookText: 'Wait…' });
    const after = renderHook({ initialAsset: readyVideo, initialOutcome: outcome });
    expect(after).toContain('data-testid="hook-outcome-not-configured"');
    expect(after).toContain('ANALYSIS_NOT_CONFIGURED');
    expect(after).not.toContain('hook-report-card');
    expect(after).not.toContain('hook-report-score');
    expect(after).not.toContain('studio-tools-factor-bar');
    expect(after).toContain('data-testid="hook-report-empty"');
  });

  it('a real analysis renders the full report — score, gauge, hook, hold, factor bars — framed as an estimate', () => {
    const analysis: HookScoreReport = {
      score: 72,
      factors: { firstFramePull: 80, hook: 74, hold: 61, motion: 66, faces: 40, text: 55, sound: 70 },
      framing: 'modelled_estimate',
      analysedDurationSec: 12,
    };
    const html = renderHook({ initialAsset: readyVideo, analysis });
    expect(html).toContain('data-testid="hook-report-card"');
    expect(html).toContain('data-testid="hook-report-score"');
    expect(html).toContain('72');
    expect(html).toContain('Modelled estimate');
    expect(html).toContain('data-testid="hook-report-hook"');
    expect(html).toContain('data-testid="hook-report-hold"');
    expect((html.match(/studio-tools-factor-bar/g) ?? []).length).toBe(7);
  });

  it('picker offers only READY videos', () => {
    const html = renderHook({ assets: [readyImage, readyVideo, pendingVideo] });
    expect(html).toContain('data-testid="hook-asset-pick-asset-video"');
    expect(html).not.toContain('hook-asset-pick-asset-video-pending');
    expect(html).not.toContain('hook-asset-pick-asset-1"');
  });
});

// ---------------------------------------------------------------------------
// Rendering: Presenter Swap — drafts labelled, gate reasons stacked
// ---------------------------------------------------------------------------

const renderSwap = (props: Partial<PresenterSwapProps>) =>
  renderToStaticMarkup(
    React.createElement(PresenterSwap, { assetsState: 'ready', assets: [], ...props }),
  );

describe('presenter swap — rendering', () => {
  it('an empty persona library points at Voice Studio instead of inventing a presenter', () => {
    const html = renderSwap({ personas: [] });
    expect(html).toContain('data-testid="swap-personas-empty"');
    expect(html).toContain('href="/studio/voice"');
  });

  it('personas are labelled drafts; a consented draft stacks exactly the training + provider reasons', () => {
    const html = renderSwap({
      personas: [consentedPersona()],
      initialPersonaId: 'persona-1',
      initialClip: readyVideo,
    });
    expect(html).toContain('Draft — not trained');
    expect(html).toContain('consent recorded');
    expect(html).toContain('data-testid="swap-gate"');
    expect(html).toContain('still a draft');
    expect(html).toContain('PROVIDER_NOT_CONFIGURED');
    expect(html).not.toContain('No consent is recorded');
  });

  it('a consent-less draft adds the consent reason on its own line', () => {
    const html = renderSwap({
      personas: [personaDraft()],
      initialPersonaId: 'persona-1',
      initialClip: readyVideo,
    });
    expect(html).toContain('No consent is recorded for');
    expect(html).toContain('no consent recorded');
  });

  it('a blocked outcome prints each reason separately; the quote refuses a total', () => {
    const outcome = attemptPresenterSwap({
      clip: readyVideo,
      reference: { kind: 'persona', persona: consentedPersona() },
      trainingCompleted: false,
      providerConfigured: false,
    });
    const html = renderSwap({
      personas: [consentedPersona()],
      initialPersonaId: 'persona-1',
      initialClip: readyVideo,
      initialOutcome: outcome,
    });
    expect(html).toContain('data-testid="swap-outcome-blocked"');
    expect(html).toContain('Nothing was charged.');
    expect(html).toContain('data-testid="swap-quote-note"');
    expect(html).toContain('priced per second');
  });

  it('the before/after split renders only from a real completed output for a real source', () => {
    const bare = renderSwap({ initialClip: readyVideo });
    expect(bare).not.toContain('swap-before-after');
    expect(bare).toContain('data-testid="swap-results-empty"');
    const withResult = renderSwap({
      initialClip: readyVideo,
      jobs: [
        job({
          job_id: 'job-swap',
          label: 'Presenter Swap · hook.mp4',
          outputs: [{ id: 'out-1', kind: 'video', url: 'https://signed.example/swapped.mp4', label: 'Swapped clip' }],
        }),
      ],
    });
    expect(withResult).toContain('data-testid="swap-before-after"');
    expect(withResult).toContain('data-testid="swap-before-after-slider"');
    expect(withResult).toContain('https://signed.example/swapped.mp4');
  });
});
