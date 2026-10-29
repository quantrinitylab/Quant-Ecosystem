// ============================================================================
// CP-1 — fail-closed discipline (§13.6): one test per §8 NOT_CONFIGURED
// row reachable in CP-1. Every refusal is the spec's named error, no job
// row is created by a refused invoke, and no output is ever fabricated.
// Consent gates fire BEFORE configuration (the §4/§8 structural order).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createToolsTestRig, expectCode, userCtx, USER, OTHER } from './tools-test-rig';

const CONSENT = { ownVoice: true, confirmedAt: '2026-10-29T00:00:00.000Z' };

describe('storage unconfigured', () => {
  it('upload_asset → STORAGE_NOT_CONFIGURED 503', async () => {
    const rig = createToolsTestRig({ storage: null });
    await expectCode(
      rig.registry.invoke('quantcooks.upload_asset', {
        projectId: 'p1', filename: 'dish.png', contentType: 'image/png', size: 100,
      }, userCtx()),
      'STORAGE_NOT_CONFIGURED',
      503,
    );
  });

  it('download_asset → STORAGE_NOT_CONFIGURED 503', async () => {
    const rig = createToolsTestRig({ storage: null });
    const asset = await rig.assetFake.editAsset.create({
      data: {
        projectId: 'p1', userId: USER, filename: 'dish.png', type: 'image', size: 10,
        url: 'quantcooks/user-1/p1/a/dish.png',
        metadata: { storageKey: 'quantcooks/user-1/p1/a/dish.png', uploadStatus: 'READY' },
      },
    });
    await expectCode(
      rig.registry.invoke('quantcooks.download_asset', { assetId: asset.id }, userCtx()),
      'STORAGE_NOT_CONFIGURED',
      503,
    );
  });
});

describe('credits unwired (CP-2)', () => {
  it('get_credit_balance → CREDITS_NOT_CONFIGURED 503', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.get_credit_balance', {}, userCtx()),
      'CREDITS_NOT_CONFIGURED',
      503,
    );
  });

  it('list_credit_history → CREDITS_NOT_CONFIGURED 503', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.list_credit_history', {}, userCtx()),
      'CREDITS_NOT_CONFIGURED',
      503,
    );
  });

  it('get_credit_quote still composes quotes (composition needs no ledger)', async () => {
    const rig = createToolsTestRig();
    const result = await rig.registry.invoke('quantcooks.get_credit_quote', {
      tool: 'quantcooks.suggest_titles', params: { description: 'x' },
    }, userCtx());
    expect(result['credits']).toBe(1);
    expect(result['tool']).toBe('quantcooks.suggest_titles');
  });
});

describe('Tier B executors refuse with their named errors, creating nothing', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['quantcooks.generate_dish_image', { prompt: 'a thali' }, 'PROVIDER_NOT_CONFIGURED'],
    ['quantcooks.generate_video_from_text', { prompt: 'steam rises' }, 'PROVIDER_NOT_CONFIGURED'],
    ['quantcooks.list_models', {}, 'PROVIDER_NOT_CONFIGURED'],
    ['quantcooks.list_camera_presets', {}, 'PRESETS_NOT_CONFIGURED'],
    ['quantcooks.plan_project', { brief: 'launch film' }, 'PLANNER_NOT_CONFIGURED'],
    ['quantcooks.run_pipeline', { inputs: {} }, 'PIPELINE_NOT_CONFIGURED'],
    ['quantcooks.create_chef_persona', { name: 'Chef', referenceAssetIds: ['asset_1'], consent: { ownLikeness: true, confirmedAt: CONSENT.confirmedAt } }, 'TRAINING_NOT_CONFIGURED'],
    ['quantcooks.dub_video', { videoAssetId: 'a1', targetLanguage: 'hi' }, 'PROVIDER_NOT_CONFIGURED'],
  ];

  for (const [name, params, code] of cases) {
    it(`${name} → ${code}, no job row`, async () => {
      const rig = createToolsTestRig();
      await expectCode(rig.registry.invoke(name, params, userCtx()), code, 503);
      expect(rig.jobFake.rows).toHaveLength(0);
    });
  }
});

describe('consent before configuration (§4/§8)', () => {
  it('clone_voice without consent → CONSENT_REQUIRED 400 (not the NOT_CONFIGURED code)', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.clone_voice', {
        name: 'v', sampleAssetIds: ['a1'], consent: { ownVoice: false, confirmedAt: CONSENT.confirmedAt },
      }, userCtx()),
      'CONSENT_REQUIRED',
      400,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });

  it('clone_voice with consent → VOICE_TRAINING_NOT_CONFIGURED 503', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.clone_voice', {
        name: 'v', sampleAssetIds: ['a1'], consent: CONSENT,
      }, userCtx()),
      'VOICE_TRAINING_NOT_CONFIGURED',
      503,
    );
  });

  it('create_chef_persona without consent → CONSENT_REQUIRED 400', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.create_chef_persona', {
        name: 'Chef', referenceAssetIds: ['asset_1'],
        consent: { ownLikeness: false, confirmedAt: CONSENT.confirmedAt },
      }, userCtx()),
      'CONSENT_REQUIRED',
      400,
    );
  });
});

describe('score_hook validation precedes configuration (§4.1)', () => {
  async function seedVideo(
    rig: ReturnType<typeof createToolsTestRig>,
    overrides: Record<string, unknown> = {},
    metadata: Record<string, unknown> = {},
  ) {
    return rig.assetFake.editAsset.create({
      data: {
        projectId: 'p1', userId: USER, filename: 'clip.mp4', type: 'video', size: 10,
        url: 'quantcooks/user-1/p1/a/clip.mp4',
        metadata: { storageKey: 'quantcooks/user-1/p1/a/clip.mp4', uploadStatus: 'READY', ...metadata },
        ...overrides,
      },
    });
  }

  it('another user’s clip → 404 before anything else', async () => {
    const rig = createToolsTestRig();
    const asset = await seedVideo(rig, { userId: OTHER });
    await expectCode(
      rig.registry.invoke('quantcooks.score_hook', { videoAssetId: asset.id }, userCtx()),
      'ASSET_NOT_FOUND',
      404,
    );
  });

  it('non-video asset → SOURCE_NOT_VIDEO 400', async () => {
    const rig = createToolsTestRig();
    const asset = await seedVideo(rig, { type: 'image', filename: 'still.png' });
    await expectCode(
      rig.registry.invoke('quantcooks.score_hook', { videoAssetId: asset.id }, userCtx()),
      'SOURCE_NOT_VIDEO',
      400,
    );
  });

  it('PENDING video → ASSET_NOT_READY 400', async () => {
    const rig = createToolsTestRig();
    const asset = await seedVideo(rig, {}, { uploadStatus: 'PENDING' });
    await expectCode(
      rig.registry.invoke('quantcooks.score_hook', { videoAssetId: asset.id }, userCtx()),
      'ASSET_NOT_READY',
      400,
    );
  });

  it('READY video over 15s → CLIP_TOO_LONG_FOR_ANALYSIS 400 (pre-spend, pre-configuration)', async () => {
    const rig = createToolsTestRig();
    const asset = await seedVideo(rig, {}, { duration: 30 });
    await expectCode(
      rig.registry.invoke('quantcooks.score_hook', { videoAssetId: asset.id }, userCtx()),
      'CLIP_TOO_LONG_FOR_ANALYSIS',
      400,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });

  it('READY video within 15s → ANALYSIS_NOT_CONFIGURED 503 (no invented score)', async () => {
    const rig = createToolsTestRig();
    const asset = await seedVideo(rig, {}, { duration: 10 });
    await expectCode(
      rig.registry.invoke('quantcooks.score_hook', { videoAssetId: asset.id }, userCtx()),
      'ANALYSIS_NOT_CONFIGURED',
      503,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });
});

describe('the ratified twins with binaries absent', () => {
  it('render_effects → CRAFT_NOT_CONFIGURED 503, no job row', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.render_effects', { projectId: 'p1', ecproj: { compositions: [] } }, userCtx()),
      'CRAFT_NOT_CONFIGURED',
      503,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });

  it('edit_photo → PHOTO_NOT_CONFIGURED 503, no job row', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.edit_photo', {
        sourceAssetId: 'a1', operations: [{ id: 'image.imageSize', params: { width: 10, height: 10 } }],
      }, userCtx()),
      'PHOTO_NOT_CONFIGURED',
      503,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });
});
