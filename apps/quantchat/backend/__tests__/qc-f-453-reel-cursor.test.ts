// ============================================================================
// QC-F-453 — Reel feed cursor pagination contract todta hai (same-ms reels
// gayab + invalid/deleted cursor par pehli page repeat)
// ============================================================================
//
// Defect (P2, loop-audit web-code 2026-10-16; specialist-qc-f-453-buildprep
// §§0–3, premise CONFIRMED 5 / REFINED 2 on current main):
//   (a) `ReelService.getFeed` ka docstring vaada karta tha "next page is
//       everything created strictly before that reel's createdAt (ties
//       broken by id)", par `where` sirf `{ createdAt: { lt } }` tha —
//       orderBy ka id tiebreak filter me NAHI tha. Page-boundary par
//       cursor reel ke saath ek hi millisecond par bani har reel isiliye
//       kisi page par kabhi NAHI aati thi (na error, na sanket).
//   (b) Cursor reel na mile (deleted / ajaaan id) to code chup-chaap
//       bina-cursor pehli page lauta deta tha; client use agla page
//       samajh kar jod deta tha — duplicates + hasMore ka jhootha chakkar.
//
// Fix pinned here (brief §3.2, BAND):
//   - Compound cursor: where = OR [ {createdAt < t}, {createdAt = t,
//     id < cursorId} ] — filter aur orderBy EK HI total order par.
//   - Fail-closed resolve: unknown/deleted cursor → 400 INVALID_CURSOR,
//     pehli-page fallback KABHI NAHI.
//   - Viewer ho to cursor reel ke creator par QC-F-447 pair gate query se
//     PEHLE: blocked → wahi abhed 400 INVALID_CURSOR (existence/block
//     leak NAHI), unreadable → 503 UPSTREAM_UNAVAILABLE (QC-F-359 shape).
//   - Cursor = sabse purani reel → 200 khaali page (asal ant, error NAHI).
//
// Harness: REAL ReelService + REAL PrivacyService against a stateful
// in-memory fake (stable identities; the QC-F-447 makeReelWorld pattern,
// findMany fake compound OR-where samajhta hai — brief §0 correction 2).
//
// Negative control: C1–C6 + C9 purane (pre-fix) service par FAIL hone
// chahiye; C7/C8 controls dono par PASS. Is run ka NC saboot
// build-QC-F-453.md me darj hai.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { PrivacyService, type PrivacyPrismaLike } from '../services/privacy.service';
import { ReelService } from '../services/reel.service';

// ---------------------------------------------------------------------------
// Shared shapes (QC-F-447 test ke aksharshah pattern)
// ---------------------------------------------------------------------------

const prefsBlocking = (ids: string[]) => ({
  chatSettings: { blockedUsers: ids.map((id) => ({ id })) },
});
const MALFORMED_PREFS = { chatSettings: { blockedUsers: 'not-an-array' } };

const VIEWER = 'user-viewer';
const CREATOR = 'user-creator';
const CREATOR2 = 'user-creator-2';
const CLEAN = 'user-clean';

interface ReelRow {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  isFeatured: boolean;
  createdAt: Date;
  creator: { username: string; avatarUrl: null; displayName: string };
}

function makeReelRow(id: string, creatorId: string, createdAt: Date): ReelRow {
  return {
    id,
    creatorId,
    videoUrl: `https://cdn.example.com/${id}.mp4`,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    caption: `reel ${id}`,
    duration: 10,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    watchThroughRate: 0.5,
    isFeatured: false,
    createdAt,
    creator: { username: `name-of-${creatorId}`, avatarUrl: null, displayName: `Name of ${creatorId}` },
  };
}

interface ReelWorld {
  service: ReelService;
  reels: Map<string, ReelRow>;
}

function makeReelWorld(prefsInit: Map<string, unknown>, rows: ReelRow[]): ReelWorld {
  const prefs = new Map(prefsInit);
  const reels = new Map(rows.map((r) => [r.id, r]));

  const userDelegate = {
    async findUnique({ where }: { where: { id: string } }) {
      return prefs.has(where.id) ? { preferences: prefs.get(where.id) } : null;
    },
    async findMany({ where }: { where: { id: { in: string[] } } }) {
      return where.id.in
        .filter((id) => prefs.has(id))
        .map((id) => ({
          id,
          preferences: prefs.get(id),
          username: `name-of-${id}`,
          displayName: `Name of ${id}`,
          avatarUrl: null,
          isVerified: false,
        }));
    },
  };
  const reelDelegate = {
    async findUnique({ where }: { where: { id: string } }) {
      const row = reels.get(where.id);
      return row ? { id: row.id, creatorId: row.creatorId, createdAt: row.createdAt } : null;
    },
    async findMany(args: {
      where?: {
        createdAt?: { lt: Date };
        OR?: Array<
          | { createdAt: { lt: Date } }
          | { createdAt: Date; id: { lt: string } }
        >;
      };
      take?: number;
    }) {
      let out = [...reels.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
      );
      if (args.where?.OR) {
        const or = args.where.OR;
        out = out.filter((r) =>
          or.some((branch) => {
            if ('lt' in branch.createdAt) {
              return r.createdAt.getTime() < branch.createdAt.lt.getTime();
            }
            const tie = branch as { createdAt: Date; id: { lt: string } };
            return r.createdAt.getTime() === tie.createdAt.getTime() && r.id < tie.id.lt;
          }),
        );
      } else if (args.where?.createdAt?.lt) {
        const lt = args.where.createdAt.lt.getTime();
        out = out.filter((r) => r.createdAt.getTime() < lt);
      }
      return args.take ? out.slice(0, args.take) : out;
    },
    async count() {
      return reels.size;
    },
  };
  const likeDelegate = {
    async findMany({ where }: { where: { userId: string; reelId: { in: string[] } } }) {
      void where;
      return [] as Array<{ reelId: string }>;
    },
  };
  const prisma = {
    user: userDelegate,
    reel: reelDelegate,
    reelLike: likeDelegate,
    reelComment: { async create() { return {}; } },
    $transaction: async <T,>(fn: (t: unknown) => Promise<T>): Promise<T> => fn(prisma),
  };
  const privacy = new PrivacyService(prisma as unknown as PrivacyPrismaLike);
  return { service: new ReelService(prisma as never, privacy), reels };
}

const T = (s: number) => new Date(1_760_000_000_000 + s * 1000);
const SAME_MS = new Date(1_760_000_100_000);

async function captureAppError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err as { statusCode?: number; code?: string; message?: string };
  }
  throw new Error('expected the call to throw, but it succeeded');
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  const e = await captureAppError(promise);
  expect(e.statusCode).toBe(statusCode);
  expect(e.code).toBe(code);
  return e;
}

const cleanPrefs = (ids: string[]) =>
  new Map<string, unknown>(ids.map((id) => [id, null] as [string, unknown]));

// ============================================================================
// C series — compound cursor + fail-closed resolve
// ============================================================================

describe('QC-F-453: reel feed compound cursor', () => {
  it('C1 [NC] same-ms tie, viewer path: limit-1 par teeno reels exactly-ek-baar, kram total order par', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('tie-a', CLEAN, SAME_MS),
      makeReelRow('tie-b', CLEAN, SAME_MS),
      makeReelRow('tie-c', CLEAN, SAME_MS),
    ]);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageNo = 0; pageNo < 3; pageNo++) {
      const page = await world.service.getFeed({ userId: VIEWER, limit: 1, cursor });
      seen.push(...page.reels.map((r) => r.id));
      expect(page.hasMore).toBe(pageNo < 2);
      cursor = page.nextCursor ?? undefined;
    }
    expect(cursor).toBeUndefined(); // teesra page ant hai — nextCursor null
    // Total order (createdAt desc, id desc): c, b, a — har ek exactly ek baar.
    expect(seen).toEqual(['tie-c', 'tie-b', 'tie-a']);
    // Sabse purani reel ko cursor bana kar maango to imaandaar khaali ant.
    const end = await world.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'tie-a' });
    expect(end.reels).toEqual([]);
    expect(end.hasMore).toBe(false);
    expect(end.nextCursor).toBeNull();
  });

  it('C2 [NC] same-ms tie, bina-viewer (service-contract) path par bhi compound filter', async () => {
    const world = makeReelWorld(cleanPrefs([CLEAN]), [
      makeReelRow('tie-a', CLEAN, SAME_MS),
      makeReelRow('tie-b', CLEAN, SAME_MS),
      makeReelRow('tie-c', CLEAN, SAME_MS),
    ]);
    const p1 = await world.service.getFeed({ limit: 2 });
    expect(p1.reels.map((r) => r.id)).toEqual(['tie-c', 'tie-b']);
    expect(p1.nextCursor).toBe('tie-b');
    const p2 = await world.service.getFeed({ limit: 2, cursor: p1.nextCursor! });
    expect(p2.reels.map((r) => r.id)).toEqual(['tie-a']);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();
  });

  it('C3 [NC] unknown cursor → 400 INVALID_CURSOR (viewer ke saath aur bina viewer bhi); pehli page NAHI', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('r1', CLEAN, T(20)),
      makeReelRow('r2', CLEAN, T(10)),
    ]);
    await expectAppError(
      world.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'reel-jo-hai-hi-nahi' }),
      400,
      'INVALID_CURSOR',
    );
    await expectAppError(
      world.service.getFeed({ limit: 1, cursor: 'reel-jo-hai-hi-nahi' }),
      400,
      'INVALID_CURSOR',
    );
  });

  it('C4 [NC] deleted cursor → 400 INVALID_CURSOR; pehli page repeat NAHI hoti', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('r1', CLEAN, T(30)),
      makeReelRow('r2', CLEAN, T(20)),
      makeReelRow('r3', CLEAN, T(10)),
    ]);
    const page1 = await world.service.getFeed({ userId: VIEWER, limit: 1 });
    expect(page1.reels.map((r) => r.id)).toEqual(['r1']);
    expect(page1.nextCursor).toBe('r1');
    // Cursor reel beech me delete ho gayi.
    world.reels.delete('r1');
    await expectAppError(
      world.service.getFeed({ userId: VIEWER, limit: 1, cursor: page1.nextCursor! }),
      400,
      'INVALID_CURSOR',
    );
  });

  it('C5 [NC] blocked-pair cursor → 400 INVALID_CURSOR, unknown cursor se abhed (status+code+message)', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [VIEWER, null],
        [CREATOR, prefsBlocking([VIEWER])], // creator ne viewer ko block kiya
        [CLEAN, null],
      ]),
      [
        makeReelRow('blocked-r', CREATOR, T(20)),
        makeReelRow('clean-r', CLEAN, T(10)),
      ],
    );
    const blockedErr = await captureAppError(
      world.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'blocked-r' }),
    );
    const unknownErr = await captureAppError(
      world.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'ghost-r' }),
    );
    expect(blockedErr.statusCode).toBe(400);
    expect(blockedErr.code).toBe('INVALID_CURSOR');
    // Abhedta: teeno parat par ek hi jawab — existence/block leak NAHI.
    expect({
      statusCode: blockedErr.statusCode,
      code: blockedErr.code,
      message: blockedErr.message,
    }).toEqual({
      statusCode: unknownErr.statusCode,
      code: unknownErr.code,
      message: unknownErr.message,
    });

    // Ulta direction (viewer ne creator ko block kiya) bhi wahi 400.
    const world2 = makeReelWorld(
      new Map<string, unknown>([
        [VIEWER, prefsBlocking([CREATOR2])],
        [CREATOR2, null],
      ]),
      [makeReelRow('blocked-r2', CREATOR2, T(20))],
    );
    await expectAppError(
      world2.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'blocked-r2' }),
      400,
      'INVALID_CURSOR',
    );
  });

  it('C6 [NC] cursor pair apathaniya (malformed prefs) → 503 UPSTREAM_UNAVAILABLE, page NAHI milti', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [VIEWER, MALFORMED_PREFS],
        [CREATOR, null],
      ]),
      [makeReelRow('r1', CREATOR, T(20)), makeReelRow('r2', CREATOR, T(10))],
    );
    await expectAppError(
      world.service.getFeed({ userId: VIEWER, limit: 1, cursor: 'r1' }),
      503,
      'UPSTREAM_UNAVAILABLE',
    );
  });

  it('C7 control: cursor = sabse purani reel → 200 khaali page (asal ant, error NAHI)', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('r1', CLEAN, T(20)),
      makeReelRow('r2', CLEAN, T(10)),
    ]);
    const page = await world.service.getFeed({ userId: VIEWER, limit: 5, cursor: 'r2' });
    expect(page.reels).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('C8 control: distinct timestamps par khush-raasta do-page safar pehle jaisa exact', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('r1', CLEAN, T(50)),
      makeReelRow('r2', CLEAN, T(40)),
      makeReelRow('r3', CLEAN, T(30)),
    ]);
    const p1 = await world.service.getFeed({ userId: VIEWER, limit: 2 });
    expect(p1.reels.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(p1.nextCursor).toBe('r2');
    const p2 = await world.service.getFeed({ userId: VIEWER, limit: 2, cursor: p1.nextCursor! });
    expect(p2.reels.map((r) => r.id)).toEqual(['r3']);
    expect(p2.hasMore).toBe(false);
    expect(p2.nextCursor).toBeNull();
  });

  it('C9 [NC] same-ms joda page-boundary par kata hai + peeche purani reel — koi skip, koi repeat NAHI', async () => {
    const world = makeReelWorld(cleanPrefs([VIEWER, CLEAN]), [
      makeReelRow('x-new', CLEAN, T(30)),
      makeReelRow('tie-a', CLEAN, SAME_MS),
      makeReelRow('tie-b', CLEAN, SAME_MS),
      makeReelRow('y-old', CLEAN, T(10)),
    ]);
    // SAME_MS = T(100s offset wala) — T(30)/T(10) se aage hai, isiliye kram:
    // tie-b, tie-a (same-ms, id desc), x-new, y-old. Boundary tie jode ke
    // beech se guzarti hai (limit 1 dusra page tie-a par khatm hota hai to
    // purana lt-filter tie-a ko hamesha ke liye kaat deta tha).
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageNo = 0; pageNo < 4; pageNo++) {
      const page = await world.service.getFeed({ userId: VIEWER, limit: 1, cursor });
      seen.push(...page.reels.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
      if (pageNo < 3) expect(page.hasMore).toBe(true);
      else expect(page.hasMore).toBe(false);
    }
    expect(seen).toEqual(['tie-b', 'tie-a', 'x-new', 'y-old']);
    expect(new Set(seen).size).toBe(4);
  });
});
