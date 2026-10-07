// ============================================================================
// QuantChat - Memory Service (Tasks 13.2, 13.3, 13.4)
//
// Backs the Memories vault. Wraps the Prisma `Memory` model (soft-delete via
// `deletedAt`) with:
//   - create()           save a snap/story/reel into the vault (Task 13.2)
//   - list()             date-descending listing with optional search filters
//                        by date range, location, and caption text (Task 13.3)
//   - softDelete()       mark a memory deleted (opens the 5s undo window, 13.4)
//   - restore()          undo a soft-delete within the window (Task 13.4)
//   - permanentDelete()  hard-remove after the undo window elapses (Task 13.4)
//
// The service is decoupled from the generated Prisma client types via the
// `MemoryPrismaClient` structural interface — mirroring the casting pattern
// already used by `routes/avatar.ts` — so it type-checks regardless of whether
// `prisma generate` has been run for the Memory delegate.
// ============================================================================
import { createAppError } from '@quant/server-core';

export type MemoryMediaType = 'PHOTO' | 'VIDEO';

export interface MemoryRecord {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption: string | null;
  location: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface CreateMemoryInput {
  userId: string;
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption?: string | null;
  location?: string | null;
}

/** Search filters for the Memories vault (Task 13.3). */
export interface MemorySearchFilters {
  /** Lower bound (inclusive) on createdAt. */
  from?: Date;
  /** Upper bound (inclusive) on createdAt. */
  to?: Date;
  /** Case-insensitive substring match on the attached location. */
  location?: string;
  /** Case-insensitive substring match on the caption text. */
  q?: string;
}

/**
 * Minimal structural surface of the Prisma client this service relies on.
 * Keeps the service unit-testable (a plain mock satisfies it) and decoupled
 * from the generated `Memory` delegate types.
 */
export interface MemoryPrismaClient {
  memory: {
    create(args: unknown): Promise<MemoryRecord>;
    findMany(args: unknown): Promise<MemoryRecord[]>;
    findFirst(args: unknown): Promise<MemoryRecord | null>;
    update(args: unknown): Promise<MemoryRecord>;
    delete(args: unknown): Promise<MemoryRecord>;
  };
}

/**
 * Pure builder for the Prisma `where` clause used by {@link MemoryService.list}.
 * Exported for unit testing without a database.
 *
 * Invariants:
 *  - Always scoped to the owning user.
 *  - Always excludes soft-deleted rows (`deletedAt: null`).
 *  - Date range, location, and caption filters are additive (AND-combined).
 */
export function buildMemoryWhere(
  userId: string,
  filters: MemorySearchFilters = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    userId,
    deletedAt: null,
  };

  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt['gte'] = filters.from;
    if (filters.to) createdAt['lte'] = filters.to;
    where['createdAt'] = createdAt;
  }

  if (filters.location && filters.location.trim().length > 0) {
    where['location'] = { contains: filters.location.trim(), mode: 'insensitive' };
  }

  if (filters.q && filters.q.trim().length > 0) {
    where['caption'] = { contains: filters.q.trim(), mode: 'insensitive' };
  }

  return where;
}

export class MemoryService {
  constructor(private readonly prisma: MemoryPrismaClient) {}

  /** Task 13.2 — persist a captured/saved item into the user's vault. */
  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    return this.prisma.memory.create({
      data: {
        userId: input.userId,
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        caption: input.caption ?? null,
        location: input.location ?? null,
      },
    });
  }

  /**
   * Task 13.1 / 13.3 — list a user's non-deleted memories, newest first,
   * with optional date-range / location / caption search filters.
   */
  async list(userId: string, filters: MemorySearchFilters = {}): Promise<MemoryRecord[]> {
    return this.prisma.memory.findMany({
      where: buildMemoryWhere(userId, filters),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Task 13.4 — soft-delete a memory (sets `deletedAt`). The row remains
   * recoverable via {@link restore} until the undo window elapses and
   * {@link permanentDelete} runs. Ownership is enforced.
   */
  async softDelete(userId: string, id: string): Promise<MemoryRecord> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      throw createAppError('Memory not found', 404, 'MEMORY_NOT_FOUND');
    }
    return this.prisma.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Task 13.4 — undo a soft-delete within the window by clearing `deletedAt`.
   * Only succeeds while the memory is still soft-deleted (not yet purged).
   */
  async restore(userId: string, id: string): Promise<MemoryRecord> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: { not: null } },
    });
    if (!existing) {
      throw createAppError('Memory not available to restore', 404, 'MEMORY_NOT_FOUND');
    }
    return this.prisma.memory.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /**
   * Task 13.4 — permanently remove a memory once the undo window has elapsed.
   * Only purges rows that are still soft-deleted (a restore in the meantime
   * cancels the purge). Idempotent: a missing/restored row is a no-op.
   */
  async permanentDelete(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: { not: null } },
    });
    if (!existing) {
      // Either already purged or restored during the undo window — nothing to do.
      return;
    }
    await this.prisma.memory.delete({ where: { id } });
  }
}
