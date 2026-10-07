import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionManager } from '@quant/browser-agent';
import { createAppError } from '@quant/server-core';

// Layer 2 type augmentation: expose the decorated browser-agent SessionManager
// on the Fastify instance. Constructed in buildApp() (per-app lane). It owns the
// lifecycle of authenticated, time-bounded browsing sessions the agent-runtime
// stack drives, so it is decorated after agentRuntime (dependsOn).
declare module 'fastify' {
  interface FastifyInstance {
    browserAgent: SessionManager;
  }
}

const createSessionSchema = z.object({
  siteUrl: z.string().url(),
});

const sessionParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * browser-agent seam routes (per-app lane), registered under the `/agents/browser`
 * prefix in quantai's buildApp(). The global auth hook protects every path; the
 * owning `userId` is taken from `request.auth` (never the client body) so a user
 * only ever sees their own sessions. The session-creating mutation declares the
 * `agents:execute` scope.
 */
export default async function browserAgentRoutes(fastify: FastifyInstance) {
  // POST /agents/browser/sessions — open a browsing session for the caller
  fastify.post(
    '/sessions',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request, reply) => {
      const parsed = createSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const session = fastify.browserAgent.createSession(parsed.data.siteUrl, request.auth.userId);
      return reply.status(201).send({ success: true, data: session });
    },
  );

  // GET /agents/browser/sessions — list the caller's active sessions
  fastify.get('/sessions', async (request, reply) => {
    const sessions = fastify.browserAgent.listActiveSessions(request.auth.userId);
    return reply.send({ success: true, data: { sessions } });
  });

  // GET /agents/browser/sessions/:id — fetch one of the caller's sessions
  fastify.get('/sessions/:id', async (request, reply) => {
    const parsed = sessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }

    let session;
    try {
      session = fastify.browserAgent.getSession(parsed.data.id);
    } catch {
      throw createAppError('Session not found', 404, 'NOT_FOUND');
    }
    if (session.userId !== request.auth.userId) {
      throw createAppError('Session not found', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: session });
  });

  // POST /agents/browser/sessions/:id/end — close one of the caller's sessions
  fastify.post(
    '/sessions/:id/end',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      let session;
      try {
        session = fastify.browserAgent.getSession(parsed.data.id);
      } catch {
        throw createAppError('Session not found', 404, 'NOT_FOUND');
      }
      if (session.userId !== request.auth.userId) {
        throw createAppError('Session not found', 404, 'NOT_FOUND');
      }

      fastify.browserAgent.endSession(parsed.data.id);
      return reply.send({ success: true, data: { id: parsed.data.id, status: 'closed' } });
    },
  );
}
