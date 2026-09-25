import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ProjectService } from '../services/project.service';
import projectsRoutes from '../routes/projects';

describe('ProjectService Unit Tests', () => {
  let service: ProjectService;
  const userId = 'user-test-123';
  const otherUserId = 'user-test-456';

  beforeEach(() => {
    service = new ProjectService();
  });

  describe('Project CRUD Operations', () => {
    it('creates a project with default PROJECT_ONLY memory isolation mode', async () => {
      const project = await service.createProject(userId, {
        name: 'Alpha Quant Strategy',
        description: 'Algorithmic trading alpha models',
        customInstructions: 'Always output Python vectorbt code.',
      });

      expect(project.id).toMatch(/^proj-/);
      expect(project.userId).toBe(userId);
      expect(project.name).toBe('Alpha Quant Strategy');
      expect(project.description).toBe('Algorithmic trading alpha models');
      expect(project.customInstructions).toBe('Always output Python vectorbt code.');
      expect(project.memoryIsolationMode).toBe('PROJECT_ONLY');
      expect(project.pinnedFiles).toEqual([]);
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('creates a project with initial pinned files', async () => {
      const project = await service.createProject(userId, {
        name: 'Project with Pinned Files',
        pinnedFiles: [
          {
            name: 'strategy.py',
            content: 'import numpy as np\nprint("Strategy loaded")',
            mimeType: 'text/x-python',
            size: 45,
          },
        ],
      });

      expect(project.pinnedFiles).toHaveLength(1);
      expect(project.pinnedFiles[0]?.name).toBe('strategy.py');
      expect(project.pinnedFiles[0]?.mimeType).toBe('text/x-python');
      expect(project.pinnedFiles[0]?.id).toBeDefined();
    });

    it('fails to create a project if name is empty', async () => {
      await expect(service.createProject(userId, { name: '   ' })).rejects.toThrow(
        'Project name is required',
      );
    });

    it('fails to create a project if userId is missing', async () => {
      await expect(service.createProject('', { name: 'Valid Name' })).rejects.toThrow(
        'userId is required',
      );
    });

    it('retrieves an existing project by id', async () => {
      const created = await service.createProject(userId, { name: 'Query Me' });
      const fetched = await service.getProject(userId, created.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('Query Me');
    });

    it('returns null when retrieving non-existent project', async () => {
      const fetched = await service.getProject(userId, 'proj-non-existent');
      expect(fetched).toBeNull();
    });

    it('enforces ownership isolation: user cannot access another users project', async () => {
      const project = await service.createProject(userId, { name: 'Private Workspace' });
      const fetchedByOther = await service.getProject(otherUserId, project.id);
      expect(fetchedByOther).toBeNull();
    });

    it('lists all projects for a specific user ordered by updatedAt desc', async () => {
      const p1 = await service.createProject(userId, { name: 'Project 1' });
      const p2 = await service.createProject(userId, { name: 'Project 2' });
      // Create project for another user
      await service.createProject(otherUserId, { name: 'Other User Project' });

      const list = await service.listProjects(userId);
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.name)).toContain('Project 1');
      expect(list.map((p) => p.name)).toContain('Project 2');
      expect(list.map((p) => p.name)).not.toContain('Other User Project');
    });

    it('updates project fields successfully', async () => {
      const project = await service.createProject(userId, {
        name: 'Original Name',
        description: 'Old description',
      });

      const updated = await service.updateProject(userId, project.id, {
        name: 'Renamed Strategy',
        description: 'New updated description',
        customInstructions: 'Use pandas and polars only.',
      });

      expect(updated.name).toBe('Renamed Strategy');
      expect(updated.description).toBe('New updated description');
      expect(updated.customInstructions).toBe('Use pandas and polars only.');
    });

    it('rejects empty name during update', async () => {
      const project = await service.createProject(userId, { name: 'Original' });
      await expect(service.updateProject(userId, project.id, { name: '   ' })).rejects.toThrow(
        'Project name cannot be empty',
      );
    });

    it('fails to update a non-existent project', async () => {
      await expect(
        service.updateProject(userId, 'proj-ghost', { name: 'Does Not Exist' }),
      ).rejects.toThrow('Project proj-ghost not found');
    });

    it('deletes a project successfully', async () => {
      const project = await service.createProject(userId, { name: 'To Be Deleted' });
      const deleted = await service.deleteProject(userId, project.id);
      expect(deleted).toBe(true);

      const afterDelete = await service.getProject(userId, project.id);
      expect(afterDelete).toBeNull();
    });

    it('returns false when deleting a non-existent project or one owned by another user', async () => {
      const project = await service.createProject(userId, { name: 'Target' });
      const deleteAttempt = await service.deleteProject(otherUserId, project.id);
      expect(deleteAttempt).toBe(false);

      const deleteNonExistent = await service.deleteProject(userId, 'proj-ghost');
      expect(deleteNonExistent).toBe(false);
    });
  });

  describe('Pinned Files Management', () => {
    it('adds pinned files with automatic size calculation when omitted', async () => {
      const project = await service.createProject(userId, { name: 'Context Hub' });
      const content = 'export const API_URL = "https://quantai.internal";';

      const updated = await service.addPinnedFile(userId, project.id, {
        name: 'config.ts',
        content,
        mimeType: 'text/typescript',
      });

      expect(updated.pinnedFiles).toHaveLength(1);
      const file = updated.pinnedFiles[0]!;
      expect(file.name).toBe('config.ts');
      expect(file.mimeType).toBe('text/typescript');
      expect(file.content).toBe(content);
      expect(file.size).toBe(Buffer.byteLength(content, 'utf8'));
      expect(file.id).toMatch(/^file-/);
    });

    it('updates file content if file with same id is added again', async () => {
      const project = await service.createProject(userId, { name: 'Re-upload Project' });
      const initial = await service.addPinnedFile(userId, project.id, {
        id: 'file-fixed-id',
        name: 'notes.txt',
        content: 'Draft 1',
      });
      expect(initial.pinnedFiles).toHaveLength(1);
      expect(initial.pinnedFiles[0]?.content).toBe('Draft 1');

      const updated = await service.addPinnedFile(userId, project.id, {
        id: 'file-fixed-id',
        name: 'notes.txt',
        content: 'Draft 2 (revised)',
      });
      expect(updated.pinnedFiles).toHaveLength(1);
      expect(updated.pinnedFiles[0]?.content).toBe('Draft 2 (revised)');
    });

    it('removes a pinned file by fileId', async () => {
      const project = await service.createProject(userId, { name: 'File Holder' });
      const withFile = await service.addPinnedFile(userId, project.id, {
        name: 'remove_me.md',
        content: '# Scratchpad',
      });

      const fileId = withFile.pinnedFiles[0]!.id;
      const afterRemoval = await service.removePinnedFile(userId, project.id, fileId);

      expect(afterRemoval.pinnedFiles).toHaveLength(0);
    });

    it('throws error when removing a non-existent fileId', async () => {
      const project = await service.createProject(userId, { name: 'File Holder' });
      await expect(
        service.removePinnedFile(userId, project.id, 'file-non-existent'),
      ).rejects.toThrow('Pinned file file-non-existent not found');
    });

    it('prevents file operations from non-owner user', async () => {
      const project = await service.createProject(userId, { name: 'Protected Files' });
      await expect(
        service.addPinnedFile(otherUserId, project.id, { name: 'malicious.sh' }),
      ).rejects.toThrow(`Project ${project.id} not found`);
    });
  });

  describe('Memory Isolation Mode Toggle', () => {
    it('initializes with PROJECT_ONLY by default and allows toggling to UNIFIED', async () => {
      const project = await service.createProject(userId, { name: 'Isolation Check' });
      expect(project.memoryIsolationMode).toBe('PROJECT_ONLY');

      const toggled = await service.updateProject(userId, project.id, {
        memoryIsolationMode: 'UNIFIED',
      });
      expect(toggled.memoryIsolationMode).toBe('UNIFIED');

      const toggledBack = await service.updateProject(userId, project.id, {
        memoryIsolationMode: 'PROJECT_ONLY',
      });
      expect(toggledBack.memoryIsolationMode).toBe('PROJECT_ONLY');
    });

    it('supports specifying UNIFIED mode at creation time', async () => {
      const project = await service.createProject(userId, {
        name: 'Shared Workspace',
        memoryIsolationMode: 'UNIFIED',
      });
      expect(project.memoryIsolationMode).toBe('UNIFIED');
    });
  });

  describe('Project Context Prompt Generation', () => {
    it('returns null for non-existent project', async () => {
      const prompt = await service.getProjectContextPrompt(userId, 'proj-ghost');
      expect(prompt).toBeNull();
    });

    it('generates context prompt with custom instructions and formatted pinned files', async () => {
      const project = await service.createProject(userId, {
        name: 'Quant Risk Engine',
        customInstructions: 'Enforce strict 2% max portfolio VaR.',
        memoryIsolationMode: 'PROJECT_ONLY',
      });

      await service.addPinnedFile(userId, project.id, {
        name: 'risk_limits.json',
        mimeType: 'application/json',
        content: JSON.stringify({ maxVaR: 0.02, maxLeverage: 3 }, null, 2),
        size: 32,
      });

      await service.addPinnedFile(userId, project.id, {
        name: 'README.md',
        mimeType: 'text/markdown',
        content: '# Risk Models\nUse Monte Carlo simulation.',
        size: 40,
      });

      const context = await service.getProjectContextPrompt(userId, project.id);
      expect(context).not.toBeNull();
      expect(context?.customInstructions).toBe('Enforce strict 2% max portfolio VaR.');
      expect(context?.isolationMode).toBe('PROJECT_ONLY');
      expect(context?.pinnedFilesContext).toContain('### File: risk_limits.json');
      expect(context?.pinnedFilesContext).toContain('"maxVaR": 0.02');
      expect(context?.pinnedFilesContext).toContain('### File: README.md');
      expect(context?.pinnedFilesContext).toContain('Monte Carlo simulation.');
    });

    it('handles projects with no pinned files gracefully', async () => {
      const project = await service.createProject(userId, {
        name: 'Empty Workspace',
        customInstructions: 'Be concise.',
      });

      const context = await service.getProjectContextPrompt(userId, project.id);
      expect(context).not.toBeNull();
      expect(context?.customInstructions).toBe('Be concise.');
      expect(context?.pinnedFilesContext).toBe('');
      expect(context?.isolationMode).toBe('PROJECT_ONLY');
    });
  });
});

describe('Projects Fastify Route Integration Tests', () => {
  let app: FastifyInstance;
  let service: ProjectService;
  const testUserId = 'user-fastify-test';

  beforeEach(async () => {
    service = new ProjectService();
    app = Fastify();
    (app as any).projectService = service;
    await app.register(projectsRoutes, { prefix: '/projects' });
    await app.ready();
  });

  it('GET /projects returns empty list initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: { 'x-user-id': testUserId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('POST /projects creates a project and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-user-id': testUserId },
      payload: {
        name: 'Machine Learning Lab',
        description: 'Model training workspace',
        customInstructions: 'Focus on XGBoost and LightGBM.',
        memoryIsolationMode: 'PROJECT_ONLY',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Machine Learning Lab');
    expect(body.data.memoryIsolationMode).toBe('PROJECT_ONLY');
  });

  it('POST /projects validates project name presence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-user-id': testUserId },
      payload: {
        name: '',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /projects/:id returns 404 for unknown project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects/proj-unknown',
      headers: { 'x-user-id': testUserId },
    });

    expect(res.statusCode).toBe(404);
  });

  it('PATCH /projects/:id updates project and toggles memory isolation', async () => {
    const created = await service.createProject(testUserId, {
      name: 'Initial Name',
      memoryIsolationMode: 'PROJECT_ONLY',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${created.id}`,
      headers: { 'x-user-id': testUserId },
      payload: {
        name: 'Updated Name',
        memoryIsolationMode: 'UNIFIED',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('Updated Name');
    expect(body.data.memoryIsolationMode).toBe('UNIFIED');
  });

  it('POST /projects/:id/files attaches pinned file and DELETE removes it', async () => {
    const created = await service.createProject(testUserId, { name: 'Attachment Workspace' });

    // Attach file
    const attachRes = await app.inject({
      method: 'POST',
      url: `/projects/${created.id}/files`,
      headers: { 'x-user-id': testUserId },
      payload: {
        name: 'model.py',
        content: 'def predict(): pass',
        mimeType: 'text/x-python',
      },
    });

    expect(attachRes.statusCode).toBe(201);
    const attachBody = JSON.parse(attachRes.body);
    expect(attachBody.data.pinnedFiles).toHaveLength(1);
    const fileId = attachBody.data.pinnedFiles[0].id;

    // Delete file
    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/projects/${created.id}/files/${fileId}`,
      headers: { 'x-user-id': testUserId },
    });

    expect(removeRes.statusCode).toBe(200);
    const removeBody = JSON.parse(removeRes.body);
    expect(removeBody.data.pinnedFiles).toHaveLength(0);
  });

  it('GET /projects/:id/context returns formatted prompt context', async () => {
    const project = await service.createProject(testUserId, {
      name: 'System Prompt Workspace',
      customInstructions: 'Act as a Senior Quant Trader.',
      memoryIsolationMode: 'PROJECT_ONLY',
      pinnedFiles: [
        {
          name: 'guidelines.txt',
          content: 'Rule 1: Never exceed risk limits.',
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/context`,
      headers: { 'x-user-id': testUserId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.customInstructions).toBe('Act as a Senior Quant Trader.');
    expect(body.data.isolationMode).toBe('PROJECT_ONLY');
    expect(body.data.pinnedFilesContext).toContain('Rule 1: Never exceed risk limits.');
  });

  it('DELETE /projects/:id deletes project', async () => {
    const project = await service.createProject(testUserId, { name: 'To Delete Fastify' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}`,
      headers: { 'x-user-id': testUserId },
    });

    expect(res.statusCode).toBe(200);
    const check = await service.getProject(testUserId, project.id);
    expect(check).toBeNull();
  });
});
