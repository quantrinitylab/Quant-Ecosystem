// @vitest-environment node
// ============================================================================
// Task 27.3 — Property test: debits are idempotent under retries
// quantmail-superhub · Phase 7 — Metered usage gate (check -> reserve -> settle)
// ============================================================================
//
// Feature: quantmail-superhub, Property 13: debits are idempotent under retries
//
// **Property P13 (debit idempotence)** — for ANY `actionKey`, replaying the same
// reservation/settlement (sequentially OR concurrently, an arbitrary number of
// times) leaves the wallet balance UNCHANGED relative to applying it exactly
// once. The idempotency anchor is the wallet's append-only ledger: each consumed
// bucket's debit row carries a @unique key `debit:{actionKey}#{bucket}`, so a
// replayed debit/settlement appends nothing and the derived balance
// (`sum(ledger)`) cannot drift. Concretely, across N replays:
//   * the wallet's final balance equals the balance after EXACTLY ONE application;
//   * the number of distinct debit ledger entries for an `actionKey` is bounded
//     by the number of consumed buckets (<= 3), NOT multiplied by the replay count;
//   * `UsageGate.checkAndReserve` replays return the same reservation (id) and
//     record only one hold;
//   * `UsageGate.settle` replays return the same settled record and never move
//     the balance after the first settlement;
//   * `CreditWallet.debit` replays return the prior `DebitResult` (replayed=true)
//     and leave the balance unchanged.
//
// **Validates: Requirements 18.4, 18.6**
//
// HARNESS: drives the REAL `UsageGate` + REAL `CreditWallet` (wired together by
// `createWalletBalanceProvider`), all consumed through the billing module barrel
// (`modules/billing`). The only seam is an injected in-memory Prisma double for
// the `creditLedgerEntry` table — append-only and ENFORCING the @unique(actionKey)
// constraint (throws P2002 on a duplicate), exactly like the task-27.1 service
// tests. No live services, no network, no real database. Library: fast-check,
// >= 100 runs per property.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CreditWallet,
  PricingEngine,
  UsageGate,
  InMemoryReservationStore,
  createWalletBalanceProvider,
  permitAllEntitlements,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double — append-only, enforces the @unique(actionKey)
// constraint (throws P2002 on a duplicate). Modeled exactly on the task-27.1
// service tests (credit-wallet-debit.service.test.ts / usage-gate-wallet.service.test.ts).
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

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
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
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return rows
          .filter((r) => owner == null || r.ownerRef === owner)
          .map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: {
        where?: { ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const hit = rows.find(
          (r) =>
            (where?.ownerRef == null || r.ownerRef === where.ownerRef) &&
            (where?.entryType == null || r.entryType === where.entryType) &&
            (where?.utcDay == null || r.utcDay === where.utcDay),
        );
        return hit ? { ...hit } : null;
      },
    },
  };
}

function seqIds(prefix: string) {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const };
const ALICE: OwnershipPrincipal = { principalId: 'alice' };

/** Build a UsageGate whose balance/settlement is backed by a real CreditWallet. */
function makeWalletGate() {
  const prisma = createLedgerPrisma();
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
  const reservations = new InMemoryReservationStore();
  const gate = new UsageGate({
    balances: createWalletBalanceProvider({ wallet }),
    reservations,
    pricing: new PricingEngine({ creditsPerUsd: 1000 }),
    entitlements: permitAllEntitlements,
    generateId: seqIds('res'),
  });
  return { gate, wallet, prisma };
}

/** Seed the wallet's three buckets via the real grant primitives. */
async function seedWallet(
  wallet: CreditWallet,
  { daily, monthly, purchased }: { daily: number; monthly: number; purchased: number },
): Promise<void> {
  if (daily > 0) await wallet.grantDaily(OWNER, '2024-06-01', { dailyAllowance: daily });
  if (monthly > 0) await wallet.credit(OWNER, { amount: monthly, kind: 'monthly_grant' });
  if (purchased > 0) await wallet.credit(OWNER, { amount: purchased, kind: 'purchase' });
}

/** Distinct debit ledger rows recorded for a logical `actionKey`. */
function debitRowsFor(prisma: ReturnType<typeof createLedgerPrisma>, actionKey: string): LedgerRow[] {
  const prefix = `debit:${actionKey}#`;
  return prisma._rows.filter(
    (r) => r.entryType === 'debit' && typeof r.actionKey === 'string' && r.actionKey.startsWith(prefix),
  );
}

/**
 * The number of buckets a single debit of `amount` consumes, drawing in the
 * fixed order DAILY -> MONTHLY -> PURCHASED. This is the upper bound (<= 3) on
 * the distinct debit ledger entries for the action — replays must NOT increase it.
 */
function consumedBucketCount(daily: number, monthly: number, purchased: number, amount: number): number {
  let remaining = amount;
  let count = 0;
  for (const available of [daily, monthly, purchased]) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, available), remaining);
    if (take > 0) {
      count += 1;
      remaining -= take;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Bucket seeds guaranteeing total >= 5 (the rag_query estimate) so the gate can reserve. */
const gateBucketsArb = fc.record({
  daily: fc.integer({ min: 0, max: 500 }),
  monthly: fc.integer({ min: 0, max: 500 }),
  purchased: fc.integer({ min: 5, max: 1000 }),
});

/** Bucket seeds guaranteeing total >= 1 for a direct positive-credit debit. */
const debitBucketsArb = fc.record({
  daily: fc.integer({ min: 0, max: 500 }),
  monthly: fc.integer({ min: 0, max: 500 }),
  purchased: fc.integer({ min: 1, max: 1000 }),
});

/** An arbitrary non-empty idempotency key — the property holds for ANY actionKey. */
const actionKeyArb = fc.string({ minLength: 1, maxLength: 16 });

/** An arbitrary number of replays (>= 1). */
const repeatArb = fc.integer({ min: 1, max: 6 });

// ===========================================================================

describe('Feature: quantmail-superhub, Property 13: debits are idempotent under retries (Req 18.4, 18.6)', () => {
  // -------------------------------------------------------------------------
  // P13 (gate, sequential): replaying checkAndReserve + settle sequentially N
  // times charges the wallet exactly once.
  // -------------------------------------------------------------------------
  it('UsageGate: sequential reservation+settlement replays charge the balance exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        gateBucketsArb,
        actionKeyArb,
        fc.integer({ min: 0, max: 2000 }),
        repeatArb,
        repeatArb,
        async (buckets, actionKey, actualPick, reserveRepeats, settleRepeats) => {
          const { gate, wallet, prisma } = makeWalletGate();
          await seedWallet(wallet, buckets);
          const total = buckets.daily + buckets.monthly + buckets.purchased;
          const actualCost = Math.min(actualPick, total); // fundable => debit succeeds
          const action = { actionKey, kind: 'rag_query' as const };

          // Replay the reservation: every replay returns the SAME reservation id.
          const reservations = [];
          for (let i = 0; i < reserveRepeats; i++) {
            reservations.push(await gate.checkAndReserve('alice', action));
          }
          const firstId = reservations[0].id;
          for (const r of reservations) {
            expect(r.id).toBe(firstId);
            expect(r.actionKey).toBe(actionKey);
            expect(r.estimatedCost).toBe(5);
          }
          // Only one hold recorded (available = total - 5, not total - 5*replays).
          expect(await gate.getAvailableBalance('alice')).toBe(total - 5);

          const stored = await gate.getReservation('alice', actionKey);
          expect(stored).toBeDefined();

          // Settle once, capture the balance, then replay settle N more times.
          const firstSettle = await gate.settle(stored!, actualCost);
          expect(firstSettle.settled).toBe(true);
          expect(firstSettle.actualCost).toBe(actualCost);
          const balanceAfterOne = (await wallet.getBalance(ALICE, OWNER)).total;

          for (let i = 1; i < settleRepeats; i++) {
            const again = await gate.settle(stored!, actualCost);
            expect(again.settled).toBe(true);
            expect(again.actualCost).toBe(actualCost);
            // Each replay leaves the balance exactly where the first settle left it.
            expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(balanceAfterOne);
          }

          // Balance after N replays == balance after exactly ONE application.
          expect(balanceAfterOne).toBe(total - actualCost);
          expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(total - actualCost);

          // Distinct debit entries are bounded by consumed buckets, never multiplied.
          const expectedEntries = consumedBucketCount(
            buckets.daily,
            buckets.monthly,
            buckets.purchased,
            actualCost,
          );
          const debits = debitRowsFor(prisma, actionKey);
          expect(debits.length).toBe(expectedEntries);
          expect(debits.length).toBeLessThanOrEqual(3);
        },
      ),
      { numRuns: 120 },
    );
  });

  // -------------------------------------------------------------------------
  // P13 (gate, concurrent): the same reservation + settlement replayed CONCURRENTLY
  // (Promise.all) still charges the wallet exactly once. The @unique(actionKey)
  // ledger constraint is the race-safe idempotency anchor.
  // -------------------------------------------------------------------------
  it('UsageGate: concurrent reservation+settlement replays charge the balance exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        gateBucketsArb,
        actionKeyArb,
        fc.integer({ min: 0, max: 2000 }),
        repeatArb,
        repeatArb,
        async (buckets, actionKey, actualPick, reserveRepeats, settleRepeats) => {
          const { gate, wallet, prisma } = makeWalletGate();
          await seedWallet(wallet, buckets);
          const total = buckets.daily + buckets.monthly + buckets.purchased;
          const actualCost = Math.min(actualPick, total);
          const action = { actionKey, kind: 'rag_query' as const };

          // Concurrent reservations: all resolve to a hold for the SAME actionKey.
          const reservations = await Promise.all(
            Array.from({ length: reserveRepeats }, () => gate.checkAndReserve('alice', action)),
          );
          for (const r of reservations) {
            expect(r.actionKey).toBe(actionKey);
            expect(r.estimatedCost).toBe(5);
          }
          const stored = await gate.getReservation('alice', actionKey);
          expect(stored).toBeDefined();

          // Concurrent settlements of the stored reservation.
          await Promise.all(
            Array.from({ length: settleRepeats }, () => gate.settle(stored!, actualCost)),
          );

          // Charged exactly once regardless of concurrent replay count.
          expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(total - actualCost);

          const expectedEntries = consumedBucketCount(
            buckets.daily,
            buckets.monthly,
            buckets.purchased,
            actualCost,
          );
          const debits = debitRowsFor(prisma, actionKey);
          expect(debits.length).toBe(expectedEntries);
          expect(debits.length).toBeLessThanOrEqual(3);
        },
      ),
      { numRuns: 120 },
    );
  });

  // -------------------------------------------------------------------------
  // P13 (wallet.debit, sequential): the primitive is idempotent by actionKey —
  // a replay appends nothing, returns the prior DebitResult, and leaves the
  // balance unchanged.
  // -------------------------------------------------------------------------
  it('CreditWallet.debit: sequential replays return the prior result and leave the balance unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        debitBucketsArb,
        actionKeyArb,
        fc.integer({ min: 1, max: 2000 }),
        repeatArb,
        async (buckets, actionKey, amountPick, replays) => {
          const prisma = createLedgerPrisma();
          const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
          await seedWallet(wallet, buckets);
          const total = buckets.daily + buckets.monthly + buckets.purchased;
          const amount = Math.min(amountPick, total); // fundable, positive

          const first = await wallet.debit(OWNER, amount, actionKey);
          expect(first.replayed).toBe(false);
          expect(first.total).toBe(amount);
          const balanceAfterOne = (await wallet.getBalance(ALICE, OWNER)).total;
          expect(balanceAfterOne).toBe(total - amount);

          for (let i = 0; i < replays; i++) {
            const again = await wallet.debit(OWNER, amount, actionKey);
            expect(again.replayed).toBe(true);
            expect(again.total).toBe(first.total);
            expect(again.byBucket).toEqual(first.byBucket);
            // Balance is unchanged across every replay.
            expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(balanceAfterOne);
          }

          // Distinct debit rows == consumed buckets (the prior debit's entries),
          // never multiplied by the replay count.
          const debits = debitRowsFor(prisma, actionKey);
          expect(debits.length).toBe(first.entries.length);
          expect(debits.length).toBe(
            consumedBucketCount(buckets.daily, buckets.monthly, buckets.purchased, amount),
          );
          expect(debits.length).toBeLessThanOrEqual(3);
        },
      ),
      { numRuns: 120 },
    );
  });

  // -------------------------------------------------------------------------
  // P13 (wallet.debit, concurrent): N concurrent debits with the same actionKey
  // land exactly one logical debit — the @unique constraint makes the losers
  // replay the winner.
  // -------------------------------------------------------------------------
  it('CreditWallet.debit: concurrent replays of one actionKey land exactly one debit', async () => {
    await fc.assert(
      fc.asyncProperty(
        debitBucketsArb,
        actionKeyArb,
        fc.integer({ min: 1, max: 2000 }),
        fc.integer({ min: 2, max: 6 }),
        async (buckets, actionKey, amountPick, concurrency) => {
          const prisma = createLedgerPrisma();
          const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
          await seedWallet(wallet, buckets);
          const total = buckets.daily + buckets.monthly + buckets.purchased;
          const amount = Math.min(amountPick, total);

          const results = await Promise.all(
            Array.from({ length: concurrency }, () => wallet.debit(OWNER, amount, actionKey)),
          );
          // Every concurrent caller resolves to the SAME logical debit (actionKey).
          for (const r of results) {
            expect(r.actionKey).toBe(actionKey);
          }

          // Exactly one logical debit landed: balance reflects a single charge.
          expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(total - amount);

          const debits = debitRowsFor(prisma, actionKey);
          expect(debits.length).toBe(
            consumedBucketCount(buckets.daily, buckets.monthly, buckets.purchased, amount),
          );
          expect(debits.length).toBeLessThanOrEqual(3);
        },
      ),
      { numRuns: 120 },
    );
  });
});
