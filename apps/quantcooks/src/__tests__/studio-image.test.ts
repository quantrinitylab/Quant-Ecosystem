// ============================================================================
// QuantCooks Studio (Phase 2 Unit 2) — Image Studio: lib logic + rendering.
// Same approach as Unit 1's tests: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. The upload flow is
// tested at its seam — runReferenceUpload with a mocked uploader (the page
// injects useAssetUpload's mutateAsync) — so the real P0-3 error text
// (STORAGE_NOT_CONFIGURED 503) is proven to reach the user untouched.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, type ComposerSettings } from '../lib/studio/pricing';
import {
  IMAGE_STYLE_PRESETS,
  imageResultsFromJobs,
  pickableImageAssets,
  referenceFromAsset,
  runReferenceUpload,
  stylePresetById,
  uploadPhaseLabel,
  validateReferenceFile,
} from '../lib/studio/image';
import { ImageStudio, type ImageStudioProps } from '../components/studio/ImageStudio';

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

const render = (props: Partial<ImageStudioProps>) =>
  renderToStaticMarkup(
    React.createElement(ImageStudio, {
      assetsState: 'ready',
      assets: [],
      projectId: 'proj-1',
      upload: async () => asset({}),
      ...props,
    }),
  );

// ---------------------------------------------------------------------------
// Lib: style presets + asset picking
// ---------------------------------------------------------------------------

describe('image lib — presets and picking', () => {
  it('ships the four original food style presets from the spec', () => {
    expect(IMAGE_STYLE_PRESETS.map((p) => p.name)).toEqual([
      'Editorial Menu',
      'Rustic Home Kitchen',
      'Bright Café Light',
      'Festival Table Colour',
    ]);
    expect(stylePresetById('bright-cafe-light')?.name).toBe('Bright Café Light');
    expect(stylePresetById('nope')).toBeNull();
    expect(stylePresetById(null)).toBeNull();
  });

  it('pickable assets are READY images only — PENDING rows and videos are excluded', () => {
    const ready = asset({ id: 'a-ready' });
    const pending = asset({ id: 'a-pending', uploadStatus: 'PENDING', url: null });
    const video = asset({ id: 'a-video', type: 'video', filename: 'pour.mp4' });
    expect(pickableImageAssets([ready, pending, video]).map((a) => a.id)).toEqual(['a-ready']);
  });

  it('referenceFromAsset carries assetId, filename and the signed preview URL', () => {
    expect(referenceFromAsset(asset({ id: 'a-9' }))).toEqual({
      assetId: 'a-9',
      filename: 'thali.jpg',
      url: 'https://signed.example/thali.jpg',
    });
  });
});

// ---------------------------------------------------------------------------
// Lib: upload validation + orchestration (mocked uploader)
// ---------------------------------------------------------------------------

describe('image lib — upload flow wiring', () => {
  it('accepts a normal image and rejects non-images, oversize and empty files', () => {
    expect(validateReferenceFile({ name: 'dish.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(validateReferenceFile({ name: 'clip.mp4', type: 'video/mp4', size: 1000 })).toContain('not an image');
    expect(validateReferenceFile({ name: 'huge.tif', type: 'image/tiff', size: 600 * 1024 * 1024 })).toContain('512 MB');
    expect(validateReferenceFile({ name: 'zero.jpg', type: 'image/jpeg', size: 0 })).toContain('empty');
  });

  it('a successful upload resolves to the created asset', async () => {
    const created = asset({ id: 'a-new', filename: 'dosa.jpg' });
    const upload = vi.fn(async () => created);
    const outcome = await runReferenceUpload({ name: 'dosa.jpg', type: 'image/jpeg', size: 10 }, upload);
    expect(outcome).toEqual({ status: 'done', asset: created });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('a storage failure reaches the caller with its REAL message (503 passthrough)', async () => {
    const upload = vi.fn(async () => {
      throw new Error('STORAGE_NOT_CONFIGURED: object storage is not configured on this server');
    });
    const outcome = await runReferenceUpload({ name: 'dosa.jpg', type: 'image/jpeg', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') expect(outcome.message).toContain('STORAGE_NOT_CONFIGURED');
  });

  it('an invalid file never reaches the uploader', async () => {
    const upload = vi.fn(async () => asset({}));
    const outcome = await runReferenceUpload({ name: 'notes.pdf', type: 'application/pdf', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    expect(upload).not.toHaveBeenCalled();
  });

  it('upload phase labels are honest stage text, never a percentage', () => {
    expect(uploadPhaseLabel('working')).toContain('Uploading your photo');
    expect(uploadPhaseLabel('working')).not.toMatch(/%/);
    expect(uploadPhaseLabel('idle')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lib: settings → quote (pricing.ts, whole credits)
// ---------------------------------------------------------------------------

describe('image lib — settings feed the quote', () => {
  const settings = (over: Partial<ComposerSettings>): ComposerSettings => ({
    modelId: 'qc-still-standard',
    ratio: '1:1',
    resolution: 'Standard',
    durationSeconds: 0,
    batch: 1,
    audioOn: false,
    stackedExtras: 0,
    ...over,
  });

  it('base still is 2 credits; batch multiplies; quality re-prices', () => {
    expect(computeQuote('image', settings({})).credits).toBe(2);
    expect(computeQuote('image', settings({ batch: 4 })).credits).toBe(8);
    expect(computeQuote('image', settings({ resolution: 'High' })).credits).toBe(3);
    expect(computeQuote('image', settings({ resolution: 'Draft' })).credits).toBe(1);
    expect(computeQuote('image', settings({ modelId: 'qc-still-detail', resolution: 'High', batch: 2 })).credits).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Lib: results rail only renders real job outputs
// ---------------------------------------------------------------------------

describe('image lib — results from jobs', () => {
  const job = (over: Partial<StudioJob>): StudioJob => ({
    job_id: 'job-1',
    status: 'COMPLETED',
    progress: 100,
    credit_cost: 2,
    outputs: [],
    error: null,
    ...over,
  });

  it('completed jobs contribute their image outputs, nothing else does', () => {
    const done = job({ outputs: [{ id: 'o-1', kind: 'image', url: 'https://signed.example/x.jpg', label: 'Hero still' }] });
    const videoDone = job({ job_id: 'job-2', outputs: [{ id: 'o-2', kind: 'video', url: 'https://signed.example/y.mp4' }] });
    const failed = job({ job_id: 'job-3', status: 'FAILED', error: 'provider down', outputs: [] });
    expect(imageResultsFromJobs([done, videoDone, failed])).toEqual([
      { jobId: 'job-1', outputId: 'o-1', url: 'https://signed.example/x.jpg', label: 'Hero still' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Component: the five mandatory states + grammar
// ---------------------------------------------------------------------------

describe('ImageStudio screen', () => {
  it('not-configured state: Generate disabled, honest reason naming the registered tool, nothing charged', () => {
    const html = render({});
    expect(html).toContain('data-testid="image-studio"');
    expect(html).toContain('data-testid="composer-not-configured"');
    expect(html).toContain('quantcooks.generate_dish_image');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('nothing will be charged');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
    expect(html).not.toContain('data-testid="composer-confirm"');
  });

  it('renders the spec chips: Style preset, Reference, Chef Persona, Brand kit', () => {
    const html = render({});
    expect(html).toContain('data-testid="chip-style"');
    expect(html).toContain('data-testid="chip-reference"');
    expect(html).toContain('data-testid="chip-persona"');
    expect(html).toContain('data-testid="chip-brand-kit"');
    // Image settings row: quality + batch present, duration/audio absent.
    expect(html).toContain('data-testid="composer-resolution"');
    expect(html).toContain('data-testid="composer-batch"');
    expect(html).not.toContain('data-testid="composer-duration"');
    expect(html).not.toContain('data-testid="composer-audio"');
  });

  it('empty state: intro card, starter style tiles in the picker, honest results rail', () => {
    const html = render({ assets: [] });
    expect(html).toContain('data-testid="image-empty-state"');
    expect(html).toContain('Describe the dish shot you need');
    expect(html).toContain('data-testid="image-assets-empty"');
    expect(html).toContain('data-testid="image-results-empty"');
    expect(html).toContain('nothing here is a placeholder image');
    expect(html).toContain('data-testid="jobstrip-empty"');
  });

  it('loading state: skeleton tiles occupy the picker grid', () => {
    const html = render({ assetsState: 'loading' });
    expect(html).toContain('data-testid="image-assets-loading"');
    expect(html).not.toContain('data-testid="image-assets-empty"');
  });

  it('error state: the real assets error shows with a Retry action', () => {
    const html = render({ assetsState: 'error', assetsError: 'Failed to load assets (503)' });
    expect(html).toContain('data-testid="image-assets-error"');
    expect(html).toContain('Failed to load assets (503)');
    expect(html).toContain('Retry');
  });

  it('populated state: real READY photos are pickable, PENDING/video assets are not offered', () => {
    const html = render({
      assets: [
        asset({ id: 'a-ready', filename: 'thali.jpg' }),
        asset({ id: 'a-pending', filename: 'pending.jpg', uploadStatus: 'PENDING', url: null }),
        asset({ id: 'a-video', filename: 'pour.mp4', type: 'video' }),
      ],
    });
    expect(html).toContain('data-testid="image-asset-pick-a-ready"');
    expect(html).toContain('https://signed.example/thali.jpg');
    expect(html).not.toContain('image-asset-pick-a-pending');
    expect(html).not.toContain('pour.mp4');
    expect(html).not.toContain('data-testid="image-empty-state"');
  });

  it('a chosen reference becomes a removable Composer chip and a preview in the input panel', () => {
    const html = render({ initialReferenceAsset: asset({ id: 'a-ref', filename: 'my-dish.jpg' }) });
    expect(html).toContain('data-testid="image-reference-selected"');
    expect(html).toContain('my-dish.jpg');
    expect(html).toContain('Remove reference');
    expect(html).toContain('data-testid="chip-reference"');
  });

  it('a chosen style preset shows on the Style chip', () => {
    const html = render({ initialStylePresetId: 'editorial-menu' });
    expect(html).toContain('Style preset: Editorial Menu');
  });

  it('uploads are honestly unavailable without a project: input disabled, reason on the surface', () => {
    const html = render({ projectId: null, projectName: null, upload: undefined });
    expect(html).toContain('data-testid="image-upload-unavailable"');
    expect(html).toContain('Uploads are saved into a project');
    expect(html).toMatch(/data-testid="image-file-input"[^>]*disabled/);
  });

  it('results rail renders real completed image outputs and failed-job refunds truthfully', () => {
    const jobs: StudioJob[] = [
      {
        job_id: 'job-ok',
        status: 'COMPLETED',
        progress: 100,
        credit_cost: 2,
        outputs: [{ id: 'out-1', kind: 'image', url: 'https://signed.example/still.jpg', label: 'Hero still' }],
        error: null,
        label: 'Image · QC Still',
      },
      {
        job_id: 'job-bad',
        status: 'FAILED',
        progress: null,
        credit_cost: 2,
        outputs: [],
        error: 'Provider timed out',
        label: 'Image · QC Still',
      },
    ];
    const html = render({ jobs });
    expect(html).toContain('data-testid="image-result-out-1"');
    expect(html).toContain('https://signed.example/still.jpg');
    expect(html).not.toContain('data-testid="image-results-empty"');
    expect(html).toContain('Provider timed out');
    expect(html).toContain('Refunded');
  });
});
