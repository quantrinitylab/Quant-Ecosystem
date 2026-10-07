// ============================================================================
// Test support — in-memory fake Prisma client for EncryptedSearchIndex tests
// Spec: quantchat-launch-readiness, Task 17.3
//
// A live PostgreSQL is not available in the sandbox, so the blind-index property
// test drives the REAL `PrismaEncryptedSearchIndex` against a faithful in-memory
// model of the exact Prisma operations it issues (mirrors the repo's established
// fake-key-prisma.ts approach):
//
//   prisma.blindIndexEntry.createMany({ data })          // index()
//   prisma.$queryRaw(Prisma.sql`SELECT "messageId", MIN(...) ... GROUP BY ...`)  // search() rows
//   prisma.$queryRaw(Prisma.sql`SELECT COUNT(DISTINCT "messageId") ...`)         // search() count
//
// Unlike the key-storage fake (which is driven by tagged templates), the search
// service calls `$queryRaw` with a single `Prisma.Sql` argument, so this fake
// inspects the composed `Prisma.Sql` object (`.sql` text + flattened `.values`)
// to model the GROUP BY / COUNT(DISTINCT) match the service relies on. The
// matching mirrors Postgres semantics: owner-scoped (`"userId" = ?`), an
// equality test over opaque token hashes (`"tokenHash" IN (...)`), grouped by
// message id so each candidate appears exactly once, ordered by the earliest
// matching row, then LIMIT/OFFSET.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file, so the
// vitest include glob does not collect it as a test suite — it is a shared
// helper imported by the blind-index test file.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

/**
 * A persisted blind-index row. This is the COMPLETE set of columns the
 * zero-knowledge store keeps: message id, conversation id, owner id, an opaque
 * HMAC token hash, and a timestamp. There is deliberately no place to store
 * plaintext, ciphertext, or key material (Requirements 14.3, 16.1).
 */
export interface BlindRow {
  messageId: string;
  conversationId: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  /** Monotonic insertion order — a deterministic stand-in for row identity. */
  seq: number;
}

/** Anything carrying the `Prisma.Sql` shape the service passes to `$queryRaw`. */
interface SqlLike {
  sql: string;
  values: unknown[];
}

function isSqlLike(value: unknown): value is SqlLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { sql?: unknown }).sql === 'string' &&
    Array.isArray((value as { values?: unknown }).values)
  );
}

export interface FakeSearchPrisma {
  blindIndexEntry: {
    createMany(args: {
      data: Array<{
        messageId: string;
        conversationId: string;
        userId: string;
        tokenHash: string;
        createdAt?: Date;
      }>;
    }): Promise<{ count: number }>;
  };
  $queryRaw<T = unknown>(query: unknown): Promise<T>;
  /** Inspection hook for assertions — not part of the PrismaClient surface. */
  __state: { entries: BlindRow[] };
}

/** Build a fresh in-memory fake Prisma client for the blind index. */
export function createFakeSearchPrisma(): FakeSearchPrisma {
  const entries: BlindRow[] = [];
  let seq = 0;

  // Compute the owner-scoped, deduped match the service's GROUP BY query
  // produces, ordered by the earliest matching row (createdAt, then messageId).
  function matchedMessages(
    userId: string,
    hashes: string[],
  ): Array<{ messageId: string; conversationId: string; minCreatedAt: number; minSeq: number }> {
    const hashSet = new Set(hashes);
    const byMessage = new Map<
      string,
      { conversationId: string; minCreatedAt: number; minSeq: number }
    >();
    for (const row of entries) {
      if (row.userId !== userId || !hashSet.has(row.tokenHash)) {
        continue;
      }
      const t = row.createdAt.getTime();
      const found = byMessage.get(row.messageId);
      if (!found) {
        byMessage.set(row.messageId, {
          conversationId: row.conversationId,
          minCreatedAt: t,
          minSeq: row.seq,
        });
      } else {
        if (t < found.minCreatedAt) {
          found.minCreatedAt = t;
        }
        if (row.seq < found.minSeq) {
          found.minSeq = row.seq;
        }
        // MIN("conversationId") — a no-op pick; a message has one conversation.
        if (row.conversationId < found.conversationId) {
          found.conversationId = row.conversationId;
        }
      }
    }
    return Array.from(byMessage.entries())
      .map(([messageId, v]) => ({ messageId, ...v }))
      .sort((a, b) => {
        if (a.minCreatedAt !== b.minCreatedAt) {
          return a.minCreatedAt - b.minCreatedAt;
        }
        if (a.minSeq !== b.minSeq) {
          return a.minSeq - b.minSeq;
        }
        return a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0;
      });
  }

  return {
    blindIndexEntry: {
      async createMany({ data }) {
        for (const d of data) {
          entries.push({
            messageId: d.messageId,
            conversationId: d.conversationId,
            userId: d.userId,
            tokenHash: d.tokenHash,
            createdAt: d.createdAt ?? new Date(),
            seq: (seq += 1),
          });
        }
        return { count: data.length };
      },
    },

    async $queryRaw<T = unknown>(query: unknown): Promise<T> {
      if (!isSqlLike(query)) {
        throw new Error('fake $queryRaw expected a Prisma.Sql argument');
      }
      const values = query.values;
      const userId = values[0] as string;
      const isCount = /COUNT\s*\(\s*DISTINCT/i.test(query.sql);

      if (isCount) {
        // values: [userId, ...hashes]
        const hashes = values.slice(1) as string[];
        const total = matchedMessages(userId, hashes).length;
        return [{ count: BigInt(total) }] as unknown as T;
      }

      // Rows query — values: [userId, ...hashes, pageSize, skip]
      const skip = Number(values[values.length - 1]);
      const pageSize = Number(values[values.length - 2]);
      const hashes = values.slice(1, values.length - 2) as string[];
      const all = matchedMessages(userId, hashes);
      const page = all.slice(skip, skip + pageSize);
      return page.map((m) => ({
        messageId: m.messageId,
        conversationId: m.conversationId,
      })) as unknown as T;
    },

    __state: { entries },
  };
}

/** Cast helper — the fake implements exactly the subset the service uses. */
export function asPrismaClient(fake: FakeSearchPrisma): PrismaClient {
  return fake as unknown as PrismaClient;
}
