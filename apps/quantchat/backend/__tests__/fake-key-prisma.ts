// ============================================================================
// Test support — in-memory fake Prisma client for PrismaKeyStorage tests
// Spec: quantchat-launch-readiness, Tasks 2.3 / 2.4 / 2.5
//
// A live PostgreSQL is not available in the sandbox, so these tests drive the
// REAL `PrismaKeyStorage` against a faithful in-memory model of the exact
// Prisma operations it issues (mirrors the repo's established mocking approach
// in message.service.test.ts / persistence.property.test.ts):
//
//   prisma.preKeyBundle.upsert / findUnique
//   prisma.keySession.upsert / findUnique
//   prisma.oneTimePreKey.findMany / createMany / count
//   prisma.$queryRaw`UPDATE ... FOR UPDATE SKIP LOCKED RETURNING "publicKey"`
//
// The atomic-claim `$queryRaw` is modeled to select-and-mark a single oldest
// unclaimed prekey synchronously within the call (no internal await), which is
// how Postgres' `FOR UPDATE SKIP LOCKED` row lock behaves: concurrent claims
// issued via `Promise.all` are serialized and can never hand out the same key
// twice. This lets the property tests exercise the real claim contract without
// a database.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file, so the
// vitest include glob does not collect it as a test suite — it is a shared
// helper imported by the PrismaKeyStorage test files.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

interface BundleRow {
  id: string;
  userId: string;
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  registrationId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OtkRow {
  id: string;
  userId: string;
  bundleId: string;
  publicKey: string;
  claimed: boolean;
  claimedAt: Date | null;
  createdAt: Date;
  /** Monotonic insertion order — models `ORDER BY "createdAt" ASC` deterministically. */
  seq: number;
}

interface SessionRow {
  id: string;
  initiatorId: string;
  responderId: string;
  rootKey: string;
  established: boolean;
  createdAt: Date;
}

export interface FakeKeyPrisma {
  preKeyBundle: {
    upsert(args: {
      where: { userId: string };
      create: Omit<BundleRow, 'id' | 'createdAt' | 'updatedAt'>;
      update: Partial<BundleRow>;
    }): Promise<BundleRow>;
    findUnique(args: {
      where: { userId: string };
      select?: { id?: boolean };
    }): Promise<BundleRow | { id: string } | null>;
  };
  keySession: {
    upsert(args: {
      where: { initiatorId_responderId: { initiatorId: string; responderId: string } };
      create: Omit<SessionRow, 'id' | 'createdAt'>;
      update: Partial<SessionRow>;
    }): Promise<SessionRow>;
    findUnique(args: {
      where: { initiatorId_responderId: { initiatorId: string; responderId: string } };
    }): Promise<SessionRow | null>;
  };
  oneTimePreKey: {
    findMany(args: {
      where: { userId: string; publicKey?: { in: string[] }; claimed?: boolean };
      select?: { publicKey?: boolean };
    }): Promise<Array<{ publicKey: string } | OtkRow>>;
    createMany(args: {
      data: Array<{ userId: string; bundleId: string; publicKey: string }>;
    }): Promise<{ count: number }>;
    count(args: { where: { userId: string; claimed?: boolean } }): Promise<number>;
  };
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  /** Inspection hook for assertions — not part of the PrismaClient surface. */
  __state: { bundles: Map<string, BundleRow>; sessions: Map<string, SessionRow>; otks: OtkRow[] };
}

/**
 * Build a fresh in-memory fake Prisma client. The backing maps/arrays are the
 * "durable tier": passing the SAME fake into a new `PrismaKeyStorage` instance
 * models a process restart (in-memory storage state is gone, durable rows are
 * not), which is exactly what the durability property needs.
 */
export function createFakeKeyPrisma(): FakeKeyPrisma {
  const bundles = new Map<string, BundleRow>(); // keyed by userId (@@unique)
  const sessions = new Map<string, SessionRow>(); // keyed by initiatorId\0responderId (@@unique)
  const otks: OtkRow[] = [];
  let idSeq = 0;
  let otkSeq = 0;
  const nextId = (prefix: string): string => `${prefix}_${(idSeq += 1)}`;
  const sessionKey = (initiatorId: string, responderId: string): string =>
    `${initiatorId}\u0000${responderId}`;

  return {
    preKeyBundle: {
      async upsert({ where, create, update }) {
        const existing = bundles.get(where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return { ...existing };
        }
        const row: BundleRow = {
          id: nextId('bundle'),
          userId: create.userId,
          identityKey: create.identityKey,
          signedPreKey: create.signedPreKey,
          signedPreKeySignature: create.signedPreKeySignature,
          registrationId: create.registrationId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bundles.set(row.userId, row);
        return { ...row };
      },
      async findUnique({ where, select }) {
        const row = bundles.get(where.userId);
        if (!row) {
          return null;
        }
        if (select?.id) {
          return { id: row.id };
        }
        return { ...row };
      },
    },

    keySession: {
      async upsert({ where, create, update }) {
        const { initiatorId, responderId } = where.initiatorId_responderId;
        const key = sessionKey(initiatorId, responderId);
        const existing = sessions.get(key);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row: SessionRow = {
          id: nextId('session'),
          initiatorId: create.initiatorId,
          responderId: create.responderId,
          rootKey: create.rootKey,
          established: create.established,
          createdAt: new Date(),
        };
        sessions.set(key, row);
        return { ...row };
      },
      async findUnique({ where }) {
        const { initiatorId, responderId } = where.initiatorId_responderId;
        const row = sessions.get(sessionKey(initiatorId, responderId));
        return row ? { ...row } : null;
      },
    },

    oneTimePreKey: {
      async findMany({ where, select }) {
        let rows = otks.filter((o) => o.userId === where.userId);
        if (where.publicKey?.in) {
          const inSet = new Set(where.publicKey.in);
          rows = rows.filter((o) => inSet.has(o.publicKey));
        }
        if (where.claimed !== undefined) {
          rows = rows.filter((o) => o.claimed === where.claimed);
        }
        if (select?.publicKey) {
          return rows.map((o) => ({ publicKey: o.publicKey }));
        }
        return rows.map((o) => ({ ...o }));
      },
      async createMany({ data }) {
        for (const d of data) {
          otks.push({
            id: nextId('otk'),
            userId: d.userId,
            bundleId: d.bundleId,
            publicKey: d.publicKey,
            claimed: false,
            claimedAt: null,
            createdAt: new Date(),
            seq: (otkSeq += 1),
          });
        }
        return { count: data.length };
      },
      async count({ where }) {
        return otks.filter(
          (o) =>
            o.userId === where.userId &&
            (where.claimed === undefined || o.claimed === where.claimed),
        ).length;
      },
    },

    // Models the design's Algorithm 1 atomic claim. The select-and-mark runs
    // synchronously (no internal await), mirroring `FOR UPDATE SKIP LOCKED`:
    // each concurrent claim grabs a distinct row, never the same one twice.
    async $queryRaw<T = unknown>(_strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      const userId = values[0] as string;
      const candidate = otks
        .filter((o) => o.userId === userId && !o.claimed)
        .sort((a, b) => a.seq - b.seq)[0];
      if (!candidate) {
        return [] as unknown as T;
      }
      candidate.claimed = true;
      candidate.claimedAt = new Date();
      return [{ publicKey: candidate.publicKey }] as unknown as T;
    },

    __state: { bundles, sessions, otks },
  };
}

/** Cast helper — the fake implements exactly the subset PrismaKeyStorage uses. */
export function asPrismaClient(fake: FakeKeyPrisma): PrismaClient {
  return fake as unknown as PrismaClient;
}
