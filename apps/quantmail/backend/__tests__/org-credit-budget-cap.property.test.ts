// @vitest-environment node
// ============================================================================
// Task 30.2 — Property test: org credit spend never exceeds CEO-funded cap
// quantmail-superhub · Phase 7 — Credits, Plans & Billing Economy
// ============================================================================
//
// Feature: quantmail-superhub, Property 6b: org credit spend never exceeds CEO-funded budget cap
//
// **Property P6b (credit-backed org ceiling)** — for ANY org run, total credit
// spend <= reserved `budgetCap` AND `budgetCap <= CEO reservable balance`.
//
// Concretely, for an arbitrary CEO wallet balance and an arbitrary requested
// org `budgetCap`:
//   * When `ceil(budgetCap) > CEO reservable balance`, `reserve()` FAILS CLOSED
//     (402 INSUFFICIENT_ORG_BUDGET): NOTHING is debited and the CEO balance is
//     unchanged — an org is NEVER funded beyond the CEO's reservable balance,
//     so for every SUCCESSFUL reservation `budgetCap <= CEO reservable balance`.
//   * When `ceil(budgetCap) <= CEO reservable balance`, `reserve()` debits
//     EXACTLY `ceil(budgetCap)` from the CEO wallet; the reserved amount is the
//     org's funded ceiling.
//   * Simulating an org run as a sequence of org-spend debits against the
//     reserved budget, the cumulative org credit spend stays `<= reserved
//     budgetCap` THROUGHOUT — once the reserved budget is exhausted, further org
//     spend FAILS CLOSED (402 OUT_OF_CREDITS) and can never push spend beyond
//     the reserved (CEO-funded) cap.
//   * Re-reserving the SAME org is idempotent: it never increases the total
//     debited from the CEO.
//
// **Validates: Requirements 21.1, 21.2**
//
// MODELING CHOICE (how "total org credit spend <= reserved budgetCap" is proven)
//   The reservation moves `ceil(budgetCap)` credits OUT of the CEO wallet via a
//   single idempotent CEO-wallet debit keyed by the org id (the real
//   `createCreditWalletOrgBudgetReservation` adapter, consumed via the company
//   barrel). To model the org RUN spending against that reserved budget we seed
//   a SEPARATE org-scoped `CreditWallet` (purchased bucket) with exactly the
//   reserved amount, then drive a randomized sequence of org-spend debits
//   through the REAL ledger-backed `CreditWallet.debit` (same fail-closed,
//   append-only primitive the production usage gate settles through). Because
//   that wallet was seeded with EXACTLY the reserved credits and `debit` can
//   never drive a balance negative, the org wallet's cumulative successful spend
//   is structurally bounded by the reserved budget — which is the most direct
//   proof of "total org credit spend <= reserved budgetCap <= CEO reservable
//   balance". Both wallets are the REAL `CreditWallet` over an in-memory,
//   append-only Prisma double (enforcing the @unique actionKey) — no mocks of
//   the reservation or debit logic.
//
// HARNESS: fast-check, >= 100 runs per property (the ecosystem's JS
// property-testing tool). No live `@quant/ai`, no network, no real database.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createCreditWalletOrgBudgetReservation,
  orgBudgetActionKey,
} from '../modules/company';
import { CreditWallet } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory append-only ledger prisma double (mirrors the wallet's contract,
// modeled on company-org-budget-reservation.service.test.ts).
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

function seqIds(prefix = 'w') {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const CEO_OWNER = { ownerId: 'ceo-1', ownerType: 'user' as const, tenantId: 'tenant-1' };
const CEO_PRINCIPAL: OwnershipPrincipal = { principalId: 'ceo-1' };

const ORG_OWNER = { ownerId: 'org-wallet-1', ownerType: 'org' as const, tenantId: 'tenant-1' };
const ORG_PRINCIPAL: OwnershipPrincipal = { principalId: 'org-wallet-1' };

const debitRows = (prisma: ReturnType<typeof createLedgerPrisma>) =>
  prisma._rows.filter((row) => row.entryType === 'debit');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const scenarioArb = fc.record({
  // CEO reservable balance (whole purchased credits). 0 means an unfunded CEO.
  ceoBalance: fc.integer({ min: 0, max: 3000 }),
  // Requested org budget cap — possibly fractional, to exercise the ceil().
  // Spans BELOW and ABOVE typical CEO balances so both branches are hit.
  budgetCap: fc.double({ min: 0, max: 3500, noNaN: true, noDefaultInfinity: true }),
  // The org RUN, modeled as a sequence of whole-credit org-spend debits.
  orgSpends: fc.array(fc.integer({ min: 1, max: 600 }), { minLength: 0, maxLength: 30 }),
});

// ===========================================================================

describe('Feature: quantmail-superhub, Property 6b: org credit spend never exceeds CEO-funded budget cap', () => {
  it('reserve() funds an org only within the CEO reservable balance, and org spend never exceeds the reserved cap (Req 21.1, 21.2)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ ceoBalance, budgetCap, orgSpends }) => {
        // --- Fresh CEO wallet + reservation adapter (the REAL wallet) --------
        const ceoPrisma = createLedgerPrisma();
        const ceoWallet = new CreditWallet(ceoPrisma as never, { generateId: seqIds('ceo') });
        if (ceoBalance > 0) {
          await ceoWallet.credit(CEO_OWNER, { amount: ceoBalance, kind: 'purchase' });
        }
        const reservation = createCreditWalletOrgBudgetReservation({ wallet: ceoWallet });

        const reservable = (await ceoWallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total;
        expect(reservable).toBe(ceoBalance);

        // The reservation reserves WHOLE credits >= the requested cap.
        const ceiling = Math.ceil(budgetCap);

        const reserveOnce = () =>
          reservation.reserve({
            orgId: 'org-1',
            budgetCap,
            ceoUserId: 'ceo-1',
            tenantId: 'tenant-1',
          });

        // === BRANCH A: a zero-cap org reserves nothing (trivially funded) ====
        if (ceiling <= 0) {
          const result = await reserveOnce();
          expect(result.reserved).toBe(0);
          expect(debitRows(ceoPrisma)).toHaveLength(0);
          // A zero funded ceiling means the org can spend nothing — and the CEO
          // balance is untouched.
          expect((await ceoWallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(ceoBalance);
          return;
        }

        // === BRANCH B: cap exceeds the CEO reservable balance -> FAIL CLOSED =
        if (ceiling > reservable) {
          await expect(reserveOnce()).rejects.toMatchObject({
            statusCode: 402,
            code: 'INSUFFICIENT_ORG_BUDGET',
          });
          // Nothing debited; the CEO balance is unchanged. An org is NEVER
          // funded beyond the CEO's reservable balance.
          expect(debitRows(ceoPrisma)).toHaveLength(0);
          expect((await ceoWallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(ceoBalance);
          return;
        }

        // === BRANCH C: cap is fundable -> reserve EXACTLY ceil(budgetCap) ====
        const result = await reserveOnce();
        expect(result.replayed).toBe(false);
        expect(result.reserved).toBe(ceiling);

        // INVARIANT: budgetCap (its funded whole-credit ceiling) <= CEO
        // reservable balance for every successful reservation (Req 21.1).
        expect(ceiling).toBeLessThanOrEqual(reservable);

        // The CEO wallet is drawn down by EXACTLY the reserved ceiling.
        const ceoAfter = (await ceoWallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total;
        expect(ceoAfter).toBe(ceoBalance - ceiling);

        // The reservation debit is keyed idempotently by the org id.
        const reservationDebit = debitRows(ceoPrisma).find((r) =>
          (r.actionKey ?? '').startsWith(`debit:${orgBudgetActionKey('org-1')}#`),
        );
        expect(reservationDebit).toBeDefined();

        const reserved = result.reserved;

        // --- Model the org RUN: spend against the reserved budget -----------
        // Seed a separate org-scoped wallet with EXACTLY the reserved credits;
        // every org-spend debit draws this real, fail-closed ledger.
        const orgPrisma = createLedgerPrisma();
        const orgWallet = new CreditWallet(orgPrisma as never, { generateId: seqIds('org') });
        if (reserved > 0) {
          await orgWallet.credit(ORG_OWNER, { amount: reserved, kind: 'purchase' });
        }

        let cumulativeSpend = 0;
        let i = 0;
        for (const spend of orgSpends) {
          const key = `org-run:org-1:${i++}`;
          if (cumulativeSpend + spend <= reserved) {
            // Affordable spend: it succeeds and advances the running total.
            const debit = await orgWallet.debit(ORG_OWNER, spend, key);
            expect(debit.total).toBe(spend);
            cumulativeSpend += spend;
          } else {
            // Over the reserved budget: the org run FAILS CLOSED — nothing is
            // spent, so spend can never breach the reserved (CEO-funded) cap.
            await expect(orgWallet.debit(ORG_OWNER, spend, key)).rejects.toMatchObject({
              statusCode: 402,
              code: 'OUT_OF_CREDITS',
            });
          }

          // === THE INVARIANT (Req 21.2): cumulative org credit spend never
          // exceeds the reserved (CEO-funded) budget cap, at EVERY step. ======
          expect(cumulativeSpend).toBeLessThanOrEqual(reserved);
          const orgBalance = (await orgWallet.getBalance(ORG_PRINCIPAL, ORG_OWNER)).total;
          expect(orgBalance).toBe(reserved - cumulativeSpend);
          expect(orgBalance).toBeGreaterThanOrEqual(0);
        }

        // Final ceiling assertion: total org spend <= reserved cap <= CEO
        // reservable balance.
        expect(cumulativeSpend).toBeLessThanOrEqual(reserved);
        expect(reserved).toBeLessThanOrEqual(reservable);

        // --- Idempotent re-reservation never debits the CEO again -----------
        const second = await reserveOnce();
        expect(second.replayed).toBe(true);
        expect(second.reserved).toBe(ceiling);
        // Still only ONE reservation's worth of credits left the CEO wallet.
        expect((await ceoWallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(
          ceoBalance - ceiling,
        );
      }),
      { numRuns: 200 },
    );
  });
});
