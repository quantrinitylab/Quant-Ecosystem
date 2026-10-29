// ============================================================================
// CraftRenderService + CraftRenderProcessor tests (C-2).
//
// Service and processor run over composed stateful fakes (craft-render
// delegate + asset delegate + fake storage) — the P0-4 idiom. The processor
// is driven against the FAKE BINARY fixture (a real spawn of a script that
// emits the pinned CLI's real --progress lines), with env-controlled
// variants for non-zero exit and zero-exit-no-output. The real pinned
// binary is exercised by craft-render.integration.test.ts (gated).
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CraftRenderService } from '../services/craft-render.service';
import { CraftRenderProcessor } from '../services/craft-render-processor';
import { AssetService } from '../services/asset.service';
import { NodeEffectCraftRunner, type EffectCraftRunner } from '../services/effectcraft.adapter';
import { createFakeEditCraftRenderPrisma } from './fake-edit-craft-render-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-effectcraft-cli.mjs',
);

const VALID_ECPROJ = {
  schema: 2,
  items: {
    '1': {
      id: 1,
      kind: {
        type: 'Comp',
        width: 480,
        height: 270,
        duration: 2540160000000,
        layers: [],
      },
    },
  },
};

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

function composeFakes() {
  const craft = createFakeEditCraftRenderPrisma();
  const assetsFake = createFakeEditAssetPrisma();
  const prisma = {
    editCraftRenderJob: craft.editCraftRenderJob,
    editAsset: assetsFake.editAsset,
  };
  return { craft, assetsFake, prisma };
}

const silentLogger = { info: () => undefined, error: () => undefined };

describe('CraftRenderService', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('create persists a QUEUED job with the params snapshot, creditCost 0, metering not_wired', async () => {
    const { prisma, craft } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));

    const job = await service.createRender({
      projectId: 'proj-1',
      ecproj: VALID_ECPROJ,
      comp: 'Main',
      userId: 'user-1',
    });

    expect(job.status).toBe('QUEUED');
    expect(job.kind).toBe('CRAFT_RENDER');
    expect(job.provider).toBe('effectcraft');
    expect(job.comp).toBe('Main');
    expect(job.format).toBe('h264');
    expect(job.creditCost).toBe(0);
    expect(job.metering).toBe('not_wired');
    expect(job.outputAssetId).toBeNull();
    expect(job.outputUrl).toBeNull();
    expect(craft.rows).toHaveLength(1);
    expect((craft.rows[0]!.params as { ecproj: unknown }).ecproj).toEqual(VALID_ECPROJ);
  });

  it('create with no companion configured -> 503 CRAFT_NOT_CONFIGURED and NO row', async () => {
    const { prisma, craft } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, null);

    await expect(
      service.createRender({ projectId: 'proj-1', ecproj: VALID_ECPROJ, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'CRAFT_NOT_CONFIGURED' });
    expect(craft.rows).toHaveLength(0);
  });

  it('create with a malformed .ecproj -> 400 INVALID_ECPROJ and NO row', async () => {
    const { prisma, craft } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));

    await expect(
      service.createRender({ projectId: 'proj-1', ecproj: { nope: true }, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ECPROJ' });
    expect(craft.rows).toHaveLength(0);
  });

  it('create rejects hand-written seconds in the duration field (ticks gotcha)', async () => {
    const { prisma } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));
    const corrupt = structuredClone(VALID_ECPROJ) as typeof VALID_ECPROJ;
    (corrupt.items['1']!.kind as { duration: unknown }).duration = 10;

    await expect(
      service.createRender({ projectId: 'proj-1', ecproj: corrupt, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_ECPROJ' });
  });

  it('owner scoping: other users get 404; list filters by owner and project', async () => {
    const { prisma } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));

    const mine = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await service.createRender({ projectId: 'p2', ecproj: VALID_ECPROJ, userId: 'user-2' });

    await expect(service.getRender(mine.id, 'user-2')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CRAFT_RENDER_NOT_FOUND',
    });
    await expect(service.getRender(mine.id, 'user-1')).resolves.toMatchObject({ id: mine.id });

    const listMine = await service.listRenders('user-1');
    expect(listMine).toHaveLength(1);
    const listFiltered = await service.listRenders('user-1', 'p2');
    expect(listFiltered).toHaveLength(0);
  });

  it('claim is atomic: a second claim of the same job returns null', async () => {
    const { prisma } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));
    const job = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });

    const first = await service.claimJob(job.id);
    expect(first).toMatchObject({ status: 'PROCESSING', progress: 10, stage: 'rendering' });
    const second = await service.claimJob(job.id);
    expect(second).toBeNull();
  });

  it('progress heartbeats clamp into the PROCESSING band [10, 99]', async () => {
    const { prisma } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));
    const job = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await service.claimJob(job.id);

    await service.updateProgress(job.id, 100);
    await expect(service.getRender(job.id)).resolves.toMatchObject({ progress: 99 });
    await service.updateProgress(job.id, 3);
    await expect(service.getRender(job.id)).resolves.toMatchObject({ progress: 10 });
    await service.updateProgress(job.id, 55);
    await expect(service.getRender(job.id)).resolves.toMatchObject({ progress: 55 });
  });

  it('stale sweep fails only old PROCESSING jobs, with PROCESSOR_INTERRUPTED', async () => {
    const { prisma, craft } = composeFakes();
    const service = new CraftRenderService(prisma as never, storage.port, new NodeEffectCraftRunner(FIXTURE_BIN));
    const old = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    const fresh = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await service.claimJob(old.id);
    await service.claimJob(fresh.id);
    // Backdate the first row's updatedAt beyond the sweep cutoff (relative
    // to the fake's own clock, not the wall clock).
    const oldRow = craft.rows.find((r) => r.id === old.id)!;
    const freshRow = craft.rows.find((r) => r.id === fresh.id)!;
    oldRow.updatedAt = new Date(freshRow.updatedAt.getTime() - 2 * 60 * 60 * 1000);
    const cutoff = new Date(freshRow.updatedAt.getTime() - 60 * 60 * 1000);

    const swept = await service.failStaleProcessing(cutoff);
    expect(swept).toBe(1);
    await expect(service.getRender(old.id)).resolves.toMatchObject({
      status: 'FAILED',
      error: 'PROCESSOR_INTERRUPTED',
    });
    await expect(service.getRender(fresh.id)).resolves.toMatchObject({ status: 'PROCESSING' });
  });
});

describe('CraftRenderProcessor (fake binary fixture)', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
    delete process.env['FAKE_EC_EXIT'];
    delete process.env['FAKE_EC_NO_OUTPUT'];
  });

  afterEach(() => {
    delete process.env['FAKE_EC_EXIT'];
    delete process.env['FAKE_EC_NO_OUTPUT'];
  });

  function buildProcessor(runner: EffectCraftRunner, storagePort: FakeStorage['port'] | null) {
    const { prisma, craft, assetsFake } = composeFakes();
    const service = new CraftRenderService(prisma as never, storagePort, runner);
    const assets = new AssetService(prisma as never, storagePort);
    const processor = new CraftRenderProcessor({
      service,
      assets,
      runner,
      storage: storagePort,
      logger: silentLogger,
    });
    return { service, processor, craft, assetsFake };
  }

  it('happy path: QUEUED -> COMPLETED, output lands as a READY asset with bytes in storage', async () => {
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);

    const job = await service.createRender({
      projectId: 'proj-1', ecproj: VALID_ECPROJ, comp: 'Main', userId: 'user-1',
    });
    await processor.tick();

    const done = await service.getRender(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.outputAssetId).toBeTruthy();

    const assetRow = assetsFake.rows.find((r) => r.id === done.outputAssetId);
    expect(assetRow).toBeTruthy();
    const meta = assetRow!.metadata as Record<string, unknown>;
    expect(meta['uploadStatus']).toBe('READY');
    const key = meta['storageKey'] as string;
    expect(key).toContain('quantcooks/user-1/proj-1/');
    expect(storage.has(key)).toBe(true);
    const bytes = storage.objects.get(key)!.bytes;
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    // The job surface mints a fresh signed URL from the fake host.
    expect(done.outputUrl).toContain(FAKE_STORAGE_HOST);
  });

  it('non-zero exit -> FAILED EFFECTCRAFT_EXIT_3 with the stderr tail', async () => {
    process.env['FAKE_EC_EXIT'] = '3';
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    const { service, processor } = buildProcessor(runner, storage.port);

    const job = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await processor.tick();

    const failed = await service.getRender(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('EFFECTCRAFT_EXIT_3');
    expect(failed.error).toContain('simulated render failure');
  });

  it('zero exit but no output file -> FAILED RENDER_NO_OUTPUT (never faked)', async () => {
    process.env['FAKE_EC_NO_OUTPUT'] = '1';
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake } = buildProcessor(runner, storage.port);

    const job = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await processor.tick();

    const failed = await service.getRender(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('RENDER_NO_OUTPUT');
    expect(assetsFake.rows).toHaveLength(0);
  });

  it('storage unconfigured -> claimed job fails at claim time with STORAGE_NOT_CONFIGURED; binary never spawned', async () => {
    let spawns = 0;
    const countingRunner: EffectCraftRunner = {
      async run() {
        spawns++;
        return { exitCode: 0, stderrTail: '', timedOut: false };
      },
    };
    const { service, processor } = buildProcessor(countingRunner, null);

    const job = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    await processor.tick();

    const failed = await service.getRender(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('STORAGE_NOT_CONFIGURED');
    expect(spawns).toBe(0);
  });

  it('two queued jobs are claimed distinctly, oldest first', async () => {
    const runner = new NodeEffectCraftRunner(FIXTURE_BIN);
    const { service, processor } = buildProcessor(runner, storage.port);

    const first = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });
    const second = await service.createRender({ projectId: 'p1', ecproj: VALID_ECPROJ, userId: 'user-1' });

    await processor.tick();
    await expect(service.getRender(first.id)).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(service.getRender(second.id)).resolves.toMatchObject({ status: 'QUEUED' });

    await processor.tick();
    await expect(service.getRender(second.id)).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
