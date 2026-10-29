// ============================================================================
// ProjectService editor-state tests (P0-5).
//
// Covers the state surface added over the P0-1 service: GET/PUT state
// semantics at the service level (round-trip, the atomic version gate,
// synthesis for empty documents), the derived EditLayer projection
// (upsert-by-clipId), the duplicate-preserves-state fix, cross-instance
// persistence over the composed fake, and one integration-style case:
// a state saved here is found by P0-4's REAL ExportProcessor source
// resolution (D4-3) via content.assetId.
//
// Runs against the composed stateful fake (fake-project-state-prisma.ts):
// $transaction there is sequential execution, documented as not truly
// atomic — these tests assert outcomes and the version gate, never
// rollback under injected mid-transaction faults (real-DB smoke is P0-6).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectService, type EditorDocument } from '../services/project.service';
import { ExportProcessor } from '../services/export-processor';
import { ExportService, type ExportJob } from '../services/export.service';
import { createFakeProjectStatePrisma } from './fake-project-state-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditExportPrisma } from './fake-edit-export-prisma';
import { createFakeStorage } from './fake-storage';

type StatePrisma = ReturnType<typeof createFakeProjectStatePrisma>;

const FILTERS = { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 };

function makeClip(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'clip-a',
    trackId: 'track-1',
    name: 'Intro clip',
    startTime: 0,
    duration: 5,
    trimStart: 0,
    trimEnd: 0,
    type: 'video',
    thumbnail: '',
    volume: 1,
    opacity: 1,
    filters: { ...FILTERS },
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    ...overrides,
  };
}

function makeDoc(clips: Record<string, unknown>[], overrides: Partial<EditorDocument> = {}): EditorDocument {
  return {
    schemaVersion: 1,
    tracks: [
      {
        id: 'track-1',
        name: 'Video 1',
        type: 'video',
        locked: false,
        visible: true,
        height: 60,
        clips,
      },
    ],
    duration: 120,
    aspectRatio: '16:9',
    ...overrides,
  } as EditorDocument;
}

async function errorOf(promise: Promise<unknown>): Promise<{
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  message?: string;
}> {
  try {
    await promise;
  } catch (err) {
    return err as { code?: string; statusCode?: number; details?: Record<string, unknown>; message?: string };
  }
  throw new Error('expected the promise to reject');
}

describe('ProjectService editor state (P0-5)', () => {
  let prisma: StatePrisma;
  let service: ProjectService;

  beforeEach(() => {
    prisma = createFakeProjectStatePrisma();
    service = new ProjectService(prisma as never);
  });

  async function createProject(userId = 'user-1') {
    return service.createProject({ userId, name: 'Stateful', type: 'video' });
  }

  describe('round-trip', () => {
    it('save → get returns the identical document, canvas from the aspect table, version bumped', async () => {
      const project = await createProject();
      const doc = makeDoc([makeClip()], { aspectRatio: '9:16', duration: 42 });

      const saved = await service.saveProjectState(project.id, 'user-1', {
        version: 1,
        timeline: doc,
      });

      expect(saved.version).toBe(2);
      expect(saved.width).toBe(1080);
      expect(saved.height).toBe(1920);
      expect(saved.duration).toBe(42);
      expect(saved.timeline).toEqual(doc);

      const fetched = await service.getProjectState(project.id);
      expect(fetched.timeline).toEqual(doc);
      expect(fetched.version).toBe(2);
    });

    it('version increments 1 → 2 → 3 across saves', async () => {
      const project = await createProject();
      const doc = makeDoc([makeClip()]);

      const v2 = await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });
      const v3 = await service.saveProjectState(project.id, 'user-1', { version: 2, timeline: doc });
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
    });

    it('every aspect ratio maps to its canvas columns', async () => {
      const project = await createProject();
      const table = {
        '16:9': [1920, 1080],
        '9:16': [1080, 1920],
        '1:1': [1080, 1080],
        '4:5': [1080, 1350],
        '4:3': [1440, 1080],
      } as const;
      let version = 1;
      for (const [ratio, [w, h]] of Object.entries(table)) {
        const saved = await service.saveProjectState(project.id, 'user-1', {
          version,
          timeline: makeDoc([], { aspectRatio: ratio as EditorDocument['aspectRatio'] }),
        });
        expect([saved.width, saved.height]).toEqual([w, h]);
        version = saved.version;
      }
    });

    it('persists across service instances over the same store (restart)', async () => {
      const project = await createProject();
      const doc = makeDoc([makeClip()]);
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });

      const afterRestart = new ProjectService(prisma as never);
      const fetched = await afterRestart.getProjectState(project.id);
      expect(fetched.timeline).toEqual(doc);
      expect(fetched.version).toBe(2);
    });
  });

  describe('version gate', () => {
    it('a stale version is a 409 VERSION_CONFLICT carrying currentVersion, and nothing is written', async () => {
      const project = await createProject();
      const docA = makeDoc([makeClip({ name: 'A' })]);
      const docB = makeDoc([makeClip({ name: 'B' })]);
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: docA });

      const err = await errorOf(
        service.saveProjectState(project.id, 'user-1', { version: 1, timeline: docB }),
      );
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(err.details?.['currentVersion']).toBe(2);

      const fetched = await service.getProjectState(project.id);
      expect(fetched.timeline).toEqual(docA);
      expect(fetched.version).toBe(2);
    });

    it('conflict-then-overwrite with the fresh version succeeds', async () => {
      const project = await createProject();
      const docA = makeDoc([makeClip({ name: 'A' })]);
      const docB = makeDoc([makeClip({ name: 'B' })]);
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: docA });
      await errorOf(service.saveProjectState(project.id, 'user-1', { version: 1, timeline: docB }));

      const overwritten = await service.saveProjectState(project.id, 'user-1', {
        version: 2,
        timeline: docB,
      });
      expect(overwritten.version).toBe(3);
      expect(overwritten.timeline).toEqual(docB);
    });
  });

  describe('ownership and existence', () => {
    it('non-owner save is 403 NOT_PROJECT_OWNER', async () => {
      const project = await createProject();
      const err = await errorOf(
        service.saveProjectState(project.id, 'user-2', { version: 1, timeline: makeDoc([]) }),
      );
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('NOT_PROJECT_OWNER');
    });

    it('missing project is 404 on both state methods', async () => {
      const getErr = await errorOf(service.getProjectState('missing'));
      expect(getErr.code).toBe('PROJECT_NOT_FOUND');
      const saveErr = await errorOf(
        service.saveProjectState('missing', 'user-1', { version: 1, timeline: makeDoc([]) }),
      );
      expect(saveErr.code).toBe('PROJECT_NOT_FOUND');
    });

    it('soft-deleted project is 404 on both state methods', async () => {
      const project = await createProject();
      await service.deleteProject(project.id, 'user-1');
      const getErr = await errorOf(service.getProjectState(project.id));
      expect(getErr.code).toBe('PROJECT_NOT_FOUND');
      const saveErr = await errorOf(
        service.saveProjectState(project.id, 'user-1', { version: 1, timeline: makeDoc([]) }),
      );
      expect(saveErr.code).toBe('PROJECT_NOT_FOUND');
    });

    it('state reads are not owner-scoped (matching GET /projects/:id)', async () => {
      const project = await createProject();
      const fetched = await service.getProjectState(project.id);
      expect(fetched.id).toBe(project.id);
    });
  });

  describe('empty-document synthesis (C11)', () => {
    it('a fresh project opens with tracks [], duration 120, aspect from default canvas', async () => {
      const project = await createProject();
      const state = await service.getProjectState(project.id);
      expect(state.timeline).toEqual({
        schemaVersion: 1,
        tracks: [],
        duration: 120,
        aspectRatio: '16:9',
      });
      expect(state.duration).toBe(120);
      expect(state.version).toBe(1);
    });

    it('column duration and a portrait canvas drive the synthesised document', async () => {
      const row = await prisma.editProject.create({
        data: { userId: 'user-1', name: 'Seeded', type: 'video', width: 1080, height: 1920, duration: 45 },
      });
      const state = await service.getProjectState(row.id);
      expect(state.timeline.duration).toBe(45);
      expect(state.timeline.aspectRatio).toBe('9:16');
      expect(state.timeline.tracks).toEqual([]);
    });
  });

  describe('layer projection (D5-2)', () => {
    it('rebuilds rows keyed by clipId with content.assetId exactly as P0-4 reads it', async () => {
      const project = await createProject();
      const doc = makeDoc([
        makeClip({ id: 'clip-a', assetId: 'asset-1', startTime: 0, duration: 5 }),
        makeClip({ id: 'clip-b', name: 'Second', startTime: 5, duration: 3, type: 'text' }),
      ]);
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });

      expect(prisma.layerRows).toHaveLength(2);
      const [rowA, rowB] = prisma.layerRows;
      expect(rowA).toMatchObject({
        projectId: project.id,
        name: 'Intro clip',
        type: 'video',
        order: 0,
        visible: true,
        locked: false,
        startTime: 0,
        endTime: 5,
      });
      expect((rowA!.content as Record<string, unknown>)['clipId']).toBe('clip-a');
      expect((rowA!.content as Record<string, unknown>)['assetId']).toBe('asset-1');
      expect(rowB).toMatchObject({ type: 'text', order: 1, startTime: 5, endTime: 8 });
      expect((rowB!.content as Record<string, unknown>)['assetId']).toBeUndefined();
      // No signed URL may leak into the persisted projection (D5-6).
      expect(JSON.stringify(prisma.layerRows)).not.toContain('X-Amz');
      expect(JSON.stringify(prisma.layerRows)).not.toContain('thumbnail');
    });

    it('upserts in place: rename/reorder keeps the row id; removal deletes the row', async () => {
      const project = await createProject();
      await service.saveProjectState(project.id, 'user-1', {
        version: 1,
        timeline: makeDoc([makeClip({ id: 'clip-a' }), makeClip({ id: 'clip-b', startTime: 5 })]),
      });
      const idA = prisma.layerRows.find((r) => (r.content as { clipId?: string }).clipId === 'clip-a')!.id;
      const idB = prisma.layerRows.find((r) => (r.content as { clipId?: string }).clipId === 'clip-b')!.id;

      const renamed = makeDoc([
        makeClip({ id: 'clip-b', startTime: 0, name: 'Now first' }),
        makeClip({ id: 'clip-a', startTime: 3, name: 'Renamed' }),
      ]);
      await service.saveProjectState(project.id, 'user-1', { version: 2, timeline: renamed });

      expect(prisma.layerRows).toHaveLength(2);
      const afterA = prisma.layerRows.find((r) => r.id === idA)!;
      const afterB = prisma.layerRows.find((r) => r.id === idB)!;
      expect(afterA.name).toBe('Renamed');
      expect(afterA.order).toBe(1);
      expect(afterB.name).toBe('Now first');
      expect(afterB.order).toBe(0);

      await service.saveProjectState(project.id, 'user-1', {
        version: 3,
        timeline: makeDoc([makeClip({ id: 'clip-a' })]),
      });
      expect(prisma.layerRows).toHaveLength(1);
      expect(prisma.layerRows[0]!.id).toBe(idA);
    });

    it('a row created directly via the layers API (no clipId) is removed by the next state save', async () => {
      const project = await createProject();
      await prisma.editLayer.create({
        data: { projectId: project.id, name: 'API layer', type: 'video', content: {} },
      });
      expect(prisma.layerRows).toHaveLength(1);

      await service.saveProjectState(project.id, 'user-1', {
        version: 1,
        timeline: makeDoc([makeClip()]),
      });
      expect(prisma.layerRows).toHaveLength(1);
      expect((prisma.layerRows[0]!.content as Record<string, unknown>)['clipId']).toBe('clip-a');
    });

    it('track visibility/lock flow into the projection; transform is carried', async () => {
      const project = await createProject();
      const doc = makeDoc([makeClip({ rotation: 45 })]);
      (doc.tracks[0] as { visible: boolean }).visible = false;
      (doc.tracks[0] as { locked: boolean }).locked = true;
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });

      const row = prisma.layerRows[0]!;
      expect(row.visible).toBe(false);
      expect(row.locked).toBe(true);
      expect((row.transform as Record<string, unknown>)['rotation']).toBe(45);
    });
  });

  describe('duplicate preserves state (C1 fix)', () => {
    it('the copy has the same document and projection (new row ids, same clipIds), version 1', async () => {
      const project = await createProject();
      const doc = makeDoc([makeClip({ assetId: 'asset-1' })], { aspectRatio: '1:1' });
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });
      const originalLayerIds = prisma.layerRows.map((r) => r.id);

      const copy = await service.duplicateProject(project.id, 'user-1');
      const copyState = await service.getProjectState(copy.id);
      expect(copyState.timeline).toEqual(doc);
      expect(copyState.version).toBe(1);
      expect([copyState.width, copyState.height]).toEqual([1080, 1080]);

      const copyLayers = prisma.layerRows.filter((r) => r.projectId === copy.id);
      expect(copyLayers).toHaveLength(1);
      expect(originalLayerIds).not.toContain(copyLayers[0]!.id);
      expect((copyLayers[0]!.content as Record<string, unknown>)['clipId']).toBe('clip-a');
      expect((copyLayers[0]!.content as Record<string, unknown>)['assetId']).toBe('asset-1');
    });
  });

  describe('P0-4 integration (D4-3 source resolution)', () => {
    it('an editor-saved video clip is found by the real ExportProcessor.resolveSource', async () => {
      const project = await createProject();

      // A READY video asset in the project's library (fake asset delegate).
      const assetPrisma = createFakeEditAssetPrisma();
      const asset = await assetPrisma.editAsset.create({
        data: {
          projectId: project.id,
          userId: 'user-1',
          filename: 'dish.mp4',
          type: 'video',
          size: 1234,
          url: 'quantcooks/user-1/proj/dish.mp4',
          metadata: { uploadStatus: 'READY', storageKey: 'quantcooks/user-1/proj/dish.mp4' },
        },
      });

      const doc = makeDoc([makeClip({ assetId: asset.id, startTime: 2, duration: 4 })]);
      await service.saveProjectState(project.id, 'user-1', { version: 1, timeline: doc });

      const processor = new ExportProcessor({
        service: new ExportService(createFakeEditExportPrisma() as never, createFakeStorage().port),
        renderer: { render: async () => ({ outputKey: 'unused' }) } as never,
        prisma: {
          editProject: prisma.editProject,
          editLayer: prisma.editLayer,
          editAsset: assetPrisma.editAsset,
        } as never,
        logger: { info: () => undefined, error: () => undefined },
      });

      const job = {
        id: 'job-1',
        projectId: project.id,
        userId: 'user-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
        status: 'PROCESSING',
        progress: 10,
        outputUrl: null,
        error: null,
        createdAt: new Date(),
        completedAt: null,
      } as unknown as ExportJob;

      const resolved = await processor.resolveSource(job);
      expect(resolved).toEqual({
        sourceKey: 'quantcooks/user-1/proj/dish.mp4',
        assetId: asset.id,
        trim: { startSec: 2, durationSec: 4 },
      });
    });
  });
});
