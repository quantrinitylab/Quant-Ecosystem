// ============================================================================
// QuantCooks Studio (Phase 2 Unit 3) — Video Studio: lib logic + rendering.
// Same approach as Units 1–2: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. The upload flow
// is tested at its seam — runSourceUpload with a mocked uploader (the page
// injects useAssetUpload's mutateAsync) — so the real P0-3 error text
// (STORAGE_NOT_CONFIGURED 503) is proven to reach the user untouched.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type { ServerAsset, ServerProject } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, type ComposerSettings } from '../lib/studio/pricing';
import {
  CAMERA_MOVES,
  INCOMPATIBLE_PAIRS,
  MAX_CAMERA_STACK,
  VIDEO_STARTERS,
  cameraMoveById,
  incompatibilityBetween,
  moveCameraMove,
  pickableFrameAssets,
  pickableVideoAssets,
  removeCameraMove,
  runSourceUpload,
  sourceFromAsset,
  sourceUploadPhaseLabel,
  stackLabel,
  tryAddCameraMove,
  validateSourceFile,
  videoQuote,
  videoQuoteSettings,
  videoResultsFromJobs,
  videoToolForMode,
} from '../lib/studio/video';
import { VideoStudio, type VideoStudioProps } from '../components/studio/VideoStudio';
import { MotionControl, type MotionControlProps } from '../components/studio/MotionControl';

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'pour.mp4',
  type: 'video',
  size: 4096,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/pour.mp4',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/pour.mp4',
  ...over,
});

const project = (over: Partial<ServerProject>): ServerProject => ({
  id: 'proj-1',
  userId: 'user-1',
  name: 'Diwali menu film',
  type: 'video',
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const render = (props: Partial<VideoStudioProps>) =>
  renderToStaticMarkup(
    React.createElement(VideoStudio, {
      assetsState: 'ready',
      assets: [],
      projectsState: 'ready',
      projects: [],
      projectId: 'proj-1',
      upload: async () => asset({}),
      ...props,
    }),
  );

const renderMotion = (props: Partial<MotionControlProps>) =>
  renderToStaticMarkup(
    React.createElement(MotionControl, {
      stack: [],
      onAdd: () => {},
      onRemove: () => {},
      onMove: () => {},
      ...props,
    }),
  );

// ---------------------------------------------------------------------------
// Lib: the camera move library (spec §3.3 — original food vocabulary)
// ---------------------------------------------------------------------------

describe('video lib — camera move library', () => {
  it('ships exactly the twelve spec moves, with the original names', () => {
    expect(CAMERA_MOVES.map((m) => m.name)).toEqual([
      'Plate Push-In',
      'Cheese-Pull Crash Zoom',
      'Cake Orbit',
      'Thali Top-Down Drop',
      'Pack Spin',
      'Buffet Fly-Over',
      'Rise & Bake Timelapse',
      'Home-Kitchen Handheld',
      'Flat-Lay Lock',
      'Spread Reveal Pullback',
      'Counter Whip',
      'Sizzle Vertigo',
    ]);
    expect(cameraMoveById('cake-orbit')?.family).toBe('Around the Dish');
    expect(cameraMoveById('thali-top-down-drop')?.bestFor).toContain('Spread/Thali');
    expect(cameraMoveById('nope')).toBeNull();
    expect(cameraMoveById(null)).toBeNull();
  });

  it('every move names its family and at least one best-for food context', () => {
    for (const move of CAMERA_MOVES) {
      expect(move.family.length).toBeGreaterThan(0);
      expect(move.bestFor.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Lib: stacking (≤3, incompatibility blocking, reorder/remove)
// ---------------------------------------------------------------------------

describe('video lib — camera stack rules', () => {
  it('adds moves up to the cap of 3, in order', () => {
    let stack: string[] = [];
    for (const id of ['plate-push-in', 'cake-orbit', 'counter-whip']) {
      const result = tryAddCameraMove(stack, id);
      expect(result.ok).toBe(true);
      if (result.ok) stack = result.stack;
    }
    expect(stack).toEqual(['plate-push-in', 'cake-orbit', 'counter-whip']);
    expect(MAX_CAMERA_STACK).toBe(3);
  });

  it('a fourth move is blocked as full — the stack comes back unchanged, never swapped', () => {
    const stack = ['plate-push-in', 'cake-orbit', 'counter-whip'];
    const result = tryAddCameraMove(stack, 'pack-spin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('full');
      expect(result.message).toContain('at most 3 moves');
      expect(result.stack).toEqual(stack);
    }
  });

  it('a duplicate add is blocked with its reason', () => {
    const result = tryAddCameraMove(['cake-orbit'], 'cake-orbit');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('duplicate');
      expect(result.message).toContain('already in your stack');
    }
  });

  it('incompatible pairs block inline with a reason naming the conflict (spec example included)', () => {
    // The spec's own example pair.
    expect(incompatibilityBetween('flat-lay-lock', 'buffet-fly-over')).toContain('Flat-Lay Lock');
    expect(incompatibilityBetween('buffet-fly-over', 'flat-lay-lock')).toBe(
      incompatibilityBetween('flat-lay-lock', 'buffet-fly-over'),
    );
    expect(incompatibilityBetween('cake-orbit', 'plate-push-in')).toBeNull();

    const result = tryAddCameraMove(['flat-lay-lock'], 'buffet-fly-over');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('incompatible');
      expect(result.conflictsWith).toBe('Flat-Lay Lock');
      expect(result.stack).toEqual(['flat-lay-lock']);
    }
    // Every declared pair references real moves, in both directions.
    for (const pair of INCOMPATIBLE_PAIRS) {
      expect(cameraMoveById(pair.a)).not.toBeNull();
      expect(cameraMoveById(pair.b)).not.toBeNull();
      expect(incompatibilityBetween(pair.b, pair.a)).toBe(pair.reason);
    }
  });

  it('reorder swaps neighbours and is a no-op at the edges; remove trims the stack', () => {
    const stack = ['plate-push-in', 'cake-orbit', 'counter-whip'];
    expect(moveCameraMove(stack, 'cake-orbit', -1)).toEqual(['cake-orbit', 'plate-push-in', 'counter-whip']);
    expect(moveCameraMove(stack, 'cake-orbit', 1)).toEqual(['plate-push-in', 'counter-whip', 'cake-orbit']);
    expect(moveCameraMove(stack, 'plate-push-in', -1)).toEqual(stack);
    expect(moveCameraMove(stack, 'counter-whip', 1)).toEqual(stack);
    expect(moveCameraMove(stack, 'missing', 1)).toEqual(stack);
    expect(removeCameraMove(stack, 'cake-orbit')).toEqual(['plate-push-in', 'counter-whip']);
  });

  it('stackLabel reads like the spec chip: names joined, with the move count', () => {
    expect(stackLabel([])).toBeNull();
    expect(stackLabel(['plate-push-in'])).toBe('Plate Push-In · 1 move');
    expect(stackLabel(['plate-push-in', 'cake-orbit'])).toBe('Plate Push-In + Cake Orbit · 2 moves');
  });
});

// ---------------------------------------------------------------------------
// Lib: settings + stack → quote (pricing.ts stacked-extras term)
// ---------------------------------------------------------------------------

describe('video lib — the stack feeds the quote', () => {
  const settings = (over: Partial<ComposerSettings>): ComposerSettings => ({
    modelId: 'qc-motion-standard',
    ratio: '9:16',
    resolution: '720p',
    durationSeconds: 5,
    batch: 1,
    audioOn: true,
    stackedExtras: 0,
    ...over,
  });

  it('base video run is 8 credits; each stacked move adds the table’s 2-credit extra', () => {
    expect(videoQuote(settings({}), []).credits).toBe(8);
    expect(videoQuote(settings({}), ['plate-push-in']).credits).toBe(10);
    expect(videoQuote(settings({}), ['plate-push-in', 'cake-orbit']).credits).toBe(12);
    expect(videoQuote(settings({}), ['plate-push-in', 'cake-orbit', 'counter-whip']).credits).toBe(14);
  });

  it('videoQuote is exactly computeQuote with stackedExtras composed in — no parallel pricing', () => {
    const stack = ['cake-orbit', 'pack-spin'];
    expect(videoQuoteSettings(settings({ durationSeconds: 10 }), stack)).toEqual({
      ...settings({ durationSeconds: 10 }),
      stackedExtras: 2,
    });
    expect(videoQuote(settings({ durationSeconds: 10 }), stack)).toEqual(
      computeQuote('video', settings({ durationSeconds: 10, stackedExtras: 2 })),
    );
    // 8 base + 5 extra seconds × 1 + 2 moves × 2 = 17.
    expect(videoQuote(settings({ durationSeconds: 10 }), stack).credits).toBe(17);
    // Resolution multiplies the run before extras land: round(8 × 1.5) + 2 = 14.
    expect(videoQuote(settings({ resolution: '1080p' }), ['cake-orbit']).credits).toBe(14);
  });

  it('the mode picks its registered tool twin', () => {
    expect(videoToolForMode('text')).toBe('quantcooks.generate_video_from_text');
    expect(videoToolForMode('image')).toBe('quantcooks.animate_image');
  });
});

// ---------------------------------------------------------------------------
// Lib: source picking (READY only) + upload seam
// ---------------------------------------------------------------------------

describe('video lib — source picking and upload', () => {
  it('pickable clips are READY videos only; pickable frames are READY images only', () => {
    const readyClip = asset({ id: 'v-ready' });
    const pendingClip = asset({ id: 'v-pending', uploadStatus: 'PENDING', url: null });
    const readyFrame = asset({ id: 'i-ready', type: 'image', filename: 'dish.jpg', url: 'https://signed.example/dish.jpg' });
    const pendingFrame = asset({ id: 'i-pending', type: 'image', uploadStatus: 'PENDING', url: null });
    const all = [readyClip, pendingClip, readyFrame, pendingFrame];
    expect(pickableVideoAssets(all).map((a) => a.id)).toEqual(['v-ready']);
    expect(pickableFrameAssets(all).map((a) => a.id)).toEqual(['i-ready']);
    expect(sourceFromAsset(readyFrame)).toEqual({
      assetId: 'i-ready',
      filename: 'dish.jpg',
      kind: 'image',
      url: 'https://signed.example/dish.jpg',
    });
  });

  it('accepts clips and photos; rejects documents, oversize and empty files', () => {
    expect(validateSourceFile({ name: 'pour.mp4', type: 'video/mp4', size: 1000 })).toBeNull();
    expect(validateSourceFile({ name: 'dish.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateSourceFile({ name: 'notes.pdf', type: 'application/pdf', size: 1000 })).toContain('not a clip or a photo');
    expect(validateSourceFile({ name: 'huge.mov', type: 'video/quicktime', size: 600 * 1024 * 1024 })).toContain('512 MB');
    expect(validateSourceFile({ name: 'zero.mp4', type: 'video/mp4', size: 0 })).toContain('empty');
  });

  it('a successful upload resolves to the created asset', async () => {
    const created = asset({ id: 'a-new', filename: 'sizzle.mp4' });
    const upload = vi.fn(async () => created);
    const outcome = await runSourceUpload({ name: 'sizzle.mp4', type: 'video/mp4', size: 10 }, upload);
    expect(outcome).toEqual({ status: 'done', asset: created });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('a storage failure reaches the caller with its REAL message (503 passthrough)', async () => {
    const upload = vi.fn(async () => {
      throw new Error('STORAGE_NOT_CONFIGURED: object storage is not configured on this server');
    });
    const outcome = await runSourceUpload({ name: 'sizzle.mp4', type: 'video/mp4', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') expect(outcome.message).toContain('STORAGE_NOT_CONFIGURED');
  });

  it('an invalid file never reaches the uploader; phase labels never invent a percentage', async () => {
    const upload = vi.fn(async () => asset({}));
    const outcome = await runSourceUpload({ name: 'recipe.pdf', type: 'application/pdf', size: 10 }, upload);
    expect(outcome.status).toBe('error');
    expect(upload).not.toHaveBeenCalled();
    expect(sourceUploadPhaseLabel('working')).toContain('Uploading your file');
    expect(sourceUploadPhaseLabel('working')).not.toMatch(/%/);
    expect(sourceUploadPhaseLabel('idle')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lib: results rail only renders real job outputs
// ---------------------------------------------------------------------------

describe('video lib — results from jobs', () => {
  const job = (over: Partial<StudioJob>): StudioJob => ({
    job_id: 'job-1',
    status: 'COMPLETED',
    progress: 100,
    credit_cost: 12,
    outputs: [],
    error: null,
    ...over,
  });

  it('completed jobs contribute their video outputs, nothing else does', () => {
    const done = job({ outputs: [{ id: 'o-1', kind: 'video', url: 'https://signed.example/clip.mp4', label: 'Hero clip' }] });
    const imageDone = job({ job_id: 'job-2', outputs: [{ id: 'o-2', kind: 'image', url: 'https://signed.example/x.jpg' }] });
    const processing = job({ job_id: 'job-3', status: 'PROCESSING', progress: null, outputs: [{ id: 'o-3', kind: 'video', url: null }] });
    expect(videoResultsFromJobs([done, imageDone, processing])).toEqual([
      { jobId: 'job-1', outputId: 'o-1', url: 'https://signed.example/clip.mp4', label: 'Hero clip' },
    ]);
  });

  it('the starters lead with animating a photo, per the Hero Frame on-ramp', () => {
    expect(VIDEO_STARTERS[0]?.id).toBe('animate-photo');
    expect(VIDEO_STARTERS[0]?.mode).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// Component: Motion Control stack builder
// ---------------------------------------------------------------------------

describe('MotionControl surface', () => {
  it('renders the library grouped by family, all twelve moves addable', () => {
    const html = renderMotion({});
    expect(html).toContain('data-testid="motion-control"');
    expect(html).toContain('data-testid="motion-family-Around the Dish"');
    expect(html).toContain('data-testid="motion-family-Overhead &amp; Crane"');
    for (const move of CAMERA_MOVES) {
      expect(html).toContain(`data-testid="motion-add-${move.id}"`);
    }
    expect(html).toContain('data-testid="motion-stack-empty"');
    expect(html).toContain('0 of 3 moves');
  });

  it('the stack renders in order with reorder/remove controls and the price impact stated', () => {
    const html = renderMotion({ stack: ['cake-orbit', 'plate-push-in'] });
    expect(html).toContain('data-testid="motion-stack-item-cake-orbit"');
    expect(html).toContain('1. Cake Orbit');
    expect(html).toContain('2. Plate Push-In');
    expect(html).toContain('data-testid="motion-move-down-cake-orbit"');
    expect(html).toContain('data-testid="motion-remove-plate-push-in"');
    expect(html).toContain('+4 credits on the run');
    // A stacked move cannot be added twice from the library.
    expect(html).toMatch(/data-testid="motion-add-cake-orbit"[^>]*disabled/);
  });

  it('a blocked add’s reason is printed inline where it happened', () => {
    const html = renderMotion({
      stack: ['flat-lay-lock'],
      notice: 'Flat-Lay Lock holds the frame perfectly still overhead; Buffet Fly-Over swoops along the spread — the frame cannot do both.',
    });
    expect(html).toContain('data-testid="motion-stack-notice"');
    expect(html).toContain('the frame cannot do both');
  });
});

// ---------------------------------------------------------------------------
// Component: Video Studio — tabs, grammar, five states
// ---------------------------------------------------------------------------

describe('VideoStudio screen', () => {
  it('renders the three workspace tabs with Create active by default', () => {
    const html = render({});
    expect(html).toContain('data-testid="video-studio"');
    expect(html).toContain('data-testid="video-tab-create"');
    expect(html).toContain('data-testid="video-tab-edit"');
    expect(html).toContain('data-testid="video-tab-motion"');
    expect(html).toContain('data-testid="video-create-panel"');
  });

  it('not-configured state: Generate disabled, reason names the text tool twin, nothing charged', () => {
    const html = render({});
    expect(html).toContain('data-testid="composer-not-configured"');
    expect(html).toContain('quantcooks.generate_video_from_text');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('nothing will be charged');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
    expect(html).not.toContain('data-testid="composer-confirm"');
  });

  it('image mode names the animate_image twin and shows the frame slots', () => {
    const html = render({
      initialMode: 'image',
      initialStartFrameAsset: asset({ id: 'i-1', type: 'image', filename: 'hero-dish.jpg', url: 'https://signed.example/hero.jpg' }),
    });
    expect(html).toContain('quantcooks.animate_image');
    expect(html).toContain('data-testid="video-startframe-selected"');
    expect(html).toContain('hero-dish.jpg');
    expect(html).toContain('data-testid="video-endframe-slot"');
    expect(html).toContain('data-testid="chip-start-frame"');
  });

  it('renders the spec chips and the video settings row (duration + audio, no batch)', () => {
    const html = render({});
    expect(html).toContain('data-testid="chip-camera"');
    expect(html).toContain('data-testid="chip-effects"');
    expect(html).toContain('data-testid="chip-persona"');
    expect(html).toContain('data-testid="composer-duration"');
    expect(html).toContain('data-testid="composer-audio"');
    expect(html).toContain('data-testid="composer-resolution"');
    expect(html).not.toContain('data-testid="composer-batch"');
  });

  it('the Camera chip summarises the stack in run order', () => {
    const html = render({ initialCameraStack: ['plate-push-in', 'cake-orbit'] });
    expect(html).toContain('Camera move: Plate Push-In + Cake Orbit · 2 moves');
  });

  it('empty state: starter cards lead, media picker and results rail are honestly empty', () => {
    const html = render({ assets: [] });
    expect(html).toContain('data-testid="video-empty-state"');
    expect(html).toContain('data-testid="video-starter-animate-photo"');
    expect(html).toContain('data-testid="video-assets-empty"');
    expect(html).toContain('data-testid="video-results-empty"');
    expect(html).toContain('Generation jobs do not exist yet');
    expect(html).toContain('data-testid="jobstrip-empty"');
  });

  it('loading state: skeleton tiles occupy the media picker', () => {
    const html = render({ assetsState: 'loading' });
    expect(html).toContain('data-testid="video-assets-loading"');
    expect(html).not.toContain('data-testid="video-assets-empty"');
  });

  it('error state: the real assets error shows with a Retry action', () => {
    const html = render({ assetsState: 'error', assetsError: 'Failed to load assets (503)' });
    expect(html).toContain('data-testid="video-assets-error"');
    expect(html).toContain('Failed to load assets (503)');
    expect(html).toContain('Retry');
  });

  it('populated state: READY frames and clips are pickable, PENDING media is not offered', () => {
    const html = render({
      assets: [
        asset({ id: 'v-ready', filename: 'pour.mp4' }),
        asset({ id: 'v-pending', filename: 'pending.mp4', uploadStatus: 'PENDING', url: null }),
        asset({ id: 'i-ready', filename: 'dish.jpg', type: 'image', url: 'https://signed.example/dish.jpg' }),
      ],
    });
    expect(html).toContain('data-testid="video-clip-pick-v-ready"');
    expect(html).toContain('data-testid="video-frame-pick-i-ready"');
    expect(html).not.toContain('video-clip-pick-v-pending');
    expect(html).not.toContain('pending.mp4');
  });

  it('uploads are honestly unavailable without a project: input disabled, reason on the surface', () => {
    const html = render({ projectId: null, projectName: null, upload: undefined });
    expect(html).toContain('data-testid="video-upload-unavailable"');
    expect(html).toContain('Uploads are saved into a project');
    expect(html).toMatch(/data-testid="video-file-input"[^>]*disabled/);
  });

  it('results rail renders real completed video outputs and failed-job refunds truthfully', () => {
    const jobs: StudioJob[] = [
      {
        job_id: 'job-ok',
        status: 'COMPLETED',
        progress: 100,
        credit_cost: 12,
        outputs: [{ id: 'out-1', kind: 'video', url: 'https://signed.example/clip.mp4', label: 'Hero clip' }],
        error: null,
        label: 'Video · QC Motion',
      },
      {
        job_id: 'job-bad',
        status: 'FAILED',
        progress: null,
        credit_cost: 12,
        outputs: [],
        error: 'Provider timed out',
        label: 'Video · QC Motion',
      },
    ];
    const html = render({ jobs });
    expect(html).toContain('data-testid="video-result-out-1"');
    expect(html).toContain('https://signed.example/clip.mp4');
    expect(html).not.toContain('data-testid="video-results-empty"');
    expect(html).toContain('Provider timed out');
    expect(html).toContain('Refunded');
  });

  it('Edit tab lists the caller’s real projects with the gallery as the editor’s front door', () => {
    const html = render({
      initialTab: 'edit',
      projects: [project({ id: 'proj-9', name: 'Thali launch reel' })],
    });
    expect(html).toContain('data-testid="video-edit-panel"');
    expect(html).toContain('data-testid="video-project-proj-9"');
    expect(html).toContain('Thali launch reel');
    expect(html).toContain('href="/projects"');
    expect(html).toContain('timeline editor');
  });

  it('Edit tab states: loading skeletons, error with retry, and an honest empty state', () => {
    expect(render({ initialTab: 'edit', projectsState: 'loading' })).toContain('data-testid="video-projects-loading"');
    const err = render({ initialTab: 'edit', projectsState: 'error', projectsError: 'Failed to load projects (500)' });
    expect(err).toContain('data-testid="video-projects-error"');
    expect(err).toContain('Failed to load projects (500)');
    const empty = render({ initialTab: 'edit', projects: [] });
    expect(empty).toContain('data-testid="video-projects-empty"');
  });

  it('Motion Control tab renders the stack builder as its own surface', () => {
    const html = render({ initialTab: 'motion', initialCameraStack: ['sizzle-vertigo'] });
    expect(html).toContain('data-testid="video-motion-panel"');
    expect(html).toContain('data-testid="motion-control"');
    expect(html).toContain('data-testid="motion-stack-item-sizzle-vertigo"');
    expect(html).toContain('quantcooks.list_camera_presets');
  });
});
