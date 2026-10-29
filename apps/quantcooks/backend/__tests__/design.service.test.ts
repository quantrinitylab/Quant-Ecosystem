// ============================================================================
// DesignService + DesignProcessor tests (C-7 step 4) — the C-2/C-3B
// service-test idiom over composed stateful fakes (unified EditJob
// delegate + asset delegate + project delegate + fake storage). The
// processor is driven by the real Node runner against the fake-binary
// FIXTURE (fixtures/fake-figcraft-cli.mjs); the pinned real binary is
// exercised by the gated integration suite (design.integration.test.ts).
//
// What these tests pin, per the step-4 brief:
//  - companion absent -> create/export refuse 503 FIGCRAFT_NOT_CONFIGURED,
//    NO EditJob row
//  - create guards -> 400 INVALID_TEMPLATE (no row), 404 missing /
//    other-user project (no row)
//  - export guards -> 404 missing/other-user asset, 400 not-READY,
//    400 non-design source
//  - jobs live on EditJob with kind DESIGN; export projectId is DERIVED
//    from the source asset; outputs land as NEW assets; the source row
//    and bytes are never mutated
//  - storage unconfigured at claim -> FAILED STORAGE_NOT_CONFIGURED and
//    the binary is NEVER spawned (counting runner)
//  - non-zero exit -> FAILED FIGCRAFT_EXIT_<code>; exit 0 + no output ->
//    FAILED DESIGN_NO_OUTPUT / EXPORT_NO_OUTPUT, never faked
//  - credits: creditCost 0 + metering 'not_wired' on every surface
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesignService } from '../services/design.service';
import { DesignProcessor } from '../services/design-processor';
import { AssetService } from '../services/asset.service';
import { NodeFigCraftRunner, type FigCraftRunner } from '../services/figcraft.adapter';
import { createFakeEditJobPrisma } from './fake-edit-job-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-figcraft-cli.mjs',
);

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

const silentLogger = { info: () => undefined, error: () => undefined };

function composeFakes() {
  const jobs = createFakeEditJobPrisma();
  const assetsFake = createFakeEditAssetPrisma();
  const projectsFake = createFakeEditProjectPrisma();
  const prisma = {
    editJob: jobs.editJob,
    editAsset: assetsFake.editAsset,
    editProject: projectsFake.editProject,
  };
  return { prisma, jobs, assetsFake, projectsFake };
}

async function seedProject(
  projectsFake: ReturnType<typeof createFakeEditProjectPrisma>,
  userId = 'user-1',
) {
  return projectsFake.editProject.create({
    data: { userId, name: 'Dish Project', type: 'video' },
  });
}

const SOURCE_KEY = 'quantcooks/user-1/proj-1/fake-asset-9/menu.figcraft';
const SOURCE_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('seed-design-document'),
]);

async function seedDesignAsset(
  assetsFake: ReturnType<typeof createFakeEditAssetPrisma>,
  storage: FakeStorage,
  projectId: string,
  overrides: Record<string, unknown> = {},
) {
  await storage.port.upload(SOURCE_KEY, SOURCE_BYTES, 'application/x-figcraft');
  return assetsFake.editAsset.create({
    data: {
      projectId,
      userId: 'user-1',
      filename: 'menu.figcraft',
      type: 'application',
      size: SOURCE_BYTES.byteLength,
      url: SOURCE_KEY,
      metadata: {
        storageKey: SOURCE_KEY,
        contentType: 'application/x-figcraft',
        uploadStatus: 'READY',
      },
      ...overrides,
    },
  });
}

function buildProcessor(
  runner: FigCraftRunner,
  storagePort: FakeStorage['port'] | null,
  storage: FakeStorage,
) {
  const { prisma, jobs, assetsFake, projectsFake } = composeFakes();
  const service = new DesignService(prisma as never, storagePort, runner);
  const assets = new AssetService(prisma as never, storagePort);
  const processor = new DesignProcessor({
    service,
    assets,
    runner,
    storage: storagePort,
    logger: silentLogger,
  });
  return { service, processor, jobs, assetsFake, projectsFake, storage };
}

describe('DesignService create guards', () => {
  let storage: FakeStorage;
  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('companion absent -> 503 FIGCRAFT_NOT_CONFIGURED naming the companion, NO job row', async () => {
    const { prisma, jobs, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(prisma as never, storage.port, null);

    await expect(
      service.createDesign({ projectId: project.id, template: 'mobile-app', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'FIGCRAFT_NOT_CONFIGURED' });
    await expect(
      service.createDesign({ projectId: project.id, userId: 'user-1' }),
    ).rejects.toThrow(/figcraft/);
    expect(jobs.rows).toHaveLength(0);
  });

  it('template outside the starter set -> 400 INVALID_TEMPLATE, NO job row', async () => {
    const { prisma, jobs, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    await expect(
      service.createDesign({ projectId: project.id, template: 'bogus', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TEMPLATE' });
    expect(jobs.rows).toHaveLength(0);
  });

  it('missing project -> 404; another user\'s project -> 404 (owner scoping)', async () => {
    const { prisma, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    await expect(
      service.createDesign({ projectId: 'no-such-project', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    await expect(
      service.createDesign({ projectId: project.id, userId: 'user-2' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
  });

  it('happy create: QUEUED on EditJob, kind DESIGN, creditCost 0 + metering not_wired', async () => {
    const { prisma, jobs, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createDesign({
      projectId: project.id, template: 'mobile-app', name: 'Dish App', userId: 'user-1',
    });
    expect(job.status).toBe('QUEUED');
    expect(job.kind).toBe('DESIGN');
    expect(job.provider).toBe('figcraft');
    expect(job.operation).toBe('create');
    expect(job.template).toBe('mobile-app');
    expect(job.name).toBe('Dish App');
    expect(job.projectId).toBe(project.id);
    expect(job.creditCost).toBe(0);
    expect(job.metering).toBe('not_wired');
    expect(job.outputAssetIds).toEqual([]);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]!.kind).toBe('DESIGN');
    expect(jobs.rows[0]!.toolName).toBe('quantcooks.create_design');
  });
});

describe('DesignService export guards', () => {
  let storage: FakeStorage;
  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('companion absent -> 503 FIGCRAFT_NOT_CONFIGURED, NO job row', async () => {
    const { prisma, jobs, assetsFake, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);
    const service = new DesignService(prisma as never, storage.port, null);
    await expect(
      service.exportDesign({ sourceAssetId: source.id, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'FIGCRAFT_NOT_CONFIGURED' });
    expect(jobs.rows).toHaveLength(0);
  });

  it('missing asset -> 404; another user\'s asset -> 404', async () => {
    const { prisma, assetsFake, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    await expect(
      service.exportDesign({ sourceAssetId: 'no-such-asset', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
    await expect(
      service.exportDesign({ sourceAssetId: source.id, userId: 'user-2' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });

  it('PENDING design -> 400 ASSET_NOT_READY; image asset -> 400 SOURCE_NOT_DESIGN', async () => {
    const { prisma, assetsFake, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    const pending = await seedDesignAsset(assetsFake, storage, project.id, {
      url: null,
      metadata: { storageKey: SOURCE_KEY, contentType: 'application/x-figcraft', uploadStatus: 'PENDING' },
    });
    await expect(
      service.exportDesign({ sourceAssetId: pending.id, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'ASSET_NOT_READY' });

    const photo = await seedDesignAsset(assetsFake, storage, project.id, {
      filename: 'thali.png',
      type: 'image',
      metadata: { storageKey: SOURCE_KEY, contentType: 'image/png', uploadStatus: 'READY' },
    });
    await expect(
      service.exportDesign({ sourceAssetId: photo.id, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'SOURCE_NOT_DESIGN' });
  });

  it('bad format / scale -> 400 before any row', async () => {
    const { prisma, jobs, assetsFake, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    await expect(
      service.exportDesign({ sourceAssetId: source.id, format: 'tiff', userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FORMAT' });
    await expect(
      service.exportDesign({ sourceAssetId: source.id, scale: 9, userId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SCALE' });
    expect(jobs.rows).toHaveLength(0);
  });

  it('happy export create: projectId DERIVED from the source asset', async () => {
    const { prisma, jobs, assetsFake, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    const job = await service.exportDesign({
      sourceAssetId: source.id, format: 'svg', userId: 'user-1',
    });
    expect(job.status).toBe('QUEUED');
    expect(job.operation).toBe('export');
    expect(job.projectId).toBe(project.id);
    expect(job.sourceAssetId).toBe(source.id);
    expect(job.format).toBe('svg');
    expect(jobs.rows[0]!.toolName).toBe('quantcooks.export_design');
  });

  it('reads are owner-scoped and kind-filtered: another user / another kind -> 404', async () => {
    const { prisma, jobs, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createDesign({ projectId: project.id, userId: 'user-1' });
    await expect(service.getDesign(job.id, 'user-2')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listDesigns('user-2')).resolves.toHaveLength(0);
    await expect(service.listDesigns('user-1')).resolves.toHaveLength(1);
    // A non-DESIGN job id is not a design job.
    const other = await service.jobs.createJob({
      userId: 'user-1', kind: 'EXPORT', toolName: 'quantcooks.export_project',
    });
    await expect(service.getDesign(other.id, 'user-1')).rejects.toMatchObject({
      statusCode: 404, code: 'DESIGN_JOB_NOT_FOUND',
    });
    expect(jobs.rows).toHaveLength(2);
  });

  it('stale sweep fails old PROCESSING DESIGN jobs with PROCESSOR_INTERRUPTED (kind-filtered)', async () => {
    const { prisma, jobs, projectsFake } = composeFakes();
    const project = await seedProject(projectsFake);
    const service = new DesignService(
      prisma as never, storage.port, new NodeFigCraftRunner(FIXTURE_BIN),
    );
    const job = await service.createDesign({ projectId: project.id, userId: 'user-1' });
    const claimed = await service.claimNextDesign();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe('PROCESSING');
    jobs.rows[0]!.updatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const swept = await service.failStaleDesigns(new Date(Date.now() - 15 * 60 * 1000));
    expect(swept).toBe(1);
    await expect(service.getDesign(job.id, 'user-1')).resolves.toMatchObject({
      status: 'FAILED',
      error: 'PROCESSOR_INTERRUPTED',
    });
  });
});

describe('DesignProcessor (fake binary fixture)', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
    delete process.env['FAKE_FIG_EXIT'];
    delete process.env['FAKE_FIG_NO_OUTPUT'];
  });

  afterEach(() => {
    delete process.env['FAKE_FIG_EXIT'];
    delete process.env['FAKE_FIG_NO_OUTPUT'];
  });

  it('create happy path: COMPLETED, document lands as a NEW READY .figcraft asset in the project', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);

    const job = await service.createDesign({
      projectId: project.id, template: 'mobile-app', name: 'Dish App', userId: 'user-1',
    });
    await processor.tick();

    const done = await service.getDesign(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.outputAssetId).toBeTruthy();
    expect(done.outputUrl).toContain(FAKE_STORAGE_HOST);

    const outRow = assetsFake.rows.find((r) => r.id === done.outputAssetId);
    expect(outRow).toBeTruthy();
    expect(outRow!.projectId).toBe(project.id);
    expect(outRow!.filename).toBe('Dish App.figcraft');
    const meta = outRow!.metadata as Record<string, unknown>;
    expect(meta['uploadStatus']).toBe('READY');
    expect(meta['contentType']).toBe('application/x-figcraft');
    const bytes = storage.objects.get(meta['storageKey'] as string)!.bytes;
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(bytes.toString('utf8')).toContain('FAKE-FIGCRAFT-DOCUMENT');
  });

  it('export single-frame: COMPLETED with one PNG asset; source untouched', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);

    const job = await service.exportDesign({
      sourceAssetId: source.id, format: 'png', frame: 'Welcome', userId: 'user-1',
    });
    await processor.tick();

    const done = await service.getDesign(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.outputAssetIds).toHaveLength(1);
    const outRow = assetsFake.rows.find((r) => r.id === done.outputAssetIds[0]);
    expect(outRow!.filename).toBe('menu-Welcome.png');
    expect(outRow!.projectId).toBe(project.id);
    const meta = outRow!.metadata as Record<string, unknown>;
    const bytes = storage.objects.get(meta['storageKey'] as string)!.bytes;
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    // Source row + bytes are exactly as seeded.
    const srcRow = assetsFake.rows.find((r) => r.id === source.id);
    expect(srcRow!.filename).toBe('menu.figcraft');
    expect(storage.objects.get(SOURCE_KEY)!.bytes).toEqual(SOURCE_BYTES);
  });

  it('export per-frame (png, no frame): one asset per top-level frame', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);

    const job = await service.exportDesign({ sourceAssetId: source.id, format: 'png', userId: 'user-1' });
    await processor.tick();

    const done = await service.getDesign(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.outputAssetIds).toHaveLength(2);
    const names = done.outputAssetIds
      .map((id) => assetsFake.rows.find((r) => r.id === id)!.filename)
      .sort();
    expect(names).toEqual(['Explore.png', 'Welcome.png']);
  });

  it('export pdf: single asset with %PDF magic even without a frame', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);
    const source = await seedDesignAsset(assetsFake, storage, project.id);

    const job = await service.exportDesign({ sourceAssetId: source.id, format: 'pdf', userId: 'user-1' });
    await processor.tick();

    const done = await service.getDesign(job.id, 'user-1');
    expect(done.status).toBe('COMPLETED');
    expect(done.outputAssetIds).toHaveLength(1);
    const outRow = assetsFake.rows.find((r) => r.id === done.outputAssetIds[0]);
    expect(outRow!.filename).toBe('menu.pdf');
    const meta = outRow!.metadata as Record<string, unknown>;
    expect(storage.objects.get(meta['storageKey'] as string)!.bytes.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('non-zero exit -> FAILED FIGCRAFT_EXIT_3, no output asset', async () => {
    process.env['FAKE_FIG_EXIT'] = '3';
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);

    const job = await service.createDesign({ projectId: project.id, template: 'mobile-app', userId: 'user-1' });
    await processor.tick();

    const failed = await service.getDesign(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('FIGCRAFT_EXIT_3');
    expect(assetsFake.rows).toHaveLength(0);
  });

  it('zero exit but no document -> FAILED DESIGN_NO_OUTPUT (never faked)', async () => {
    process.env['FAKE_FIG_NO_OUTPUT'] = '1';
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, assetsFake, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);

    const job = await service.createDesign({ projectId: project.id, userId: 'user-1' });
    await processor.tick();

    const failed = await service.getDesign(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('DESIGN_NO_OUTPUT');
    expect(assetsFake.rows).toHaveLength(0);
  });

  it('storage unconfigured -> claimed job fails at claim time with STORAGE_NOT_CONFIGURED; binary never spawned', async () => {
    let spawns = 0;
    const countingRunner: FigCraftRunner = {
      async run() {
        spawns++;
        return { exitCode: 0, stderrTail: '', stdoutTail: '', timedOut: false };
      },
    };
    const { service, processor, projectsFake } = buildProcessor(countingRunner, null, storage);
    const project = await seedProject(projectsFake);

    const job = await service.createDesign({ projectId: project.id, template: 'mobile-app', userId: 'user-1' });
    await processor.tick();

    const failed = await service.getDesign(job.id, 'user-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('STORAGE_NOT_CONFIGURED');
    expect(spawns).toBe(0);
  });

  it('two queued jobs are claimed distinctly, oldest first, kinds isolated', async () => {
    const runner = new NodeFigCraftRunner(FIXTURE_BIN);
    const { service, processor, projectsFake } = buildProcessor(runner, storage.port, storage);
    const project = await seedProject(projectsFake);

    const first = await service.createDesign({ projectId: project.id, name: 'First', userId: 'user-1' });
    const second = await service.createDesign({ projectId: project.id, name: 'Second', userId: 'user-1' });
    // A foreign-kind job in the same store is never claimed by this processor.
    await service.jobs.createJob({ userId: 'user-1', kind: 'EXPORT', toolName: 'quantcooks.export_project' });

    await processor.tick();
    await expect(service.getDesign(first.id, 'user-1')).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(service.getDesign(second.id, 'user-1')).resolves.toMatchObject({ status: 'QUEUED' });

    await processor.tick();
    await expect(service.getDesign(second.id, 'user-1')).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
