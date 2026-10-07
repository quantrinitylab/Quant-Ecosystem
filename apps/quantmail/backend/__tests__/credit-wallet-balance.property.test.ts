// @vitest-environment node
// ============================================================================
// Task 25.2 — Property test: balance == sum(ledger) and is never negative
// quantmail-superhub · Phase 7 — Credit wallet & append-only ledger (Pillar 7)
// ============================================================================
//
// Feature: quantmail-superhub, Property 10: balance == sum(ledger)
// Feature: quantmail-superhub, Property 9: balance >= 0
//
// **Property P10 (balance == sum(ledger))** — for ANY sequence of grants (and
// simulated debits) applied to a fresh wallet, the DERIVED balance reported by
// `getBalance().total` ALWAYS equals the arithmetic SUM of every appended
// `CreditLedgerEntry.amount`, and the per-bucket breakdown
// (`daily + monthly + purchased`) ALWAYS re-sums to that same total. The
// balance is never stored — it is recomputed from the append-only ledger — so
// this must hold after every operation, for every prefix of the sequence.
//
// **Property P9 (balance >= 0)** — across that same arbitrary sequence of
// grants interleaved with debits, the wallet's total balance NEVER goes
// negative. Debits are constrained so a balance can only be drawn down to the
// credits that actually back it, exactly as the real consumption path (task 27)
// will be required to behave.
//
// **Validates: Requirements 16.1, 16.2**
//
// HARNESS: tests the REAL `CreditWallet` implementation (task 25.1), consumed
// through the billing module barrel (`modules/billing`). The only seam is an
// injected in-memory Prisma double for the `creditLedgerEntry` table, modeled
// exactly on `credit-wallet.service.test.ts`'s ledger double — it records
// `create()` rows and serves `findMany()` over them. Simulated debits (the real
// `debit` primitive lands in task 27) are appended as negative ledger rows
// directly through the same double, letting us exercise the sum/non-negative
// invariants over mixed grant/debit sequences. No live services, no network, no
// real database. Library: fast-check, >= 100 runs per property.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CreditWallet, type CreditKind } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double (same shape as credit-wallet.service.test.ts).
// Records create() rows and serves findMany(); deliberately omits update/delete
// so the append-only invariant is structural. Exposes `_rows` so the harness
// can both read the ledger sum and append simulated debit rows directly.
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
  const prisma = {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey: (data.actionKey as string | null) ?? null,
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
    },
  };
  return prisma;
}

function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

/** Append a simulated DEBIT row (negative amount) directly to the ledger. The
 * real `debit` primitive lands in task 27; here we drive the append-only ledger
 * with negative rows to exercise the derived-balance invariants over draws. */
function appendDebit(
  prisma: ReturnType<typeof createLedgerPrisma>,
  ownerRef: string,
  amount: number,
  bucket: string,
): void {
  prisma._rows.push({
    id: `debit-${prisma._rows.length + 1}`,
    ownerRef,
    ownerType: 'user',
    tenantId: 'tenant-A',
    entryType: 'debit',
    bucket,
    amount: -amount,
    actionKey: null,
    sourceRef: null,
    utcDay: null,
    reason: 'simulated-debit',
    createdAt: new Date(),
  });
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

/** The arithmetic sum of every ledger row's amount for the owner. */
function ledgerSum(prisma: ReturnType<typeof createLedgerPrisma>, ownerId: string): number {
  return prisma._rows
    .filter((r) => r.ownerRef === ownerId)
    .reduce((acc, r) => acc + r.amount, 0);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const CREDIT_KINDS: CreditKind[] = ['purchase', 'monthly_grant', 'refund', 'adjustment'];

/** A single positive credit operation: a whole amount > 0 and a credit kind. */
const creditOpArb = fc.record({
  amount: fc.integer({ min: 1, max: 1000 }),
  kind: fc.constantFrom(...CREDIT_KINDS),
});

/** A grant/debit step: a positive credit OR a debit (drawn down, clamped to the
 * running balance by the harness so P9 — balance >= 0 — is preserved). */
const mixedOpArb = fc.oneof(
  fc.record({
    type: fc.constant('credit' as const),
    amount: fc.integer({ min: 1, max: 1000 }),
    kind: fc.constantFrom(...CREDIT_KINDS),
  }),
  fc.record({
    type: fc.constant('debit' as const),
    amount: fc.integer({ min: 1, max: 1000 }),
  }),
);

// ===========================================================================

describe('Feature: quantmail-superhub, Property 10: balance == sum(ledger) (Req 16.1) & Property 9: balance >= 0 (Req 16.2)', () => {
  // -------------------------------------------------------------------------
  // P10 (grants only): after EVERY credit in an arbitrary sequence, the derived
  // total equals the ledger sum, the buckets re-sum to the total, and the total
  // is non-negative.
  // -------------------------------------------------------------------------
  it('P10: getBalance().total equals the ledger sum (and buckets re-sum to total) after every grant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(creditOpArb, { minLength: 0, maxLength: 40 }),
        async (ops) => {
          const prisma = createLedgerPrisma();
          const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

          // A fresh wallet starts empty.
          const empty = await wallet.getBalance(ALICE, OWNER);
          expect(empty.total).toBe(0);

          let runningSum = 0;
          for (const op of ops) {
            await wallet.credit(OWNER, { amount: op.amount, kind: op.kind });
            runningSum += op.amount;

            const balance = await wallet.getBalance(ALICE, OWNER);

            // P10: derived total == SUM(ledger amounts) (two independent views).
            expect(balance.total).toBe(ledgerSum(prisma, OWNER.ownerId));
            expect(balance.total).toBe(runningSum);
            // The per-bucket breakdown ALWAYS re-sums to the total.
            expect(balance.daily + balance.monthly + balance.purchased).toBe(balance.total);
            // P9: a sum of positive grants is never negative.
            expect(balance.total).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // P9 + P10 (grants interleaved with debits): debits are clamped to the credits
  // that back them, so the balance never goes negative; throughout the whole
  // sequence the derived balance still equals the ledger sum and re-sums by
  // bucket.
  // -------------------------------------------------------------------------
  it('P9/P10: across grants interleaved with debits, total == sum(ledger), total >= 0 throughout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mixedOpArb, { minLength: 0, maxLength: 60 }),
        async (ops) => {
          const prisma = createLedgerPrisma();
          const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

          let running = 0;
          for (const op of ops) {
            if (op.type === 'credit') {
              await wallet.credit(OWNER, { amount: op.amount, kind: op.kind });
              running += op.amount;
            } else {
              // Clamp the debit to the current balance so it can never push the
              // total below zero (P9). A debit larger than the balance simply
              // draws it down to whatever credits remain.
              const draw = Math.min(op.amount, running);
              if (draw <= 0) continue; // nothing to debit on an empty wallet.
              appendDebit(prisma, OWNER.ownerId, draw, 'PURCHASED');
              running -= draw;
            }

            const balance = await wallet.getBalance(ALICE, OWNER);

            // P10: balance == sum(ledger), holding across grants AND debits.
            expect(balance.total).toBe(ledgerSum(prisma, OWNER.ownerId));
            expect(balance.total).toBe(running);
            // Buckets always re-sum to the total (even with mixed signs).
            expect(balance.daily + balance.monthly + balance.purchased).toBe(balance.total);
            // P9: the balance NEVER goes negative.
            expect(balance.total).toBeGreaterThanOrEqual(0);
          }

          // Final sanity: end-state balance still equals the ledger sum and >= 0.
          const final = await wallet.getBalance(ALICE, OWNER);
          expect(final.total).toBe(ledgerSum(prisma, OWNER.ownerId));
          expect(final.total).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
