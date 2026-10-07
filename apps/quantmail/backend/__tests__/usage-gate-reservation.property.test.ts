// @vitest-environment node
// ============================================================================
// Task 27.2 — Property test: no metered action without a prior reservation
// quantmail-superhub · Phase 7 — Metered usage gate (check -> reserve -> settle)
// ============================================================================
//
// Feature: quantmail-superhub, Property 11: no metered action without a prior reservation
//
// **Property P11 (reservation-before-execute)** — for ANY metered action,
// execution is permitted only AFTER a successful prior debit/reservation;
// otherwise it FAILS CLOSED. Concretely, against the REAL UsageGate wired to the
// REAL CreditWallet (wallet-backed balance provider over an append-only ledger):
//
//   * `settle` is the ONLY path that debits the wallet, and it NEVER debits
//     unless a successful `checkAndReserve` recorded a reservation first for that
//     (owner, actionKey). Settling a reservation that was never recorded throws
//     RESERVATION_NOT_FOUND and the ledger gains ZERO debit entries.
//   * Whenever the available balance is insufficient, `checkAndReserve` fails
//     closed with OUT_OF_CREDITS, stores NO reservation, and a subsequent settle
//     attempt also fails (RESERVATION_NOT_FOUND) and debits nothing.
//   * Conversely, when `checkAndReserve` succeeds, a following `settle` debits
//     EXACTLY the actual cost, exactly once (a replayed settle is a no-op).
//
//   The global invariant tying it together: across an arbitrary, randomly
//   ordered sequence of reserve/settle/orphan-settle operations, the total
//   credits debited from the wallet ALWAYS equals the sum of `actualCost` over
//   settles that were preceded by a recorded reservation — and nothing else can
//   ever move the ledger.
//
// **Validates: Requirements 18.3, 18.5**
//
// HARNESS: drives the REAL `UsageGate` + REAL `CreditWallet` (via
// `createWalletBalanceProvider`), all consumed through the billing barrel
// (`modules/billing`). The only seam is an in-memory Prisma double for the
// `creditLedgerEntry` table (append-only, enforces the @unique `actionKey`),
// modeled exactly on `usage-gate-wallet.service.test.ts`. No live services, no
// network, no real database. Library: fast-check, >= 100 runs per property.
//
// SCOPE: test-only. Does not modify any implementation. QuantChat untouched.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CreditWallet,
  PricingEngine,
  UsageGate,
  InMemoryReservationStore,
  createWalletBalanceProvider,
  permitAllEntitlements,
  type Reservation,
  type ActionKind,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double (append-only; enforces @unique actionKey).
// Same shape as usage-gate-wallet.service.test.ts: serves create/findMany/
// findFirst and rejects a duplicate actionKey with a P2002 unique violation so
// the wallet's idempotency anchors behave exactly as in production.
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
        return rows.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
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

function seqIds(prefix = 'id') {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const OWNER_ID = 'alice';
const OWNER = { ownerId: OWNER_ID, ownerType: 'user' as const };
const ALICE: OwnershipPrincipal = { principalId: OWNER_ID };

/** Build a REAL UsageGate whose balance/settlement is backed by a REAL CreditWallet. */
function makeWalletGate() {
  const prisma = createLedgerPrisma();
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
  const reservations = new InMemoryReservationStore();
  let r = 0;
  const gate = new UsageGate({
    balances: createWalletBalanceProvider({ wallet }),
    reservations,
    pricing: new PricingEngine({ creditsPerUsd: 1000 }),
    entitlements: permitAllEntitlements,
    generateId: () => `res-${++r}`,
  });
  return { gate, wallet, prisma };
}

/** Sum of the magnitudes of every DEBIT row in the ledger (credits actually spent). */
function totalDebited(prisma: ReturnType<typeof createLedgerPrisma>): number {
  return prisma._rows
    .filter((row) => row.entryType === 'debit')
    .reduce((acc, row) => acc + Math.abs(row.amount), 0);
}

/** Count of debit rows in the ledger (one or more per settled reservation). */
function debitRowCount(prisma: ReturnType<typeof createLedgerPrisma>): number {
  return prisma._rows.filter((row) => row.entryType === 'debit').length;
}

// ---------------------------------------------------------------------------
// Generators — varied metered-action kinds with deterministic static costs.
// (All non-AI drivers price to a fixed whole-credit cost, keeping the model
// exact while still exercising a spread of estimate sizes 1..50.)
// ---------------------------------------------------------------------------

type MeteredKind = Extract<
  ActionKind,
  'email_send' | 'rag_query' | 'ci_minute' | 'agent_org_run' | 'storage_gb_day'
>;

/** The active PricingRule cost (credits) per metered kind (units default to 1). */
const KIND_COST: Readonly<Record<MeteredKind, number>> = {
  email_send: 1,
  rag_query: 5,
  ci_minute: 2,
  agent_org_run: 50,
  storage_gb_day: 1,
};

const kindArb: fc.Arbitrary<MeteredKind> = fc.constantFrom(
  'email_send',
  'rag_query',
  'ci_minute',
  'agent_org_run',
  'storage_gb_day',
);

/** A randomly-ordered sequence step: a genuine reserve→settle, or an orphan settle. */
const stepArb = fc.oneof(
  fc.record({
    op: fc.constant('reserveSettle' as const),
    kind: kindArb,
    // Picks an actual cost in 1..estimate (always fundable once reserved).
    actualPick: fc.integer({ min: 0, max: 60 }),
    // Sometimes replay the settle to assert the debit happens exactly once.
    replay: fc.boolean(),
  }),
  fc.record({
    op: fc.constant('orphanSettle' as const),
    kind: kindArb,
    actualPick: fc.integer({ min: 0, max: 60 }),
  }),
);

const fabricate = (kind: MeteredKind, actionKey: string): Reservation => ({
  id: 'forged',
  ownerRef: OWNER_ID,
  actionKey,
  kind,
  estimatedCost: KIND_COST[kind],
  settled: false,
  createdAt: new Date(),
});

/** Assert an awaited promise rejects with a specific HTTP status + code. */
async function expectRejection(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, 'expected the operation to reject (fail closed)').toBeDefined();
  expect((caught as { statusCode?: number }).statusCode).toBe(statusCode);
  expect((caught as { code?: string }).code).toBe(code);
}

// ===========================================================================

describe('Feature: quantmail-superhub, Property 11: no metered action without a prior reservation (Req 18.3, 18.5)', () => {
  // -------------------------------------------------------------------------
  // P11 (orphan settle): settling a reservation that was NEVER recorded by
  // checkAndReserve fails closed (RESERVATION_NOT_FOUND) and NEVER debits the
  // wallet — for any action kind and any (even abundant) balance.
  // -------------------------------------------------------------------------
  it('a settle without a prior recorded reservation throws RESERVATION_NOT_FOUND and never debits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 500 }),
        fc.array(fc.record({ kind: kindArb, actualPick: fc.integer({ min: 0, max: 60 }) }), {
          minLength: 1,
          maxLength: 25,
        }),
        async (seedCredits, attempts) => {
          const { gate, wallet, prisma } = makeWalletGate();
          if (seedCredits > 0) {
            await wallet.credit(OWNER, { amount: seedCredits, kind: 'purchase' });
          }

          for (let i = 0; i < attempts.length; i++) {
            const { kind, actualPick } = attempts[i];
            const actionKey = `orphan-${i}`;
            const estimate = KIND_COST[kind];
            const actual = (actualPick % estimate) + 1; // 1..estimate

            // No reservation was ever recorded for this actionKey.
            expect(await gate.getReservation(OWNER_ID, actionKey)).toBeUndefined();

            // Settling the fabricated reservation fails closed and debits nothing.
            await expectRejection(
              gate.settle(fabricate(kind, actionKey), actual),
              404,
              'RESERVATION_NOT_FOUND',
            );
          }

          // The wallet was NEVER debited: balance is the full seed, zero debit rows.
          expect(totalDebited(prisma)).toBe(0);
          expect(debitRowCount(prisma)).toBe(0);
          expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(seedCredits);
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // P11 (end-to-end, randomly ordered): across an arbitrary mix of genuine
  // reserve→settle steps and orphan settles, the wallet is debited EXACTLY by
  // the sum of actual costs of settles that had a prior recorded reservation —
  // and by nothing else. Insufficient balance fails the reserve closed (no
  // reservation, no debit); a successful reserve lets a single settle debit the
  // actual cost exactly once (a replay is a no-op).
  // -------------------------------------------------------------------------
  it('no debit occurs without a prior reservation; reserve-then-settle debits the actual cost exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          purchased: fc.integer({ min: 0, max: 200 }),
          daily: fc.integer({ min: 0, max: 50 }),
        }),
        fc.array(stepArb, { minLength: 0, maxLength: 40 }),
        async (seed, steps) => {
          const { gate, wallet, prisma } = makeWalletGate();

          // Seed the wallet across buckets for variety (consumption order does
          // not affect the total spent that the invariant tracks).
          if (seed.daily > 0) {
            await wallet.grantDaily(OWNER, '2024-06-01', { dailyAllowance: seed.daily });
          }
          if (seed.purchased > 0) {
            await wallet.credit(OWNER, { amount: seed.purchased, kind: 'purchase' });
          }
          const seededTotal = seed.daily + seed.purchased;

          // Model: credits genuinely spent so far (settles preceded by a
          // recorded reservation). The wallet has no open holds between steps
          // because every reserve is settled within its own step, so the
          // available balance equals the running total.
          let spent = 0;
          let runningTotal = seededTotal;
          let successfulSettles = 0;

          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const actionKey = `act-${i}`;
            const estimate = KIND_COST[step.kind];
            const actual = (step.actualPick % estimate) + 1; // 1..estimate, always fundable

            if (step.op === 'orphanSettle') {
              // Orphan: never reserved -> settle fails closed, no debit.
              expect(await gate.getReservation(OWNER_ID, actionKey)).toBeUndefined();
              const before = totalDebited(prisma);
              await expectRejection(
                gate.settle(fabricate(step.kind, actionKey), actual),
                404,
                'RESERVATION_NOT_FOUND',
              );
              expect(totalDebited(prisma)).toBe(before);
              continue;
            }

            // reserveSettle: reservation requires available balance >= estimate.
            if (runningTotal >= estimate) {
              const reservation = await gate.checkAndReserve(OWNER_ID, {
                actionKey,
                kind: step.kind,
              });
              // A reservation is now recorded for this (owner, actionKey).
              expect(reservation.actionKey).toBe(actionKey);
              expect(await gate.getReservation(OWNER_ID, actionKey)).toBeDefined();

              const before = totalDebited(prisma);
              const settled = await gate.settle(reservation, actual);
              expect(settled.settled).toBe(true);
              expect(settled.actualCost).toBe(actual);

              // The settle debited EXACTLY the actual cost.
              expect(totalDebited(prisma) - before).toBe(actual);
              spent += actual;
              runningTotal -= actual;
              successfulSettles += 1;

              // A replayed settle of the same reservation is a strict no-op.
              if (step.replay) {
                const after = totalDebited(prisma);
                const again = await gate.settle(reservation, actual);
                expect(again.settled).toBe(true);
                expect(totalDebited(prisma)).toBe(after);
              }
            } else {
              // FAIL CLOSED: balance < estimate -> OUT_OF_CREDITS, no reservation.
              await expectRejection(
                gate.checkAndReserve(OWNER_ID, { actionKey, kind: step.kind }),
                402,
                'OUT_OF_CREDITS',
              );
              expect(await gate.getReservation(OWNER_ID, actionKey)).toBeUndefined();

              // And a subsequent settle for the un-reserved action also fails closed.
              const before = totalDebited(prisma);
              await expectRejection(
                gate.settle(fabricate(step.kind, actionKey), actual),
                404,
                'RESERVATION_NOT_FOUND',
              );
              expect(totalDebited(prisma)).toBe(before);
            }
          }

          // GLOBAL INVARIANT: the wallet moved by exactly the credits spent via
          // reserved-then-settled actions, and by nothing else.
          expect(totalDebited(prisma)).toBe(spent);
          const finalBalance = await wallet.getBalance(ALICE, OWNER);
          expect(finalBalance.total).toBe(seededTotal - spent);
          expect(finalBalance.total).toBeGreaterThanOrEqual(0);
          // Every debit in the ledger corresponds to a settled reservation;
          // with no reservation there is no debit (no orphan ever moved it).
          if (successfulSettles === 0) {
            expect(debitRowCount(prisma)).toBe(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
