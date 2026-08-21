import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ThreadService } from '../services/thread.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  folderId: z.string().optional(),
});

export default async function threadsRoutes(fastify: FastifyInstance) {
  // GET /threads
  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ThreadService(prisma as never);
    const result = await service.listThreads(userId, queryResult.data.folderId, {
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /threads/:id - resolves a thread id OR an email id.
  // Threads are created lazily, so many emails have threadId=null and the
  // frontend falls back to the email id for /thread/:id deep links. Resolving
  // both here means "Open thread" never errors for a legitimate message.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const service = new ThreadService(prisma as never);

    // 1) Try the id as a real thread id first.
    try {
      const thread = await service.getThread(request.params.id, userId);
      if (thread) {
        return reply.send({
          success: true,
          data: {
            ...thread,
            messages: thread.emails ?? (thread as any).messages ?? [],
          },
        });
      }
    } catch {
      /* fall through to email-id resolution */
    }

    // 2) Treat the id as an email id owned by this user.
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId || email.deletedAt) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    // 2a) The email already belongs to a thread - return that thread.
    if (email.threadId) {
      try {
        const thread = await service.getThread(email.threadId, userId);
        if (thread) {
          return reply.send({
            success: true,
            data: {
              ...thread,
              messages: thread.emails ?? (thread as any).messages ?? [],
            },
          });
        }
      } catch {
        /* fall through to the single-message view */
      }
    }

    // 2b) No thread row yet - present the email as a single-message thread so
    // the thread page renders the message instead of an error.
    const message = { ...email, category: email.aiCategory || 'primary' };
    return reply.send({
      success: true,
      data: {
        id: email.threadId ?? email.id,
        subject: email.subject,
        messageCount: 1,
        isRead: email.isRead,
        isStarred: email.isStarred,
        lastEmailAt: email.receivedAt ?? email.createdAt,
        participants: [],
        messages: [message],
      },
    });
  });
}
