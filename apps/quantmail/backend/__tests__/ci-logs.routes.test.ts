// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import ciLogsRoutes from '../routes/ci-logs';

describe('CI Build Real-Time Log Streaming Route (Task W34-04)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      repository: {
        findMany: vi.fn(),
      },
      ciRun: {
        findUnique: vi.fn(),
      },
    };

    app = fastify();
    app.decorate('prisma', mockPrisma);

    // Mock global auth hook behavior
    app.addHook('preHandler', async (request: any) => {
      const authHeader = request.headers.authorization;
      if (authHeader === 'Bearer valid-user-token') {
        request.auth = { userId: 'user-1' };
      } else if (authHeader === 'Bearer other-user-token') {
        request.auth = { userId: 'user-2' };
      }
    });

    await app.register(ciLogsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/build-123/logs',
    });

    expect(res.statusCode).toBe(401);
    const json = res.json();
    expect(json.message).toContain('Authentication required');
  });

  it('returns 404 BUILD_NOT_FOUND when build does not exist', async () => {
    mockPrisma.ciRun.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/non-existent/logs',
      headers: {
        authorization: 'Bearer valid-user-token',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when build belongs to a repository not owned by caller', async () => {
    mockPrisma.ciRun.findUnique.mockResolvedValueOnce({
      id: 'build-foreign',
      repoId: 'repo-private-other',
      status: 'RUNNING',
    });
    // Caller user-1 owns repo-1
    mockPrisma.repository.findMany.mockResolvedValueOnce([{ id: 'repo-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/build-foreign/logs',
      headers: {
        authorization: 'Bearer valid-user-token',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns JSON build log channel metadata when Accept: application/json is specified', async () => {
    mockPrisma.ciRun.findUnique.mockResolvedValueOnce({
      id: 'build-123',
      repoId: 'repo-1',
      status: 'RUNNING',
    });
    mockPrisma.repository.findMany.mockResolvedValueOnce([{ id: 'repo-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/build-123/logs',
      headers: {
        authorization: 'Bearer valid-user-token',
        accept: 'application/json',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.buildId).toBe('build-123');
    expect(json.data.channel).toBe('channel:ci:build:build-123:logs');
  });

  it('initiates SSE text/event-stream connection for authorized requests on /ci/builds/:id/logs', async () => {
    mockPrisma.ciRun.findUnique.mockResolvedValueOnce({
      id: 'build-456',
      repoId: 'repo-1',
      status: 'RUNNING',
    });
    mockPrisma.repository.findMany.mockResolvedValueOnce([{ id: 'repo-1' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/ci/builds/build-456/logs?once=true',
      headers: {
        authorization: 'Bearer valid-user-token',
        accept: 'text/event-stream',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: connected');
    expect(res.body).toContain('channel:ci:build:build-456:logs');
  });
});
