/**
 * Thread realtime gateway — WebSocket transport for email-thread chat.
 *
 *   GET /ws/thread/:threadId   (websocket upgrade; reachable publicly as
 *                               /api/ws/thread/:threadId via the ingress
 *                               /api rewrite to the backend root)
 *
 * Two event kinds, both fanned out by `threadRealtimeHub`:
 *   - server → client: { type: 'message.new', message }   (a new mail/chat
 *     message was persisted in this thread — replaces the 30s poll)
 *   - server → client: { type: 'typing', typing: { userId, displayName, typing } }
 *   - client → server: { type: 'typing', typing: boolean } (rate-limited)
 *   - client → server: { type: 'ping' } → { type: 'pong' }
 *
 * Auth mirrors the /collab gateway: session token via `?token=`, the
 * `quant_access_token` cookie, or a Bearer header. Thread membership is fail
 * closed — only the thread's owner may subscribe (the reply route only ever
 * lets the owner post, so the owner is the only viewer this gateway needs).
 */
import type { FastifyInstance } from 'fastify';
import * as jose from 'jose';
import { getJwtSecret } from '@quant/auth/lib/secrets';
import type { PrismaClient } from '@quant/database';
import {
  threadRealtimeHub,
  type WireEvent,
} from '../services/thread-realtime';

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

function extractSessionToken(req: {
  query?: Record<string, unknown>;
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null {
  const q = req.query;
  if (q && typeof q['token'] === 'string' && (q['token'] as string).trim()) {
    return (q['token'] as string).trim();
  }
  const cookieToken = req.cookies?.['quant_access_token'];
  if (typeof cookieToken === 'string' && cookieToken.trim()) return cookieToken.trim();
  const rawCookie = req.headers.cookie;
  if (typeof rawCookie === 'string') {
    const match = rawCookie.match(/(?:^|;\s*)quant_access_token=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1].trim());
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const bearer = auth.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }
  return null;
}

async function verifySessionToken(token: string): Promise<{
  userId: string;
  displayName: string;
  email?: string;
}> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const { payload } = await jose.jwtVerify(token, secret, {
    issuer: [
      'quantmail',
      'https://quantrinity.in',
      'https://quant.app',
      process.env['JWT_ISSUER'] ?? '',
    ],
    audience: ['quant-ecosystem', process.env['JWT_AUDIENCE'] ?? ''],
  });
  const userId = String(payload.sub ?? '');
  if (!userId) throw new Error('missing sub');
  const displayName =
    String(payload['displayName'] ?? payload['name'] ?? payload['username'] ?? '') || userId;
  return { userId, displayName, email: String(payload['email'] ?? '') };
}

export async function threadRealtimeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { threadId: string } }>(
    '/ws/thread/:threadId',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const threadId = (req.params as { threadId?: string })?.threadId;
        if (!threadId) {
          return reply.code(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'threadId is required', statusCode: 400 },
          });
        }

        const token = extractSessionToken(req as never);
        if (!token) {
          return reply.code(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Session token required during thread realtime handshake',
              statusCode: 401,
            },
          });
        }

        let session: { userId: string; displayName: string };
        try {
          session = await verifySessionToken(token);
        } catch {
          return reply.code(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired session token',
              statusCode: 401,
            },
          });
        }

        // Fail closed: only the thread owner may hold a realtime subscription.
        // The backend compiles against the dev-time prisma stub
        // (backend/types/prisma-stub.d.ts), whose findUnique takes no
        // `select` — fetch the row and compare its owner field directly.
        try {
          const prisma = getPrisma(fastify);
          const thread = await prisma.emailThread.findUnique({
            where: { id: threadId },
          });
          if (!thread || thread.userId !== session.userId) {
            return reply.code(403).send({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Forbidden: not authorized to subscribe to this thread',
                statusCode: 403,
              },
            });
          }
        } catch {
          return reply.code(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Forbidden: thread could not be resolved',
              statusCode: 403,
            },
          });
        }

        (req as unknown as { threadRealtimeSession: typeof session }).threadRealtimeSession =
          session;
      },
    },
    (connection, req) => {
      const socket = connection as unknown as {
        send(d: string): void;
        close(code?: number, reason?: string): void;
        on(ev: string, cb: (...a: never[]) => void): void;
        ping(cb?: () => void): void;
        readyState: number;
      };
      const threadId = (req.params as { threadId: string }).threadId;
      const session = (req as unknown as { threadRealtimeSession: { userId: string; displayName: string } })
        .threadRealtimeSession;

      const unsubscribe = threadRealtimeHub.subscribe(
        threadId,
        session.userId,
        session.displayName,
        socket,
      );
      // The hub hands out connIds internally; look it up for typing rate-limit.
      let connId: string | undefined;
      {
        const room: unknown = (threadRealtimeHub as unknown as {
          rooms: Map<string, Map<string, { userId: string; connId: string; socket: unknown }>>;
        }).rooms.get(threadId);
        if (room instanceof Map) {
          for (const peer of room.values()) {
            if (peer.socket === socket && peer.userId === session.userId) {
              connId = peer.connId;
              break;
            }
          }
        }
      }

      const send = (event: WireEvent): void => {
        try {
          if (socket.readyState === 1) socket.send(JSON.stringify(event));
        } catch {
          /* ignore */
        }
      };

      // Server heartbeat: ping, expect traffic back within the timeout.
      let lastActivity = Date.now();
      const heartbeat = setInterval(() => {
        if (Date.now() - lastActivity > HEARTBEAT_TIMEOUT_MS) {
          try {
            socket.close(4001, 'heartbeat timeout');
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          socket.ping();
        } catch {
          /* ignore */
        }
      }, HEARTBEAT_INTERVAL_MS);
      (heartbeat as unknown as { unref?: () => void }).unref?.();

      const cleanup = (): void => {
        clearInterval(heartbeat);
        try {
          if (connId) threadRealtimeHub.remove(threadId, connId);
        } catch {
          /* ignore */
        }
        unsubscribe();
      };

      socket.on('message', (raw: unknown) => {
        lastActivity = Date.now();
        let parsed: { type?: string; typing?: boolean } | null = null;
        try {
          parsed = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== 'object') return;
        if (parsed.type === 'ping') {
          send({ type: 'pong', threadId, ts: Date.now() });
          return;
        }
        if (parsed.type === 'typing') {
          const typing = parsed.typing === true;
          threadRealtimeHub.broadcastTyping(
            threadId,
            { userId: session.userId, displayName: session.displayName },
            typing,
            { senderConnId: connId },
          );
        }
      });

      socket.on('close', cleanup);
      socket.on('error', cleanup);
    },
  );

  // Health/debug: how many thread rooms are live (no PII).
  fastify.get('/ws/thread-stats', async () => ({
    success: true,
    data: {
      rooms: threadRealtimeHub.totalRooms(),
    },
  }));
}
