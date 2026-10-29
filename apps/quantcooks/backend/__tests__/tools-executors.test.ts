// ============================================================================
// CP-1 — Tier A executors against the real services (§13.7): the registry
// wraps the landed Project/Layer/Asset/Catalogue/AI-text/AutoEdit
// services over the repo fakes — round trips must behave exactly as the
// services' own suites promise, through the invoke pipeline.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createToolsTestRig, expectCode, userCtx, USER, OTHER } from './tools-test-rig';

const fakeAi = {
  infer: async (req: { feature?: string }) => ({
    content:
      req.feature === 'captions'
        ? 'Golden, crispy, straight off the tawa.'
        : 'Biryani Nights\nSteam & Spice\nThe Dum Story',
    model: 'fake',
    provider: 'fake',
  }),
};

describe('projects round trip', () => {
  it('create → get → update → duplicate → list → delete', async () => {
    const rig = createToolsTestRig();
    const created = await rig.registry.invoke(
      'quantcooks.create_project', { name: 'Launch film', type: 'video' }, userCtx(),
    );
    const project = created['project'] as { id: string; name: string };
    expect(project.name).toBe('Launch film');

    const got = await rig.registry.invoke(
      'quantcooks.get_project', { projectId: project.id }, userCtx(),
    );
    expect((got['project'] as { id: string }).id).toBe(project.id);
    expect(got['layers']).toEqual([]);

    const renamed = await rig.registry.invoke(
      'quantcooks.update_project', { projectId: project.id, name: 'Launch film v2' }, userCtx(),
    );
    expect((renamed['project'] as { name: string }).name).toBe('Launch film v2');

    const dup = await rig.registry.invoke(
      'quantcooks.duplicate_project', { projectId: project.id }, userCtx(),
    );
    const dupId = (dup['project'] as { id: string }).id;
    expect(dupId).not.toBe(project.id);

    const list = await rig.registry.invoke('quantcooks.list_projects', {}, userCtx());
    expect((list['projects'] as unknown[]).length).toBe(2);

    await rig.registry.invoke('quantcooks.delete_project', { projectId: dupId }, userCtx());
    const after = await rig.registry.invoke('quantcooks.list_projects', {}, userCtx());
    expect((after['projects'] as unknown[]).length).toBe(1);
  });

  it('update by a non-owner refuses (service-enforced)', async () => {
    const rig = createToolsTestRig();
    const created = await rig.registry.invoke(
      'quantcooks.create_project', { name: 'Mine' }, userCtx(),
    );
    const id = (created['project'] as { id: string }).id;
    await expectCode(
      rig.registry.invoke('quantcooks.update_project', { projectId: id, name: 'Theft' }, userCtx({ actorUserId: OTHER })),
      'NOT_PROJECT_OWNER',
      403,
    );
  });
});

describe('set_timeline (the K8 composite)', () => {
  it('replace semantics: unknown/duplicate ids refuse REORDER_SET_MISMATCH before any write', async () => {
    const rig = createToolsTestRig();
    const created = await rig.registry.invoke(
      'quantcooks.create_project', { name: 'Timeline' }, userCtx(),
    );
    const projectId = (created['project'] as { id: string }).id;

    const set1 = await rig.registry.invoke('quantcooks.set_timeline', {
      projectId,
      layers: [
        { name: 'Base', type: 'video', order: 0 },
        { name: 'Title', type: 'text', order: 1 },
      ],
    }, userCtx());
    const layers = set1['layers'] as { id: string; name: string }[];
    expect(layers.map((l) => l.name)).toEqual(['Base', 'Title']);

    // An id that names no layer of this project refuses, writing nothing.
    await expectCode(
      rig.registry.invoke('quantcooks.set_timeline', {
        projectId,
        layers: [{ id: 'no-such-layer', name: 'Ghost', type: 'video', order: 0 }],
      }, userCtx()),
      'REORDER_SET_MISMATCH',
    );
    // A duplicated id refuses the same way.
    await expectCode(
      rig.registry.invoke('quantcooks.set_timeline', {
        projectId,
        layers: [
          { id: layers[0]!.id, name: 'Base', type: 'video', order: 0 },
          { id: layers[0]!.id, name: 'Base again', type: 'video', order: 1 },
        ],
      }, userCtx()),
      'REORDER_SET_MISMATCH',
    );
    const afterRefusals = await rig.registry.invoke(
      'quantcooks.get_project', { projectId }, userCtx(),
    );
    expect((afterRefusals['layers'] as unknown[]).length).toBe(2);

    // Full set with both ids reorders cleanly.
    const set2 = await rig.registry.invoke('quantcooks.set_timeline', {
      projectId,
      layers: [
        { id: layers[1]!.id, name: 'Title', type: 'text', order: 0 },
        { id: layers[0]!.id, name: 'Base', type: 'video', order: 1 },
      ],
    }, userCtx());
    expect((set2['layers'] as { name: string }[]).map((l) => l.name)).toEqual(['Title', 'Base']);

    // Replace may drop a layer by omission (the unmentioned row is deleted).
    const set3 = await rig.registry.invoke('quantcooks.set_timeline', {
      projectId,
      layers: [{ id: layers[1]!.id, name: 'Title', type: 'text', order: 0 }],
    }, userCtx());
    expect((set3['layers'] as { name: string }[]).map((l) => l.name)).toEqual(['Title']);
  });
});

describe('assets round trip', () => {
  it('upload plan → PENDING asset; download refuses until READY; then signs', async () => {
    const rig = createToolsTestRig();
    const created = await rig.registry.invoke(
      'quantcooks.create_project', { name: 'Assets' }, userCtx(),
    );
    const projectId = (created['project'] as { id: string }).id;

    const planned = await rig.registry.invoke('quantcooks.upload_asset', {
      projectId, filename: 'dish.png', contentType: 'image/png', size: 128,
    }, userCtx());
    const assetId = planned['assetId'] as string;
    expect(typeof planned['uploadUrl']).toBe('string');
    const fetched = await rig.registry.invoke(
      'quantcooks.get_asset', { assetId }, userCtx(),
    );
    expect((fetched['asset'] as { uploadStatus: string }).uploadStatus).toBe('PENDING');

    await expectCode(
      rig.registry.invoke('quantcooks.download_asset', { assetId }, userCtx()),
      'ASSET_NOT_READY',
      409,
    );

    const listed = await rig.registry.invoke(
      'quantcooks.list_assets', { projectId }, userCtx(),
    );
    expect((listed['assets'] as unknown[]).length).toBe(1);

    await rig.registry.invoke('quantcooks.delete_asset', { assetId }, userCtx());
    const after = await rig.registry.invoke(
      'quantcooks.list_assets', { projectId }, userCtx(),
    );
    expect((after['assets'] as unknown[]).length).toBe(0);
  });
});

describe('AI text tools (fake engine)', () => {
  it('suggest_titles returns the engine’s titles, unmetered in CP-1', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const result = await rig.registry.invoke(
      'quantcooks.suggest_titles', { description: 'A dum biryani film' }, userCtx(),
    );
    expect(result['titles']).toEqual(['Biryani Nights', 'Steam & Spice', 'The Dum Story']);
    expect(result['metering']).toBe('not_wired');
  });

  it('generate_captions returns the single caption string', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const result = await rig.registry.invoke(
      'quantcooks.generate_captions', { transcript: 'fry until golden' }, userCtx(),
    );
    expect(result['caption']).toBe('Golden, crispy, straight off the tawa.');
  });
});

describe('catalogue → project composition', () => {
  it('apply_template composes a real project from a real template', async () => {
    const rig = createToolsTestRig();
    const templates = await rig.registry.invoke('quantcooks.list_templates', {}, userCtx());
    const first = (templates['templates'] as { id: string }[])[0];
    expect(first?.id).toBeTruthy();
    const applied = await rig.registry.invoke('quantcooks.apply_template', {
      templateId: first!.id, name: 'From template',
    }, userCtx());
    const project = applied['project'] as { id: string; name: string };
    expect(project.name).toBe('From template');
    const got = await rig.registry.invoke(
      'quantcooks.get_project', { projectId: project.id }, userCtx(),
    );
    expect((got['project'] as { id: string }).id).toBe(project.id);
  });

  it('list_effects / list_presets serve the real catalogue data', async () => {
    const rig = createToolsTestRig();
    const effects = await rig.registry.invoke('quantcooks.list_effects', {}, userCtx());
    expect((effects['effects'] as unknown[]).length).toBeGreaterThan(0);
    const presets = await rig.registry.invoke('quantcooks.list_presets', {}, userCtx());
    expect((presets['presets'] as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('auto-edit preferences + same-day replay', () => {
  it('preferences default to disabled, then round-trip', async () => {
    const rig = createToolsTestRig();
    const before = await rig.registry.invoke(
      'quantcooks.get_auto_edit_preferences', {}, userCtx(),
    );
    expect(before['preference']).toEqual({ enabled: false });
    await rig.registry.invoke('quantcooks.set_auto_edit_preference', {
      enabled: true, caption: 'Daily special',
    }, userCtx());
    const after = await rig.registry.invoke(
      'quantcooks.get_auto_edit_preferences', {}, userCtx(),
    );
    expect((after['preference'] as { enabled: boolean }).enabled).toBe(true);
  });

  it('a completed same-day run replays its job instead of running twice', async () => {
    const rig = createToolsTestRig();
    const day = new Date().toISOString().slice(0, 10);
    const existing = await rig.deps.jobs.createJob({
      userId: USER,
      kind: 'AUTO_EDIT',
      toolName: 'quantcooks.run_auto_edit',
      idempotencyKey: `auto-edit:${USER}:${day}`,
    });
    await rig.deps.jobs.claimJob(existing.id);
    await rig.deps.jobs.completeJob(existing.id, { result: { runId: 'run-1' } });

    const result = await rig.registry.invoke('quantcooks.run_auto_edit', {}, userCtx());
    expect((result['job'] as { id: string }).id).toBe(existing.id);
    expect(rig.jobFake.rows).toHaveLength(1);
  });
});
