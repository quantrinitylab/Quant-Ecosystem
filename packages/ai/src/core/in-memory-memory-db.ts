// ============================================================================
// AI Core — createInMemoryMemoryDb
//
// A minimal in-memory MemoryDbClient for development and tests: lets an app
// composition root wire the REAL memory orchestration (createMemoryService)
// even when no DATABASE_URL is configured. Production roots pass the real
// Prisma client instead; the orchestration code path is identical either way.
//
// This replaces the N copies of the same fake that had accumulated across
// app test files and the quantai facade service.
// ============================================================================

import type { MemoryDbClient } from './memory-composition';
import type { MemoryRecordRow, MemoryRecordCreateData } from './prisma-memory-store';

export function createInMemoryMemoryDb(): MemoryDbClient {
  const rows: MemoryRecordRow[] = [];
  let seq = 0;

  const matches = (row: MemoryRecordRow, where: Record<string, unknown>): boolean => {
    if ('ownerId' in where && row.ownerId !== where['ownerId']) return false;
    if ('ownerType' in where && row.ownerType !== where['ownerType']) return false;
    if ('logicalId' in where && row.logicalId !== where['logicalId']) return false;
    if ('archivedAt' in where && where['archivedAt'] === null && row.archivedAt !== null)
      return false;
    if ('deletedAt' in where && where['deletedAt'] === null && row.deletedAt !== null) return false;
    return true;
  };

  return {
    memoryRecord: {
      create: async ({ data }: { data: MemoryRecordCreateData }): Promise<MemoryRecordRow> => {
        const n = ++seq;
        const now = new Date();
        const row = {
          id: `row_${n}`,
          logicalId: `mem_${n}`,
          version: 1,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as unknown as MemoryRecordRow;
        rows.push(row);
        return row;
      },
      findMany: async (args: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => matches(r, args.where ?? {})),
      updateMany: async (args: {
        where?: Record<string, unknown>;
        data?: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const r of rows) {
          if (!matches(r, args.where ?? {})) continue;
          Object.assign(r, args.data ?? {});
          count++;
        }
        return { count };
      },
    },
  } as unknown as MemoryDbClient;
}
