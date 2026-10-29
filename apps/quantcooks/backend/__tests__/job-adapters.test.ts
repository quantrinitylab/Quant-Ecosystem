// ============================================================================
// CP-1 — the EditJob fold-in (§13.2): the three landed job services run
// their FULL lifecycles over the unified EditJob table through the
// per-kind delegate adapters, with their public shapes unchanged, and
// jobs are cross-visible between the legacy surfaces and the unified
// JobService. Fakes WITHOUT an editJob delegate pass through untouched
// (which is why every pre-CP-1 suite keeps passing unmodified).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ExportService } from '../services/export.service';
import { CraftRenderService } from '../services/craft-render.service';
import { PhotoEditService } from '../services/photo-edit.service';
import {
  adaptCraftPrisma,
  adaptExportPrisma,
  adaptPhotoPrisma,
} from '../services/job-delegate-adapters';
import { JobService } from '../tools/jobs';
import { createFakeEditJobPrisma } from './fake-edit-job-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage } from './fake-storage';
import { createToolsTestRig, userCtx, USER } from './tools-test-rig';

const VALID_ECPROJ = {
  schema: 2,
  items: {
    '1': {
      id: 1,
      kind: { type: 'Comp', width: 480, height: 270, duration: 2540160000000, layers: [] },
    },
  },
  root: 1,
};

const VALID_OPS = [{ id: 'image.imageSize', params: { width: 32, height: 24 } }];

describe('delegate adapters — activation discipline', () => {
  it('prisma without an editJob delegate passes through by identity', () => {
    const legacyOnly = { editExportJob: { marker: true } };
    expect(adaptExportPrisma(legacyOnly as never)).toBe(legacyOnly);
    expect(adaptCraftPrisma(legacyOnly as never)).toBe(legacyOnly);
    expect(adaptPhotoPrisma(legacyOnly as never)).toBe(legacyOnly);
  });
});

describe('EXPORT fold-in', () => {
  it('ExportService lifecycle runs on EditJob; rows carry kind EXPORT + params', async () => {
    const jobFake = createFakeEditJobPrisma();
    const storage = createFakeStorage().port;
    const prisma = adaptExportPrisma({ editJob: jobFake.editJob, editAsset: jobFake.editAsset });
    const service = new ExportService(prisma as never, storage);

    const queued = await service.queueExport({
      projectId: 'project-1', format: 'mp4', resolution: '1080p', quality: 'high', userId: USER,
    });
    expect(queued.status).toBe('QUEUED');
    expect(queued.outputUrl).toBeNull();

    // The unified store holds exactly one row, folded with the landed shape.
    expect(jobFake.rows).toHaveLength(1);
    const row = jobFake.rows[0]!;
    expect(row.kind).toBe('EXPORT');
    expect(row.toolName).toBe('quantcooks.export_project');
    expect(row.params).toEqual({ format: 'mp4', resolution: '1080p', quality: 'high' });

    const claimed = await service.claimJob(queued.id);
    expect(claimed?.status).toBe('PROCESSING');
    const completed = await service.completeJob(queued.id, 'quantcooks/user-1/project-1/out.mp4');
    expect(completed?.status).toBe('COMPLETED');
    // Landed behaviour: the public outputUrl is a fresh signed URL minted
    // from the stored KEY (the key itself is what EditJob.result holds).
    expect(completed?.outputUrl).toContain('out.mp4');
    expect((jobFake.rows[0]!.result as { outputKey: string }).outputKey).toBe(
      'quantcooks/user-1/project-1/out.mp4',
    );

    const status = await service.getExportStatus(queued.id, USER);
    expect(status.status).toBe('COMPLETED');
    const list = await service.listExports('project-1', USER);
    expect(list.map((j) => j.id)).toEqual([queued.id]);
  });

  it('cross-visibility: tool-created EXPORT jobs read through the legacy service and back', async () => {
    const rig = createToolsTestRig();
    // Create through the registry tool (JobService on EditJob)…
    const invoked = await rig.registry.invoke(
      'quantcooks.export_project',
      { projectId: 'proj-x', format: 'mp4' },
      userCtx(),
    );
    const jobId = (invoked['job'] as { id: string }).id;
    // …read through the legacy ExportService over the same store.
    const legacy = new ExportService(rig.prisma as never, rig.storage);
    const viaLegacy = await legacy.getExportStatus(jobId, USER);
    expect(viaLegacy.id).toBe(jobId);
    expect(viaLegacy.status).toBe('QUEUED');
    // …and a legacy-queued export reads through the unified JobService.
    const queued = await legacy.queueExport({
      projectId: 'proj-x', format: 'webm', resolution: '720p', quality: 'low', userId: USER,
    });
    const jobs = new JobService(rig.prisma as never, rig.storage);
    const viaUnified = await jobs.getJob(queued.id, USER);
    expect(viaUnified.kind).toBe('EXPORT');
    expect((viaUnified.params as { format: string }).format).toBe('webm');
  });
});

describe('CRAFT_RENDER fold-in', () => {
  it('binary absent → CRAFT_NOT_CONFIGURED and NO EditJob row', async () => {
    const jobFake = createFakeEditJobPrisma();
    const prisma = adaptCraftPrisma({ editJob: jobFake.editJob, editAsset: jobFake.editAsset });
    const service = new CraftRenderService(prisma as never, createFakeStorage().port, null);
    await expect(
      service.createRender({ projectId: 'proj-1', ecproj: VALID_ECPROJ, comp: 'Main', userId: USER }),
    ).rejects.toMatchObject({ code: 'CRAFT_NOT_CONFIGURED', statusCode: 503 });
    expect(jobFake.rows).toHaveLength(0);
  });

  it('full lifecycle on EditJob with a fake runner; outputs[0] round-trips', async () => {
    const jobFake = createFakeEditJobPrisma();
    const prisma = adaptCraftPrisma({ editJob: jobFake.editJob, editAsset: jobFake.editAsset });
    const runner = { probeVersion: async () => 'effectcraft 0.18.0' } as never;
    const service = new CraftRenderService(prisma as never, createFakeStorage().port, runner);

    const created = await service.createRender({
      projectId: 'proj-1', ecproj: VALID_ECPROJ, comp: 'Main', userId: USER,
    });
    expect(created.status).toBe('QUEUED');
    expect(jobFake.rows).toHaveLength(1);
    const row = jobFake.rows[0]!;
    expect(row.kind).toBe('CRAFT_RENDER');
    expect(row.provider).toBe('effectcraft');
    expect((row.params as { comp: string }).comp).toBe('Main');

    const claimed = await service.claimJob(created.id);
    expect(claimed?.status).toBe('PROCESSING');
    const completed = await service.completeJob(created.id, 'asset-craft-out');
    expect(completed?.outputAssetId).toBe('asset-craft-out');
    expect(jobFake.rows[0]!.outputs).toEqual([{ assetId: 'asset-craft-out', kind: 'video' }]);

    const read = await service.getRender(created.id, USER);
    expect(read.outputAssetId).toBe('asset-craft-out');
    expect(read.comp).toBe('Main');
  });
});

describe('PHOTO_EDIT fold-in', () => {
  it('binary absent → PHOTO_NOT_CONFIGURED and NO EditJob row', async () => {
    const rig = createToolsTestRig();
    const source = await rig.assetFake.editAsset.create({
      data: {
        projectId: 'proj-1', userId: USER, filename: 'thali.png', type: 'image', size: 10,
        url: 'quantcooks/user-1/proj-1/a/thali.png',
        metadata: { storageKey: 'quantcooks/user-1/proj-1/a/thali.png', uploadStatus: 'READY' },
      },
    });
    await expect(
      rig.deps.photoEdits.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: USER }),
    ).rejects.toMatchObject({ code: 'PHOTO_NOT_CONFIGURED', statusCode: 503 });
    expect(rig.jobFake.rows).toHaveLength(0);
  });

  it('full lifecycle on EditJob; source never mutated, output is a new ref', async () => {
    const assetFake = createFakeEditAssetPrisma();
    const jobFake = createFakeEditJobPrisma();
    const storage = createFakeStorage().port;
    const source = await assetFake.editAsset.create({
      data: {
        projectId: 'proj-1', userId: USER, filename: 'thali.png', type: 'image', size: 10,
        url: 'quantcooks/user-1/proj-1/a/thali.png',
        metadata: { storageKey: 'quantcooks/user-1/proj-1/a/thali.png', uploadStatus: 'READY' },
      },
    });
    const prisma = adaptPhotoPrisma({
      editJob: jobFake.editJob,
      editAsset: assetFake.editAsset,
    });
    const runner = { probeVersion: async () => 'photocraft 0.17.0' } as never;
    const service = new PhotoEditService(prisma as never, storage, runner);

    const created = await service.createEdit({
      sourceAssetId: source.id, operations: VALID_OPS, userId: USER,
    });
    expect(created.status).toBe('QUEUED');
    expect(jobFake.rows).toHaveLength(1);
    const row = jobFake.rows[0]!;
    expect(row.kind).toBe('PHOTO_EDIT');
    expect((row.params as { sourceAssetId: string }).sourceAssetId).toBe(source.id);

    const claimed = await service.claimJob(created.id);
    expect(claimed?.status).toBe('PROCESSING');
    const completed = await service.completeJob(created.id, 'asset-photo-out');
    expect(completed?.outputAssetId).toBe('asset-photo-out');
    expect(jobFake.rows[0]!.outputs).toEqual([{ assetId: 'asset-photo-out', kind: 'image' }]);

    const read = await service.getEdit(created.id, USER);
    expect(read.sourceAssetId).toBe(source.id);
    expect(read.outputAssetId).toBe('asset-photo-out');
  });
});
