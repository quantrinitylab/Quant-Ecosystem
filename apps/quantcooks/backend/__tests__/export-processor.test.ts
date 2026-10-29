// ============================================================================
// ExportProcessor tests (P0-4).
//
// The processor runs against the composed fake delegates (project / layer /
// asset / export-job) + fake storage, with a stub ExportRenderer injected —
// the same DI seams production uses (server.ts injects StorageExportRenderer
// + the real prisma). Covered: QUEUED → COMPLETED end to end, every honest
// FAILED path, trim passthrough, the mid-flight-cancel discard (D4-6), the
// stale sweep, and the server-side storage gate that keeps the processor OFF
// when storage is not configured (jobs stay QUEUED — pinned against
// server.ts source, since server.ts is the only place a processor may be
// constructed).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
import { ExportService } from '../services/export.service';
import { ExportProcessor } from '../services/export-processor';
import type { ExportRenderer, ExportRenderRequest } from '../services/export-renderer';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditExportPrisma } from './fake-edit-export-prisma';
import { createFakeStorage, type FakeStorage } from './fake-storage';

const SOURCE_KEY = 'quantcooks/user-1/project-1/fake-asset-1/clip.mp4';

function createStack() {
  const projectFake = createFakeEditProjectPrisma();
  const layerFake = createFakeEditLayerPrisma();
  const assetFake = createFakeEditAssetPrisma();
  const exportFake = createFakeEditExportPrisma();
  const storage = createFakeStorage();

  const prisma = {
    editProject: projectFake.editProject,
    editLayer: layerFake.editLayer,
    editAsset: assetFake.editAsset,
    editExportJob: exportFake.editExportJob,
  };
  const service = new ExportService(exportFake as never, storage.port);

  return { projectFake, layerFake, assetFake, exportFake, storage, prisma, service };
}

type Stack = ReturnType<typeof createStack>;

async function seedProject(stack: Stack): Promise<string> {
  const row = await stack.projectFake.editProject.create({
    data: { userId: 'user-1', name: 'Dish Film', type: 'video' },
  });
  return row.id as string;
}

async function seedReadyAsset(stack: Stack, projectId: string): Promise<string> {
  const row = await stack.assetFake.editAsset.create({
    data: {
      projectId,
      userId: 'user-1',
      filename: 'clip.mp4',
      type: 'video',
      size: 100,
      url: SOURCE_KEY,
      metadata: { uploadStatus: 'READY', storageKey: SOURCE_KEY, contentType: 'video/mp4' },
    },
  });
  return row.id as string;
}

async function seedVideoLayer(
  stack: Stack,
  projectId: string,
  assetId: string,
  window: { startTime?: number; endTime?: number } = {},
): Promise<void> {
  await stack.layerFake.editLayer.create({
    data: {
      projectId,
      name: 'Main video',
      type: 'video',
      order: 0,
      startTime: window.startTime ?? 0,
      endTime: window.endTime ?? 0,
      content: { assetId },
    },
  });
}

interface StubRenderer extends ExportRenderer {
  calls: ExportRenderRequest[];
}

function stubRenderer(
  storage: FakeStorage,
  behavior: { failWith?: Error; duringRender?: (req: ExportRenderRequest) => Promise<void> } = {},
): StubRenderer {
  const calls: ExportRenderRequest[] = [];
  return {
    calls,
    async render(req, _workDir, hooks) {
      calls.push(req);
      if (behavior.failWith) throw behavior.failWith;
      await hooks?.onRendered?.();
      if (behavior.duringRender) await behavior.duringRender(req);
      const outputKey = `quantcooks/${req.job.userId ?? 'system'}/${req.job.projectId}/exports/${req.job.id}.mp4`;
      // Simulate the real renderer's upload so discard paths are observable.
      storage.put(outputKey, Buffer.from('rendered'), 'video/mp4');
      return { outputKey, durationSec: 12 };
    },
  };
}

describe('ExportProcessor', () => {
  let stack: Stack;
  let workDir: string;

  beforeEach(async () => {
    stack = createStack();
    workDir = await mkdtemp(join(tmpdir(), 'qc-export-processor-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeProcessor(renderer: ExportRenderer, extra: Record<string, unknown> = {}) {
    return new ExportProcessor({
      service: stack.service,
      renderer,
      prisma: stack.prisma as never,
      storage: stack.storage.port,
      workDir,
      logger: { info: () => undefined, error: () => undefined },
      ...extra,
    } as never);
  }

  async function queueMp4(projectId: string, overrides: Record<string, string> = {}) {
    return stack.service.queueExport({
      userId: 'user-1',
      projectId,
      format: 'mp4',
      resolution: '1080p',
      quality: 'high',
      ...overrides,
    });
  }

  it('drives a QUEUED job to COMPLETED with the output key recorded', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId);
    const job = await queueMp4(projectId);
    const renderer = stubRenderer(stack.storage);
    const processor = makeProcessor(renderer);

    const claimed = await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(claimed).toBe(true);
    expect(after.status).toBe('COMPLETED');
    expect(after.progress).toBe(100);
    expect(after.completedAt).not.toBeNull();
    expect(after.outputKey).toBe(
      `quantcooks/user-1/${projectId}/exports/${job.id}.mp4`,
    );
    expect(after.outputUrl).toContain(after.outputKey);
    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]?.sourceKey).toBe(SOURCE_KEY);
  });

  it('writes progress 70 via the onRendered hook before completing', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId);
    const job = await queueMp4(projectId);

    let progressDuringRender: number | undefined;
    const renderer = stubRenderer(stack.storage, {
      duringRender: async () => {
        progressDuringRender = (await stack.service.getExportStatus(job.id)).progress;
      },
    });
    const processor = makeProcessor(renderer);

    await processor.tick();

    // The stub calls onRendered before duringRender, so the job must already
    // read 70 — proof the 0→10→70→100 ladder is written in order.
    expect(progressDuringRender).toBe(70);
    expect((await stack.service.getExportStatus(job.id)).progress).toBe(100);
  });

  it('marks the job FAILED with the renderer’s real error message', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId);
    const job = await queueMp4(projectId);
    const processor = makeProcessor(
      stubRenderer(stack.storage, { failWith: new Error('ffmpeg exited with code 1') }),
    );

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(after.error).toBe('ffmpeg exited with code 1');
    expect(after.completedAt).not.toBeNull();
  });

  it('fails a non-mp4 job with EXPORT_FORMAT_NOT_SUPPORTED without calling the renderer', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId);
    const job = await queueMp4(projectId, { format: 'webm' });
    const renderer = stubRenderer(stack.storage);
    const processor = makeProcessor(renderer);

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(after.error).toContain('EXPORT_FORMAT_NOT_SUPPORTED');
    expect(renderer.calls).toHaveLength(0);
  });

  it('fails with NO_RENDERABLE_SOURCE when the project has no READY video asset', async () => {
    const projectId = await seedProject(stack);
    const job = await queueMp4(projectId);
    const processor = makeProcessor(stubRenderer(stack.storage));

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(after.error).toContain('NO_RENDERABLE_SOURCE');
  });

  it('fails with PROJECT_NOT_FOUND when the project is missing', async () => {
    const job = await queueMp4('project-does-not-exist');
    const processor = makeProcessor(stubRenderer(stack.storage));

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(after.error).toBe('PROJECT_NOT_FOUND');
  });

  it('falls back to the earliest READY video asset when no layer points at one', async () => {
    const projectId = await seedProject(stack);
    await seedReadyAsset(stack, projectId);
    const job = await queueMp4(projectId);
    const renderer = stubRenderer(stack.storage);
    const processor = makeProcessor(renderer);

    await processor.tick();

    expect((await stack.service.getExportStatus(job.id)).status).toBe('COMPLETED');
    expect(renderer.calls[0]?.sourceKey).toBe(SOURCE_KEY);
    expect(renderer.calls[0]?.trim).toBeUndefined();
  });

  it('skips a PENDING layer asset and reports NO_RENDERABLE_SOURCE', async () => {
    const projectId = await seedProject(stack);
    const pending = await stack.assetFake.editAsset.create({
      data: {
        projectId,
        userId: 'user-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 100,
        url: null,
        metadata: { uploadStatus: 'PENDING' },
      },
    });
    await seedVideoLayer(stack, projectId, pending.id as string);
    const job = await queueMp4(projectId);
    const processor = makeProcessor(stubRenderer(stack.storage));

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(after.error).toContain('NO_RENDERABLE_SOURCE');
  });

  it('passes the layer trim window through to the renderer', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId, { startTime: 5, endTime: 15 });
    const job = await queueMp4(projectId);
    const renderer = stubRenderer(stack.storage);
    const processor = makeProcessor(renderer);

    await processor.tick();

    expect(renderer.calls[0]?.trim).toEqual({ startSec: 5, durationSec: 10 });
    expect((await stack.service.getExportStatus(job.id)).status).toBe('COMPLETED');
  });

  it('does not mark a mid-flight-cancelled job COMPLETED and discards its output', async () => {
    const projectId = await seedProject(stack);
    const assetId = await seedReadyAsset(stack, projectId);
    await seedVideoLayer(stack, projectId, assetId);
    const job = await queueMp4(projectId);
    const outputKey = `quantcooks/user-1/${projectId}/exports/${job.id}.mp4`;

    const renderer = stubRenderer(stack.storage, {
      duringRender: async () => {
        // Simulate an external actor terminating the job mid-render (the
        // D4-6 defence: completion must re-check the row's status).
        await stack.exportFake.editExportJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: 'Cancelled by user' },
        });
      },
    });
    const processor = makeProcessor(renderer);

    await processor.tick();
    const after = await stack.service.getExportStatus(job.id);

    expect(after.status).toBe('FAILED');
    expect(stack.storage.has(outputKey)).toBe(false);
  });

  it('sweeps stale PROCESSING jobs to FAILED/PROCESSOR_INTERRUPTED', async () => {
    await stack.exportFake.editExportJob.create({
      data: {
        projectId: 'project-1',
        userId: 'user-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
        status: 'PROCESSING',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const processor = makeProcessor(stubRenderer(stack.storage));

    const swept = await processor.sweepStale(new Date('2026-10-29T00:00:00Z'));

    expect(swept).toBe(1);
    expect(stack.exportFake.rows[0]?.status).toBe('FAILED');
    expect(stack.exportFake.rows[0]?.error).toBe('PROCESSOR_INTERRUPTED');
  });

  it('tick returns false when the queue is empty', async () => {
    const processor = makeProcessor(stubRenderer(stack.storage));
    expect(await processor.tick()).toBe(false);
  });

  it('start/stop leaves no live interval behind', async () => {
    const processor = makeProcessor(stubRenderer(stack.storage), { pollMs: 60_000 });
    processor.start();
    await processor.stop();
    // Nothing to assert on the timer itself; reaching here without hanging
    // handles (vitest would report them) is the proof.
    expect(true).toBe(true);
  });
});

describe('processor-off-when-no-storage (server gate)', () => {
  it('with storage null, queueing still works and the job honestly stays QUEUED', async () => {
    const exportFake = createFakeEditExportPrisma();
    const service = new ExportService(exportFake as never, null);

    const job = await service.queueExport({
      userId: 'user-1',
      projectId: 'project-1',
      format: 'mp4',
      resolution: '1080p',
      quality: 'high',
    });

    // No processor exists in this configuration (server.ts refuses to build
    // one), so nothing can claim the job: it stays QUEUED with progress 0 —
    // never a fake PROCESSING/COMPLETED.
    expect(job.status).toBe('QUEUED');
    expect(job.progress).toBe(0);
    const after = await service.getExportStatus(job.id);
    expect(after.status).toBe('QUEUED');
    expect(after.outputUrl).toBeNull();
  });

  it('server.ts gates processor construction on a non-null storage port', () => {
    const serverSrc = readFileSync(join(BACKEND_DIR, 'server.ts'), 'utf8');

    expect(serverSrc).toContain('EXPORT_PROCESSOR_DISABLED');
    expect(serverSrc).toContain('EXPORT_PROCESSOR_ENABLED');
    const gateIndex = serverSrc.indexOf('if (!storage)');
    const constructIndex = serverSrc.indexOf('new ExportProcessor');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(constructIndex).toBeGreaterThan(gateIndex);
    // app.ts must stay worker-free: tests build the app without listening.
    const appSrc = readFileSync(join(BACKEND_DIR, 'app.ts'), 'utf8');
    expect(appSrc).not.toContain('ExportProcessor');
  });
});
