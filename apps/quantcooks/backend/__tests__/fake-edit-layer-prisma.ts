// ============================================================================
// Stateful fake for the EditLayer Prisma delegate (P0-2 tests).
//
// Same approach as fake-edit-project-prisma.ts: implements exactly the
// narrow delegate surface LayerService uses (create / findFirst / findMany /
// count / update / delete) with real persistence semantics — rows live in
// the fake's store and `where` equality + `orderBy` are honored for real.
// Schema defaults (visible/locked/opacity/blendMode/Json fields) are applied
// on create the way Prisma would. Re-run against a real test database in CI.
// ============================================================================

export interface FakeEditLayerRow {
  id: string;
  projectId: string;
  name: string;
  type: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  startTime: number;
  endTime: number;
  content: unknown;
  transform: unknown;
  effects: unknown;
  keyframes: unknown;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

function matchesWhere(row: FakeEditLayerRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected === null) return actual === null || actual === undefined;
    if (expected instanceof Date && actual instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    return actual === expected;
  });
}

export function createFakeEditLayerPrisma() {
  const rows: FakeEditLayerRow[] = [];
  let idCounter = 0;
  let clock = Date.UTC(2026, 0, 1, 0, 0, 0);

  const nextTimestamp = () => new Date((clock += 1000));

  return {
    rows,
    editLayer: {
      async create({ data }: { data: Record<string, unknown> }) {
        idCounter++;
        const now = nextTimestamp();
        const row: FakeEditLayerRow = {
          id: `fake-layer-${idCounter}`,
          projectId: data['projectId'] as string,
          name: data['name'] as string,
          type: data['type'] as string,
          order: (data['order'] as number | undefined) ?? 0,
          visible: (data['visible'] as boolean | undefined) ?? true,
          locked: (data['locked'] as boolean | undefined) ?? false,
          opacity: (data['opacity'] as number | undefined) ?? 1,
          blendMode: (data['blendMode'] as string | undefined) ?? 'normal',
          startTime: (data['startTime'] as number | undefined) ?? 0,
          endTime: (data['endTime'] as number | undefined) ?? 0,
          content: data['content'] ?? {},
          transform: data['transform'] ?? {},
          effects: data['effects'] ?? [],
          keyframes: data['keyframes'] ?? [],
          parentId: (data['parentId'] as string | null | undefined) ?? null,
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
        const orderBy = args['orderBy'] as { order?: 'asc' | 'desc' } | undefined;

        let result = rows.filter((r) => matchesWhere(r, where));
        if (orderBy?.order) {
          const dir = orderBy.order === 'desc' ? -1 : 1;
          result = [...result].sort((a, b) => dir * (a.order - b.order));
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

export type FakeEditLayerPrisma = ReturnType<typeof createFakeEditLayerPrisma>;
