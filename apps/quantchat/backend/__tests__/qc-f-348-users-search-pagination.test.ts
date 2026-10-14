// ============================================================================
// QC-F-348 — user directory search pagination regression tests
//
// GET /users/search had NO paging at all: schema {q, limit<=50}, `take: limit`,
// no skip/page, and the response was a bare array with no hasMore/total —
// so page 2 did not exist on the server, and the Flutter people search
// (new chat / new group / add-member) could never reach the 21st person.
//
// Slice 1A fix (backend/routes/users.ts):
//   - optional `page` param (default 1; page=0 → zod 400)
//   - `skip: (page-1)*limit`, `take: limit+1` probe → honest `hasMore`
//   - stable order: displayName asc + id asc tiebreaker (equal display
//     names otherwise page in DB-arbitrary order — dupes/gaps across pages)
//   - response gains a `pagination: {page, pageSize, hasMore}` SIBLING;
//     `data` stays a bare array so the web caller is byte-compatible
//   - QC-F-042 hideFromSearch post-filter now runs on the sliced page
//     (probe row removed first); QC-F-259 deny-list where is untouched.
//
// These tests run the REAL route against a fake prisma whose findMany
// HONESTLY evaluates the where clause (same evaluator family as the
// QC-F-259 test) AND skip/take AND orderBy in BOTH shapes (single object
// and array of objects). A fake that ignored skip/orderBy would make B1
// green against broken code — that is exactly the theatre this file
// refuses: the evaluation rules are stated here so the reader can audit
// them. Negative control (pre-fix users.ts): B1, B3, B5 FAIL at runtime
// (page ignored / pagination absent / page=0 not rejected); B2's shape
// half passes pre-fix (declared contract pin), its pagination half
// fails; B4 is a regression pin (passes pre- and post-fix by design).
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import usersRoutes from '../routes/users';

// Stable module-level identity (never a fresh-identity mock).
const SEARCHER = { userId: 'u_searcher', username: 'searcher' };

interface DirectoryRow {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  deletedAt: Date | null;
  preferences: unknown;
}

function row(partial: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    username: partial.id,
    displayName: partial.id,
    email: `${partial.id}@example.test`,
    avatarUrl: null,
    bio: null,
    status: 'ACTIVE',
    deletedAt: null,
    preferences: null,
    ...partial,
  };
}

// 45 people matching q='aarav', in three displayName tie-groups of 15 so
// the id tiebreaker is load-bearing: without it, equal names page in
// arbitrary order and B1's exact-slice expectations cannot hold.
function aaravRows(): DirectoryRow[] {
  const rows: DirectoryRow[] = [
    row({ id: SEARCHER.userId, username: 'aarav_searcher', displayName: 'Aarav Searcher' }),
  ];
  const groups = ['Aarav Alpha', 'Aarav Beta', 'Aarav Gamma'];
  for (let i = 1; i <= 45; i++) {
    const id = `u${String(i).padStart(2, '0')}`;
    rows.push(row({ id, username: `aarav${i}`, displayName: groups[(i - 1) % 3] }));
  }
  return rows;
}

function expectedOrder(rows: DirectoryRow[]): string[] {
  return rows
    .filter((r) => r.id !== SEARCHER.userId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
    .map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Honest Prisma evaluation: where (QC-F-259 evaluator), orderBy (single
// object OR array), skip, take — applied in Prisma's order:
// filter → sort → skip → take → project.
// ---------------------------------------------------------------------------
type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === 'string') return value === cond;
  if (cond instanceof Date) {
    return value instanceof Date && value.getTime() === cond.getTime();
  }
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    if ('not' in c) return !matchField(value, c.not);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('contains' in c) {
      const hay = String(value ?? '');
      const needle = String(c.contains);
      return c.mode === 'insensitive'
        ? hay.toLowerCase().includes(needle.toLowerCase())
        : hay.includes(needle);
    }
  }
  return value === cond;
}

function matchWhere(r: DirectoryRow, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const clauses = cond as Where[];
      if (!clauses.some((clause) => matchWhere(r, clause))) return false;
    } else if (key === 'AND') {
      const clauses = cond as Where[];
      if (!clauses.every((clause) => matchWhere(r, clause))) return false;
    } else if (!matchField((r as unknown as Record<string, unknown>)[key], cond)) {
      return false;
    }
  }
  return true;
}

type OrderBy = Record<string, string> | Array<Record<string, string>>;

function applyOrderBy(rows: DirectoryRow[], orderBy: OrderBy): DirectoryRow[] {
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  const out = [...rows];
  out.sort((a, b) => {
    for (const key of keys) {
      for (const [field, dir] of Object.entries(key)) {
        const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
        const cmp = av.localeCompare(bv);
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
  return out;
}

function directoryPrisma(rows: DirectoryRow[]) {
  return {
    user: {
      async findMany(args: unknown) {
        const a = args as {
          where?: Where;
          select?: Record<string, boolean>;
          take?: number;
          skip?: number;
          orderBy?: OrderBy;
        };
        // PrivacyService.resolveMany batch read (QC-F-042 post-filter).
        if (a.select?.preferences) {
          const ids = (a.where?.id as { in?: string[] } | undefined)?.in ?? [];
          return rows
            .filter((r) => ids.includes(r.id))
            .map((r) => ({ id: r.id, preferences: r.preferences }));
        }
        let out = rows.filter((r) => matchWhere(r, a.where ?? {}));
        if (a.orderBy) out = applyOrderBy(out, a.orderBy);
        if (typeof a.skip === 'number') out = out.slice(a.skip);
        if (typeof a.take === 'number') out = out.slice(0, a.take);
        const select = a.select ?? {};
        return out.map((r) => {
          const projected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) projected[key] = (r as unknown as Record<string, unknown>)[key];
          }
          return projected;
        });
      },
      async findUnique(args: unknown) {
        const id = (args as { where: { id: string } }).where.id;
        const found = rows.find((r) => r.id === id);
        return found ? { preferences: found.preferences } : null;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Route-level harness (bare Fastify + fake prisma, QC-F-259 pattern; the
// error handler mirrors server-core: ZodError → 400 VALIDATION_ERROR).
// ---------------------------------------------------------------------------
const apps: FastifyInstance[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function buildTestApp(rows: DirectoryRow[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.decorate('prisma', directoryPrisma(rows) as never);
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = {
      userId: SEARCHER.userId,
      username: SEARCHER.username,
      email: '',
      role: 'user',
      scopes: [],
      sessionId: 'sess_test',
      app: 'quantchat',
      tokenId: 'tok_test',
    };
  });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.ready();
  apps.push(app);
  return app;
}

interface SearchBody {
  success: boolean;
  data: Array<{ id: string }>;
  pagination?: { page: number; pageSize: number; hasMore: boolean };
}

async function search(app: FastifyInstance, qs: string): Promise<{ status: number; body: SearchBody }> {
  const res = await app.inject({ method: 'GET', url: `/users/search?${qs}` });
  return { status: res.statusCode, body: res.json() as SearchBody };
}

// ---------------------------------------------------------------------------
// QC-F-348 — directory paging exists and tells the truth
// ---------------------------------------------------------------------------
describe('QC-F-348 users/search pagination', () => {
  it('B1: page 1 and page 2 return distinct, stably-ordered slices', async () => {
    const rows = aaravRows();
    const expected = expectedOrder(rows);
    const app = await buildTestApp(rows);

    const p1 = await search(app, 'q=aarav&limit=20&page=1');
    expect(p1.status).toBe(200);
    expect(p1.body.data.map((u) => u.id)).toEqual(expected.slice(0, 20));
    expect(p1.body.pagination).toEqual({ page: 1, pageSize: 20, hasMore: true });

    const p2 = await search(app, 'q=aarav&limit=20&page=2');
    expect(p2.body.data.map((u) => u.id)).toEqual(expected.slice(20, 40));
    expect(p2.body.pagination).toEqual({ page: 2, pageSize: 20, hasMore: true });

    const overlap = p1.body.data.filter((u) => p2.body.data.some((v) => v.id === u.id));
    expect(overlap).toEqual([]);

    const p3 = await search(app, 'q=aarav&limit=20&page=3');
    expect(p3.body.data.map((u) => u.id)).toEqual(expected.slice(40));
    expect(p3.body.data).toHaveLength(5);
    expect(p3.body.pagination).toEqual({ page: 3, pageSize: 20, hasMore: false });
  });

  it('B2: no page param keeps the legacy shape (web contract)', async () => {
    const app = await buildTestApp(aaravRows());
    const res = await search(app, 'q=aarav');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination?.page).toBe(1);
    expect(res.body.pagination?.pageSize).toBe(20);
  });

  it('B3: hasMore is exact at the boundary (20 matches → false, 21 → true)', async () => {
    const mk = (n: number): DirectoryRow[] => {
      const rows: DirectoryRow[] = [
        row({ id: SEARCHER.userId, username: 'x_searcher', displayName: 'Xav Searcher' }),
      ];
      for (let i = 1; i <= n; i++) {
        const id = `x${String(i).padStart(2, '0')}`;
        rows.push(row({ id, username: `xav${i}`, displayName: `Xav Person ${String(i).padStart(2, '0')}` }));
      }
      return rows;
    };

    const app20 = await buildTestApp(mk(20));
    const exact = await search(app20, 'q=xav&limit=20&page=1');
    expect(exact.body.data).toHaveLength(20);
    expect(exact.body.pagination?.hasMore).toBe(false);

    const app21 = await buildTestApp(mk(21));
    const over1 = await search(app21, 'q=xav&limit=20&page=1');
    expect(over1.body.pagination?.hasMore).toBe(true);
    const over2 = await search(app21, 'q=xav&limit=20&page=2');
    expect(over2.body.data).toHaveLength(1);
    expect(over2.body.pagination?.hasMore).toBe(false);
  });

  it('B4: hideFromSearch stays applied inside pages (QC-F-042 barkarar)', async () => {
    const rows = aaravRows();
    // u01 sorts inside page 1 (Aarav Alpha group, lowest id) — hide them.
    const hidden = rows.find((r) => r.id === 'u01')!;
    hidden.preferences = { chatSettings: { privacy: { hideFromSearch: true } } };
    const app = await buildTestApp(rows);

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await search(app, `q=aarav&limit=20&page=${page}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((u) => u.id));
    }
    expect(seen).not.toContain('u01');
    expect(seen).toHaveLength(44);
    expect(new Set(seen).size).toBe(44);
  });

  it('B5: invalid page is rejected (page=0 → 400)', async () => {
    const app = await buildTestApp(aaravRows());
    const res = await search(app, 'q=aarav&page=0');
    expect(res.status).toBe(400);
  });
});
