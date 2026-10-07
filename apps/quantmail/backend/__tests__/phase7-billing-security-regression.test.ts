// @vitest-environment node
// ============================================================================
// Feature: quantmail-superhub, Phase-7 billing security regression (V15-V17)
// Task 31 — "Write Phase-7 billing security regression suite"
// ============================================================================
//
// This suite is the consolidated Phase-7 billing HARD GATE: it asserts that
// each Phase-7 billing vulnerability class is CLOSED against the REAL
// implementations shipped in Tasks 25-30 (CreditWallet + append-only ledger,
// the daily free allowance, the metered UsageGate wired to the wallet, and the
// BillingService over the vendor-neutral PaymentProvider port).
//
//   V15  Balance never negative / no double-charge on retry   (Req 16.2, 18.4)
//   V16  Unverified webhook rejected (no grant)                (Req 20.2)
//   V17  Daily-reset abuse closed (idempotent per UTC day)     (Req 17.2)
//   Tenant-scoped wallet authz (owner / tenant-admin only)     (Req 16.4)
//
// _Requirements: 16.2, 16.4, 17.2, 18.4, 20.2_
//
// STRATEGY
//   Every class is asserted against the REAL code paths — modules are consumed
//   ONLY through the billing barrel (`../modules/billing`) plus the shared
//   ownership filter (`../shared/ownership-authz`), never by reaching into
//   `services/*` (preserving the SRP module boundary). The append-only ledger
//   and payment store are backed by an in-memory Prisma double that faithfully
//   reproduces the production invariants the implementations rely on:
//     * `creditLedgerEntry` is append-only (no update/delete) and enforces the
//       `@unique(actionKey)` constraint (throws P2002 on a duplicate), so debit
//       and daily-grant idempotency RACES are exercised the way the real DB
//       behaves.
//     * `paymentRecord` enforces `@unique(providerEventId)`, the at-most-once
//       latch the BillingService relies on.
//   This mirrors the in-memory doubles already used by the per-feature suites
//   (credit-wallet-debit/-daily-grant, usage-gate-wallet, billing-service.smoke).
//   No QuantChat code is touched; this is a test-only regression net.

import { describe, it, expect } from 'vitest';
import {
  CreditWallet,
  PricingEngine,
  UsageGate,
  InMemoryReservationStore,
  createWalletBalanceProvider,
  permitAllEntitlements,
  BillingService,
  PlanService,
  FakePaymentProvider,
  type PaymentEvent,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ===========================================================================
// In-memory Prisma double: an append-only credit ledger (@unique actionKey),
// a payment store (@unique providerEventId), and plan subscriptions.
//
// `update`/`delete` are intentionally ABSENT on `creditLedgerEntry` so any
// mutation of an entry would be a hard failure — the append-only invariant
// (Req 16.3) holds by construction, which is what the "never negative" guard
// structurally depends on.
// ===========================================================================

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

type Row = Record<string, unknown>;

function matches(row: Row, where?: Record<string, unknown>): boolean {
  if (where == null) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v != null && typeof v === 'object' && 'in' in (v as Record<string, unknown>)) {
      const list = (v as { in: unknown[] }).in;
      if (!list.includes(row[k])) return false;
    } else if (v != null && v !== row[k]) {
      return false;
    }
  }
  return true;
}

function createBillingPrisma() {
  const ledger: LedgerRow[] = [];
  const payments: Row[] = [];
  const subs: Row[] = [];
  let n = 0;
  const nextId = () => `row-${++n}`;

  const prisma = {
    _ledger: ledger,
    _payments: payments,
    _subs: subs,

    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        // Enforce @unique(actionKey) so idempotency races behave like the real DB.
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && ledger.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed: actionKey'), {
            code: 'P2002',
          });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? nextId(),
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
        ledger.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return ledger.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: {
        where?: { ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const hit = ledger.find(
          (r) =>
            (where?.ownerRef == null || r.ownerRef === where.ownerRef) &&
            (where?.entryType == null || r.entryType === where.entryType) &&
            (where?.utcDay == null || r.utcDay === where.utcDay),
        );
        return hit ? { ...hit } : null;
      },
    },

    paymentRecord: {
      async create({ data }: { data: Row }): Promise<Row> {
        if (
          data.providerEventId != null &&
          payments.some((p) => p.providerEventId === data.providerEventId)
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: Row = {
          id: data.id ?? nextId(),
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

    planSubscription: {
      async findFirst({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      } = {}): Promise<Row | null> {
        let m = subs.filter((s) => matches(s, where));
        if (orderBy?.createdAt === 'desc') {
          m = m.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
        }
        return m.length > 0 ? { ...m[0] } : null;
      },
      async create({ data }: { data: Row }): Promise<Row> {
        const row: Row = { id: data.id ?? nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
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

function seqIds(prefix = 'id') {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

/** Sum the raw ledger amounts (the authoritative balance, Req 16.1). */
function ledgerSum(prisma: ReturnType<typeof createBillingPrisma>): number {
  return prisma._ledger.reduce((acc, r) => acc + r.amount, 0);
}

const debitRows = (prisma: ReturnType<typeof createBillingPrisma>) =>
  prisma._ledger.filter((r) => r.entryType === 'debit');

// Owner + principals used across the suite.
const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };
const DAY_1 = '2024-06-01';
const DAY_2 = '2024-06-02';

// ===========================================================================
// V15 — Balance never negative / no double-charge on retry (Req 16.2, 18.4)
// ===========================================================================

describe('Feature: quantmail-superhub, Phase-7 billing security regression (V15): balance never negative / no double-charge on retry (Req 16.2, 18.4)', () => {
  it('V15a: a debit that would overdraw FAILS CLOSED — appends nothing and the balance stays >= 0', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 15, kind: 'purchase' });

    await expect(wallet.debit(OWNER, 20, 'overdraw')).rejects.toMatchObject({
      statusCode: 402,
      code: 'OUT_OF_CREDITS',
    });

    // Nothing was appended; the balance is unchanged and never negative.
    expect(debitRows(prisma)).toHaveLength(0);
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(15);
    expect(balance.total).toBeGreaterThanOrEqual(0);
    // The authoritative invariant holds: total == SUM(ledger).
    expect(balance.total).toBe(ledgerSum(prisma));
  });

  it('V15b: draining the EXACT balance lands at zero (never below) and a further debit fails closed', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 30, kind: 'purchase' });

    await wallet.debit(OWNER, 30, 'drain');
    const drained = await wallet.getBalance(ALICE, OWNER);
    expect(drained.total).toBe(0);

    // Any further debit on a zero balance fails closed; balance never dips below 0.
    await expect(wallet.debit(OWNER, 1, 'past-zero')).rejects.toMatchObject({
      code: 'OUT_OF_CREDITS',
    });
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(0);
  });

  it('V15c: replaying the same actionKey debit charges AT MOST ONCE (idempotent, Req 18.4)', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const first = await wallet.debit(OWNER, 30, 'retry-key');
    const rowsAfterFirst = prisma._ledger.length;
    const replay = await wallet.debit(OWNER, 30, 'retry-key');

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.total).toBe(first.total);
    // No new rows on replay; the balance reflects a SINGLE 30-credit debit.
    expect(prisma._ledger.length).toBe(rowsAfterFirst);
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(70);
  });

  it('V15d: CONCURRENT replays of the same actionKey land EXACTLY ONE charge (the @unique race is closed)', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const results = await Promise.all([
      wallet.debit(OWNER, 25, 'race-key'),
      wallet.debit(OWNER, 25, 'race-key'),
      wallet.debit(OWNER, 25, 'race-key'),
    ]);

    // Each caller observes the same single 25-credit charge.
    for (const r of results) expect(r.total).toBe(25);
    // Exactly one logical debit landed in the ledger.
    expect(debitRows(prisma)).toHaveLength(1);
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(75);
  });

  it('V15e: a retried UsageGate SETTLEMENT debits the wallet AT MOST ONCE (no double-charge through the meter)', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    let r = 0;
    const gate = new UsageGate({
      balances: createWalletBalanceProvider({ wallet }),
      reservations: new InMemoryReservationStore(),
      pricing: new PricingEngine({ creditsPerUsd: 1000 }),
      entitlements: permitAllEntitlements,
      generateId: () => `res-${++r}`,
    });

    const res = await gate.checkAndReserve('alice', { actionKey: 'meter-1', kind: 'rag_query' });
    await gate.settle(res, 5);
    // Retry the same settlement (e.g. a redelivered job) — must be a no-op.
    await gate.settle(res, 5);

    // Exactly one debit landed; balance debited once (95), not twice (90).
    expect(debitRows(prisma)).toHaveLength(1);
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(95);
  });
});

// ===========================================================================
// V16 — Unverified webhook rejected (no grant) (Req 20.2)
// ===========================================================================

const SECRET = 'whsec_phase7_secret';

function makeBilling() {
  const prisma = createBillingPrisma();
  const provider = new FakePaymentProvider({ generateId: seqIds('s') });
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
  const planService = new PlanService(prisma as never, { generateId: seqIds('sub') });
  const billing = new BillingService(prisma as never, provider, wallet, planService, {
    webhookSecret: SECRET,
    resolveOwner: () => OWNER,
  });
  return { prisma, provider, wallet, planService, billing };
}

describe('Feature: quantmail-superhub, Phase-7 billing security regression (V16): unverified webhook rejected, grants nothing (Req 20.2)', () => {
  const successEvent: PaymentEvent = {
    providerEventId: 'evt_v16',
    type: 'payment_success',
    ownerRef: 'alice',
    kind: 'topup',
    amountCredits: 1_000,
  };

  it('V16a: a webhook with a BAD signature is rejected and grants nothing (no ledger entry, no record)', async () => {
    const { billing, prisma } = makeBilling();
    const payload = JSON.stringify(successEvent);

    await expect(billing.handleWebhook(payload, 'not-a-valid-signature')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(prisma._ledger).toHaveLength(0);
    expect(prisma._payments).toHaveLength(0);
  });

  it('V16b: a TAMPERED payload (signature minted for a DIFFERENT body) is rejected and grants nothing', async () => {
    const { billing, provider, prisma } = makeBilling();
    // Sign the honest 1-credit body, then tamper the amount up to 1,000,000.
    const honest = JSON.stringify({ ...successEvent, amountCredits: 1 });
    const signature = provider.sign(honest, SECRET);
    const tampered = JSON.stringify({ ...successEvent, amountCredits: 1_000_000 });

    await expect(billing.handleWebhook(tampered, signature)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(prisma._ledger).toHaveLength(0);
    expect(prisma._payments).toHaveLength(0);
  });

  it('V16c: a signature minted under the WRONG secret is rejected and grants nothing', async () => {
    const { billing, provider, prisma } = makeBilling();
    const payload = JSON.stringify(successEvent);
    const wrongSecretSignature = provider.sign(payload, 'whsec_attacker_guess');

    await expect(billing.handleWebhook(payload, wrongSecretSignature)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(prisma._ledger).toHaveLength(0);
    expect(prisma._payments).toHaveLength(0);
  });

  it('V16d: control — a VERIFIED event grants once, and a verified DUPLICATE providerEventId is applied AT MOST ONCE', async () => {
    const { billing, provider, wallet, prisma } = makeBilling();
    const payload = JSON.stringify(successEvent);
    const signature = provider.sign(payload, SECRET);

    const first = await billing.handleWebhook(payload, signature);
    expect(first.applied).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.creditedAmount).toBe(1_000);
    expect((await wallet.getBalance(ALICE, OWNER)).purchased).toBe(1_000);

    // Replay the SAME verified event — at-most-once: no second grant.
    const replay = await billing.handleWebhook(payload, signature);
    expect(replay.applied).toBe(false);
    expect(replay.duplicate).toBe(true);

    expect((await wallet.getBalance(ALICE, OWNER)).purchased).toBe(1_000); // unchanged
    expect(prisma._ledger.filter((r) => r.entryType === 'purchase')).toHaveLength(1);
  });
});

// ===========================================================================
// V17 — Daily-reset abuse closed (idempotent per UTC day) (Req 17.2)
// ===========================================================================

describe('Feature: quantmail-superhub, Phase-7 billing security regression (V17): daily-reset abuse closed, idempotent per UTC day (Req 17.2)', () => {
  it('V17a: MANY grantDaily attempts for the same (owner, UTC day) yield EXACTLY ONE daily_grant', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 100,
    });

    // Hammer the same UTC day many times (sequential re-runs of the reset job).
    const entries = [];
    for (let i = 0; i < 25; i += 1) {
      entries.push(await wallet.grantDaily(OWNER, DAY_1));
    }

    const grants = prisma._ledger.filter((r) => r.entryType === 'daily_grant');
    expect(grants).toHaveLength(1);
    // Every attempt returned the SAME single grant entry (idempotent no-op).
    expect(new Set(entries.map((e) => e.id)).size).toBe(1);
    // The daily balance reflects a single 100-credit grant, not 2,500.
    expect((await wallet.getBalance(ALICE, OWNER)).daily).toBe(100);
  });

  it('V17b: CONCURRENT grantDaily attempts for the same (owner, UTC day) still yield EXACTLY ONE daily_grant (race closed)', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 100,
    });

    await Promise.all(
      Array.from({ length: 8 }, () => wallet.grantDaily(OWNER, DAY_1)),
    );

    expect(prisma._ledger.filter((r) => r.entryType === 'daily_grant')).toHaveLength(1);
    expect((await wallet.getBalance(ALICE, OWNER)).daily).toBe(100);
  });

  it('V17c: a NEW UTC day grants again (one grant per day, not blocked forever)', async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 100,
    });

    const d1 = await wallet.grantDaily(OWNER, DAY_1);
    const d2 = await wallet.grantDaily(OWNER, DAY_2);

    expect(d2.id).not.toBe(d1.id);
    const grants = prisma._ledger.filter((r) => r.entryType === 'daily_grant');
    expect(grants.map((g) => g.utcDay).sort()).toEqual([DAY_1, DAY_2]);
  });

  it("V17d: yesterday's UNUSED daily credits do NOT roll over into the new day's spendable daily balance (Req 17.3)", async () => {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 100,
    });

    // Day 1: grant 100, spend 40 via a real debit, leaving 60 unused daily.
    await wallet.grantDaily(OWNER, DAY_1);
    await wallet.debit(OWNER, 40, 'spend-day1');
    expect((await wallet.getBalance(ALICE, OWNER)).daily).toBe(60);

    // Day 2: grant again. The 60 unused from day 1 must NOT roll over — the new
    // day's spendable daily balance reflects only the fresh 100-credit grant.
    await wallet.grantDaily(OWNER, DAY_2);
    const day2 = await wallet.getBalance(ALICE, OWNER);
    expect(day2.daily).toBe(100);

    // The authoritative invariant still holds: total == SUM(ledger).
    expect(day2.total).toBe(ledgerSum(prisma));
  });
});

// ===========================================================================
// Tenant-scoped wallet authz — getBalance is owner / tenant-admin only (Req 16.4)
// ===========================================================================

describe('Feature: quantmail-superhub, Phase-7 billing security regression: tenant-scoped wallet authz, owner / tenant-admin only (Req 16.4)', () => {
  async function seedWallet() {
    const prisma = createBillingPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 250, kind: 'purchase' });
    return { prisma, wallet };
  }

  it('DENIES a NON-OWNER principal in the same tenant (not an admin) with 403 FORBIDDEN', async () => {
    const { wallet } = await seedWallet();
    const intruder: OwnershipPrincipal = { principalId: 'mallory', tenantId: 'tenant-A' };

    await expect(wallet.getBalance(intruder, OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('DENIES a CROSS-TENANT principal — even a tenant admin of a DIFFERENT tenant — with 403 FORBIDDEN', async () => {
    const { wallet } = await seedWallet();
    const crossTenantAdmin: OwnershipPrincipal = {
      principalId: 'bob',
      tenantId: 'tenant-B',
      isTenantAdmin: true,
    };

    await expect(wallet.getBalance(crossTenantAdmin, OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('ALLOWS the OWNER to read their own wallet balance (no false positive)', async () => {
    const { wallet } = await seedWallet();
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(250);
    expect(balance.purchased).toBe(250);
  });

  it('ALLOWS a SAME-TENANT admin to read the wallet balance (Req 16.4)', async () => {
    const { wallet } = await seedWallet();
    const tenantAdmin: OwnershipPrincipal = {
      principalId: 'admin',
      tenantId: 'tenant-A',
      isTenantAdmin: true,
    };
    const balance = await wallet.getBalance(tenantAdmin, OWNER);
    expect(balance.total).toBe(250);
  });

  it('DENIES a same-tenant member who is NOT flagged as admin even though their tenant matches (admin flag is required)', async () => {
    const { wallet } = await seedWallet();
    // Tenant matches but isTenantAdmin is false -> not the owner, so denied.
    const member: OwnershipPrincipal = { principalId: 'coworker', tenantId: 'tenant-A', isTenantAdmin: false };

    await expect(wallet.getBalance(member, OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});
