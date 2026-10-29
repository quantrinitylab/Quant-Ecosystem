// ============================================================================
// Design jobs - GATED real-binary integration test (C-7 step 4).
//
// Skipped unless FIGCRAFT_IT=1 AND FIGCRAFT_BIN points at the pinned
// FigCraft CLI (spike pin: v0.12.1, verified sha256 against the
// release's own SHA256SUMS.txt). This is the C-2/C-3B integration
// idiom: the REAL binary is driven through the PRODUCTION path —
// DesignService -> DesignProcessor -> NodeFigCraftRunner -> binary ->
// outputs landed through the P0-3 seam into (fake) storage as real
// EditAsset rows.
//
// The proof chain is end-to-end and self-verifying:
//  1. create from the engine's `mobile-app` template -> COMPLETED; the
//     landed document is a REAL .figcraft (ZIP magic) big enough to be
//     the spike's 224-node template document, not a stub;
//  2. that very asset is then EXPORTED through the same production
//     path -> COMPLETED; the landed PNG carries the PNG magic + IHDR
//     and the landed SVG starts with a real <svg> element — bytes only
//     the engine could have produced from the document it authored;
//  3. the source document's bytes are byte-identical after the export
//     (the source is never mutated).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { DesignService } from '../services/design.service';
import { DesignProcessor } from '../services/design-processor';
import { AssetService } from '../services/asset.service';
import { NodeFigCraftRunner } from '../services/figcraft.adapter';
import { createFakeEditJobPrisma } from './fake-edit-job-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeStorage } from './fake-storage';

const ENABLED =
  process.env['FIGCRAFT_IT'] === '1' && Boolean(process.env['FIGCRAFT_BIN']);

describe.skipIf(!ENABLED)('design jobs - real FigCraft binary (FIGCRAFT_IT)', () => {
  it('creates a real template document, then exports real PNG/SVG bytes from it', async () => {
    const bin = process.env['FIGCRAFT_BIN']!;
    const runner = new NodeFigCraftRunner(bin);

    await expect(runner.probeVersion()).resolves.toContain('0.12.1');

    const jobs = createFakeEditJobPrisma();
    const assetsFake = createFakeEditAssetPrisma();
    const projectsFake = createFakeEditProjectPrisma();
    const prisma = {
      editJob: jobs.editJob,
      editAsset: assetsFake.editAsset,
      editProject: projectsFake.editProject,
    };
    const storage = createFakeStorage();

    const project = await projectsFake.editProject.create({
      data: { userId: 'user-1', name: 'Dish Project', type: 'video' },
    });

    const service = new DesignService(prisma as never, storage.port, runner);
    const assets = new AssetService(prisma as never, storage.port);
    const processor = new DesignProcessor({
      service,
      assets,
      runner,
      storage: storage.port,
      logger: { info: () => undefined, error: () => undefined },
    });

    // -- 1. create ------------------------------------------------------------
    const createJob = await service.createDesign({
      projectId: project.id,
      template: 'mobile-app',
      name: 'Spike Dish App',
      userId: 'user-1',
    });
    expect(createJob.status).toBe('QUEUED');

    await processor.tick();

    const created = await service.getDesign(createJob.id, 'user-1');
    expect(created.status).toBe('COMPLETED');
    expect(created.progress).toBe(100);
    expect(created.outputAssetId).toBeTruthy();

    const docRow = assetsFake.rows.find((r) => r.id === created.outputAssetId);
    expect(docRow).toBeTruthy();
    expect(docRow!.filename).toBe('Spike Dish App.figcraft');
    expect(docRow!.projectId).toBe(project.id);
    const docMeta = docRow!.metadata as Record<string, unknown>;
    expect(docMeta['uploadStatus']).toBe('READY');

    const docKey = docMeta['storageKey'] as string;
    const docBytes = storage.objects.get(docKey)!.bytes;
    // A real .figcraft is a ZIP (PK magic) and the mobile-app template
    // document is tens of KB (spike: 44,145 bytes for 224 nodes).
    expect(docBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(docBytes.byteLength).toBeGreaterThan(10_000);

    // -- 2a. export PNG (single frame) ----------------------------------------
    const pngJob = await service.exportDesign({
      sourceAssetId: docRow!.id,
      format: 'png',
      frame: 'Welcome',
      userId: 'user-1',
    });
    await processor.tick();

    const pngDone = await service.getDesign(pngJob.id, 'user-1');
    expect(pngDone.status).toBe('COMPLETED');
    expect(pngDone.outputAssetIds).toHaveLength(1);
    const pngRow = assetsFake.rows.find((r) => r.id === pngDone.outputAssetIds[0]);
    expect(pngRow!.filename).toBe('Spike Dish App-Welcome.png');
    const pngMeta = pngRow!.metadata as Record<string, unknown>;
    const pngBytes = storage.objects.get(pngMeta['storageKey'] as string)!.bytes;
    // PNG magic + a parseable IHDR with real dimensions.
    expect(pngBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(pngBytes.toString('ascii', 12, 16)).toBe('IHDR');
    expect(pngBytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(pngBytes.readUInt32BE(20)).toBeGreaterThan(0);

    // -- 2b. export SVG (single frame) ----------------------------------------
    const svgJob = await service.exportDesign({
      sourceAssetId: docRow!.id,
      format: 'svg',
      frame: 'Welcome',
      userId: 'user-1',
    });
    await processor.tick();

    const svgDone = await service.getDesign(svgJob.id, 'user-1');
    expect(svgDone.status).toBe('COMPLETED');
    expect(svgDone.outputAssetIds).toHaveLength(1);
    const svgRow = assetsFake.rows.find((r) => r.id === svgDone.outputAssetIds[0]);
    const svgMeta = svgRow!.metadata as Record<string, unknown>;
    const svgBytes = storage.objects.get(svgMeta['storageKey'] as string)!.bytes;
    expect(svgBytes.toString('utf8', 0, 4)).toBe('<svg');
    expect(svgBytes.byteLength).toBeGreaterThan(1_000);

    // -- 3. the source document is untouched ----------------------------------
    expect(storage.objects.get(docKey)!.bytes).toEqual(docBytes);
    const docRowAfter = assetsFake.rows.find((r) => r.id === docRow!.id);
    expect(docRowAfter!.filename).toBe('Spike Dish App.figcraft');
  }, 180_000);
});
