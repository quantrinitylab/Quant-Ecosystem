import { vi } from 'vitest';
import type { SuppressionRow, SuppressionPrismaClient } from '../../services/suppression.service';

export function createMockSuppressionDb(): SuppressionPrismaClient & {
  table: Map<string, SuppressionRow>;
} {
  const table = new Map<string, SuppressionRow>();
  return {
    table,
    emailSuppression: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return table.get(where.email.toLowerCase()) ?? null;
      }),
      findMany: vi.fn(
        async (args?: {
          where?: { email?: { in?: string[] }; reason?: string };
          orderBy?: any;
        }) => {
          const inList = args?.where?.email?.in;
          if (inList) {
            return inList
              .map((email) => table.get(email.toLowerCase()))
              .filter((r): r is SuppressionRow => r !== undefined);
          }
          const all = Array.from(table.values());
          if (args?.where?.reason) {
            return all.filter((r) => r.reason === args.where!.reason);
          }
          return all;
        },
      ),
      create: vi.fn(async ({ data }: { data: any }) => {
        const row: SuppressionRow = {
          id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          email: data.email.toLowerCase(),
          reason: data.reason,
          source: data.source,
          details: data.details,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        table.set(data.email.toLowerCase(), row);
        return row;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = table.get(where.email.toLowerCase());
        if (existing) {
          const updated: SuppressionRow = {
            ...existing,
            ...update,
            updatedAt: new Date(),
          };
          table.set(where.email.toLowerCase(), updated);
          return updated;
        }
        const row: SuppressionRow = {
          id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          email: create.email.toLowerCase(),
          reason: create.reason,
          source: create.source,
          details: create.details,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        table.set(where.email.toLowerCase(), row);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { email: string } }) => {
        const existing = table.get(where.email.toLowerCase());
        if (!existing) throw new Error('P2025');
        table.delete(where.email.toLowerCase());
        return existing;
      }),
      count: vi.fn(async () => {
        return table.size;
      }),
    },
  };
}
