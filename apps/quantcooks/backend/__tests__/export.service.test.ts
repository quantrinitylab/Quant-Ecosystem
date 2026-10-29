import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService } from '../services/export.service';
import { createFakeEditExportPrisma, type FakeEditExportPrisma } from './fake-edit-export-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';

// P0-4: the 6 original in-memory cases, ported unchanged (same names, same
// assertions) to the Prisma-backed service, plus the new processor-transition
// cases. They run against a stateful fake EditExportJob delegate — see
// fake-edit-export-prisma.ts for why, and for what "persistence" means at
// this level in the extract (no Postgres / DATABASE_URL available here).

describe('ExportService', () => {
  let service: ExportService;
  let prisma: FakeEditExportPrisma;
  let storage: FakeStorage;

  beforeEach(() => {
    prisma = createFakeEditExportPrisma();
    storage = createFakeStorage();
    service = new ExportService(prisma as never, storage.port);
  });

  describe('queueExport', () => {
    it('creates a QUEUED export job', async () => {
      const job = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      expect(job.status).toBe('QUEUED');
      expect(job.projectId).toBe('project-1');
      expect(job.format).toBe('mp4');
      expect(job.outputUrl).toBeNull();
      expect(job.progress).toBe(0);
      expect(job.error).toBeNull();
    });
  });

  describe('getExportStatus', () => {
    it('returns export job by id', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const job = await service.getExportStatus(created.id);

      expect(job.id).toBe(created.id);
      expect(job.status).toBe('QUEUED');
    });

    it('throws EXPORT_NOT_FOUND for missing export', async () => {
      await expect(service.getExportStatus('export-missing')).rejects.toThrow(
        'Export job not found',
      );
    });
  });

  describe('listExports', () => {
    it('returns exports for a project', async () => {
      await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });
      await service.queueExport({
        projectId: 'project-1',
        format: 'webm',
        resolution: '720p',
        quality: 'medium',
      });

      const exports = await service.listExports('project-1');

      expect(exports).toHaveLength(2);
    });
  });

  describe('cancelExport', () => {
    it('cancels a QUEUED export', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const cancelled = await service.cancelExport(created.id);

      expect(cancelled.status).toBe('FAILED');
    });

    it('throws EXPORT_NOT_FOUND for missing export', async () => {
      await expect(service.cancelExport('export-missing')).rejects.toThrow('Export job not found');
    });

    it('throws CANNOT_CANCEL_EXPORT for a non-QUEUED export', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });
      await service.claimJob(created.id);

      await expect(service.cancelExport(created.id)).rejects.toThrow(
        'Only queued exports can be cancelled',
      );
    });
  });

  describe('persistence across service instances', () => {
    it('a new service over the same store still sees the job (restart)', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const afterRestart = new ExportService(prisma as never, storage.port);
      const found = await afterRestart.getExportStatus(created.id);

      expect(found.id).toBe(created.id);
      expect(found.status).toBe('QUEUED');
    });
  });

  describe('claim (atomic)', () => {
    it('claimJob transitions QUEUED → PROCESSING with progress 10', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const claimed = await service.claimJob(created.id);

      expect(claimed?.status).toBe('PROCESSING');
      expect(claimed?.progress).toBe(10);
    });

    it('a second claim of the same job fails (double-claim returns null)', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const first = await service.claimJob(created.id);
      const second = await service.claimJob(created.id);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('claimNextQueued drains FIFO and then returns null', async () => {
      const a = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });
      const b = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '720p',
        quality: 'medium',
      });

      const first = await service.claimNextQueued();
      const second = await service.claimNextQueued();
      const third = await service.claimNextQueued();

      expect(first?.id).toBe(a.id);
      expect(second?.id).toBe(b.id);
      expect(third).toBeNull();
    });
  });

  describe('completeJob / failJob', () => {
    it('completeJob sets COMPLETED, progress 100, completedAt; response outputUrl is signed, row holds the key', async () => {
      const created = await service.queueExport({
        userId: 'user-1',
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });
      await service.claimJob(created.id);

      const key = `quantcooks/user-1/project-1/exports/${created.id}.mp4`;
      const completed = await service.completeJob(created.id, key);

      expect(completed?.status).toBe('COMPLETED');
      expect(completed?.progress).toBe(100);
      expect(completed?.completedAt).not.toBeNull();
      expect(completed?.outputKey).toBe(key);
      expect(completed?.outputUrl).toBe(`${FAKE_STORAGE_HOST}/${key}?signed=1`);
      // The persisted column holds the key, never the signed URL.
      expect(prisma.rows[0]?.outputUrl).toBe(key);
    });

    it('completeJob on a job no longer PROCESSING returns null (no resurrection)', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const result = await service.completeJob(created.id, 'quantcooks/x/y/exports/z.mp4');

      expect(result).toBeNull();
      const job = await service.getExportStatus(created.id);
      expect(job.status).toBe('QUEUED');
    });

    it('failJob records the error (truncated at 500 chars) and completedAt', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });
      await service.claimJob(created.id);

      const failed = await service.failJob(created.id, 'x'.repeat(600));

      expect(failed.status).toBe('FAILED');
      expect(failed.error).toHaveLength(500);
      expect(failed.completedAt).not.toBeNull();
    });

    it('updateProgress only advances a PROCESSING job', async () => {
      const created = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      await service.updateProgress(created.id, 70);
      expect((await service.getExportStatus(created.id)).progress).toBe(0);

      await service.claimJob(created.id);
      await service.updateProgress(created.id, 70);
      expect((await service.getExportStatus(created.id)).progress).toBe(70);
    });
  });

  describe('failStaleProcessing', () => {
    it('fails only PROCESSING rows older than the cutoff, with PROCESSOR_INTERRUPTED', async () => {
      await prisma.editExportJob.create({
        data: {
          projectId: 'project-1',
          format: 'mp4',
          resolution: '1080p',
          quality: 'high',
          status: 'PROCESSING',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      await prisma.editExportJob.create({
        data: {
          projectId: 'project-1',
          format: 'mp4',
          resolution: '1080p',
          quality: 'high',
          status: 'PROCESSING',
          createdAt: new Date('2027-01-01T00:00:00Z'),
          updatedAt: new Date('2027-01-01T00:00:00Z'),
        },
      });
      await prisma.editExportJob.create({
        data: {
          projectId: 'project-1',
          format: 'mp4',
          resolution: '1080p',
          quality: 'high',
          status: 'QUEUED',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      const swept = await service.failStaleProcessing(new Date('2026-06-01T00:00:00Z'));

      expect(swept).toBe(1);
      expect(prisma.rows[0]?.status).toBe('FAILED');
      expect(prisma.rows[0]?.error).toBe('PROCESSOR_INTERRUPTED');
      expect(prisma.rows[1]?.status).toBe('PROCESSING');
      expect(prisma.rows[2]?.status).toBe('QUEUED');
    });
  });

  describe('ownership scoping', () => {
    it('another user cannot read or cancel the job (404 semantics)', async () => {
      const created = await service.queueExport({
        userId: 'user-1',
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      await expect(service.getExportStatus(created.id, 'user-2')).rejects.toThrow(
        'Export job not found',
      );
      await expect(service.cancelExport(created.id, 'user-2')).rejects.toThrow(
        'Export job not found',
      );
      expect(await service.listExports('project-1', 'user-2')).toHaveLength(0);
      expect(await service.listExports('project-1', 'user-1')).toHaveLength(1);
    });
  });
});
