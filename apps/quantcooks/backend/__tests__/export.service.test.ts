import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService } from '../services/export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    service = new ExportService();
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
  });
});
