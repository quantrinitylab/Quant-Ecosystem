// @vitest-environment node
// ============================================================================
// Task 26.2 — Property test: daily allowance resets exactly once per UTC day
// quantmail-superhub · Phase 7 — Credit wallet & append-only ledger (Pillar 7)
// ============================================================================
//
// Feature: quantmail-superhub, Property 12: daily allowance resets exactly once per UTC day
//
// **Property P12 (daily reset idempotence)** — for ANY number of grant attempts
// against a given UTC day (repeated, interleaved across owners/days, in
// arbitrary order, and with concurrent-ish repeats fired via `Promise.all`),
// the append-only ledger always ends up with EXACTLY ONE `daily_grant` entry
// per (owner, UTC day) that was attempted at least once. Concretely:
//
//   * the number of distinct `daily_grant` ledger entries equals the number of
//     distinct (owner, utcDay) pairs that were attempted;
//   * every attempted (owner, utcDay) has exactly one `daily_grant` row;
//   * all repeat attempts for the same (owner, day) return the SAME entry id
//     (the grant is a NO-OP once it exists — Req 17.2);
//   * the DAILY bucket balance for each owner equals EXACTLY ONE allowance —
//     yesterday's unused daily credits never roll over or stack (Req 17.1/17.3),
//     because each grant first expires the prior daily remainder.
//
// **Validates: Requirements 17.1, 17.2**
//
// HARNESS: drives the REAL `CreditWallet.grantDaily` (task 26.1), consumed
// through the billing module barrel (`modules/billing`). The only seam is an
// in-memory Prisma double for the `creditLedgerEntry` table — modeled exactly on
// `credit-wallet-daily-grant.service.test.ts` — that ENFORCES the @unique
// `actionKey` constraint (throws P2002 on a duplicate), so repeated/concurrent
// grant attempts are de-duplicated the way the real DB would behave. No live
// services, no network, no real database. Library: fast-check, >= 100 runs.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CreditWallet } from '../modules/billing';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double (same shape as the daily-grant service test).
// create() enforces the @unique(actionKey) constraint; update/delete are
// intentionally absent so the ledger is append-only by construction. findMany /
// findFirst filter over (ownerRef, entryType, utcDay).
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  sourceRef: string | null;
  utcDay: string | null;
  reason: string | null;
  createdAt: Date;
}

interface DailyWhere {
  ownerRef?: string;
  entryType?: string;
  utcDay?: string;
}

function matches(row: LedgerRow, where?: DailyWhere): boolean {
  if (where == null) return true;
  if (where.ownerRef != null && row.ownerRef !== where.ownerRef) return false;
  if (where.entryType != null && row.entryType !== where.entryType) return false;
  if (where.utcDay != null && row.utcDay !== where.utcDay) return false;
  return true;
}

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  const prisma = {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        // Enforce the @unique(actionKey) constraint so idempotency races are
        // exercised the way the real DB would behave.
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && rows.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed: actionKey'), {
            code: 'P2002',
          });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey,
          sourceRef: (data.sourceRef as string | null) ?? null,
          utcDay: (data.utcDay as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          createdAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: DailyWhere } = {}): Promise<LedgerRow[]> {
        return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      },
      async findFirst({ where }: { where?: DailyWhere } = {}): Promise<LedgerRow | null> {
        const hit = rows.find((r) => matches(r, where));
        return hit ? { ...hit } : null;
      },
    },
  };
  return prisma;
}

function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

const ownerId = (i: number) => `owner-${i}`;
const tenantId = (i: number) => `tenant-${i}`;

/** A distinct YYYY-MM-DD UTC day, June 2024 (j in 0..5 keeps it within June). */
const utcDay = (j: number) => new Date(Date.UTC(2024, 5, 1 + j)).toISOString().slice(0, 10);

/** The DAILY bucket balance for an owner: SUM of all DAILY ledger rows. */
function dailyBalance(prisma: ReturnType<typeof createLedgerPrisma>, owner: string): number {
  return prisma._rows
    .filter((r) => r.ownerRef === owner && r.bucket === 'DAILY')
    .reduce((acc, r) => acc + r.amount, 0);
}

// ---------------------------------------------------------------------------
// Generator: an arbitrary set of grant ATTEMPTS — a fixed allowance for the run,
// a pool of owners and days, and a list of (owner, day) attempt events. Two
// events for the same (owner, day) are repeats; the list order is arbitrary,
// giving interleaved/shuffled attempts across owners and days.
// ---------------------------------------------------------------------------

const scenarioArb = fc
  .record({
    allowance: fc.integer({ min: 1, max: 100 }),
    numOwners: fc.integer({ min: 1, max: 4 }),
    numDays: fc.integer({ min: 1, max: 6 }),
  })
  .chain(({ allowance, numOwners, numDays }) =>
    fc
      .array(
        fc.record({
          owner: fc.integer({ min: 0, max: numOwners - 1 }),
          day: fc.integer({ min: 0, max: numDays - 1 }),
        }),
        { minLength: 1, maxLength: 60 },
      )
      .map((events) => ({ allowance, events })),
  );

// ===========================================================================

describe('Feature: quantmail-superhub, Property 12: daily allowance resets exactly once per UTC day (Req 17.1, 17.2)', () => {
  it('P12: exactly one daily_grant per attempted (owner, UTC day); repeats are NO-OPs; no rollover/stacking', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ allowance, events }) => {
        const prisma = createLedgerPrisma();
        const wallet = new CreditWallet(prisma as never, {
          generateId: seqIds(),
          dailyAllowanceProvider: () => allowance,
        });

        // Collapse the arbitrary attempt stream into distinct (owner, day) pairs
        // with a repeat COUNT, preserving first-appearance order (an arbitrary,
        // interleaved processing order across owners and days).
        const counts = new Map<string, number>();
        const order: Array<{ owner: number; day: number; key: string }> = [];
        for (const e of events) {
          const key = `${e.owner}|${e.day}`;
          if (!counts.has(key)) order.push({ owner: e.owner, day: e.day, key });
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // Collected returned entry ids per (owner, day) — across the first
        // attempt AND every (concurrent) repeat.
        const returnedIds = new Map<string, string[]>();

        for (const { owner, day, key } of order) {
          const ref = { ownerId: ownerId(owner), tenantId: tenantId(owner) };
          const dayStr = utcDay(day);
          const total = counts.get(key) ?? 1;

          // First attempt: awaited on its own so the grant (and any prior-day
          // expiry) is materialised exactly once.
          const first = await wallet.grantDaily(ref, dayStr);

          // Remaining attempts: fired concurrently to model a re-run / race of
          // the reset job. Each must observe the existing grant and return it as
          // a NO-OP (Req 17.2) — never appending a second grant.
          const repeats = await Promise.all(
            Array.from({ length: total - 1 }, () => wallet.grantDaily(ref, dayStr)),
          );

          returnedIds.set(key, [first.id, ...repeats.map((r) => r.id)]);
        }

        // The distinct (owner, day) pairs that were attempted at least once.
        const attemptedPairs = order.map(({ owner, day }) => `${ownerId(owner)}|${utcDay(day)}`);
        const attemptedSet = new Set(attemptedPairs);

        // (1) EXACTLY ONE daily_grant per attempted (owner, day): the number of
        // distinct daily_grant entries equals the number of distinct attempted
        // (owner, day) pairs.
        const grants = prisma._rows.filter((r) => r.entryType === 'daily_grant');
        expect(grants).toHaveLength(attemptedSet.size);

        const grantPairs = new Set(grants.map((g) => `${g.ownerRef}|${g.utcDay}`));
        expect(grantPairs).toEqual(attemptedSet);

        // (2) Per attempted pair: exactly one daily_grant row, and EVERY attempt
        // (first + concurrent repeats) returned that same single entry id.
        for (const { owner, day, key } of order) {
          const owner_ = ownerId(owner);
          const dayStr = utcDay(day);
          const rowsForPair = prisma._rows.filter(
            (r) => r.entryType === 'daily_grant' && r.ownerRef === owner_ && r.utcDay === dayStr,
          );
          expect(rowsForPair).toHaveLength(1);
          expect(rowsForPair[0].amount).toBe(allowance);

          const ids = returnedIds.get(key) ?? [];
          const distinctReturned = new Set(ids);
          expect(distinctReturned.size).toBe(1);
          expect(distinctReturned.has(rowsForPair[0].id)).toBe(true);
        }

        // (3) NO rollover / stacking (Req 17.1/17.3): each owner that was granted
        // on >= 1 day ends with a DAILY balance of EXACTLY one allowance — the
        // latest grant expired all prior daily remainder before adding its own.
        const attemptedOwners = new Set(order.map(({ owner }) => ownerId(owner)));
        for (const owner of attemptedOwners) {
          expect(dailyBalance(prisma, owner)).toBe(allowance);
        }
      }),
      { numRuns: 150 },
    );
  });
});
