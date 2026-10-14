// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import quantyAgentRoutes from '../routes/quanty-agent';

describe('quanty task SSE hijack regression (fix/qm-quanty-hijack-convention)', () => {
  let app: FastifyInstance;
  // `any`: the route plugin casts fastify.prisma internally; a bare {}
  // does not satisfy Fastify's decorate() GetterSetter typing.
  const mockPrisma: any = {};
  const hijackCalls: string[] = [];
  let onSendFired = false;
  let terminalTaskId = '';

  beforeAll(async () => {
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

    await app.register(quantyAgentRoutes);
    await app.ready();

    // Seed a terminal task through the unmatched-command path: the rule
    // planner marks unknown commands unmatched, so the POST handler stores a
    // 'failed' task and returns before the executor ever runs — no
    // background work inside the test process.
    const res = await app.inject({
      method: 'POST',
      url: '/api/quanty/tasks',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ command: 'xqzzy flibbertigibbet wobble nonsense 42' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('failed');
    terminalTaskId = body.data.taskId;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    hijackCalls.length = 0;
    onSendFired = false;
  });

  it('hijacks the reply before streaming a terminal task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/quanty/tasks/${terminalTaskId}/stream`,
      headers: { accept: 'text/event-stream' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    // Terminal tasks close immediately after the snapshot: behavior unchanged.
    expect(res.body).toContain('data: [DONE]');
    // Regression: the pre-fix code never called reply.hijack() — the stream
    // only survived because Fastify's wrap-thenable skips send when the
    // handler resolves undefined with headers already sent.
    expect(hijackCalls).toEqual([`/api/quanty/tasks/${terminalTaskId}/stream`]);
    // A hijacked response never enters Fastify's send path.
    expect(onSendFired).toBe(false);
  });

  it('does not hijack when the task does not exist (auth check runs first)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quanty/tasks/no-such-task/stream',
      headers: { accept: 'text/event-stream' },
    });

    expect(res.statusCode).toBe(404);
    expect(hijackCalls).toEqual([]);
    expect(onSendFired).toBe(true);
  });

  it('does not hijack the non-streaming task route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/quanty/tasks/${terminalTaskId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(hijackCalls).toEqual([]);
    expect(onSendFired).toBe(true);
  });
});
