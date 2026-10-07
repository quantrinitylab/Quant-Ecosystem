// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 29.1 — BillingService smoke coverage
// Payments, signed webhooks, and idempotent grants (Requirements 20.1-20.5)
// ============================================================================
//
// Minimal-but-meaningful coverage of the BillingService over the vendor-neutral
// PaymentProvider port (the FakePaymentProvider test double). The exhaustive
// idempotence/signature-gating property test is Task 29.2.
//
//   • Req 20.1 — createCheckout returns a provider-hosted handle; only a pending
//     PaymentRecord (no card data) is stored.
//   • Req 20.2 — an unverified webhook signature is rejected and grants nothing.
//   • Req 20.3 — a verified payment_success grants credits / activates the
//     subscription, applied at most once per providerEventId.
//   • Req 20.4 — a verified payment_failure marks the PaymentRecord failed.
//   • Req 20.5 — subscription change is applied through PlanService.
//
// Consumes the implementation exclusively through the billing barrel.

import { describe, it, expect } from 'vitest';
import {
  BillingService,
  CreditWallet,
  PlanService,
  FakePaymentProvider,
  PLAN_CATALOG,
  type PaymentEvent,
} from '../modules/billing';

// ---------------------------------------------------------------------------
// Combined in-memory prisma mock: paymentRecord + creditLedgerEntry +
// planSubscription, with a @unique(providerEventId) guard on paymentRecord.
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
        // Enforce @unique(providerEventId) when non-null.
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

function makeService() {
  const prisma = createBillingPrisma();
  const provider = new FakePaymentProvider({ generateId: (() => { let i = 0; return () => `s${++i}`; })() });
  const wallet = new CreditWallet(prisma as never);
  const planService = new PlanService(prisma as never);
  const billing = new BillingService(prisma as never, provider, wallet, planService, {
    webhookSecret: SECRET,
    resolveOwner: () => OWNER,
  });
  return { prisma, provider, wallet, planService, billing };
}

/** Mint a signed webhook payload for an event (mirrors a real provider post). */
function signedEvent(provider: FakePaymentProvider, event: PaymentEvent): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  return { payload, signature: provider.sign(payload, SECRET) };
}

// ===========================================================================
// Req 20.1 — provider-hosted checkout, no card data
// ===========================================================================

describe('BillingService.createCheckout (Req 20.1)', () => {
  it('returns a provider-hosted handle and records a pending top-up (no card data)', async () => {
    const { billing, prisma } = makeService();
    const { handle, record } = await billing.createCheckout(OWNER, { kind: 'topup', credits: 500 });

    expect(handle.url).toContain(handle.sessionId);
    expect(handle.provider).toBe('fake');
    expect(record.status).toBe('pending');
    expect(record.kind).toBe('topup');
    expect(record.amountCredits).toBe(500);
    expect(record.providerSessionId).toBe(handle.sessionId);
    // Only a pending record exists; no ledger grant yet.
    expect(prisma._payments.length).toBe(1);
    expect(prisma._ledger.length).toBe(0);
    // No card-data fields are present on the persisted record.
    expect(JSON.stringify(record)).not.toMatch(/card|pan|cvv|number/i);
  });

  it('rejects a top-up with no positive amount and a subscription with no tier', async () => {
    const { billing } = makeService();
    await expect(billing.createCheckout(OWNER, { kind: 'topup' })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    await expect(billing.createCheckout(OWNER, { kind: 'subscription' })).rejects.toMatchObject({
      code: 'INVALID_PLAN',
    });
  });
});

// ===========================================================================
// Req 20.2 — unverified webhook rejected, grants nothing
// ===========================================================================

describe('BillingService.handleWebhook — signature gating (Req 20.2)', () => {
  it('rejects an event with a bad signature and grants no credits', async () => {
    const { billing, prisma } = makeService();
    const payload = JSON.stringify({
      providerEventId: 'evt_1',
      type: 'payment_success',
      ownerRef: 'alice',
      kind: 'topup',
      amountCredits: 100,
    });
    await expect(billing.handleWebhook(payload, 'not-a-valid-signature')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
    // Nothing granted, no record stamped.
    expect(prisma._ledger.length).toBe(0);
    expect(prisma._payments.length).toBe(0);
  });
});

// ===========================================================================
// Req 20.3 — verified payment_success grants credits, at most once
// ===========================================================================

describe('BillingService.handleWebhook — payment_success top-up (Req 20.3)', () => {
  it('grants purchased credits on first delivery and is a no-op on replay', async () => {
    const { billing, provider, wallet, prisma } = makeService();
    const { handle } = await billing.createCheckout(OWNER, { kind: 'topup', credits: 250 });

    const event: PaymentEvent = {
      providerEventId: 'evt_topup_1',
      type: 'payment_success',
      ownerRef: 'alice',
      kind: 'topup',
      amountCredits: 250,
      providerSessionId: handle.sessionId,
    };
    const { payload, signature } = signedEvent(provider, event);

    const first = await billing.handleWebhook(payload, signature);
    expect(first.applied).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.creditedAmount).toBe(250);
    expect(first.record.status).toBe('succeeded');

    const balance1 = await wallet.getBalance({ principalId: 'alice', tenantId: 'tenant-A' }, OWNER);
    expect(balance1.purchased).toBe(250);

    // REPLAY: same providerEventId → no second grant (at most once).
    const second = await billing.handleWebhook(payload, signature);
    expect(second.applied).toBe(false);
    expect(second.duplicate).toBe(true);

    const balance2 = await wallet.getBalance({ principalId: 'alice', tenantId: 'tenant-A' }, OWNER);
    expect(balance2.purchased).toBe(250); // unchanged
    expect(prisma._ledger.length).toBe(1);
  });

  it('activates a subscription and grants the plan monthly included credits', async () => {
    const { billing, provider, wallet, planService } = makeService();
    const { handle } = await billing.createCheckout(OWNER, { kind: 'subscription', planTier: 'pro' });

    const event: PaymentEvent = {
      providerEventId: 'evt_sub_1',
      type: 'payment_success',
      ownerRef: 'alice',
      kind: 'subscription',
      planTier: 'pro',
      providerSubId: 'sub_123',
      providerSessionId: handle.sessionId,
    };
    const { payload, signature } = signedEvent(provider, event);

    const res = await billing.handleWebhook(payload, signature);
    expect(res.applied).toBe(true);
    expect(res.creditedAmount).toBe(PLAN_CATALOG.pro.monthlyIncludedCredits);

    // Plan is now PRO and monthly credits were granted.
    expect((await planService.getPlan(OWNER)).tier).toBe('pro');
    const bal = await wallet.getBalance({ principalId: 'alice', tenantId: 'tenant-A' }, OWNER);
    expect(bal.monthly).toBe(PLAN_CATALOG.pro.monthlyIncludedCredits);
  });
});

// ===========================================================================
// Req 20.4 — verified payment_failure marks the record failed, grants nothing
// ===========================================================================

describe('BillingService.handleWebhook — payment_failure (Req 20.4)', () => {
  it('marks the PaymentRecord failed and grants no credits', async () => {
    const { billing, provider, wallet, prisma } = makeService();
    const { handle } = await billing.createCheckout(OWNER, { kind: 'topup', credits: 300 });

    const event: PaymentEvent = {
      providerEventId: 'evt_fail_1',
      type: 'payment_failure',
      ownerRef: 'alice',
      kind: 'topup',
      amountCredits: 300,
      providerSessionId: handle.sessionId,
    };
    const { payload, signature } = signedEvent(provider, event);

    const res = await billing.handleWebhook(payload, signature);
    expect(res.applied).toBe(true);
    expect(res.record.status).toBe('failed');
    expect(res.creditedAmount).toBe(0);

    const bal = await wallet.getBalance({ principalId: 'alice', tenantId: 'tenant-A' }, OWNER);
    expect(bal.total).toBe(0);
    expect(prisma._ledger.length).toBe(0);
  });
});

// ===========================================================================
// Req 20.5 — subscription change applied via PlanService at the boundary
// ===========================================================================

describe('BillingService.handleWebhook — subscription change (Req 20.5)', () => {
  it('cancel routes the owner back to FREE at the period boundary', async () => {
    const { billing, provider, planService } = makeService();
    // Start on PRO.
    await planService.changePlan(OWNER, 'pro', { effective: 'immediate' });
    expect((await planService.getPlan(OWNER)).tier).toBe('pro');

    const event: PaymentEvent = {
      providerEventId: 'evt_cancel_1',
      type: 'subscription_canceled',
      ownerRef: 'alice',
      kind: 'subscription',
      subscriptionAction: 'cancel',
    };
    const { payload, signature } = signedEvent(provider, event);

    const res = await billing.handleWebhook(payload, signature);
    expect(res.applied).toBe(true);

    // A cancel is scheduled for the period end (still PRO until the boundary),
    // recorded as a pending downgrade to FREE on the single subscription.
    const sub = await planService.getPlan(OWNER);
    expect(sub.subscription?.pendingPlanTier).toBe('free');
  });

  it('an upgrade event applies immediately', async () => {
    const { billing, provider, planService } = makeService();
    await planService.changePlan(OWNER, 'pro', { effective: 'immediate' });

    const event: PaymentEvent = {
      providerEventId: 'evt_up_1',
      type: 'subscription_updated',
      ownerRef: 'alice',
      kind: 'subscription',
      planTier: 'team',
      subscriptionAction: 'upgrade',
    };
    const { payload, signature } = signedEvent(provider, event);
    await billing.handleWebhook(payload, signature);

    expect((await planService.getPlan(OWNER)).tier).toBe('team');
  });
});
