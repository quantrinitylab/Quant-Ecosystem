// ============================================================================
// Test support — in-memory fake Prisma client for PrismaOutboxService tests
// (QC-F-541: outbox claim lease)
//
// A live PostgreSQL is not available in the sandbox, so the QC-F-541 suite
// drives the REAL `PrismaOutboxService` against this faithful in-memory model
// of the exact Prisma operations the claim path issues:
//
//   prisma.$transaction(async (tx) => {          (interactive transaction)
//       tx.$queryRaw    SELECT ... FOR UPDATE SKIP LOCKED   (claim select)
//       tx.$executeRaw  UPDATE ... SET claimedAt/leaseExpiresAt (claim stamp)
//   })
//   prisma.messageOutbox.update / updateMany     (markProcessed/markFailed/
//                                                 releaseClaim)
//   prisma.$queryRaw                             (standalone select — the
//                                                 pre-QC-F-541 claim shape;
//                                                 modelled so the negative
//                                                 control fails behaviourally)
//
// The properties modelled here are the ones the finding turns on:
//   * TRANSACTION SERIALIZATION + ATOMICITY: `$transaction` callbacks run one
//     at a time (a promise-chain mutex), against the committed store, with a
//     snapshot restore if the callback throws — so a claim's SELECT and its
//     lease stamp are visible to the next transaction as one committed unit,
//     exactly as Postgres + SKIP LOCKED would present them.
//   * LEASE PREDICATE: the claim select honours processedAt / attempts /
//     leaseExpiresAt exactly as the service's SQL WHERE clause states.
//
// HEADER WARNING (honesty): this double MODELS `FOR UPDATE SKIP LOCKED`; it
// is not a real row lock. The genuine Postgres lock behaviour is Tier-2
// (TEST_DATABASE_URL-gated, see qc-f-541-outbox-claim.test.ts) and remains
// owed until a database is available — no test here claims it was exercised.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file so the
// vitest include glob does not collect it as a suite — it is a shared helper.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

/** A committed `message_outbox` row as the fake stores it. */
export interface FakeOutboxRow {
  id: string;
  conversationId: string;
  messageId: string;
  recipientIds: string[];
  attempts: number;
  processedAt: Date | null;
  lastError: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
}

/** The minimal shape of a Prisma `Sql` object the service hands to raw calls. */
interface RawSql {
  text: string;
  values: unknown[];
}

interface OutboxUpdateData {
  processedAt?: Date | null;
  claimedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  lastError?: string | null;
  attempts?: number | { increment: number };
}

export interface FakeOutboxPrisma {
  $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T>;
  $queryRaw(query: RawSql): Promise<FakeOutboxRow[]>;
  messageOutbox: {
    create(args: { data: Partial<FakeOutboxRow> }): Promise<FakeOutboxRow>;
    update(args: { where: { id: string }; data: OutboxUpdateData }): Promise<FakeOutboxRow>;
    updateMany(args: {
      where: { id: string; processedAt?: Date | null };
      data: OutboxUpdateData;
    }): Promise<{ count: number }>;
  };
  /** Inspection / seeding hook for assertions — not part of the Prisma surface. */
  __state: { rows: FakeOutboxRow[] };
  /** Seed a row directly (ids deterministic per instance). */
  __seed(partial: Partial<FakeOutboxRow> & { conversationId: string; messageId: string }): FakeOutboxRow;
}

function cloneRow(row: FakeOutboxRow): FakeOutboxRow {
  return { ...row, recipientIds: [...row.recipientIds] };
}

function applyUpdate(row: FakeOutboxRow, data: OutboxUpdateData): void {
  if (data.processedAt !== undefined) row.processedAt = data.processedAt;
  if (data.claimedAt !== undefined) row.claimedAt = data.claimedAt;
  if (data.leaseExpiresAt !== undefined) row.leaseExpiresAt = data.leaseExpiresAt;
  if (data.lastError !== undefined) row.lastError = data.lastError;
  if (data.attempts !== undefined) {
    row.attempts =
      typeof data.attempts === 'number' ? data.attempts : row.attempts + data.attempts.increment;
  }
}

/**
 * The claim SELECT, modelled from the service's SQL text: the WHERE predicate
 * is (processedAt IS NULL, attempts <= max, and — when the query carries the
 * QC-F-541 lease clause — leaseExpiresAt IS NULL OR <= now), oldest first,
 * limited. Values arrive in SQL order: [maxAttempts, (now)?, limit]. The
 * select never stamps by itself: inside a transaction the service's paired
 * $executeRaw stamps before commit; standalone (pre-fix) there is no stamp
 * at all, because the statement's locks evaporated when it returned.
 */
function runClaimSelect(rows: FakeOutboxRow[], query: RawSql): FakeOutboxRow[] {
  if (!query.text.includes('FOR UPDATE SKIP LOCKED')) {
    throw new Error(`fake-outbox-prisma: unmodelled raw query: ${query.text}`);
  }
  const hasLeaseClause = query.text.includes('"leaseExpiresAt"');
  const maxAttempts = query.values[0] as number;
  const now = hasLeaseClause ? (query.values[1] as Date) : null;
  const limit = query.values[hasLeaseClause ? 2 : 1] as number;

  return rows
    .filter(
      (r) =>
        r.processedAt === null &&
        r.attempts <= maxAttempts &&
        (!hasLeaseClause ||
          r.leaseExpiresAt === null ||
          (now !== null && r.leaseExpiresAt.getTime() <= now.getTime())),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit)
    .map(cloneRow);
}

/** Build a fresh fake Prisma client modelling the outbox claim surface. */
export function createFakeOutboxPrisma(): FakeOutboxPrisma {
  const store: { rows: FakeOutboxRow[] } = { rows: [] };
  let idSeq = 0;
  const nextId = (): string => `obx_${(idSeq += 1)}`;

  // Promise-chain mutex: interactive transactions run strictly one at a time,
  // in call order — the serialization Postgres gives interactive transactions
  // contending for the same rows under SKIP LOCKED.
  let txChain: Promise<unknown> = Promise.resolve();

  function buildRow(data: Partial<FakeOutboxRow>): FakeOutboxRow {
    return {
      id: data.id ?? nextId(),
      conversationId: data.conversationId as string,
      messageId: data.messageId as string,
      recipientIds: [...(data.recipientIds ?? [])],
      attempts: data.attempts ?? 0,
      processedAt: data.processedAt ?? null,
      lastError: data.lastError ?? null,
      claimedAt: data.claimedAt ?? null,
      leaseExpiresAt: data.leaseExpiresAt ?? null,
      createdAt: data.createdAt ?? new Date(),
    };
  }

  const messageOutbox = {
    async create({ data }: { data: Partial<FakeOutboxRow> }): Promise<FakeOutboxRow> {
      const row = buildRow(data);
      store.rows.push(row);
      return cloneRow(row);
    },
    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: OutboxUpdateData;
    }): Promise<FakeOutboxRow> {
      const row = store.rows.find((r) => r.id === where.id);
      if (!row) {
        const err = new Error(
          'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        );
        (err as Error & { code?: string }).code = 'P2025';
        throw err;
      }
      applyUpdate(row, data);
      return cloneRow(row);
    },
    async updateMany({
      where,
      data,
    }: {
      where: { id: string; processedAt?: Date | null };
      data: OutboxUpdateData;
    }): Promise<{ count: number }> {
      const row = store.rows.find((r) => r.id === where.id);
      if (!row) return { count: 0 };
      if (where.processedAt !== undefined && row.processedAt !== where.processedAt) {
        return { count: 0 };
      }
      applyUpdate(row, data);
      return { count: 1 };
    },
  };

  return {
    messageOutbox,

    async $queryRaw(query: RawSql): Promise<FakeOutboxRow[]> {
      // Standalone (non-transactional) claim select — the pre-QC-F-541 shape.
      // No stamp exists on this path: the statement's locks are gone when it
      // returns, which is precisely the defect the negative control shows.
      return runClaimSelect(store.rows, query);
    },

    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        // Snapshot for rollback: writes inside the callback land on the live
        // store; a throw restores the snapshot, so nothing partial commits.
        const snapshot = store.rows.map(cloneRow);

        const tx = {
          $queryRaw: async (query: RawSql): Promise<FakeOutboxRow[]> => {
            // The select itself does not stamp: the service's paired
            // $executeRaw (same transaction, immediately after) writes the
            // lease before commit, and transaction serialization means no
            // other claim can observe the in-between state — the pair is one
            // committed unit, as under Postgres.
            return runClaimSelect(store.rows, query);
          },
          $executeRaw: async (query: RawSql): Promise<number> => {
            if (!query.text.includes('UPDATE "message_outbox"')) {
              throw new Error(`fake-outbox-prisma: unmodelled raw update: ${query.text}`);
            }
            // Values in SQL order: [claimedAt, leaseExpiresAt, ...ids].
            const [claimedAt, leaseExpiresAt, ...ids] = query.values as [Date, Date, ...string[]];
            let count = 0;
            for (const row of store.rows) {
              if (ids.includes(row.id)) {
                row.claimedAt = claimedAt;
                row.leaseExpiresAt = leaseExpiresAt;
                count += 1;
              }
            }
            return count;
          },
          messageOutbox: {
            async create({ data }: { data: Partial<FakeOutboxRow> }): Promise<FakeOutboxRow> {
              const row = buildRow(data);
              store.rows.push(row);
              return cloneRow(row);
            },
          },
        };

        try {
          return await cb(tx);
        } catch (error) {
          store.rows = snapshot;
          throw error;
        }
      };

      const result = txChain.then(run, run);
      txChain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    __state: store,

    __seed(partial) {
      const row = buildRow(partial);
      store.rows.push(row);
      return row;
    },
  };
}

/** Cast helper — the fake implements exactly the subset PrismaOutboxService uses. */
export function asOutboxPrismaClient(fake: FakeOutboxPrisma): PrismaClient {
  return fake as unknown as PrismaClient;
}
