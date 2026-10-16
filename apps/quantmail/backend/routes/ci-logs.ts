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

/** One log line inside a ci-runner batch payload. */
export interface CiLogBatchEntry {
  seq?: number;
  timestamp?: number;
  stream?: 'stdout' | 'stderr';
  line?: string;
}

/** Batch payload the ci-runner LogStreamer publishes per flush. */
export interface CiLogBatchPayload {
  buildId?: string;
  jobId?: string;
  seq?: number;
  entries?: CiLogBatchEntry[];
  isEnd?: boolean;
}

/**
 * Convert one Redis PubSub message into the SSE frames to write.
 *
 * The ci-runner publishes BATCH payloads ({seq, entries: [{seq, timestamp,
 * stream, line}], isEnd}) — one frame is not renderable by BuildTerminal,
 * which reads `data.line` per event. Unpack batches into one `event: log`
 * frame per entry (SSE id = the entry's monotonic seq).
 *
 * Completion: the `event: end` frame is the machine signal, but
 * BuildTerminal's EventSource only observes unnamed `message` events (it has
 * no 'end' listener), so a final unnamed `log` frame carrying isEnd is what
 * flips the terminal to COMPLETED. Both are emitted.
 */
export function formatLogSseFrames(buildId: string, message: string): string[] {
  let payload: CiLogBatchPayload | null = null;
  try {
    payload = JSON.parse(message) as CiLogBatchPayload;
  } catch {
    // Not JSON (legacy/plain-text producer) — forward as a single log event.
    return [`event: log\ndata: ${message}\n\n`];
  }
  if (!payload || typeof payload !== 'object') {
    return [`event: log\ndata: ${message}\n\n`];
  }

  const frames: string[] = [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length > 0) {
    for (const entry of entries) {
      const seq = typeof entry?.seq === 'number' ? entry.seq : 1;
      frames.push(`id: ${seq}\nevent: log\ndata: ${JSON.stringify(entry ?? {})}\n\n`);
    }
  } else {
    // Legacy single-message shape — forward untouched.
    const seq = typeof payload.seq === 'number' ? payload.seq : 1;
    frames.push(`id: ${seq}\nevent: log\ndata: ${message}\n\n`);
  }

  if (payload.isEnd) {
    frames.push(`event: end\ndata: ${JSON.stringify({ buildId, completed: true })}\n\n`);
    frames.push(
      `event: log\ndata: ${JSON.stringify({ buildId, isEnd: true, status: 'completed' })}\n\n`,
    );
  }
  return frames;
}

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

    // Hijack FIRST — auth/ownership checks and the JSON snapshot path above are all
    // resolved before this point. After hijack, Fastify skips its post-handler send
    // path, so the raw SSE response stays open (repo convention: sse-transport.ts).
    // Without hijack, returning the reply triggers send on an already-flowing raw
    // response and Fastify kills the stream right after the `event: connected` frame.
    reply.hijack();

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
      // Hijacked: no Fastify send on return — just end the handler.
      return;
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
        } catch (quitErr) {
          try {
            subscriber.disconnect();
          } catch (discErr) {
            fastify.log.debug({ err: discErr }, 'Subscriber disconnect error during cleanup');
          }
          fastify.log.debug({ err: quitErr }, 'Subscriber quit error during cleanup');
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

        // Unpack ci-runner batch payloads into per-line SSE events (plus the
        // terminal frames on isEnd) — see formatLogSseFrames.
        for (const frame of formatLogSseFrames(run.id, message)) {
          reply.raw.write(frame);
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

    // Keep request alive for SSE streaming.
    // Hijacked: handler must not return the reply (that would re-trigger the send
    // path); the stream stays open until the client disconnects or cleanup runs.
    return;
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
