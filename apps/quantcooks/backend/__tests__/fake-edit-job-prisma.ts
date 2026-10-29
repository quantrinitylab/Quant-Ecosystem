// ============================================================================
// Stateful fake for the unified EditJob Prisma delegate (CP-1 tests).
//
// Same approach as the per-kind fakes (fake-edit-export-prisma.ts et al.):
// exactly the narrow delegate surface JobService + the per-kind delegate
// adapters use (create / findFirst / findMany / update / updateMany) with
// real persistence semantics — rows live in one store, so services and
// adapters over the same fake see each other's writes (the fold-in
// cross-visibility tests depend on that). Beyond equality it honors `OR`
// groups and `orderBy.createdAt`; `updateMany` matches the full `where`
// so the atomic claim on { id, status: 'QUEUED' } behaves like the real
// UPDATE … WHERE. Schema defaults from migration 0110 are applied on
// create the way Prisma would, including the (userId, idempotencyKey)
// unique constraint — a duplicate create throws an error carrying
// code 'P2002', which is what JobService's race handling keys on.
// `editAsset.findFirst` reads a seedable map (JobService mints output
// URLs from asset rows). Tests may seed createdAt/updatedAt explicitly.
// ============================================================================

export interface FakeEditJobRow {
  id: string;
  userId: string;
  projectId: string | null;
  kind: string;
  toolName: string;
  provider: string | null;
  status: string;
  progress: number;
  stage: string | null;
  params: unknown;
  idempotencyKey: string;
  quoteId: string | null;
  creditCost: number;
  reservationKey: string | null;
  outputs: unknown;
  result: unknown;
  error: string | null;
  parentJobId: string | null;
  externalRef: string | null;
  attempts: number;
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

function matchesWhere(row: FakeEditJobRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') {
      return (expected as Record<string, unknown>[]).some((branch) =>
        matchesWhere(row, branch),
      );
    }
    return matchesCondition(row[key], expected);
  });
}

function sortByCreatedAt(rows: FakeEditJobRow[], orderBy?: { createdAt?: 'asc' | 'desc' }) {
  if (!orderBy?.createdAt) return rows;
  const dir = orderBy.createdAt === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
}

export function createFakeEditJobPrisma() {
  const rows: FakeEditJobRow[] = [];
  const assets = new Map<string, Record<string, unknown>>();
  let idCounter = 0;
  let clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  const nextTimestamp = () => new Date((clock += 1000));

  return {
    rows,
    assets,
    editJob: {
      async create({ data }: { data: Record<string, unknown> }) {
        const userId = data['userId'] as string;
        const idempotencyKey = data['idempotencyKey'] as string;
        if (
          rows.some((r) => r.userId === userId && r.idempotencyKey === idempotencyKey)
        ) {
          const err = new Error(
            'Unique constraint failed on the fields: (`userId`,`idempotencyKey`)',
          ) as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        idCounter++;
        const createdAt = (data['createdAt'] as Date | undefined) ?? nextTimestamp();
        const row: FakeEditJobRow = {
          id: (data['id'] as string | undefined) ?? `fake-job-${idCounter}`,
          userId,
          projectId: (data['projectId'] as string | null | undefined) ?? null,
          kind: data['kind'] as string,
          toolName: data['toolName'] as string,
          provider: (data['provider'] as string | null | undefined) ?? null,
          status: (data['status'] as string | undefined) ?? 'QUEUED',
          progress: (data['progress'] as number | undefined) ?? 0,
          stage: (data['stage'] as string | null | undefined) ?? null,
          params: data['params'] ?? {},
          idempotencyKey,
          quoteId: (data['quoteId'] as string | null | undefined) ?? null,
          creditCost: (data['creditCost'] as number | undefined) ?? 0,
          reservationKey: (data['reservationKey'] as string | null | undefined) ?? null,
          outputs: data['outputs'] ?? [],
          result: data['result'] ?? null,
          error: (data['error'] as string | null | undefined) ?? null,
          parentJobId: (data['parentJobId'] as string | null | undefined) ?? null,
          externalRef: (data['externalRef'] as string | null | undefined) ?? null,
          attempts: (data['attempts'] as number | undefined) ?? 0,
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
        const result = sortByCreatedAt(
          rows.filter((r) => matchesWhere(r, where)),
          orderBy,
        );
        const found = result[0];
        return found ? { ...found } : null;
      },

      async findMany(args: Record<string, unknown> = {}) {
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        const orderBy = args['orderBy'] as { createdAt?: 'asc' | 'desc' } | undefined;
        const result = sortByCreatedAt(
          rows.filter((r) => matchesWhere(r, where)),
          orderBy,
        );
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
    editAsset: {
      async findFirst(args: Record<string, unknown> = {}) {
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        const id = where['id'] as string | undefined;
        const row = id ? assets.get(id) : undefined;
        return row ? { ...row } : null;
      },
    },
  };
}

export type FakeEditJobPrisma = ReturnType<typeof createFakeEditJobPrisma>;
