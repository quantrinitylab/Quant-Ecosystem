// ============================================================================
// AI Core — PrismaMemoryRetriever (PR-M04C)
//
// The keyword/recency stand-in retriever. Implements the frozen MemoryRetriever
// port by reading the SAME memory_records table PrismaMemoryStore writes. It
// makes the first vertical slice (observe → store → recall) work end-to-end
// WITHOUT a vector backend.
//
// It is deliberately simple: fetch the owner's candidate rows, score by
// word-overlap + recency in memory, return the top matches. PR-M05 replaces the
// scoring with real embedding similarity behind the SAME port — the integration
// test written in PR-M04C stays unchanged.
// ============================================================================

import type { MemoryRetriever, RetrievalContext, RetrievedMemory } from './memory-port';
import { asKind, asLevel } from './memory-port';
import type { MemoryRecordRow } from './prisma-memory-store';

// ─── Narrow read delegate (real Prisma client satisfies this) ────────────────

export interface MemoryRecordQueryDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    take?: number;
  }): Promise<MemoryRecordRow[]>;
}

export interface MemoryRetrieverPrismaClient {
  memoryRecord: MemoryRecordQueryDelegate;
}

export interface PrismaMemoryRetrieverOptions {
  client: MemoryRetrieverPrismaClient;
  /** How many recent candidates to scan per retrieval. */
  scanLimit?: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class PrismaMemoryRetriever implements MemoryRetriever {
  private readonly client: MemoryRetrieverPrismaClient;
  private readonly scanLimit: number;

  constructor(opts: PrismaMemoryRetrieverOptions) {
    this.client = opts.client;
    this.scanLimit = opts.scanLimit ?? 200;
  }

  async retrieve(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    // Owner-scoped, non-deleted candidates (recency-ordered). Level/expiry/
    // archive filtering is done in memory to keep the query (and its fake)
    // trivial — a keyword/recency stand-in scans candidates anyway.
    const rows = await this.client.memoryRecord.findMany({
      where: { ownerId: ctx.actor, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: this.scanLimit,
    });

    const now = Date.now();
    const levels = ctx.levels && ctx.levels.length > 0 ? new Set<string>(ctx.levels) : null;
    const queryWords = new Set(
      ctx.query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    const scored: RetrievedMemory[] = [];
    for (const row of rows) {
      if (row.archivedAt !== null) continue;
      if (row.expiresAt !== null && row.expiresAt.getTime() <= now) continue;
      if (levels && !levels.has(row.level)) continue;

      const relevance = score(queryWords, row.content);
      if (queryWords.size > 0 && relevance === 0) continue; // no keyword overlap

      scored.push(toRetrieved(row, relevance));
    }

    // Rank by relevance (keyword) then recency is already the fetch order.
    scored.sort((a, b) => b.relevance - a.relevance);
    return scored.slice(0, ctx.limit ?? 10);
  }
}

// ─── Scoring + mapping ─────────────────────────────────────────────────────────

function score(queryWords: Set<string>, content: string): number {
  if (queryWords.size === 0) return 0;
  const words = content
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let overlap = 0;
  for (const q of queryWords) {
    // Substring/stem-tolerant match so "live" matches "lives" — the sort of
    // near-miss a keyword scan should catch (vector similarity does it properly in M05).
    const hit = words.some(
      (w) => w === q || (w.length >= 3 && q.length >= 3 && (w.includes(q) || q.includes(w))),
    );
    if (hit) overlap++;
  }
  return overlap / queryWords.size;
}

function toRetrieved(row: MemoryRecordRow, relevance: number): RetrievedMemory {
  return {
    id: row.logicalId,
    content: row.content,
    source: 'prisma',
    relevance,
    kind: asKind(row.kind),
    level: asLevel(row.level),
    backend: 'postgres',
    reason: relevance > 0 ? 'keyword match' : 'recency',
    confidence: relevance,
  };
}
