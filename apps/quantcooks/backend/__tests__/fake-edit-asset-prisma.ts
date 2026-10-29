// ============================================================================
// Stateful fake for the EditAsset Prisma delegate (P0-3 tests).
//
// Same approach as fake-edit-project-prisma.ts / fake-edit-layer-prisma.ts:
// implements exactly the narrow delegate surface AssetService uses (create /
// findFirst / findMany / update / delete) with real persistence semantics —
// rows live in the fake's store, so a new AssetService (or a rebuilt Fastify
// app) over the same fake still sees them, which is what "survives a
// restart" means at this level. Beyond equality it honors only the where
// shapes AssetService actually emits: `OR` groups, `{ in: [...] }`, and
// `filename: { contains, mode: 'insensitive' }`; `orderBy.createdAt` is
// honored for real. Schema defaults (size 0, url null, metadata "{}") are
// applied on create the way Prisma would. Re-run against a real test
// database in CI.
// ============================================================================

export interface FakeEditAssetRow {
  id: string;
  projectId: string;
  userId: string | null;
  filename: string;
  type: string;
  size: number;
  url: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

function matchesCondition(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date && actual instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  if (typeof expected === 'object') {
    const cond = expected as Record<string, unknown>;
    if (Array.isArray(cond['in'])) {
      return (cond['in'] as unknown[]).includes(actual);
    }
    if (typeof cond['contains'] === 'string' && typeof actual === 'string') {
      const needle = cond['contains'];
      return cond['mode'] === 'insensitive'
        ? actual.toLowerCase().includes(needle.toLowerCase())
        : actual.includes(needle);
    }
  }
  return actual === expected;
}

function matchesWhere(row: FakeEditAssetRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') {
      return (expected as Record<string, unknown>[]).some((branch) =>
        matchesWhere(row, branch),
      );
    }
    return matchesCondition(row[key], expected);
  });
}

export function createFakeEditAssetPrisma() {
  const rows: FakeEditAssetRow[] = [];
  let idCounter = 0;
  let clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  const nextTimestamp = () => new Date((clock += 1000));

  return {
    rows,
    editAsset: {
      async create({ data }: { data: Record<string, unknown> }) {
        idCounter++;
        const now = nextTimestamp();
        const row: FakeEditAssetRow = {
          id: `fake-asset-${idCounter}`,
          projectId: data['projectId'] as string,
          userId: (data['userId'] as string | null | undefined) ?? null,
          filename: data['filename'] as string,
          type: data['type'] as string,
          size: (data['size'] as number | undefined) ?? 0,
          url: (data['url'] as string | null | undefined) ?? null,
          metadata: data['metadata'] ?? {},
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return { ...row };
      },

      async findFirst({ where }: { where?: Record<string, unknown> }) {
        const found = rows.find((r) => matchesWhere(r, where));
        return found ? { ...found } : null;
      },

      async findMany(args: Record<string, unknown> = {}) {
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        const orderBy = args['orderBy'] as { createdAt?: 'asc' | 'desc' } | undefined;

        let result = rows.filter((r) => matchesWhere(r, where));
        if (orderBy?.createdAt) {
          const dir = orderBy.createdAt === 'desc' ? -1 : 1;
          result = [...result].sort(
            (a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()),
          );
        }
        return result.map((r) => ({ ...r }));
      },

      async update({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) {
        const row = rows.find((r) => matchesWhere(r, where));
        if (!row) {
          throw new Error('Record to update not found (fake P2025)');
        }
        Object.assign(row, data);
        row.updatedAt = nextTimestamp();
        return { ...row };
      },

      async delete({ where }: { where: Record<string, unknown> }) {
        const index = rows.findIndex((r) => matchesWhere(r, where));
        if (index < 0) {
          throw new Error('Record to delete not found (fake P2025)');
        }
        const [removed] = rows.splice(index, 1);
        return { ...removed };
      },
    },
  };
}

export type FakeEditAssetPrisma = ReturnType<typeof createFakeEditAssetPrisma>;
