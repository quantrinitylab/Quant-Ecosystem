// ============================================================================
// QuantAI — Project Context Fastify Routes Tests (Task W39-A04)
// Endpoints:
// - POST   /projects
// - GET    /projects
// - GET    /projects/:projectId
// - POST   /projects/:projectId/memories
// - GET    /projects/:projectId/context
// - DELETE /projects/:projectId/memories
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import projectContextRoutes from '../routes/project-context';
import { ProjectContextService } from '../services/project-context.service';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('Fastify Routes: /projects (Task W39-A04)', () => {
  let app: ReturnType<typeof Fastify>;
  let projectContextService: ProjectContextService;
  let testUserId: string | null = 'user-test-architect';

  beforeEach(async () => {
    app = Fastify();
    projectContextService = new ProjectContextService();

    app.decorate('projectContextService', projectContextService);
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      if (testUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
      }
    });

    await app.register(projectContextRoutes, { prefix: '/projects' });
    await app.ready();
  });

  afterEach(async () => {
    testUserId = 'user-test-architect';
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. POST /projects - Create Project Workspace
  // --------------------------------------------------------------------------
  it('POST /projects — creates a new project workspace with isolation boundaries', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        name: 'Quantum Risk Engine',
        description: 'Portfolio VaR Monte Carlo Simulator',
        customInstructions: 'Always output Python vectorbt code.',
        inheritDefaultMemory: false,
        retentionPolicy: '90_days',
        sensitivityLevel: 'restricted',
        complianceTags: ['SOC2', 'PROPRIETARY'],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^proj-/);
    expect(body.data.name).toBe('Quantum Risk Engine');
    expect(body.data.inheritDefaultMemory).toBe(false);
    expect(body.data.memoryIsolationMode).toBe('PROJECT_ONLY');
    expect(body.data.retentionPolicy).toBe('90_days');
    expect(body.data.sensitivityLevel).toBe('restricted');
  });

  it('POST /projects — rejects invalid payload when name is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        name: '',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 2. GET /projects - List User Projects
  // --------------------------------------------------------------------------
  it('GET /projects — lists user projects', async () => {
    // Create 2 projects
    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Alpha Project' },
    });
    await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Beta Project' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/projects',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 3. GET /projects/:projectId - Get Specific Project
  // --------------------------------------------------------------------------
  it('GET /projects/:projectId — returns project details for owner', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Target Project' },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(projectId);
    expect(body.data.name).toBe('Target Project');
  });

  it('GET /projects/:projectId — returns 404 for non-existent project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/projects/proj-does-not-exist',
    });

    expect(response.statusCode).toBe(404);
  });

  // --------------------------------------------------------------------------
  // 4. POST /projects/:projectId/memories - Record Project-Isolated Memory
  // --------------------------------------------------------------------------
  it('POST /projects/:projectId/memories — records memory strictly isolated to project', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'ML Pipeline' },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    const memRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/memories`,
      payload: {
        content: 'Model hyperparameters: learning_rate=0.001, epochs=50',
        category: 'fact',
        tags: ['hyperparams', 'training'],
      },
    });

    expect(memRes.statusCode).toBe(201);
    const body = JSON.parse(memRes.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^mem-/);
    expect(body.data.projectId).toBe(projectId);
    expect(body.data.scope).toBe('project');
    expect(body.data.content).toContain('learning_rate=0.001');
  });

  // --------------------------------------------------------------------------
  // 5. GET /projects/:projectId/context - Retrieve Isolated Context
  // --------------------------------------------------------------------------
  it('GET /projects/:projectId/context — retrieves isolated project context with isolationHash', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        name: 'Isolated Backend Enclave',
        customInstructions: 'Never expose internal IP addresses.',
        inheritDefaultMemory: false,
      },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    // Add memory
    await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/memories`,
      payload: {
        content: 'Internal DB runs on port 5432 with TLS 1.3 only',
        category: 'architecture',
      },
    });

    const ctxRes = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/context`,
    });

    expect(ctxRes.statusCode).toBe(200);
    const body = JSON.parse(ctxRes.body);
    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe(projectId);
    expect(body.data.scope).toBe('project_isolated');
    expect(body.data.projectMemories).toHaveLength(1);
    expect(body.data.defaultMemoriesIncluded).toHaveLength(0);
    expect(body.data.boundaryEnforced).toBe(true);
    expect(body.data.isolationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data.systemInstructionsCombined).toContain('Never expose internal IP');
  });

  // --------------------------------------------------------------------------
  // 6. DELETE /projects/:projectId/memories - Purge Project Memories
  // --------------------------------------------------------------------------
  it('DELETE /projects/:projectId/memories — purges all memories in project', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'To Be Purged' },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/memories`,
      payload: { content: 'Ephemeral note 1' },
    });
    await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/memories`,
      payload: { content: 'Ephemeral note 2' },
    });

    const purgeRes = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/memories`,
    });

    expect(purgeRes.statusCode).toBe(200);
    const body = JSON.parse(purgeRes.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PURGED');
    expect(body.data.purgedCount).toBe(2);

    // Context now has 0 memories
    const ctxRes = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/context`,
    });
    const ctxBody = JSON.parse(ctxRes.body);
    expect(ctxBody.data.projectMemories).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 7. File Attachment Endpoints
  // --------------------------------------------------------------------------
  it('POST & GET /projects/:projectId/files — attaches and lists files', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Doc Project' },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    const fileRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files`,
      payload: {
        name: 'spec.md',
        size: 1024,
        mimeType: 'text/markdown',
        contentSnippet: '# API Specification',
      },
    });

    expect(fileRes.statusCode).toBe(201);
    const fileBody = JSON.parse(fileRes.body);
    expect(fileBody.success).toBe(true);
    expect(fileBody.data.name).toBe('spec.md');

    const listFilesRes = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
    });
    const listBody = JSON.parse(listFilesRes.body);
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('spec.md');
  });

  // --------------------------------------------------------------------------
  // 8. Authentication & Multi-Tenant Security
  // --------------------------------------------------------------------------
  it('requires authentication (401 when unauthenticated)', async () => {
    testUserId = null; // Unauthenticated
    const response = await app.inject({
      method: 'GET',
      url: '/projects',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /projects/:projectId/audit — returns memory isolation audit status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Audited Workspace' },
    });
    const projectId = JSON.parse(createRes.body).data.id;

    const auditRes = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/audit`,
    });

    expect(auditRes.statusCode).toBe(200);
    const body = JSON.parse(auditRes.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ISOLATED');
    expect(body.data.leaksDetected).toBe(false);
  });
});
