// ============================================================================
// QuantAI - Memory API Routes
// CRUD, candidates, export/import, full disclosure
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MemoryService } from '../services/memory.service';
import { createQuantaiMemoryFacade } from '../services/memory-facade.service';

const observeSchema = z.object({
  session: z.string().min(1),
  role: z.string().min(1).default('user'),
  content: z.string().min(1),
});

const recallQuerySchema = z.object({
  query: z.string().min(1),
});

const categoryEnum = z.enum([
  'people',
  'places',
  'projects',
  'preferences',
  'skills',
  'goals',
  'schedules',
  'routines',
]);

const createMemorySchema = z.object({
  category: categoryEnum,
  content: z.string().min(1),
  source: z.string().min(1),
  sourceApp: z.string().min(1),
  explanation: z.string().min(1),
  writeSignal: z.literal('explicit'),
  accessScopes: z.array(z.string()),
  tags: z.array(z.string()),
  expiresAt: z.number().optional(),
});

const updateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  category: categoryEnum.optional(),
  tags: z.array(z.string()).optional(),
  explanation: z.string().min(1).optional(),
});

const listQuerySchema = z.object({
  category: categoryEnum.optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
});

const exportQuerySchema = z.object({
  format: z.enum(['json', 'markdown', 'csv']).optional(),
});

const importBodySchema = z.object({
  version: z.string(),
  exportedAt: z.number(),
  userId: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      category: categoryEnum,
      content: z.string(),
      source: z.string(),
      sourceApp: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
      expiresAt: z.number().optional(),
      accessLog: z.array(
        z.object({
          accessedAt: z.number(),
          reason: z.string(),
          requestingApp: z.string(),
        }),
      ),
      explanation: z.string(),
      accessScopes: z.array(z.string()),
      writeSignal: z.enum(['explicit', 'digest-approved', 'pending-review']),
      status: z.enum(['active', 'pending']),
      tags: z.array(z.string()),
    }),
  ),
});

export default async function memoryRoutes(fastify: FastifyInstance) {
  const service = new MemoryService();

  // GET / - list memories with optional filters
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const queryResult = listQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const memories = service.listMemories(userId, queryResult.data);
    return reply.send({ success: true, data: memories });
  });

  // POST / - create memory (requires writeSignal: 'explicit')
  fastify.post('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = createMemorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const memory = service.createMemory(userId, parseResult.data);
    return reply.status(201).send({ success: true, data: memory });
  });

  // PUT /:id - update memory
  // NOTE: Ownership enforcement (404 then 403) is implemented in PUT, DELETE, approve, reject.
  // Route-level integration tests for this logic are deferred until Fastify injection test
  // infrastructure is added. The service.getMemory() + userId comparison pattern is validated
  // at the service layer in memory.service.test.ts.
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const existing = service.getMemory(request.params.id);
    if (!existing) {
      throw createAppError('Memory not found', 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Forbidden', 403, 'FORBIDDEN');
    }

    const parseResult = updateMemorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const memory = service.updateMemory(request.params.id, parseResult.data);
    if (!memory) {
      throw createAppError('Memory not found', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: memory });
  });

  // DELETE /:id - delete single memory
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const existing = service.getMemory(request.params.id);
    if (!existing) {
      throw createAppError('Memory not found', 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Forbidden', 403, 'FORBIDDEN');
    }

    const deleted = service.deleteMemory(request.params.id);
    if (!deleted) {
      throw createAppError('Memory not found', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: { message: 'Memory deleted' } });
  });

  // DELETE /purge/:tag - purge all memories with tag
  fastify.delete<{ Params: { tag: string } }>('/purge/:tag', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const count = service.purgeByTag(userId, request.params.tag);
    return reply.send({ success: true, data: { purged: count } });
  });

  // GET /candidates - list pending candidates
  fastify.get('/candidates', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const candidates = service.getPendingCandidates(userId);
    return reply.send({ success: true, data: candidates });
  });

  // POST /candidates/:id/approve - approve a candidate
  fastify.post<{ Params: { id: string } }>('/candidates/:id/approve', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const existing = service.getMemory(request.params.id);
    if (!existing) {
      throw createAppError('Candidate not found or not pending', 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Forbidden', 403, 'FORBIDDEN');
    }

    const memory = service.approveCandidate(request.params.id);
    if (!memory) {
      throw createAppError('Candidate not found or not pending', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: memory });
  });

  // POST /candidates/:id/reject - reject a candidate
  fastify.post<{ Params: { id: string } }>('/candidates/:id/reject', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const existing = service.getMemory(request.params.id);
    if (!existing) {
      throw createAppError('Candidate not found or not pending', 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Forbidden', 403, 'FORBIDDEN');
    }

    const rejected = service.rejectCandidate(request.params.id);
    if (!rejected) {
      throw createAppError('Candidate not found or not pending', 404, 'NOT_FOUND');
    }

    return reply.send({
      success: true,
      data: { message: 'Candidate rejected' },
    });
  });

  // GET /export - export memories
  fastify.get('/export', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const queryResult = exportQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const format = queryResult.data.format ?? 'json';
    const exported = service.exportMemories(userId, format);

    // Send raw content with appropriate content type to avoid double-encoding
    if (format === 'json') {
      return reply.header('Content-Type', 'application/json').send(exported);
    } else if (format === 'markdown') {
      return reply.header('Content-Type', 'text/markdown').send(exported);
    } else {
      return reply.header('Content-Type', 'text/csv').send(exported);
    }
  });

  // POST /import - import memories from JSON
  fastify.post('/import', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = importBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const imported = service.importMemories(userId, JSON.stringify(parseResult.data));
    return reply.status(201).send({ success: true, data: imported });
  });

  // GET /disclosure - full disclosure view
  fastify.get('/disclosure', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const disclosure = service.getFullDisclosure(userId);
    return reply.send({ success: true, data: disclosure });
  });

  // ─── Conversational path (M11c: routed through the ADR-011 MemoryFacade) ──
  // Mode via QUANTAI_MEMORY_MODE (legacy default = byte-identical behavior).
  // Existing CRUD routes above are deliberately untouched.
  const { facade, mode, shadowReports } = createQuantaiMemoryFacade({
    legacyService: service,
  });

  // POST /observe - record a conversation turn (writes per facade mode)
  fastify.post('/observe', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parsed = observeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    await facade.observe({
      actor: userId,
      session: parsed.data.session,
      role: parsed.data.role,
      content: parsed.data.content,
    });
    return reply.status(202).send({ success: true, data: { mode } });
  });

  // GET /recall?query= - retrieve memories (reads per facade mode)
  fastify.get('/recall', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parsed = recallQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const results = await facade.recall({ actor: userId, query: parsed.data.query });
    return reply.send({ success: true, data: { mode, results } });
  });

  // GET /facade/status - migration observability (mode + shadow evidence count)
  fastify.get('/facade/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { mode, shadowReportCount: shadowReports.length },
    });
  });
}
