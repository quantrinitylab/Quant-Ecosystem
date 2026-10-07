// @vitest-environment node
// ============================================================================
// Task 29.2 — Property test: webhook application is idempotent & signature-gated
// quantmail-superhub · Phase 7 — Payments, signed webhooks, idempotent grants
// ============================================================================
//
// Feature: quantmail-superhub, Property 13b: webhook application is idempotent
// and signature-gated
//
// **Property P13b (webhook idempotence + signature gating)** — for ANY random
// sequence of webhook deliveries against a fresh BillingService:
//
//   • SIGNATURE GATING (Req 20.2) — every delivery whose signature does NOT
//     verify (wrong secret / tampered payload / garbage signature) is REJECTED
//     with `INVALID_WEBHOOK_SIGNATURE` and grants NOTHING: it never touches the
//     wallet ledger and never stamps a PaymentRecord.
//
//   • IDEMPOTENCE / AT MOST ONCE (Req 20.3) — for ANY `providerEventId`, no
//     matter how many times a VERIFIED event is (re)delivered — sequentially or
//     concurrently via `Promise.all` — its effect is applied AT MOST ONCE. The
//     final wallet balance equals the SUM of credits from the DISTINCT verified
//     `payment_success` top-up events (failures grant nothing), and the number
//     of purchase ledger entries equals the number of distinct successfully
//     applied top-up event ids.
//
// **Validates: Requirements 20.2, 20.3**
//
// HARNESS: drives the REAL `BillingService`, `CreditWallet`, `PlanService`, and
// `FakePaymentProvider` consumed through the billing module barrel
// (`modules/billing`). The only seam is an injected in-memory Prisma double for
// `paymentRecord` (with the `@unique(providerEventId)` guard that backstops the
// at-most-once latch), `creditLedgerEntry`, and `planSubscription` — modeled
// exactly on `billing-service.smoke.test.ts`. No live services, no network, no
// real database. Library: fast-check, >= 100 runs.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  BillingService,
  CreditWallet,
  PlanService,
  FakePaymentProvider,
  type PaymentEvent,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// Combined in-memory prisma double: paymentRecord (+@unique providerEventId) +
// creditLedgerEntry + planSubscription. Mirrors billing-service.smoke.test.ts.
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: unknown;
}

function createBillingPrisma() {
  const payments: Row[] = [];
  const ledger: Row[] = [];
  const subs: Row[] = [];
  let n = 0;
  const id = () => `row-${++n}`;

  function matches(row: Row, where?: Record<string, unknown>): boolean {
    if (where == null) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v != null && typeof v === 'object' && 'in' in (v as Record<string, unknown>)) {
        const list = (v as { in: unknown[] }).in;
        if (!list.includes(row[k])) return false;
      } else if (row[k] !== v) {
        return false;
      }
    }
    return true;
  }

  const prisma = {
    _payments: payments,
    _ledger: ledger,
    _subs: subs,
    paymentRecord: {
      async create({ data }: { data: Row }): Promise<Row> {
        // Enforce @unique(providerEventId) when non-null (the at-most-once latch).
        if (
          data.providerEventId != null &&
          payments.some((p) => p.providerEventId === data.providerEventId)
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: Row = {
          id: data.id ?? id(),
          ownerType: 'user',
          tenantId: null,
          providerEventId: null,
          providerSessionId: null,
          providerSubId: null,
          status: 'pending',
          amountCredits: null,
          planTier: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        payments.push(row);
        return { ...row };
      },
      async findFirst({ where }: { where?: Record<string, unknown> } = {}): Promise<Row | null> {
        const m = payments.find((p) => matches(p, where));
        return m ? { ...m } : null;
      },
      async update({ where, data }: { where: { id: string }; data: Row }): Promise<Row> {
        const row = payments.find((p) => p.id === where.id);
        if (row == null) throw new Error('not found');
        if (
          data.providerEventId != null &&
          payments.some((p) => p.id !== where.id && p.providerEventId === data.providerEventId)
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
    creditLedgerEntry: {
      async create({ data }: { data: Row }): Promise<Row> {
        const row: Row = { id: data.id ?? id(), createdAt: new Date(), ...data };
        ledger.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<Row[]> {
        const owner = where?.ownerRef;
        return ledger.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
    },
    planSubscription: {
      async findFirst({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { createdAt?: 'asc' | 'desc' } } = {}): Promise<Row | null> {
        let m = subs.filter((s) => matches(s, where));
        if (orderBy?.createdAt === 'desc') {
          m = m.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
        }
        return m.length > 0 ? { ...m[0] } : null;
      },
      async create({ data }: { data: Row }): Promise<Row> {
        const row: Row = { id: data.id ?? id(), createdAt: new Date(), updatedAt: new Date(), ...data };
        subs.push(row);
        return { ...row };
      },
      async update({ where, data }: { where: { id: string }; data: Row }): Promise<Row> {
        const row = subs.find((s) => s.id === where.id);
        if (row == null) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
  };
  return prisma;
}

const SECRET = 'whsec_test_secret';
const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

function makeService() {
  const prisma = createBillingPrisma();
  const provider = new FakePaymentProvider();
  const wallet = new CreditWallet(prisma as never);
  const planService = new PlanService(prisma as never);
  const billing = new BillingService(prisma as never, provider, wallet, planService, {
    webhookSecret: SECRET,
    resolveOwner: () => OWNER,
  });
  return { prisma, provider, wallet, billing };
}

// ---------------------------------------------------------------------------
// Delivery encoding. Each canonical event in the pool has a fixed identity
// (providerEventId), type, and (for top-ups) amount, so the model is
// deterministic: the FIRST verified delivery of an id applies its effect; any
// later verified delivery of that id is a no-op duplicate.
// ---------------------------------------------------------------------------

type CanonicalEvent =
  | { providerEventId: string; type: 'payment_success'; amountCredits: number }
  | { providerEventId: string; type: 'payment_failure' };

/** How a single delivery is signed: validly, or in one of three invalid ways. */
type SigMode = 'valid' | 'wrong-secret' | 'tampered' | 'garbage';

function toEvent(ev: CanonicalEvent): PaymentEvent {
  if (ev.type === 'payment_success') {
    return {
      providerEventId: ev.providerEventId,
      type: 'payment_success',
      ownerRef: 'alice',
      kind: 'topup',
      amountCredits: ev.amountCredits,
    };
  }
  return {
    providerEventId: ev.providerEventId,
    type: 'payment_failure',
    ownerRef: 'alice',
    kind: 'topup',
  };
}

/** Produce the raw payload + signature a provider would post for a delivery. */
function deliver(
  provider: FakePaymentProvider,
  ev: CanonicalEvent,
  mode: SigMode,
): { payload: string; signature: string } {
  const payload = JSON.stringify(toEvent(ev));
  switch (mode) {
    case 'valid':
      return { payload, signature: provider.sign(payload, SECRET) };
    case 'wrong-secret':
      // Correct algorithm, wrong key -> same length, different bytes -> reject.
      return { payload, signature: provider.sign(payload, 'wrong-secret') };
    case 'tampered': {
      // Sign the genuine payload, then alter what is actually delivered.
      const signature = provider.sign(payload, SECRET);
      const tampered = JSON.stringify({ ...toEvent(ev), amountCredits: 999999, _x: 1 });
      return { payload: tampered, signature };
    }
    case 'garbage':
      return { payload, signature: 'not-a-valid-signature' };
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const canonicalEventArb = (eventId: string): fc.Arbitrary<CanonicalEvent> =>
  fc.oneof(
    fc.record({
      providerEventId: fc.constant(eventId),
      type: fc.constant('payment_success' as const),
      amountCredits: fc.integer({ min: 1, max: 1000 }),
    }),
    fc.record({
      providerEventId: fc.constant(eventId),
      type: fc.constant('payment_failure' as const),
    }),
  );

const invalidModeArb = fc.constantFrom<SigMode>('wrong-secret', 'tampered', 'garbage');

interface Scenario {
  pool: CanonicalEvent[];
  // Sequential schedule: each step picks a pool index + a signature mode.
  schedule: { idx: number; mode: SigMode }[];
  // Concurrent replay batch (fired via Promise.all after the sequential phase).
  concurrent: { idx: number; mode: SigMode }[];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .integer({ min: 1, max: 5 })
  .chain((poolSize) =>
    fc
      .tuple(
        ...Array.from({ length: poolSize }, (_, i) => canonicalEventArb(`evt-${i}`)),
      )
      .chain((poolTuple) => {
        const pool = poolTuple as CanonicalEvent[];
        const stepArb = fc.record({
          idx: fc.integer({ min: 0, max: pool.length - 1 }),
          mode: fc.oneof(
            { weight: 3, arbitrary: fc.constant<SigMode>('valid') },
            { weight: 1, arbitrary: invalidModeArb },
          ),
        });
        return fc.record({
          pool: fc.constant(pool),
          schedule: fc.array(stepArb, { minLength: 1, maxLength: 30 }),
          concurrent: fc.array(stepArb, { minLength: 0, maxLength: 8 }),
        });
      }),
  );

// ===========================================================================

describe('Feature: quantmail-superhub, Property 13b: webhook application is idempotent and signature-gated (Req 20.2, 20.3)', () => {
  it('rejects every unverified delivery (grants nothing) and applies each verified event at most once', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ pool, schedule, concurrent }) => {
        const { billing, provider, wallet, prisma } = makeService();

        // Model of expected end-state.
        const appliedIds = new Set<string>(); // any first-verified delivery latches the id
        const appliedTopupIds = new Set<string>(); // distinct verified successful top-ups
        let expectedPurchased = 0;

        // ---- Phase 1: sequential schedule -------------------------------
        for (const step of schedule) {
          const ev = pool[step.idx];
          const { payload, signature } = deliver(provider, ev, step.mode);

          if (step.mode !== 'valid') {
            // SIGNATURE GATING (Req 20.2): rejected, grants nothing.
            await expect(billing.handleWebhook(payload, signature)).rejects.toMatchObject({
              statusCode: 400,
              code: 'INVALID_WEBHOOK_SIGNATURE',
            });
            continue;
          }

          const firstApplication = !appliedIds.has(ev.providerEventId);
          const res = await billing.handleWebhook(payload, signature);

          if (firstApplication) {
            // AT MOST ONCE (Req 20.3): the FIRST verified delivery applies it.
            expect(res.applied).toBe(true);
            expect(res.duplicate).toBe(false);
            appliedIds.add(ev.providerEventId);
            if (ev.type === 'payment_success') {
              expect(res.creditedAmount).toBe(ev.amountCredits);
              if (!appliedTopupIds.has(ev.providerEventId)) {
                appliedTopupIds.add(ev.providerEventId);
                expectedPurchased += ev.amountCredits;
              }
            } else {
              expect(res.record.status).toBe('failed');
              expect(res.creditedAmount).toBe(0);
            }
          } else {
            // A re-delivery of an already-applied id is a no-op duplicate.
            expect(res.applied).toBe(false);
            expect(res.duplicate).toBe(true);
            expect(res.creditedAmount).toBe(0);
          }
        }

        const afterSeq = await wallet.getBalance(ALICE, OWNER);
        expect(afterSeq.purchased).toBe(expectedPurchased);
        expect(afterSeq.total).toBe(expectedPurchased);
        expect(prisma._ledger.length).toBe(appliedTopupIds.size);

        // ---- Phase 2: concurrent replays via Promise.all ----------------
        // Replays target events already delivered at least once during Phase 1,
        // exercising the at-most-once latch under concurrency. New ids in the
        // concurrent batch that were never applied before are skipped so the
        // concurrency probe stays a pure REPLAY (re-delivery) test.
        const replays = concurrent.filter((s) => appliedIds.has(pool[s.idx].providerEventId));

        const outcomes = await Promise.allSettled(
          replays.map((s) => {
            const ev = pool[s.idx];
            const { payload, signature } = deliver(provider, ev, s.mode);
            return billing.handleWebhook(payload, signature);
          }),
        );

        replays.forEach((s, i) => {
          const outcome = outcomes[i];
          if (s.mode !== 'valid') {
            // Concurrent unverified replay -> rejected, grants nothing.
            expect(outcome.status).toBe('rejected');
            if (outcome.status === 'rejected') {
              expect(outcome.reason).toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
            }
          } else {
            // Concurrent verified replay of an applied id -> duplicate no-op.
            expect(outcome.status).toBe('fulfilled');
            if (outcome.status === 'fulfilled') {
              expect(outcome.value.applied).toBe(false);
              expect(outcome.value.duplicate).toBe(true);
              expect(outcome.value.creditedAmount).toBe(0);
            }
          }
        });

        // ---- Final invariants -------------------------------------------
        // No concurrent replay changed anything: balance == sum of credits from
        // the DISTINCT verified top-ups, and purchase ledger entries == count of
        // distinct applied top-up ids.
        const finalBal = await wallet.getBalance(ALICE, OWNER);
        expect(finalBal.purchased).toBe(expectedPurchased);
        expect(finalBal.total).toBe(expectedPurchased);
        expect(finalBal.total).toBeGreaterThanOrEqual(0);
        expect(prisma._ledger.length).toBe(appliedTopupIds.size);
      }),
      { numRuns: 150 },
    );
  });
});
