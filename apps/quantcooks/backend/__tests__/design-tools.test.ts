// ============================================================================
// Design twins at the registry surface (C-7 step 4) — the CP-1 amendment
// pins: both tools registered Tier A / async / permissionTier 2 with
// dynamic availability (FIGCRAFT_NOT_CONFIGURED while the binary is
// absent), fail-closed invokes create NO job row, and with a companion
// runner present the invokes queue real DESIGN jobs on EditJob.
// inspect_design_code stays UNREGISTERED (step-5 quality gate).
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToolsTestRig, expectCode, userCtx, USER } from './tools-test-rig';
import { NodeFigCraftRunner } from '../services/figcraft.adapter';

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-figcraft-cli.mjs',
);

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

describe('design twins: registration + availability', () => {
  it('both tools are registered Tier A / async / permissionTier 2 in group design', () => {
    const rig = createToolsTestRig();
    for (const name of ['quantcooks.create_design', 'quantcooks.export_design']) {
      const def = rig.registry.get(name);
      expect([def.tier, def.mode, def.permissionTier, def.group], name).toEqual([
        'A',
        'async',
        2,
        'design',
      ]);
    }
  });

  it('inspect_design_code is NOT registered (waits for the step-5 quality gate)', () => {
    const rig = createToolsTestRig();
    expect(rig.registry.has('quantcooks.inspect_design_code')).toBe(false);
  });

  it('with the binary absent both report not_configured / FIGCRAFT_NOT_CONFIGURED', () => {
    const rig = createToolsTestRig();
    const byName = new Map(rig.registry.summaries().map((s) => [s.name, s]));
    for (const name of ['quantcooks.create_design', 'quantcooks.export_design']) {
      expect(byName.get(name)?.availability, name).toBe('not_configured');
      expect(byName.get(name)?.notConfiguredReason, name).toBe('FIGCRAFT_NOT_CONFIGURED');
    }
  });

  it('with a runner present both report available', () => {
    const rig = createToolsTestRig({ figcraftRunner: new NodeFigCraftRunner(FIXTURE_BIN) });
    const byName = new Map(rig.registry.summaries().map((s) => [s.name, s]));
    for (const name of ['quantcooks.create_design', 'quantcooks.export_design']) {
      expect(byName.get(name)?.availability, name).toBe('available');
    }
  });
});

describe('design twins: fail-closed invokes (binary absent)', () => {
  it('create_design -> FIGCRAFT_NOT_CONFIGURED 503, no job row', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke(
        'quantcooks.create_design',
        { projectId: 'p1', template: 'mobile-app' },
        userCtx(),
      ),
      'FIGCRAFT_NOT_CONFIGURED',
      503,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });

  it('export_design -> FIGCRAFT_NOT_CONFIGURED 503, no job row', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke(
        'quantcooks.export_design',
        { sourceAssetId: 'a1', format: 'png' },
        userCtx(),
      ),
      'FIGCRAFT_NOT_CONFIGURED',
      503,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
  });
});

describe('design twins: live invokes (fixture runner present)', () => {
  it('create_design queues a DESIGN job and returns the not_wired envelope', async () => {
    const rig = createToolsTestRig({ figcraftRunner: new NodeFigCraftRunner(FIXTURE_BIN) });
    const project = await rig.projectFake.editProject.create({
      data: { userId: USER, name: 'Dish Project', type: 'video' },
    });

    const result = await rig.registry.invoke(
      'quantcooks.create_design',
      { projectId: project.id, template: 'mobile-app', name: 'Dish App' },
      userCtx(),
    );
    expect(result['job_id']).toBeTruthy();
    expect(result['status']).toBe('QUEUED');
    expect(result['credit_cost']).toBe(0);
    expect(result['metering']).toBe('not_wired');
    expect(rig.jobFake.rows).toHaveLength(1);
    expect(rig.jobFake.rows[0]!.kind).toBe('DESIGN');
    expect(rig.jobFake.rows[0]!.toolName).toBe('quantcooks.create_design');

    // The queued job is readable through the registry's own job surface.
    const status = await rig.registry.invoke(
      'quantcooks.get_job_status',
      { jobId: result['job_id'] },
      userCtx(),
    );
    expect(status['job']).toMatchObject({ kind: 'DESIGN', status: 'QUEUED' });
  });

  it('export_design queues against a READY design asset; bad template refuses inside create', async () => {
    const rig = createToolsTestRig({ figcraftRunner: new NodeFigCraftRunner(FIXTURE_BIN) });
    const project = await rig.projectFake.editProject.create({
      data: { userId: USER, name: 'Dish Project', type: 'video' },
    });
    const source = await rig.assetFake.editAsset.create({
      data: {
        projectId: project.id, userId: USER, filename: 'menu.figcraft', type: 'application',
        size: 10, url: 'quantcooks/user-1/p/menu.figcraft',
        metadata: {
          storageKey: 'quantcooks/user-1/p/menu.figcraft',
          contentType: 'application/x-figcraft',
          uploadStatus: 'READY',
        },
      },
    });

    const result = await rig.registry.invoke(
      'quantcooks.export_design',
      { sourceAssetId: source.id, format: 'png' },
      userCtx(),
    );
    expect(result['status']).toBe('QUEUED');
    expect(result['source_asset_id']).toBe(source.id);
    expect(rig.jobFake.rows).toHaveLength(1);
    expect(rig.jobFake.rows[0]!.toolName).toBe('quantcooks.export_design');

    // Schema-level guard: an unlisted template never reaches the service.
    await expect(
      rig.registry.invoke(
        'quantcooks.create_design',
        { projectId: project.id, template: 'bogus' },
        userCtx(),
      ),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(rig.jobFake.rows).toHaveLength(1);
  });
});
