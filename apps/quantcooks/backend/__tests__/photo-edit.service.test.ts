// ============================================================================
// PhotoEditService + PhotoEditProcessor tests (C-3B) — the C-2 service-test
// idiom over composed stateful fakes (photo-edit delegate + asset delegate
// + fake storage). The processor is driven by the real Node runner against
// the fake-binary FIXTURE (fixtures/fake-photocraft-cli.mjs); the pinned
// real binary is exercised by the gated integration suite
// (photo-edit.integration.test.ts).
//
// What these tests pin, per the C-3B brief:
//  - companion absent -> create refuses 503 PHOTO_NOT_CONFIGURED, NO row
//  - op outside the allowlist -> 400 INVALID_OPERATIONS, NO row, no spawn
//  - source guards -> 404 missing/other-user asset, 400 not-READY, 400
//    non-image
//  - projectId is DERIVED from the source asset; the output lands as a NEW
//    asset in that project; the source row is never mutated
//  - storage unconfigured at claim -> FAILED STORAGE_NOT_CONFIGURED and
//    the binary is NEVER spawned (counting runner)
//  - non-zero exit -> FAILED PHOTO_EXIT_<code>; exit 0 + no output ->
//    FAILED EDIT_NO_OUTPUT, never faked
//  - credits: creditCost 0 + metering 'not_wired' on every surface
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PhotoEditService } from '../services/photo-edit.service';
import { PhotoEditProcessor } from '../services/photo-edit-processor';
import { AssetService } from '../services/asset.service';
import { NodePhotoCraftRunner, type PhotoCraftRunner } from '../services/photocraft.adapter';
import { createFakeEditPhotoEditPrisma } from './fake-edit-photo-edit-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-photocraft-cli.mjs',
);

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

const silentLogger = { info: () => undefined, error: () => undefined };

const SOURCE_BYTES = Buffer.from('fake-source-png-bytes');

const VALID_OPS = [
  { id: 'image.imageSize', params: { width: 32, height: 24 } },
  { id: 'image.adjustments.brightnessContrast', params: { brightness: 40, contrast: 20 } },
];

function composeFakes() {
  const photo = createFakeEditPhotoEditPrisma();
  const assetsFake = createFakeEditAssetPrisma();
  const prisma = { editPhotoEditJob: photo.editPhotoEditJob, editAsset: assetsFake.editAsset };
  return { prisma, photo, assetsFake };
}

const SOURCE_KEY = 'quantcooks/user-1/proj-1/fake-asset-1/thali.png';

async function seedSourceAsset(
  assetsFake: ReturnType<typeof createFakeEditAssetPrisma>,
  storage: FakeStorage,
  overrides: Record<string, unknown> = {},
) {
  await storage.port.upload(SOURCE_KEY, SOURCE_BYTES, 'image/png');
  const row = await assetsFake.editAsset.create({
    data: {
      projectId: 'proj-1',
      userId: 'user-1',
      filename: 'thali.png',
      type: 'image',
      size: SOURCE_BYTES.byteLength,
      url: SOURCE_KEY,
      metadata: { storageKey: SOURCE_KEY, contentType: 'image/png', uploadStatus: 'READY' },
      ...overrides,
    },
  });
  return row;
}

describe('PhotoEditService create guards', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('companion absent -> 503 PHOTO_NOT_CONFIGURED naming the companion, NO job row', async () => {
    const { prisma, photo, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(prisma as never, storage.port, null);

    await expect(
      service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'PHOTO_NOT_CONFIGURED' });
    await expect(
      service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' }),
    ).rejects.toThrow(/photocraft/);
    expect(photo.rows).toHaveLength(0);
  });

  it('operation outside the allowlist -> 400 INVALID_OPERATIONS, NO job row', async () => {
    const { prisma, photo, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const service = new PhotoEditService(prisma as never, storage.port, runner);

    await expect(
      service.createEdit({
        sourceAssetId: source.id,
        operations: [{ id: 'layer.deleteLayer' }],
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_OPERATIONS' });
    expect(photo.rows).toHaveLength(0);
  });

  it('missing asset -> 404; another user\'s asset -> 404 (owner scoping)', async () => {
    const { prisma, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const service = new PhotoEditService(prisma as never, storage.port, runner);

    await expect(
      service.createEdit({ sourceAssetId: 'no-such-asset', operations: VALID_OPS, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
    await expect(
      service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-2' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });

  it('PENDING asset -> 400 ASSET_NOT_READY; video asset -> 400 SOURCE_NOT_IMAGE', async () => {
    const { prisma, assetsFake } = composeFakes();
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const service = new PhotoEditService(prisma as never, storage.port, runner);

    const pending = await seedSourceAsset(assetsFake, storage, {
      url: null,
      metadata: { storageKey: SOURCE_KEY, contentType: 'image/png', uploadStatus: 'PENDING' },
    });
    await expect(
      service.createEdit({ sourceAssetId: pending.id, operations: VALID_OPS, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'ASSET_NOT_READY' });

    const video = await seedSourceAsset(assetsFake, storage, { type: 'video', filename: 'clip.mp4' });
    await expect(
      service.createEdit({ sourceAssetId: video.id, operations: VALID_OPS, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'SOURCE_NOT_IMAGE' });
  });

  it('happy create: QUEUED, projectId derived from source, creditCost 0 + metering not_wired', async () => {
    const { prisma, photo, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const service = new PhotoEditService(prisma as never, storage.port, runner);

    const job = await service.createEdit({
      sourceAssetId: source.id,
      operations: VALID_OPS,
      userId: 'user-1',
    });
    expect(job.status).toBe('QUEUED');
    expect(job.kind).toBe('PHOTO_EDIT');
    expect(job.provider).toBe('photocraft');
    expect(job.projectId).toBe('proj-1');
    expect(job.outputFormat).toBe('png');
    expect(job.operations).toEqual(VALID_OPS);
    expect(job.creditCost).toBe(0);
    expect(job.metering).toBe('not_wired');
    expect(job.outputAssetId).toBeNull();
    expect(job.outputUrl).toBeNull();
    expect(photo.rows).toHaveLength(1);
  });

  it('claim is atomic: a second claim of the same job returns null', async () => {
    const { prisma, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(
      prisma as never, storage.port, new NodePhotoCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });

    const claimed = await service.claimJob(job.id);
    expect(claimed).toMatchObject({ status: 'PROCESSING', progress: 10, stage: 'editing' });
    await expect(service.claimJob(job.id)).resolves.toBeNull();
  });

  it('completeJob returns null when the job left PROCESSING mid-flight', async () => {
    const { prisma, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(
      prisma as never, storage.port, new NodePhotoCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });
    await service.claimJob(job.id);
    await service.failJob(job.id, 'boom');
    await expect(service.completeJob(job.id, 'asset-x')).resolves.toBeNull();
  });

  it('failJob truncates the recorded reason at 500 chars', async () => {
    const { prisma, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(
      prisma as never, storage.port, new NodePhotoCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });
    const failed = await service.failJob(job.id, 'x'.repeat(900));
    expect(failed.error).toHaveLength(500);
  });

  it('stale sweep fails old PROCESSING jobs with PROCESSOR_INTERRUPTED', async () => {
    const { prisma, photo, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(
      prisma as never, storage.port, new NodePhotoCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });
    await service.claimJob(job.id);
    // Backdate the claim so the sweep cutoff sees it as stale.
    photo.rows[0]!.updatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const swept = await service.failStaleProcessing(new Date(Date.now() - 15 * 60 * 1000));
    expect(swept).toBe(1);
    await expect(service.getEdit(job.id, 'user-1')).resolves.toMatchObject({
      status: 'FAILED',
      error: 'PROCESSOR_INTERRUPTED',
    });
  });

  it('reads are owner-scoped: another user gets 404, lists filter', async () => {
    const { prisma, assetsFake } = composeFakes();
    const source = await seedSourceAsset(assetsFake, storage);
    const service = new PhotoEditService(
      prisma as never, storage.port, new NodePhotoCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });

    await expect(service.getEdit(job.id, 'user-2')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listEdits('user-2')).resolves.toHaveLength(0);
    await expect(service.listEdits('user-1', 'proj-1')).resolves.toHaveLength(1);
    await expect(service.listEdits('user-1', 'other-proj')).resolves.toHaveLength(0);
  });
});

describe('PhotoEditProcessor (fake binary fixture)', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
    delete process.env['FAKE_PC_EXIT'];
    delete process.env['FAKE_PC_NO_OUTPUT'];
  });

  afterEach(() => {
    delete process.env['FAKE_PC_EXIT'];
    delete process.env['FAKE_PC_NO_OUTPUT'];
  });

  function buildProcessor(runner: PhotoCraftRunner, storagePort: FakeStorage['port'] | null) {
    const { prisma, photo, assetsFake } = composeFakes();
    const service = new PhotoEditService(prisma as never, storagePort, runner);
    const assets = new AssetService(prisma as never, storagePort);
    const processor = new PhotoEditProcessor({
      service,
      assets,
      runner,
      storage: storagePort,
      logger: silentLogger,
    });
    return { service, processor, photo, assetsFake };
  }

  it('happy path: COMPLETED, output lands as a NEW READY asset in the source project; source untouched', async () => {
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);
    const source = await seedSourceAsset(assetsFake, storage);

    const job = await service.createEdit({
      sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1',
    });
    await processor.tick();

    const done = await service.getEdit(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.outputAssetId).toBeTruthy();
    expect(done.outputAssetId).not.toBe(source.id);

    const outRow = assetsFake.rows.find((r) => r.id === done.outputAssetId);
    expect(outRow).toBeTruthy();
    expect(outRow!.projectId).toBe('proj-1');
    expect(outRow!.filename).toBe('thali-edited.png');
    const meta = outRow!.metadata as Record<string, unknown>;
    expect(meta['uploadStatus']).toBe('READY');
    const key = meta['storageKey'] as string;
    expect(storage.has(key)).toBe(true);
    expect(storage.objects.get(key)!.bytes.toString('utf8')).toContain('FAKE-PC-EDITED');
    expect(done.outputUrl).toContain(FAKE_STORAGE_HOST);

    // The source row and its bytes are exactly as seeded.
    const srcRow = assetsFake.rows.find((r) => r.id === source.id);
    expect(srcRow!.filename).toBe('thali.png');
    expect(storage.objects.get(SOURCE_KEY)!.bytes).toEqual(SOURCE_BYTES);
  });

  it('non-zero exit -> FAILED PHOTO_EXIT_3 with the stderr tail', async () => {
    process.env['FAKE_PC_EXIT'] = '3';
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);
    const source = await seedSourceAsset(assetsFake, storage);

    const job = await service.createEdit({
      sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1',
    });
    await processor.tick();

    const failed = await service.getEdit(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('PHOTO_EXIT_3');
    expect(assetsFake.rows).toHaveLength(1); // source only; no output row
  });

  it('zero exit but no output file -> FAILED EDIT_NO_OUTPUT (never faked)', async () => {
    process.env['FAKE_PC_NO_OUTPUT'] = '1';
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);
    const source = await seedSourceAsset(assetsFake, storage);

    const job = await service.createEdit({
      sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1',
    });
    await processor.tick();

    const failed = await service.getEdit(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('EDIT_NO_OUTPUT');
    expect(assetsFake.rows).toHaveLength(1);
  });

  it('storage unconfigured -> claimed job fails at claim time with STORAGE_NOT_CONFIGURED; binary never spawned', async () => {
    let spawns = 0;
    const countingRunner: PhotoCraftRunner = {
      async run() {
        spawns++;
        return { exitCode: 0, stderrTail: '', timedOut: false };
      },
    };
    const { service, processor, assetsFake } = buildProcessor(countingRunner, null);
    const source = await seedSourceAsset(assetsFake, storage);

    const job = await service.createEdit({
      sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1',
    });
    await processor.tick();

    const failed = await service.getEdit(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('STORAGE_NOT_CONFIGURED');
    expect(spawns).toBe(0);
  });

  it('two queued jobs are claimed distinctly, oldest first', async () => {
    const runner = new NodePhotoCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);
    const source = await seedSourceAsset(assetsFake, storage);

    const first = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });
    const second = await service.createEdit({ sourceAssetId: source.id, operations: VALID_OPS, userId: 'user-1' });

    await processor.tick();
    await expect(service.getEdit(first.id)).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(service.getEdit(second.id)).resolves.toMatchObject({ status: 'QUEUED' });

    await processor.tick();
    await expect(service.getEdit(second.id)).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
