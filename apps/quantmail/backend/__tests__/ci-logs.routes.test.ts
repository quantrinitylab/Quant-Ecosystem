// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import ciLogsRoutes from '../routes/ci-logs';
import { formatLogSseFrames } from '../routes/ci-logs';

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

describe('CI logs SSE hijack regression (fix/qm-ci-logs-hijack)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  const hijackCalls: string[] = [];
  let onSendFired = false;

  beforeAll(async () => {
    mockPrisma = {
      repository: {
        findMany: vi.fn().mockResolvedValue([{ id: 'repo-1' }]),
      },
      ciRun: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'build-h', repoId: 'repo-1', status: 'RUNNING' }),
      },
    };

    app = fastify();
    app.decorate('prisma', mockPrisma);

    // Assign req.auth directly in the hook — no credential-shaped literals.
    app.addHook('preHandler', async (request: any, reply: any) => {
      request.auth = { userId: 'user-1' };
      const origHijack = reply.hijack.bind(reply);
      reply.hijack = ((...args: unknown[]) => {
        hijackCalls.push(request.url);
        return (origHijack as (...a: unknown[]) => unknown)(...args);
      }) as typeof reply.hijack;
    });

    app.addHook('onSend', async () => {
      onSendFired = true;
    });

    await app.register(ciLogsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    hijackCalls.length = 0;
    onSendFired = false;
  });

  it('hijacks the reply before the first SSE write (once=true probe)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/build-h/logs?once=true',
      headers: { accept: 'text/event-stream' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: connected');
    // Regression: the pre-fix code never called hijack(), so Fastify's
    // post-handler send path fired on the already-flowing raw response and
    // killed the stream right after the `event: connected` frame.
    expect(hijackCalls).toEqual(['/api/ci/builds/build-h/logs?once=true']);
  });

  it('does not run Fastify send-path hooks on the hijacked SSE response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ci/builds/build-h/logs?once=true',
      headers: { accept: 'text/event-stream' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('event: connected');
    // Pre-fix `return reply` after raw.end() re-entered the send path.
    expect(onSendFired).toBe(false);
  });

  it('does not hijack the JSON snapshot path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ci/builds/build-h/logs',
      headers: { accept: 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(hijackCalls).toEqual([]);
    expect(onSendFired).toBe(true);
  });
});

describe('formatLogSseFrames (fix/qm-ci-logs-redis-publish)', () => {
  const batch = (overrides = {}) =>
    JSON.stringify({
      buildId: 'build-1',
      jobId: 'build-1-compile',
      seq: 3,
      entries: [
        { seq: 1, timestamp: 1700000000000, stream: 'stdout', line: 'hello' },
        { seq: 2, timestamp: 1700000000001, stream: 'stderr', line: 'oops' },
      ],
      ...overrides,
    });

  it('unpacks a batch payload into one SSE log frame per entry', () => {
    const frames = formatLogSseFrames('build-1', batch());

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatch(/^id: 1\nevent: log\ndata: /);
    expect(frames[1]).toMatch(/^id: 2\nevent: log\ndata: /);

    // BuildTerminal renders data.line — each frame must carry it.
    const first = JSON.parse(frames[0]!.split('data: ')[1]!);
    expect(first.line).toBe('hello');
    expect(first.stream).toBe('stdout');
    const second = JSON.parse(frames[1]!.split('data: ')[1]!);
    expect(second.line).toBe('oops');
    expect(second.stream).toBe('stderr');
  });

  it('emits terminal frames on isEnd, including an unnamed log frame BuildTerminal observes', () => {
    const frames = formatLogSseFrames('build-1', batch({ isEnd: true }));

    // 2 entry frames + event:end + unnamed isEnd log frame.
    expect(frames).toHaveLength(4);
    const endFrame = frames.find((f) => f.startsWith('event: end'));
    expect(endFrame).toBeDefined();
    expect(JSON.parse(endFrame!.split('data: ')[1]!)).toEqual({
      buildId: 'build-1',
      completed: true,
    });

    // BuildTerminal's EventSource onmessage only fires for unnamed events.
    const terminalLog = frames.find(
      (f) => f.startsWith('event: log') && f.includes('"isEnd":true'),
    );
    expect(terminalLog).toBeDefined();
    expect(JSON.parse(terminalLog!.split('data: ')[1]!)).toMatchObject({
      buildId: 'build-1',
      isEnd: true,
    });
  });

  it('forwards a legacy single-message payload untouched', () => {
    const message = JSON.stringify({ seq: 7, line: 'legacy line' });
    const frames = formatLogSseFrames('build-1', message);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe(`id: 7\nevent: log\ndata: ${message}\n\n`);
  });

  it('forwards non-JSON messages as a single fallback frame', () => {
    const frames = formatLogSseFrames('build-1', 'plain text log');
    expect(frames).toEqual(['event: log\ndata: plain text log\n\n']);
  });

  it('defaults the SSE id to 1 when the payload has no usable seq', () => {
    const frames = formatLogSseFrames('build-1', JSON.stringify({ line: 'x' }));
    expect(frames[0]).toMatch(/^id: 1\nevent: log\n/);
  });
});
