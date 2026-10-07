import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectService } from '../services/project.service';
import { ExportService } from '../services/export.service';

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(() => {
    service = new ProjectService();
  });

  describe('createProject', () => {
    it('creates a project with given attributes', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'My Video Project',
        type: 'video',
      });

      expect(project.id).toBeDefined();
      expect(project.userId).toBe('user-1');
      expect(project.name).toBe('My Video Project');
      expect(project.type).toBe('video');
      expect(project.deletedAt).toBeNull();
    });
  });

  describe('getProject', () => {
    it('returns a project by id', async () => {
      const created = await service.createProject({
        userId: 'user-1',
        name: 'Test',
        type: 'image',
      });

      const found = await service.getProject(created.id);

      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Test');
    });

    it('throws PROJECT_NOT_FOUND for non-existent project', async () => {
      await expect(service.getProject('missing')).rejects.toThrow('Project not found');
    });

    it('throws PROJECT_NOT_FOUND for deleted project', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'To Delete',
        type: 'audio',
      });
      await service.deleteProject(project.id, 'user-1');

      await expect(service.getProject(project.id)).rejects.toThrow('Project not found');
    });
  });

  describe('listProjects', () => {
    it('returns paginated projects for a user', async () => {
      await service.createProject({ userId: 'user-1', name: 'Project 1', type: 'video' });
      await service.createProject({ userId: 'user-1', name: 'Project 2', type: 'image' });
      await service.createProject({ userId: 'user-2', name: 'Other', type: 'audio' });

      const result = await service.listProjects('user-1');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('updateProject', () => {
    it('updates project name', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'Old Name',
        type: 'video',
      });

      const updated = await service.updateProject(project.id, 'user-1', { name: 'New Name' });

      expect(updated.name).toBe('New Name');
    });

    it('throws NOT_PROJECT_OWNER for wrong user', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'Mine',
        type: 'video',
      });

      await expect(service.updateProject(project.id, 'user-2', { name: 'Hacked' })).rejects.toThrow(
        'Only the owner can update this project',
      );
    });
  });

  describe('deleteProject', () => {
    it('soft-deletes a project', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'To Delete',
        type: 'video',
      });

      const deleted = await service.deleteProject(project.id, 'user-1');

      expect(deleted.deletedAt).not.toBeNull();
    });

    it('throws NOT_PROJECT_OWNER for wrong user', async () => {
      const project = await service.createProject({
        userId: 'user-1',
        name: 'Mine',
        type: 'video',
      });

      await expect(service.deleteProject(project.id, 'user-2')).rejects.toThrow(
        'Only the owner can delete this project',
      );
    });
  });

  describe('duplicateProject', () => {
    it('creates a copy with (Copy) suffix', async () => {
      const original = await service.createProject({
        userId: 'user-1',
        name: 'Original',
        type: 'video',
      });

      const duplicate = await service.duplicateProject(original.id, 'user-1');

      expect(duplicate.id).not.toBe(original.id);
      expect(duplicate.name).toBe('Original (Copy)');
      expect(duplicate.type).toBe('video');
      expect(duplicate.userId).toBe('user-1');
    });

    it('throws PROJECT_NOT_FOUND for non-existent project', async () => {
      await expect(service.duplicateProject('missing', 'user-1')).rejects.toThrow(
        'Project not found',
      );
    });
  });
});

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    service = new ExportService();
  });

  describe('queueExport', () => {
    it('creates an export job with QUEUED status', async () => {
      const job = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('QUEUED');
      expect(job.projectId).toBe('project-1');
      expect(job.format).toBe('mp4');
      expect(job.resolution).toBe('1080p');
      expect(job.quality).toBe('high');
      expect(job.outputUrl).toBeNull();
    });
  });

  describe('getExportStatus', () => {
    it('returns export job by id', async () => {
      const job = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const found = await service.getExportStatus(job.id);

      expect(found.id).toBe(job.id);
    });

    it('throws EXPORT_NOT_FOUND for missing job', async () => {
      await expect(service.getExportStatus('missing')).rejects.toThrow('Export job not found');
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
      await service.queueExport({
        projectId: 'project-2',
        format: 'mp4',
        resolution: '4k',
        quality: 'lossless',
      });

      const result = await service.listExports('project-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('cancelExport', () => {
    it('cancels a queued export', async () => {
      const job = await service.queueExport({
        projectId: 'project-1',
        format: 'mp4',
        resolution: '1080p',
        quality: 'high',
      });

      const cancelled = await service.cancelExport(job.id);

      expect(cancelled.status).toBe('FAILED');
    });

    it('throws EXPORT_NOT_FOUND for missing job', async () => {
      await expect(service.cancelExport('missing')).rejects.toThrow('Export job not found');
    });
  });
});
