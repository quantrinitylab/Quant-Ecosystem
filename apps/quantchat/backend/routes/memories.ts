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
// QC-F-450 ('My Eyes Only') — passcode-locked private section. The closed
// rule: without a valid unlock token NO response — list, search, create,
// restore, any of them — reveals anything about a private item (not its id,
// mediaUrl, caption, location, date, or even its count). Exclusion is at
// the row level, never a masked placeholder.
//   GET    /memories/passcode/status   { hasPasscode, resetAvailable }
//   POST   /memories/passcode/set      set the first passcode
//   POST   /memories/passcode/verify   verify -> 5-minute unlock token
//   POST   /memories/passcode/change   change (current passcode is proof)
//   POST   /memories/passcode/reset    forgotten: account-password proof,
//                                      private items are permanently deleted
//   POST   /memories/passcode/lock     revoke every unlock token
//   GET    /memories?section=private  locked list (unlock token required)
//   POST   /memories/:id/move-to-private / move-to-public (unlock required)
// The unlock token travels ONLY in the `X-Memories-Unlock` header — never
// in a body or query string (URLs get logged).
//
// The undo window is implemented with a per-memory timer that fires a permanent
// delete after UNDO_WINDOW_MS. A restore (or a re-delete) clears the pending
// timer. Timers are unref'd so they never keep the process alive and are all
// cleared on server shutdown.
// ============================================================================
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  MemoryService,
  type MemoryPrismaClient,
  type MemoryRecord,
  type MemorySearchFilters,
  type MemorySection,
} from '../services/memory.service';
import {
  MemoriesVaultService,
  PASSCODE_PATTERN,
  type MemoriesVaultPrismaClient,
} from '../services/memories-vault.service';

/** Undo window for memory deletion (Task 13.4). */
export const UNDO_WINDOW_MS = 5000;

/** Header carrying the QC-F-450 vault unlock token. */
export const MEMORIES_UNLOCK_HEADER = 'x-memories-unlock';

const createMemorySchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(['PHOTO', 'VIDEO']),
  caption: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  isPrivate: z.boolean().optional(),
});

const searchQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  section: z.enum(['public', 'private']).optional(),
});

const passcodeBodySchema = z.object({
  passcode: z.string().regex(PASSCODE_PATTERN),
});

const changePasscodeBodySchema = z.object({
  currentPasscode: z.string().regex(PASSCODE_PATTERN),
  newPasscode: z.string().regex(PASSCODE_PATTERN),
});

const resetPasscodeBodySchema = z.object({
  accountPassword: z.string().min(1),
});

function unlockTokenFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers[MEMORIES_UNLOCK_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

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

function getVaultService(fastify: FastifyInstance): MemoriesVaultService {
  const prisma = (fastify as unknown as { prisma?: MemoriesVaultPrismaClient }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return new MemoriesVaultService(prisma);
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
    isPrivate: record.isPrivate,
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

  // ------------------------------------------------------------------
  // QC-F-450 — 'My Eyes Only' passcode routes. Registered BEFORE the
  // '/:id' routes below so the static 'passcode' segment can never be
  // captured as a memory id (find-my-way prefers static segments anyway;
  // the order pins the intent).
  // ------------------------------------------------------------------

  // GET /memories/passcode/status — { hasPasscode, resetAvailable } only.
  fastify.get('/passcode/status', async (request, reply) => {
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    const status = await vault.getStatus(userId);
    return reply.send({ success: true, data: status });
  });

  // POST /memories/passcode/set — first passcode (409 when one exists).
  fastify.post('/passcode/set', async (request, reply) => {
    const parsed = passcodeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid passcode', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    await vault.setPasscode(userId, parsed.data.passcode);
    return reply.send({ success: true, data: { hasPasscode: true } });
  });

  // POST /memories/passcode/verify — passcode -> single live unlock token.
  fastify.post('/passcode/verify', async (request, reply) => {
    const parsed = passcodeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid passcode', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    const grant = await vault.verifyPasscode(userId, parsed.data.passcode);
    return reply.send({
      success: true,
      data: {
        unlockToken: grant.unlockToken,
        expiresAt: grant.expiresAt.toISOString(),
        expiresInSec: grant.expiresInSec,
      },
    });
  });

  // POST /memories/passcode/change — current passcode proves identity;
  // success revokes every outstanding unlock token.
  fastify.post('/passcode/change', async (request, reply) => {
    const parsed = changePasscodeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid passcode', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    await vault.changePasscode(userId, parsed.data.currentPasscode, parsed.data.newPasscode);
    return reply.send({ success: true, data: { hasPasscode: true } });
  });

  // POST /memories/passcode/reset — forgotten passcode. Account password is
  // the proof; success permanently deletes every private item (QC-F-450
  // closed decision — see memories-vault.service.ts).
  fastify.post('/passcode/reset', async (request, reply) => {
    const parsed = resetPasscodeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid reset payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    await vault.resetPasscode(userId, parsed.data.accountPassword);
    return reply.send({ success: true, data: { hasPasscode: false } });
  });

  // POST /memories/passcode/lock — revoke every unlock token. Locking is
  // always allowed with just the session; no token is required to lock.
  fastify.post('/passcode/lock', async (request, reply) => {
    const userId = requireUserId(request);
    const vault = getVaultService(fastify);
    await vault.lock(userId);
    return reply.send({ success: true, data: { locked: true } });
  });

  // POST /memories — save a captured/saved item into the vault (Task 13.2)
  // QC-F-450: creating directly as private requires a set passcode AND a
  // valid unlock token — otherwise the item would be invisible even to
  // its owner with no way to know it landed behind the lock.
  fastify.post('/', async (request, reply) => {
    const parsed = createMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid memory payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);

    const isPrivate = parsed.data.isPrivate ?? false;
    if (isPrivate) {
      const vault = getVaultService(fastify);
      const status = await vault.getStatus(userId);
      if (!status.hasPasscode) {
        throw createAppError('No vault passcode is set', 409, 'PASSCODE_NOT_SET');
      }
      await vault.requireUnlock(userId, unlockTokenFrom(request));
    }

    const memory = await service.create({
      userId,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType,
      caption: parsed.data.caption ?? null,
      location: parsed.data.location ?? null,
      isPrivate,
    });

    return reply.status(201).send({ success: true, data: serializeMemory(memory) });
  });

  // GET /memories — newest-first listing with optional search (Tasks 13.1, 13.3)
  // QC-F-450: the default (public) section NEVER contains private rows —
  // not in the list and not in `total`. ?section=private requires a valid
  // unlock token; without one the answer is 401 MEMORIES_LOCKED, never an
  // empty list (an empty list would lie that nothing is in the vault).
  fastify.get('/', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError('Invalid search parameters', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);

    const section: MemorySection = parsed.data.section ?? 'public';
    if (section === 'private') {
      const vault = getVaultService(fastify);
      await vault.requireUnlock(userId, unlockTokenFrom(request));
    }

    const filters: MemorySearchFilters = {};
    if (parsed.data.from) filters.from = new Date(parsed.data.from);
    if (parsed.data.to) filters.to = new Date(parsed.data.to);
    if (parsed.data.location) filters.location = parsed.data.location;
    if (parsed.data.q) filters.q = parsed.data.q;

    const memories = await service.list(userId, filters, section);

    return reply.send({
      success: true,
      data: { memories: memories.map(serializeMemory), total: memories.length },
    });
  });

  // DELETE /memories/:id — soft-delete + 5s undo window (Task 13.4)
  // QC-F-450: without a valid unlock the lookup is scoped to public rows,
  // so deleting a private item answers the same 404 as a missing item —
  // its existence does not leak. With an unlock, private rows are in scope.
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const { id } = request.params;

    const vault = getVaultService(fastify);
    const unlocked = await vault.hasValidUnlock(userId, unlockTokenFrom(request));
    const deleted = await service.softDelete(userId, id, unlocked ? {} : { isPrivate: false });

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
  // QC-F-450: same privacy scope as DELETE — a soft-deleted private item
  // cannot be restored (or revealed) without a valid unlock.
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const { id } = request.params;

    const vault = getVaultService(fastify);
    const unlocked = await vault.hasValidUnlock(userId, unlockTokenFrom(request));

    // Cancel the pending purge first so a race cannot delete a row we restore.
    cancelPendingDeletion(id);
    const restored = await service.restore(userId, id, unlocked ? {} : { isPrivate: false });

    return reply.send({ success: true, data: serializeMemory(restored) });
  });

  // POST /memories/:id/move-to-private — QC-F-450: move an item behind the
  // passcode. A valid unlock token is required (you must be able to open
  // the vault to put something in it). Idempotent.
  fastify.post<{ Params: { id: string } }>('/:id/move-to-private', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const vault = getVaultService(fastify);
    const { id } = request.params;

    await vault.requireUnlock(userId, unlockTokenFrom(request));
    const moved = await service.setPrivate(userId, id, true);

    return reply.send({ success: true, data: serializeMemory(moved) });
  });

  // POST /memories/:id/move-to-public — QC-F-450: bring an item back out of
  // the vault. Also requires a valid unlock token.
  fastify.post<{ Params: { id: string } }>('/:id/move-to-public', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getMemoryService(fastify);
    const vault = getVaultService(fastify);
    const { id } = request.params;

    await vault.requireUnlock(userId, unlockTokenFrom(request));
    const moved = await service.setPrivate(userId, id, false);

    return reply.send({ success: true, data: serializeMemory(moved) });
  });
}
