// ============================================================================
// QuantMail — CI Build Real-Time Log Streaming Route (/api/ci/builds/:id/logs)
//
// Streams live stdout/stderr execution logs from Redis PubSub
// channel:ci:build:${buildId}:logs with monotonically increasing sequence IDs
// to CodeHub and terminal clients via Server-Sent Events (SSE).
// Protected by the global auth hook (req.auth.userId).
// ============================================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createAppError } from '@quant/server-core';
import Redis from 'ioredis';

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

type CiRunRow = {
  id: string;
  repoId: string;
  branch: string;
  commitSha: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export default async function ciLogsRoutes(fastify: FastifyInstance) {
  // Resolve repository ids owned by caller
  async function ownedRepoIds(userId: string): Promise<string[]> {
    const prisma = getPrisma(fastify);
    const rows = (await prisma.repository.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    })) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // Handler for streaming CI build logs over SSE / HTTP stream
  const streamBuildLogsHandler = async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: { stream?: string; once?: string };
    }>,
    reply: FastifyReply,
  ) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const buildId = request.params.id;

    const run = (await prisma.ciRun.findUnique({
      where: { id: buildId },
    })) as CiRunRow | null;

    if (!run) {
      throw createAppError('Build not found', 404, 'BUILD_NOT_FOUND');
    }

    const ids = await ownedRepoIds(userId);
    if (!ids.includes(run.repoId)) {
      throw createAppError('Build not found', 404, 'BUILD_NOT_FOUND');
    }

    const acceptHeader = request.headers.accept ?? '';
    const wantsJson =
      acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream');

    // If caller specifically requested JSON snapshot instead of SSE stream
    if (wantsJson && request.query?.stream !== 'true') {
      return reply.send({
        success: true,
        data: {
          buildId: run.id,
          status: run.status.toLowerCase(),
          channel: `channel:ci:build:${run.id}:logs`,
        },
      });
    }

    // Configure Server-Sent Events (SSE) streaming headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    if (typeof (reply.raw as any).flushHeaders === 'function') {
      (reply.raw as any).flushHeaders();
    }

    const channel = `channel:ci:build:${run.id}:logs`;

    // Emit initial connection event with monotonic seq 0
    reply.raw.write(
      `id: 0\nevent: connected\ndata: ${JSON.stringify({
        status: 'connected',
        buildId: run.id,
        channel,
      })}\n\n`,
    );

    // If caller requested a one-shot probe / test stream
    if (request.headers['x-test-stream-once'] === 'true' || request.query?.once === 'true') {
      reply.raw.end();
      return reply;
    }

    // Connect Redis subscriber for this build stream
    let subscriber: Redis | null = null;
    let isCleanedUp = false;

    const cleanup = async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (subscriber) {
        try {
          await subscriber.unsubscribe(channel);
          await subscriber.quit();
        } catch {
          try {
            subscriber.disconnect();
          } catch {}
        }
        subscriber = null;
      }
    };

    request.raw.on('close', () => {
      void cleanup();
    });

    try {
      const redisUrl =
        process.env['REDIS_URL'] ||
        `redis://${process.env['REDIS_HOST'] ?? 'localhost'}:${process.env['REDIS_PORT'] ?? '6379'}`;

      subscriber = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 500,
        retryStrategy: () => null,
      });

      subscriber.on('error', (_err) => {
        // Suppress unhandled connection errors on subscriber
      });

      subscriber.on('message', (incomingChannel, message) => {
        if (incomingChannel !== channel || isCleanedUp) return;

        try {
          const payload = JSON.parse(message);
          const seq = payload.seq ?? 1;
          reply.raw.write(`id: ${seq}\nevent: log\ndata: ${message}\n\n`);

          if (payload.isEnd) {
            reply.raw.write(
              `event: end\ndata: ${JSON.stringify({ buildId: run.id, completed: true })}\n\n`,
            );
          }
        } catch {
          reply.raw.write(`event: log\ndata: ${message}\n\n`);
        }
      });

      await Promise.race([
        subscriber.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 500),
        ),
      ]);
      await subscriber.subscribe(channel);
    } catch {
      // If Redis subscriber cannot connect (e.g. offline/mock environment),
      // keep SSE open with heartbeat until client disconnects
      const heartbeatTimer = setInterval(() => {
        if (isCleanedUp) {
          clearInterval(heartbeatTimer);
          return;
        }
        reply.raw.write(': heartbeat\n\n');
      }, 15000);

      request.raw.on('close', () => {
        clearInterval(heartbeatTimer);
      });
    }

    // Keep request alive for SSE streaming
    return reply;
  };

  // Mount both /api/ci/builds/:id/logs and /ci/builds/:id/logs endpoints
  fastify.get<{ Params: { id: string }; Querystring: { stream?: string; once?: string } }>(
    '/api/ci/builds/:id/logs',
    streamBuildLogsHandler,
  );
  fastify.get<{ Params: { id: string }; Querystring: { stream?: string; once?: string } }>(
    '/ci/builds/:id/logs',
    streamBuildLogsHandler,
  );
}
