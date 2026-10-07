// ============================================================================
// Property tests — Memories & Spotlight (backend services)
// Spec: quantchat-mega-upgrade, Task 13.9
// Design: Component 13 "Snapchat Parity — Memories & Spotlight"
//
//   Property 34 — memories listed ordered by createdAt descending
//   Property 35 — memory search returns every truly-matching item
//   Property 7  — spotlight ranking is non-increasing by engagement score
//
// Convention: fast-check is NOT a quantchat dependency. These follow the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see backend/__tests__/persistence.property.test.ts and
// backend/__tests__/avatar.property.test.ts).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  MemoryService,
  buildMemoryWhere,
  type MemoryRecord,
  type MemoryPrismaClient,
  type MemorySearchFilters,
} from '../services/memory.service';
import {
  rankBySpotlight,
  computeEngagementScore,
  FEATURED_COUNT,
  type SpotlightSourceReel,
} from '../services/spotlight.service';

// Deterministic seeded RNG (mulberry32) — mirrors the repo PBT convention.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 120; // >= 100 cases per property

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

// ============================================================================
// Shared generators
// ============================================================================

const LOCATIONS = ['Tokyo', 'Paris', 'New York', 'São Paulo', 'reykjavik', 'CAIRO', 'Lagos', ''];
const CAPTION_WORDS = ['sunset', 'beach', 'Friends', 'QUANT', 'alien', 'party', 'dog', 'food', ''];

function randCaption(rand: () => number): string | null {
  if (rand() < 0.15) return null;
  const n = randInt(rand, 1, 3);
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) parts.push(pick(rand, CAPTION_WORDS));
  return parts.join(' ').trim();
}

function randLocation(rand: () => number): string | null {
  if (rand() < 0.15) return null;
  return pick(rand, LOCATIONS);
}

// Random epoch ms within a ~3-year window for createdAt generation.
function randCreatedAt(rand: () => number): Date {
  return new Date(randInt(rand, 1_600_000_000_000, 1_700_000_000_000));
}

function randMemory(rand: () => number, userId: string, idx: number): MemoryRecord {
  return {
    id: `mem_${idx}_${randInt(rand, 0, 1_000_000_000)}`,
    userId,
    mediaUrl: `https://cdn.example/${randInt(rand, 0, 1_000_000)}.jpg`,
    mediaType: rand() < 0.5 ? 'PHOTO' : 'VIDEO',
    caption: randCaption(rand),
    location: randLocation(rand),
    createdAt: randCreatedAt(rand),
    deletedAt: null,
  };
}

// ============================================================================
// Property 34 — memories listed ordered by createdAt descending
// ============================================================================

/**
 * In-memory fake Prisma client for the Memory delegate. `findMany` records the
 * args it was called with and faithfully models the database by applying the
 * requested `orderBy: { createdAt: <dir> }` to the seeded rows it returns.
 */
function makeFakeMemoryPrisma(rows: MemoryRecord[]): {
  client: MemoryPrismaClient;
  lastFindManyArgs: () => { where?: unknown; orderBy?: { createdAt?: 'asc' | 'desc' } };
} {
  let captured: { where?: unknown; orderBy?: { createdAt?: 'asc' | 'desc' } } = {};
  const client: MemoryPrismaClient = {
    memory: {
      create: async () => {
        throw new Error('not used');
      },
      findMany: async (args: unknown) => {
        const a = (args ?? {}) as { where?: unknown; orderBy?: { createdAt?: 'asc' | 'desc' } };
        captured = a;
        const dir = a.orderBy?.createdAt ?? 'desc';
        const sorted = [...rows].sort((x, y) =>
          dir === 'desc'
            ? y.createdAt.getTime() - x.createdAt.getTime()
            : x.createdAt.getTime() - y.createdAt.getTime(),
        );
        return sorted;
      },
      findFirst: async () => null,
      update: async () => {
        throw new Error('not used');
      },
      delete: async () => {
        throw new Error('not used');
      },
    },
  };
  return { client, lastFindManyArgs: () => captured };
}

// Feature: quantchat-mega-upgrade, Property 34: memories ordered by date descending
// **Validates: Requirements 13.1**
describe('Property 34: MemoryService.list returns memories non-increasing by createdAt', () => {
  it('holds across >=100 randomized vaults (orderBy desc contract + sorted output)', async () => {
    const rand = mulberry32(0x5042_3334); // "PB34"

    for (let s = 0; s < SAMPLES; s += 1) {
      const userId = `user_${randInt(rand, 0, 10_000)}`;
      const n = randInt(rand, 0, 30);
      const rows = Array.from({ length: n }, (_, i) => randMemory(rand, userId, i));

      const { client, lastFindManyArgs } = makeFakeMemoryPrisma(rows);
      const service = new MemoryService(client);

      const result = await service.list(userId);

      // The service must request a date-descending sort from the database.
      expect(lastFindManyArgs().orderBy).toEqual({ createdAt: 'desc' });
      // The service must scope via buildMemoryWhere (user + non-deleted).
      expect(lastFindManyArgs().where).toEqual(buildMemoryWhere(userId));

      // Modeling the DB sort, the returned list is non-increasing by createdAt.
      expect(result).toHaveLength(n);
      for (let i = 1; i < result.length; i += 1) {
        expect(result[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          result[i].createdAt.getTime(),
        );
      }
    }
  });
});

// ============================================================================
// Property 35 — memory search returns every truly-matching item
// ============================================================================

/**
 * Ground-truth predicate: the intended search semantics (date range inclusive,
 * case-insensitive location/caption substring, non-deleted, user-scoped). Blank
 * filter terms are treated as "no constraint", matching buildMemoryWhere.
 */
function trulyMatches(memory: MemoryRecord, userId: string, filters: MemorySearchFilters): boolean {
  if (memory.userId !== userId) return false;
  if (memory.deletedAt !== null) return false;

  if (filters.from && memory.createdAt.getTime() < filters.from.getTime()) return false;
  if (filters.to && memory.createdAt.getTime() > filters.to.getTime()) return false;

  const loc = filters.location?.trim();
  if (loc && loc.length > 0) {
    if (!memory.location) return false;
    if (!memory.location.toLowerCase().includes(loc.toLowerCase())) return false;
  }

  const q = filters.q?.trim();
  if (q && q.length > 0) {
    if (!memory.caption) return false;
    if (!memory.caption.toLowerCase().includes(q.toLowerCase())) return false;
  }

  return true;
}

/**
 * Pure interpreter of the Prisma `where` object produced by buildMemoryWhere.
 * Replicates Prisma's matching semantics (equality, date gte/lte, case-
 * insensitive `contains`) so we can assert the generated clause admits every
 * truly-matching memory.
 */
function matchesWhere(memory: MemoryRecord, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (memory as unknown as Record<string, unknown>)[key];

    if (cond === null) {
      if (value !== null) return false;
      continue;
    }

    if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
      continue;
    }

    if (typeof cond === 'object') {
      const c = cond as Record<string, unknown>;

      // Date range: { gte?, lte? }
      if ('gte' in c || 'lte' in c) {
        if (!(value instanceof Date)) return false;
        if (c['gte'] instanceof Date && value.getTime() < c['gte'].getTime()) return false;
        if (c['lte'] instanceof Date && value.getTime() > c['lte'].getTime()) return false;
        continue;
      }

      // Substring: { contains, mode: 'insensitive' }
      if ('contains' in c) {
        const needle = String(c['contains']);
        if (typeof value !== 'string') return false;
        const haystack = c['mode'] === 'insensitive' ? value.toLowerCase() : value;
        const search = c['mode'] === 'insensitive' ? needle.toLowerCase() : needle;
        if (!haystack.includes(search)) return false;
        continue;
      }
    }

    // Plain scalar equality (e.g. userId).
    if (value !== cond) return false;
  }
  return true;
}

function randFilters(rand: () => number): MemorySearchFilters {
  const filters: MemorySearchFilters = {};
  if (rand() < 0.6) {
    const a = randCreatedAt(rand).getTime();
    const b = randCreatedAt(rand).getTime();
    filters.from = new Date(Math.min(a, b));
    filters.to = new Date(Math.max(a, b));
  }
  if (rand() < 0.5) {
    const base = pick(rand, LOCATIONS);
    // Use a substring of the location to exercise `contains`.
    filters.location = base.length > 2 ? base.slice(0, randInt(rand, 1, base.length)) : base;
  }
  if (rand() < 0.5) {
    filters.q = pick(rand, CAPTION_WORDS);
  }
  return filters;
}

// Feature: quantchat-mega-upgrade, Property 35: memory search returns matching items
// **Validates: Requirements 13.3**
describe('Property 35: buildMemoryWhere admits every memory that truly matches the filter', () => {
  it('holds across >=100 randomized memory sets and filters', () => {
    const rand = mulberry32(0x5042_3335); // "PB35"

    for (let s = 0; s < SAMPLES; s += 1) {
      const userId = `user_${randInt(rand, 0, 1_000)}`;
      const n = randInt(rand, 1, 25);
      const memories = Array.from({ length: n }, (_, i) => randMemory(rand, userId, i));
      // Occasionally include a foreign-user row to confirm user scoping.
      if (rand() < 0.3) {
        memories.push(randMemory(rand, `other_${randInt(rand, 0, 1_000)}`, n));
      }

      const filters = randFilters(rand);
      const where = buildMemoryWhere(userId, filters);

      let matchedAny = false;
      for (const memory of memories) {
        if (trulyMatches(memory, userId, filters)) {
          matchedAny = true;
          // Every truly-matching memory must satisfy the generated where-clause.
          expect(matchesWhere(memory, where)).toBe(true);
        }
      }

      // Foreign-user rows must never satisfy the user-scoped where-clause.
      for (const memory of memories) {
        if (memory.userId !== userId) {
          expect(matchesWhere(memory, where)).toBe(false);
        }
      }

      // Sanity: the generated clause is always user-scoped and excludes deleted.
      expect(where['userId']).toBe(userId);
      expect(where['deletedAt']).toBe(null);
      void matchedAny;
    }
  });
});

// ============================================================================
// Property 7 — spotlight ranking is non-increasing by engagement score
// ============================================================================

function randReel(rand: () => number, idx: number): SpotlightSourceReel {
  return {
    id: `reel_${idx}_${randInt(rand, 0, 1_000_000_000)}`,
    creatorId: `creator_${randInt(rand, 0, 10_000)}`,
    creatorUsername: `user_${randInt(rand, 0, 10_000)}`,
    creatorAvatar: `https://cdn.example/${idx}.svg`,
    videoUrl: `https://cdn.example/${idx}.mp4`,
    thumbnailUrl: `https://cdn.example/${idx}.jpg`,
    caption: `caption ${idx}`,
    duration: randInt(rand, 5, 60),
    likeCount: randInt(rand, 0, 100_000),
    commentCount: randInt(rand, 0, 50_000),
    shareCount: randInt(rand, 0, 25_000),
    watchThroughRate: rand(),
    createdAt: new Date(randInt(rand, 1_600_000_000_000, 1_700_000_000_000)).toISOString(),
    isLikedByUser: rand() < 0.5,
  };
}

// Feature: quantchat-mega-upgrade, Property 7: spotlight ranking non-increasing by engagement score
// **Validates: Requirements 13.5**
describe('Property 7: rankBySpotlight output is non-increasing by engagementScore', () => {
  it('holds across >=100 randomized reel sets (sorted, permutation, top-3 featured)', () => {
    const rand = mulberry32(0x5042_3037); // "PB07"

    for (let s = 0; s < SAMPLES; s += 1) {
      const n = randInt(rand, 0, 40);
      const reels = Array.from({ length: n }, (_, i) => randReel(rand, i));

      const ranked = rankBySpotlight(reels);

      // (a) Non-increasing by engagement score.
      for (let i = 1; i < ranked.length; i += 1) {
        expect(ranked[i - 1].engagementScore).toBeGreaterThanOrEqual(ranked[i].engagementScore);
      }

      // (b) Each engagementScore matches the pure scorer.
      for (const r of ranked) {
        expect(r.engagementScore).toBe(computeEngagementScore(r));
      }

      // (c) Output is a permutation of the input (same multiset of ids, same size).
      expect(ranked).toHaveLength(n);
      const inputIds = [...reels.map((r) => r.id)].sort();
      const outputIds = [...ranked.map((r) => r.id)].sort();
      expect(outputIds).toEqual(inputIds);

      // (d) Exactly the top min(n, FEATURED_COUNT) reels are flagged featured.
      const expectedFeatured = Math.min(n, FEATURED_COUNT);
      const featured = ranked.filter((r) => r.isFeatured);
      expect(featured).toHaveLength(expectedFeatured);
      for (let i = 0; i < ranked.length; i += 1) {
        expect(ranked[i].isFeatured).toBe(i < FEATURED_COUNT);
      }
    }
  });
});
