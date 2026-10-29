// ============================================================================
// Stateful fake for the EditProject Prisma delegate (P0-1 tests).
//
// The plan's test approach is "run the ported ProjectService cases against a
// test database". This extract has no Postgres and no DATABASE_URL, so the
// suite runs against this fake instead: it implements exactly the narrow
// delegate surface ProjectService uses (create / findFirst / findMany /
// count / update) with real persistence semantics — rows live in the fake's
// store, so a new ProjectService (or a rebuilt Fastify app) over the same
// fake still sees them, which is what "survives a restart" means at this
// level. It is NOT a mock of expected calls: `where` equality (including
// `deletedAt: null`), `orderBy`, `skip`/`take` are all honored for real.
// Re-run against a real test database in CI, where DATABASE_URL exists.
// ============================================================================

export interface FakeEditProjectRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  timeline: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  [key: string]: unknown;
}

function matchesWhere(row: FakeEditProjectRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected === null) return actual === null || actual === undefined;
    if (expected instanceof Date && actual instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    return actual === expected;
  });
}

export function createFakeEditProjectPrisma() {
  const rows: FakeEditProjectRow[] = [];
  let idCounter = 0;
  let clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  const nextTimestamp = () => new Date((clock += 1000));

  return {
    rows,
    editProject: {
      async create({ data }: { data: Record<string, unknown> }) {
        idCounter++;
        const now = nextTimestamp();
        // Schema defaults from EditProject (P0-5: canvas/timeline/version
        // columns must round-trip — before this the fake dropped them,
        // which would have hidden the toProject() discard bug class).
        const row: FakeEditProjectRow = {
          id: `fake-cuid-${idCounter}`,
          userId: data['userId'] as string,
          name: data['name'] as string,
          type: data['type'] as string,
          width: (data['width'] as number | undefined) ?? 1920,
          height: (data['height'] as number | undefined) ?? 1080,
          fps: (data['fps'] as number | undefined) ?? 30,
          duration: (data['duration'] as number | undefined) ?? 0,
          timeline: data['timeline'] ?? {},
          version: (data['version'] as number | undefined) ?? 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: (data['deletedAt'] as Date | null | undefined) ?? null,
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
        const skip = (args['skip'] as number | undefined) ?? 0;
        const take = args['take'] as number | undefined;

        let result = rows.filter((r) => matchesWhere(r, where));
        if (orderBy?.createdAt) {
          const dir = orderBy.createdAt === 'desc' ? -1 : 1;
          result = [...result].sort(
            (a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()),
          );
        }
        if (skip > 0 || take !== undefined) {
          result = result.slice(skip, take === undefined ? undefined : skip + take);
        }
        return result.map((r) => ({ ...r }));
      },

      async count(args: Record<string, unknown> = {}) {
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        return rows.filter((r) => matchesWhere(r, where)).length;
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
        // The P0-5 atomic version gate depends on the compound where
        // ({ id, version, deletedAt: null }) matching as a whole and on
        // `version: { increment: 1 }` being applied per matched row.
        let count = 0;
        for (const row of rows) {
          if (!matchesWhere(row, where)) continue;
          for (const [key, value] of Object.entries(data)) {
            if (
              value &&
              typeof value === 'object' &&
              'increment' in (value as Record<string, unknown>) &&
              typeof (value as Record<string, unknown>)['increment'] === 'number'
            ) {
              const inc = (value as Record<string, unknown>)['increment'] as number;
              row[key] = ((row[key] as number | undefined) ?? 0) + inc;
            } else {
              row[key] = value;
            }
          }
          row.updatedAt = nextTimestamp();
          count++;
        }
        return { count };
      },
    },
  };
}

export type FakeEditProjectPrisma = ReturnType<typeof createFakeEditProjectPrisma>;
