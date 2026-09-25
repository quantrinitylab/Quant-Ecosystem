// ============================================================================
// QuantAI — ProjectMemoryService & Fastify Routes Test Suite
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { ProjectMemoryService, type ProjectMemory } from '../services/project-memory.service';
import projectMemoryRoutes from '../routes/project-memory';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('ProjectMemoryService — Unit & Boundary Isolation', () => {
  let service: ProjectMemoryService;

  beforeEach(() => {
    service = new ProjectMemoryService();
  });

  describe('createProjectMemory', () => {
    it('creates project memory with DEFAULT mode and empty entries', () => {
      const memory = service.createProjectMemory({
        projectId: 'proj-alpha',
        workspaceId: 'ws-quant',
        customInstructions: 'Always follow Quant guidelines',
      });

      expect(memory.projectId).toBe('proj-alpha');
      expect(memory.workspaceId).toBe('ws-quant');
      expect(memory.customInstructions).toBe('Always follow Quant guidelines');
      expect(memory.memoryMode).toBe('DEFAULT');
      expect(memory.memoryEntries).toEqual([]);
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
    });

    it('creates project memory with PROJECT_ISOLATED mode', () => {
      const memory = service.createProjectMemory({
        projectId: 'proj-classified',
        workspaceId: 'ws-secret',
        memoryMode: 'PROJECT_ISOLATED',
      });

      expect(memory.projectId).toBe('proj-classified');
      expect(memory.memoryMode).toBe('PROJECT_ISOLATED');
    });

    it('throws error when creating duplicate projectId', () => {
      service.createProjectMemory({
        projectId: 'proj-duplicate',
        workspaceId: 'ws-1',
      });

      expect(() => {
        service.createProjectMemory({
          projectId: 'proj-duplicate',
          workspaceId: 'ws-2',
        });
      }).toThrow("Project memory for project 'proj-duplicate' already exists");
    });

    it('throws error on missing required fields', () => {
      expect(() => {
        service.createProjectMemory({
          projectId: '',
          workspaceId: 'ws-1',
        });
      }).toThrow('projectId is required');

      expect(() => {
        service.createProjectMemory({
          projectId: 'p-1',
          workspaceId: '',
        });
      }).toThrow('workspaceId is required');
    });
  });

  describe('getProjectMemory', () => {
    it('returns existing project memory', () => {
      service.createProjectMemory({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      const found = service.getProjectMemory('proj-1');
      expect(found).toBeDefined();
      expect(found?.projectId).toBe('proj-1');
    });

    it('returns undefined for non-existent project', () => {
      const found = service.getProjectMemory('proj-missing');
      expect(found).toBeUndefined();
    });
  });

  describe('updateMemoryMode', () => {
    it('switches mode between DEFAULT and PROJECT_ISOLATED', () => {
      service.createProjectMemory({
        projectId: 'proj-toggle',
        workspaceId: 'ws-1',
        memoryMode: 'DEFAULT',
      });

      const updatedToIsolated = service.updateMemoryMode('proj-toggle', 'PROJECT_ISOLATED');
      expect(updatedToIsolated.memoryMode).toBe('PROJECT_ISOLATED');

      const updatedToDefault = service.updateMemoryMode('proj-toggle', 'DEFAULT');
      expect(updatedToDefault.memoryMode).toBe('DEFAULT');
    });

    it('throws error for non-existent project', () => {
      expect(() => {
        service.updateMemoryMode('proj-none', 'PROJECT_ISOLATED');
      }).toThrow('Project memory not found for project: proj-none');
    });
  });

  describe('updateCustomInstructions', () => {
    it('updates custom instructions string', () => {
      service.createProjectMemory({
        projectId: 'proj-prompt',
        workspaceId: 'ws-1',
        customInstructions: 'Initial instructions',
      });

      const updated = service.updateCustomInstructions(
        'proj-prompt',
        'Updated: Act as a Senior Quant Systems Architect.',
      );
      expect(updated.customInstructions).toBe('Updated: Act as a Senior Quant Systems Architect.');
    });
  });

  describe('addMemoryEntry & removeMemoryEntry', () => {
    it('adds entry with category and pinned state', () => {
      service.createProjectMemory({
        projectId: 'proj-entries',
        workspaceId: 'ws-1',
      });

      const entry = service.addMemoryEntry('proj-entries', {
        content: 'Use React 19 forwardRef-free FC components',
        category: 'architecture',
        isPinned: true,
      });

      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('Use React 19 forwardRef-free FC components');
      expect(entry.category).toBe('architecture');
      expect(entry.isPinned).toBe(true);

      const mem = service.getProjectMemory('proj-entries');
      expect(mem?.memoryEntries).toHaveLength(1);
    });

    it('removes entry by id', () => {
      service.createProjectMemory({
        projectId: 'proj-remove',
        workspaceId: 'ws-1',
      });

      const entry = service.addMemoryEntry('proj-remove', {
        content: 'Temporary debug note',
      });

      const removed = service.removeMemoryEntry('proj-remove', entry.id);
      expect(removed).toBe(true);

      const mem = service.getProjectMemory('proj-remove');
      expect(mem?.memoryEntries).toHaveLength(0);
    });

    it('returns false when removing non-existent entryId', () => {
      service.createProjectMemory({
        projectId: 'proj-remove-nonexistent',
        workspaceId: 'ws-1',
      });

      const removed = service.removeMemoryEntry('proj-remove-nonexistent', 'mem_missing');
      expect(removed).toBe(false);
    });

    it('throws error when adding empty content', () => {
      service.createProjectMemory({
        projectId: 'proj-empty',
        workspaceId: 'ws-1',
      });

      expect(() => {
        service.addMemoryEntry('proj-empty', { content: '   ' });
      }).toThrow('Memory content cannot be empty');
    });
  });

  describe('togglePin', () => {
    it('toggles pin state from false to true and back to false', () => {
      service.createProjectMemory({
        projectId: 'proj-pin',
        workspaceId: 'ws-1',
      });

      const entry = service.addMemoryEntry('proj-pin', {
        content: 'Pinned architectural guideline',
        isPinned: false,
      });

      const pinned = service.togglePin('proj-pin', entry.id);
      expect(pinned.isPinned).toBe(true);

      const unpinned = service.togglePin('proj-pin', entry.id);
      expect(unpinned.isPinned).toBe(false);
    });

    it('throws error if entry not found', () => {
      service.createProjectMemory({
        projectId: 'proj-pin-error',
        workspaceId: 'ws-1',
      });

      expect(() => {
        service.togglePin('proj-pin-error', 'unknown-entry-id');
      }).toThrow("Memory entry 'unknown-entry-id' not found in project 'proj-pin-error'");
    });
  });

  // ==========================================================================
  // Strict Enterprise Memory Isolation Invariant Tests
  // ==========================================================================
  describe('Enterprise Isolation Invariants (DEFAULT vs PROJECT_ISOLATED)', () => {
    beforeEach(() => {
      // Setup Project A (DEFAULT mode - shared context)
      service.createProjectMemory({
        projectId: 'proj-public-A',
        workspaceId: 'ws-1',
        memoryMode: 'DEFAULT',
      });
      service.addMemoryEntry('proj-public-A', {
        content: 'Public guideline: use Tailwind v3 tokens',
        category: 'ui',
      });

      // Setup Project B (DEFAULT mode - shared context)
      service.createProjectMemory({
        projectId: 'proj-public-B',
        workspaceId: 'ws-1',
        memoryMode: 'DEFAULT',
      });
      service.addMemoryEntry('proj-public-B', {
        content: 'Public guideline: database uses PostgreSQL 16',
        category: 'database',
      });

      // Setup Project S (PROJECT_ISOLATED mode - classified enterprise boundary)
      service.createProjectMemory({
        projectId: 'proj-secret-S',
        workspaceId: 'ws-classified',
        memoryMode: 'PROJECT_ISOLATED',
      });
      service.addMemoryEntry('proj-secret-S', {
        content: 'Classified: proprietary hedge fund alpha trading formula',
        category: 'trading',
      });
    });

    it('Invariant 1: Project-isolated queries return ONLY their own memories', () => {
      // Querying with projectId = proj-secret-S must return only proj-secret-S entries
      const memories = service.queryMemories('*', 'proj-secret-S');
      expect(memories).toHaveLength(1);
      expect(memories[0]!.content).toContain('proprietary hedge fund alpha trading formula');

      // Must not see public A or public B memories
      expect(memories.some((m) => m.content.includes('Tailwind'))).toBe(false);
      expect(memories.some((m) => m.content.includes('PostgreSQL'))).toBe(false);
    });

    it('Invariant 2: Cross-project queries NEVER leak memories from PROJECT_ISOLATED workspaces', () => {
      // Cross-project query (no projectId)
      const globalMemories = service.queryMemories('*');

      // Should contain public A and public B memories
      expect(globalMemories.some((m) => m.content.includes('Tailwind'))).toBe(true);
      expect(globalMemories.some((m) => m.content.includes('PostgreSQL'))).toBe(true);

      // Must NEVER contain classified memory from isolated project S
      const leaked = globalMemories.some((m) =>
        m.content.includes('proprietary hedge fund alpha trading formula'),
      );
      expect(leaked).toBe(false);
    });

    it('Invariant 3: Projects in DEFAULT mode NEVER see memories from PROJECT_ISOLATED workspaces', () => {
      // Querying within proj-public-A
      const memoriesFromA = service.queryMemories('*', 'proj-public-A');

      // Can see its own memory and Public B's memory (since both are DEFAULT)
      expect(memoriesFromA.some((m) => m.content.includes('Tailwind'))).toBe(true);
      expect(memoriesFromA.some((m) => m.content.includes('PostgreSQL'))).toBe(true);

      // Must NOT see secret S memory
      expect(
        memoriesFromA.some((m) =>
          m.content.includes('proprietary hedge fund alpha trading formula'),
        ),
      ).toBe(false);
    });

    it('Invariant 4: Switching a project from DEFAULT to PROJECT_ISOLATED immediately locks down its memories', () => {
      // Before lockdown: proj-public-A memories are visible globally
      let globalMemories = service.queryMemories('Tailwind');
      expect(globalMemories).toHaveLength(1);

      // Switch proj-public-A to PROJECT_ISOLATED
      service.updateMemoryMode('proj-public-A', 'PROJECT_ISOLATED');

      // After lockdown: proj-public-A memories are strictly sealed
      globalMemories = service.queryMemories('Tailwind');
      expect(globalMemories).toHaveLength(0);

      // But inside proj-public-A, it can still access its own memories
      const isolatedMemories = service.queryMemories('Tailwind', 'proj-public-A');
      expect(isolatedMemories).toHaveLength(1);
    });
  });
});

// ============================================================================
// Fastify Routes Integration Tests
// ============================================================================
describe('Fastify Routes: /projects/:projectId/memory', () => {
  let app: ReturnType<typeof Fastify>;
  let projectMemoryService: ProjectMemoryService;

  beforeEach(async () => {
    app = Fastify();
    projectMemoryService = new ProjectMemoryService();

    app.decorate('projectMemoryService', projectMemoryService);
    await app.register(projectMemoryRoutes, { prefix: '/projects' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /projects/:projectId/memory — auto-creates default workspace if none exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects/test-proj-1/memory?workspaceId=ws-auto',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe('test-proj-1');
    expect(body.data.workspaceId).toBe('ws-auto');
    expect(body.data.memoryMode).toBe('DEFAULT');
  });

  it('GET /projects/:projectId/memory?autoCreate=false — returns 404 for unknown project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects/nonexistent-proj/memory?autoCreate=false',
    });

    expect(res.statusCode).toBe(404);
  });

  it('PATCH /projects/:projectId/memory/mode — updates memory isolation mode', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-mode-test',
      workspaceId: 'ws-1',
      memoryMode: 'DEFAULT',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/proj-mode-test/memory/mode',
      payload: { mode: 'PROJECT_ISOLATED' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.memoryMode).toBe('PROJECT_ISOLATED');
  });

  it('PATCH /projects/:projectId/memory/instructions — updates workspace instructions', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-instruct',
      workspaceId: 'ws-1',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/proj-instruct/memory/instructions',
      payload: { customInstructions: 'Always test edge cases in backend services' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.customInstructions).toBe('Always test edge cases in backend services');
  });

  it('POST /projects/:projectId/memory/entries — adds memory entry and returns 201', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-entry-test',
      workspaceId: 'ws-1',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/projects/proj-entry-test/memory/entries',
      payload: {
        content: 'Use QSDS tokens #0D1117 and #58A6FF',
        category: 'design-system',
        isPinned: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('Use QSDS tokens #0D1117 and #58A6FF');
    expect(body.data.category).toBe('design-system');
    expect(body.data.isPinned).toBe(true);
  });

  it('POST /projects/:projectId/memory/entries/:entryId/pin — toggles entry pin', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-pin-test',
      workspaceId: 'ws-1',
    });
    const entry = projectMemoryService.addMemoryEntry('proj-pin-test', {
      content: 'Toggle pin test entry',
      isPinned: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/proj-pin-test/memory/entries/${entry.id}/pin`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isPinned).toBe(true);
  });

  it('DELETE /projects/:projectId/memory/entries/:entryId — deletes memory entry', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-del-test',
      workspaceId: 'ws-1',
    });
    const entry = projectMemoryService.addMemoryEntry('proj-del-test', {
      content: 'Entry to be deleted',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/projects/proj-del-test/memory/entries/${entry.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.removed).toBe(true);

    const mem = projectMemoryService.getProjectMemory('proj-del-test');
    expect(mem?.memoryEntries).toHaveLength(0);
  });

  it('GET /projects/:projectId/memory/query — performs isolated memory query', async () => {
    projectMemoryService.createProjectMemory({
      projectId: 'proj-query-test',
      workspaceId: 'ws-1',
      memoryMode: 'PROJECT_ISOLATED',
    });
    projectMemoryService.addMemoryEntry('proj-query-test', {
      content: 'Isolated secret token: ABC-123',
      category: 'credentials',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/projects/proj-query-test/memory/query?q=secret',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].content).toContain('ABC-123');
  });
});
