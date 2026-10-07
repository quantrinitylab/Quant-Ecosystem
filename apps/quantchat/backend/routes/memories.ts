// ============================================================================
// QuantChat - Memories Backend Routes (Tasks 13.1, 13.2, 13.3, 13.4)
//
//   POST   /memories            save a snap/story/reel into the vault (13.2)
//   GET    /memories            list newest-first, with optional search by
//                               date range / location / caption text (13.1, 13.3)
//   DELETE /memories/:id        soft-delete + open a 5-second undo window;
//                               the row is permanently purged once the window
//                               elapses unless restored (13.4)
//   POST   /memories/:id/restore  undo a soft-delete within the window (13.4)
//
// The undo window is implemented with a per-memory timer that fires a permanent
// delete after UNDO_WINDOW_MS. A restore (or a re-delete) clears the pending
// timer. Timers are unref'd so they never keep the process alive and are all
// cleared on server shutdown.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  MemoryService,
  type MemoryPrismaClient,
  type MemoryRecord,
  type MemorySearchFilters,
} from '../services/memory.service';

/** Undo window for memory deletion (Task 13.4). */
export const UNDO_WINDOW_MS = 5000;

const createMemorySchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(['PHOTO', 'VIDEO']),
  caption: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
});

const searchQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getMemoryService(fastify: FastifyInstance): MemoryService {
  const prisma = (fastify as unknown as { prisma?: MemoryPrismaClient }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return new MemoryService(prisma);
}

function serializeMemory(record: MemoryRecord) {
  return {
    id: record.id,
    userId: record.userId,
    mediaUrl: record.mediaUrl,
    mediaType: record.mediaType,
    caption: record.caption,
    location: record.location,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    deletedAt: record.deletedAt instanceof Date ? record.deletedAt.toISOString() : record.deletedAt,
  };
}

export default async function memoriesRoutes(fastify: FastifyInstance) {
  // Pending permanent-deletion timers keyed by memory id (the 5s undo window).
  const pendingDeletions = new Map<string, ReturnType<typeof setTimeout>>();

  function cancelPendingDeletion(id: string): boolean {
    const timer = pendingDeletions.get(id);
    if (timer) {
      clearTimeout(timer);
      pendingDeletions.delete(id);
      return true;
    }
    return false;
  }

  // Clear any outstanding undo timers on shutdown so nothing leaks.
  fastify.addHook('onClose', async () => {
    for (const timer of pendingDeletions.values()) {
      clearTimeout(timer);
    }
    pendingDeletions.clear();
  });

  // POST /memories — save a captured/saved item into the vault (Task 13.2)
  fastify.post('/', async (request, reply) => {
    const parsed = createMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid memory payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);

    const memory = await service.create({
      userId,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType,
      caption: parsed.data.caption ?? null,
      location: parsed.data.location ?? null,
    });

    return reply.status(201).send({ success: true, data: serializeMemory(memory) });
  });

  // GET /memories — newest-first listing with optional search (Tasks 13.1, 13.3)
  fastify.get('/', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError('Invalid search parameters', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);

    const filters: MemorySearchFilters = {};
    if (parsed.data.from) filters.from = new Date(parsed.data.from);
    if (parsed.data.to) filters.to = new Date(parsed.data.to);
    if (parsed.data.location) filters.location = parsed.data.location;
    if (parsed.data.q) filters.q = parsed.data.q;

    const memories = await service.list(userId, filters);

    return reply.send({
      success: true,
      data: { memories: memories.map(serializeMemory), total: memories.length },
    });
  });

  // DELETE /memories/:id — soft-delete + 5s undo window (Task 13.4)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const { id } = request.params;

    const deleted = await service.softDelete(userId, id);

    // Replace any existing pending purge for this id, then schedule the
    // permanent delete once the undo window elapses.
    cancelPendingDeletion(id);
    const timer = setTimeout(() => {
      pendingDeletions.delete(id);
      void service.permanentDelete(userId, id).catch((err) => {
        fastify.log.error({ err, memoryId: id }, 'Failed to permanently delete memory');
      });
    }, UNDO_WINDOW_MS);
    // Never let the undo timer keep the event loop alive.
    (timer as unknown as { unref?: () => void }).unref?.();
    pendingDeletions.set(id, timer);

    return reply.send({
      success: true,
      data: {
        id: deleted.id,
        deletedAt: serializeMemory(deleted).deletedAt,
        undoWindowMs: UNDO_WINDOW_MS,
      },
    });
  });

  // POST /memories/:id/restore — undo a soft-delete within the window (Task 13.4)
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const { id } = request.params;

    // Cancel the pending purge first so a race cannot delete a row we restore.
    cancelPendingDeletion(id);
    const restored = await service.restore(userId, id);

    return reply.send({ success: true, data: serializeMemory(restored) });
  });
}
