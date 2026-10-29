// ============================================================================
// Photo edit - GATED real-binary integration test (C-3B).
//
// Skipped unless PHOTOCRAFT_IT=1 AND PHOTOCRAFT_BIN points at the pinned
// PhotoCraft CLI (Phase 1: v0.17.0, verified sha256 against the release's
// own SHA256SUMS.txt). This is the C-2 integration idiom: the REAL binary
// is driven through the PRODUCTION path — PhotoEditService ->
// PhotoEditProcessor -> NodePhotoCraftRunner -> binary -> output bytes
// landed through the P0-3 seam into (fake) storage as a real EditAsset
// row. The source bytes are the Phase-1 round-trip PNG (64x48); the edit
// resizes to 32x24 and the landed output's IHDR must say exactly that —
// proof the operations, not a stub, produced the file.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PhotoEditService } from '../services/photo-edit.service';
import { PhotoEditProcessor } from '../services/photo-edit-processor';
import { AssetService } from '../services/asset.service';
import { NodePhotoCraftRunner } from '../services/photocraft.adapter';
import { createFakeEditPhotoEditPrisma } from './fake-edit-photo-edit-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage } from './fake-storage';

const ENABLED =
  process.env['PHOTOCRAFT_IT'] === '1' && Boolean(process.env['PHOTOCRAFT_BIN']);

const SOURCE_PNG_PATH = join(
  homedir(),
  'workspace/quantcooks-craft-spike/photocraft-cli/roundtrip/in.png',
);

describe.skipIf(!ENABLED)('photo edit - real PhotoCraft binary (PHOTOCRAFT_IT)', () => {
  it('resizes a real PNG through the production path; IHDR of the landed output is 32x24', async () => {
    const bin = process.env['PHOTOCRAFT_BIN']!;
    const runner = new NodePhotoCraftRunner(bin);

    await expect(runner.probeVersion()).resolves.toContain('0.17.0');

    const photo = createFakeEditPhotoEditPrisma();
    const assetsFake = createFakeEditAssetPrisma();
    const prisma = {
      editPhotoEditJob: photo.editPhotoEditJob,
      editAsset: assetsFake.editAsset,
    };
    const storage = createFakeStorage();

    const sourceBytes = readFileSync(SOURCE_PNG_PATH);
    // The Phase-1 source is a 64x48 PNG — assert it before editing.
    expect(sourceBytes.readUInt32BE(16)).toBe(64);
    expect(sourceBytes.readUInt32BE(20)).toBe(48);

    const sourceKey = 'quantcooks/user-1/proj-1/fake-asset-1/in.png';
    await storage.port.upload(sourceKey, sourceBytes, 'image/png');
    const source = await assetsFake.editAsset.create({
      data: {
        projectId: 'proj-1',
        userId: 'user-1',
        filename: 'in.png',
        type: 'image',
        size: sourceBytes.byteLength,
        url: sourceKey,
        metadata: { storageKey: sourceKey, contentType: 'image/png', uploadStatus: 'READY' },
      },
    });

    const service = new PhotoEditService(prisma as never, storage.port, runner);
    const assets = new AssetService(prisma as never, storage.port);
    const processor = new PhotoEditProcessor({
      service,
      assets,
      runner,
      storage: storage.port,
      logger: { info: () => undefined, error: () => undefined },
    });

    const job = await service.createEdit({
      sourceAssetId: source.id,
      operations: [
        { id: 'image.imageSize', params: { width: 32, height: 24 } },
        { id: 'image.adjustments.brightnessContrast', params: { brightness: 40, contrast: 20 } },
      ],
      outputFormat: 'png',
      userId: 'user-1',
    });
    expect(job.status).toBe('QUEUED');

    await processor.tick();

    const done = await service.getEdit(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.outputAssetId).toBeTruthy();

    const outRow = assetsFake.rows.find((r) => r.id === done.outputAssetId);
    expect(outRow).toBeTruthy();
    expect(outRow!.filename).toBe('in-edited.png');
    expect(outRow!.projectId).toBe('proj-1');
    const meta = outRow!.metadata as Record<string, unknown>;
    expect(meta['uploadStatus']).toBe('READY');

    const outBytes = storage.objects.get(meta['storageKey'] as string)!.bytes;
    // PNG magic + the resize actually happened (IHDR width/height).
    expect(outBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(outBytes.readUInt32BE(16)).toBe(32);
    expect(outBytes.readUInt32BE(20)).toBe(24);

    // The source asset row/bytes are untouched.
    const srcRow = assetsFake.rows.find((r) => r.id === source.id);
    expect(srcRow!.filename).toBe('in.png');
    expect(storage.objects.get(sourceKey)!.bytes).toEqual(sourceBytes);
  }, 120_000);
});
