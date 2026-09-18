import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SearchQueryService } from '../services/search-query.service';

const searchSchema = z.object({
  q: z.string().min(1).max(1000),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const parseSchema = z.object({
  q: z.string().min(1).max(1000),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  // GET /search/emails?q=...&page=&pageSize=&cursor=&limit=
  // Executes a Gmail-style advanced search over the user's mail.
  fastify.get('/emails', async (request, reply) => {
    const parseResult = searchSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SearchQueryService(prisma as never);
    const result = await service.search(userId, parseResult.data.q, {
      page: parseResult.data.page,
      pageSize: parseResult.data.pageSize,
      cursor: parseResult.data.cursor,
      limit: parseResult.data.limit,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /search/drive?q=...&page=&pageSize=&limit=
  // Executes GIN trigram search over user's drive files
  fastify.get('/drive', async (request, reply) => {
    const parseResult = searchSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SearchQueryService(prisma as never);
    const result = await service.searchFiles(userId, parseResult.data.q, {
      page: parseResult.data.page,
      pageSize: parseResult.data.pageSize,
      limit: parseResult.data.limit,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /search/documents?q=...&page=&pageSize=&limit=
  // Executes GIN full-text search over user's collaborative documents
  fastify.get('/documents', async (request, reply) => {
    const parseResult = searchSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SearchQueryService(prisma as never);
    const result = await service.searchDocuments(userId, parseResult.data.q, {
      page: parseResult.data.page,
      pageSize: parseResult.data.pageSize,
      limit: parseResult.data.limit,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /search/all?q=...&limit=
  // Executes omni cross-app search across emails, drive files, and documents
  fastify.get('/all', async (request, reply) => {
    const parseResult = searchSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SearchQueryService(prisma as never);
    const result = await service.searchAll(userId, parseResult.data.q, {
      limit: parseResult.data.limit,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /search/parse?q=...
  // Returns the structured interpretation of a query (for query builders / UI
  // chips) without hitting the database.
  fastify.get('/parse', async (request, reply) => {
    const parseResult = parseSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = new SearchQueryService();
    const parsed = service.parse(parseResult.data.q);

    return reply.send({ success: true, data: parsed });
  });
}
