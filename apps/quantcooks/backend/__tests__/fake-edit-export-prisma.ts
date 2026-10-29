// ============================================================================
// Stateful fake for the EditExportJob Prisma delegate (P0-4 tests).
//
// Same approach as fake-edit-project-prisma.ts / fake-edit-asset-prisma.ts:
// implements exactly the narrow delegate surface ExportService uses (create /
// findFirst / findMany / update / updateMany) with real persistence semantics
// — rows live in the fake's store, so a new ExportService (or ExportProcessor)
// over the same fake still sees them, which is what "survives a restart"
// means at this level. Beyond equality it honors `OR` groups and
// `orderBy.createdAt`; `updateMany` matches the full `where` (the atomic
// claim depends on `{ id, status: 'QUEUED' }` matching as a compound) and
// returns the real affected count. Schema defaults (status QUEUED, progress
// 0, outputUrl/error/completedAt null) are applied on create the way Prisma
// would. Tests may seed `createdAt`/`updatedAt` explicitly (the stale-sweep
// cases need an old PROCESSING row). Re-run against a real test database in
// CI.
// ============================================================================

export interface FakeEditExportJobRow {
  id: string;
  projectId: string;
  userId: string | null;
  format: string;
  resolution: string;
  quality: string;
  status: string;
  progress: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  [key: string]: unknown;
}

function matchesCondition(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date && actual instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return actual === expected;
}

function matchesWhere(row: FakeEditExportJobRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') {
      return (expected as Record<string, unknown>[]).some((branch) =>
        matchesWhere(row, branch),
      );
    }
    return matchesCondition(row[key], expected);
  });
}

export function createFakeEditExportPrisma() {
  const rows: FakeEditExportJobRow[] = [];
  let idCounter = 0;
  let clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  const nextTimestamp = () => new Date((clock += 1000));

  return {
    rows,
    editExportJob: {
      async create({ data }: { data: Record<string, unknown> }) {
        idCounter++;
        const createdAt = (data['createdAt'] as Date | undefined) ?? nextTimestamp();
        const row: FakeEditExportJobRow = {
          id: `fake-export-${idCounter}`,
          projectId: data['projectId'] as string,
          userId: (data['userId'] as string | null | undefined) ?? null,
          format: data['format'] as string,
          resolution: data['resolution'] as string,
          quality: data['quality'] as string,
          status: (data['status'] as string | undefined) ?? 'QUEUED',
          progress: (data['progress'] as number | undefined) ?? 0,
          outputUrl: (data['outputUrl'] as string | null | undefined) ?? null,
          error: (data['error'] as string | null | undefined) ?? null,
          createdAt,
          updatedAt: (data['updatedAt'] as Date | undefined) ?? createdAt,
          completedAt: (data['completedAt'] as Date | null | undefined) ?? null,
        };
        rows.push(row);
        return { ...row };
      },

      async findFirst(args: Record<string, unknown> = {}) {
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        const orderBy = args['orderBy'] as { createdAt?: 'asc' | 'desc' } | undefined;

        let result = rows.filter((r) => matchesWhere(r, where));
        if (orderBy?.createdAt) {
          const dir = orderBy.createdAt === 'desc' ? -1 : 1;
          result = [...result].sort(
            (a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()),
          );
        }
        const found = result[0];
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

      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) {
        let count = 0;
        for (const row of rows) {
          if (matchesWhere(row, where)) {
            Object.assign(row, data);
            row.updatedAt = nextTimestamp();
            count++;
          }
        }
        return { count };
      },
    },
  };
}

export type FakeEditExportPrisma = ReturnType<typeof createFakeEditExportPrisma>;
