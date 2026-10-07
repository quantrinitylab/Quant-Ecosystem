// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 28.2 — PlanService comprehensive unit tests
// Entitlement resolution + single-active-subscription (Requirements 19.1, 19.4)
// ============================================================================
//
// Builds on the Task 28.1 smoke test with a thorough unit suite for the
// PlanService, focused on the two acceptance criteria this task validates:
//
//   • Req 19.1 — entitlement resolution returns the active Plan_Tier's daily
//     allowance, monthly included credits, rate limits, unlocked models, and
//     unlocked features (defaulting to FREE when no active/trialing
//     subscription exists). Also covers getPlan tier resolution and rate-limit /
//     model-lock enforcement, and the adapter factories that feed the seams.
//   • Req 19.4 — at most one active/trialing subscription per owner: repeated
//     plan changes mutate the single row rather than creating a second.
//
// Test-only: consumes the implementation exclusively through the billing barrel
// and reuses the in-memory `planSubscription` prisma mock pattern.

import { describe, it, expect } from 'vitest';
import {
  PlanService,
  PLAN_CATALOG,
  DEFAULT_PLAN_TIER,
  InMemoryRateCounter,
  createPlanEntitlementPort,
  createPlanDailyAllowanceProvider,
  type PlanTier,
  type PlanSubscriptionRecord,
} from '../modules/billing';
import {
  ownerOnlyAuthz,
  type OwnershipPrincipal,
} from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory planSubscription prisma mock (findFirst{status:{in}}, create,
// update, orderBy createdAt desc) plus a `_seed` helper for pre-existing rows.
// ---------------------------------------------------------------------------

interface MockPlanPrisma {
  _rows: PlanSubscriptionRecord[];
  _seed(partial: Partial<PlanSubscriptionRecord> & { ownerRef: string }): PlanSubscriptionRecord;
  _createCalls: number;
  planSubscription: {
    findFirst(args?: {
      where?: Record<string, unknown>;
      orderBy?: { createdAt?: 'asc' | 'desc' };
    }): Promise<PlanSubscriptionRecord | null>;
    create(args: { data: Record<string, unknown> }): Promise<PlanSubscriptionRecord>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<PlanSubscriptionRecord>;
  };
}

function createPlanPrisma(): MockPlanPrisma {
  const rows: PlanSubscriptionRecord[] = [];
  let n = 0;
  let createCalls = 0;
  let seedSeq = 0;

  const prisma: MockPlanPrisma = {
    _rows: rows,
    get _createCalls() {
      return createCalls;
    },
    _seed(partial) {
      const now = partial.createdAt ?? new Date('2025-01-01T00:00:00Z');
      const row: PlanSubscriptionRecord = {
        id: partial.id ?? `seed-${++seedSeq}`,
        ownerRef: partial.ownerRef,
        ownerType: partial.ownerType ?? 'user',
        tenantId: partial.tenantId ?? null,
        planTier: partial.planTier ?? 'free',
        status: partial.status ?? 'active',
        currentPeriodStart: partial.currentPeriodStart ?? now,
        currentPeriodEnd:
          partial.currentPeriodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        pendingPlanTier: partial.pendingPlanTier ?? null,
        effectiveAt: partial.effectiveAt ?? null,
        providerSubId: partial.providerSubId ?? null,
        createdAt: now,
        updatedAt: partial.updatedAt ?? now,
      };
      rows.push(row);
      return row;
    },
    planSubscription: {
      async findFirst({ where, orderBy } = {}) {
        let matches = rows.filter((r) => {
          if (where?.ownerRef != null && r.ownerRef !== where.ownerRef) return false;
          const status = where?.status as { in?: string[] } | string | undefined;
          if (status != null) {
            if (typeof status === 'string') return r.status === status;
            if (status.in != null) return status.in.includes(r.status);
          }
          return true;
        });
        if (orderBy?.createdAt === 'desc') {
          matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return matches.length > 0 ? { ...matches[0] } : null;
      },
      async create({ data }) {
        createCalls += 1;
        const now = new Date();
        const row: PlanSubscriptionRecord = {
          id: (data.id as string) ?? `sub-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          planTier: data.planTier as string,
          status: data.status as string,
          currentPeriodStart: data.currentPeriodStart as Date,
          currentPeriodEnd: data.currentPeriodEnd as Date,
          pendingPlanTier: (data.pendingPlanTier as string | null) ?? null,
          effectiveAt: (data.effectiveAt as Date | null) ?? null,
          providerSubId: (data.providerSubId as string | null) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.id === where.id);
        if (row == null) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
  };
  return prisma;
}

/** Count active/trialing rows for an owner (the Req 19.4 invariant subject). */
function countActive(prisma: MockPlanPrisma, ownerId: string): number {
  return prisma._rows.filter(
    (r) => r.ownerRef === ownerId && (r.status === 'active' || r.status === 'trialing'),
  ).length;
}

const ALL_TIERS: PlanTier[] = ['free', 'pro', 'team', 'enterprise'];
const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };

// ===========================================================================
// Entitlement resolution per tier (Req 19.1)
// ===========================================================================

describe('PlanService.entitlements — per-tier resolution (Req 19.1)', () => {
  for (const tier of ALL_TIERS) {
    it(`returns the ${tier} catalog entitlements for an active ${tier} subscription`, async () => {
      const prisma = createPlanPrisma();
      if (tier !== 'free') {
        prisma._seed({ ownerRef: OWNER.ownerId, planTier: tier, status: 'active' });
      }
      const svc = new PlanService(prisma as never);
      const ent = await svc.entitlements(OWNER);
      const def = PLAN_CATALOG[tier];

      expect(ent.tier).toBe(tier);
      expect(ent.dailyAllowance).toBe(def.dailyAllowance);
      expect(ent.monthlyIncludedCredits).toBe(def.monthlyIncludedCredits);
      expect(ent.rateLimits).toEqual(def.rateLimits);
      expect(ent.unlockedModels).toEqual(def.unlockedModels);
      expect(ent.unlockedFeatures).toEqual(def.unlockedFeatures);
    });
  }

  it('returns copies of the catalog arrays, not the shared constants', async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'pro', status: 'active' });
    const svc = new PlanService(prisma as never);

    const ent = await svc.entitlements(OWNER);
    // Distinct array identities from the catalog.
    expect(ent.unlockedModels).not.toBe(PLAN_CATALOG.pro.unlockedModels);
    expect(ent.unlockedFeatures).not.toBe(PLAN_CATALOG.pro.unlockedFeatures);
    expect(ent.rateLimits).not.toBe(PLAN_CATALOG.pro.rateLimits);
    expect(ent.rateLimits[0]).not.toBe(PLAN_CATALOG.pro.rateLimits[0]);

    // Mutating the returned copies must not corrupt the shared catalog.
    ent.unlockedModels.push('rogue-model');
    ent.unlockedFeatures.push('rogue-feature');
    ent.rateLimits[0].perMinute = 999_999;

    const fresh = await svc.entitlements(OWNER);
    expect(fresh.unlockedModels).toEqual(PLAN_CATALOG.pro.unlockedModels);
    expect(fresh.unlockedFeatures).toEqual(PLAN_CATALOG.pro.unlockedFeatures);
    expect(fresh.rateLimits).toEqual(PLAN_CATALOG.pro.rateLimits);
  });

  it('defaults to FREE when the owner has no subscription at all (Req 19.1)', async () => {
    const svc = new PlanService(createPlanPrisma() as never);
    const ent = await svc.entitlements(OWNER);
    expect(ent.tier).toBe(DEFAULT_PLAN_TIER);
    expect(ent.tier).toBe('free');
    expect(ent.dailyAllowance).toBe(PLAN_CATALOG.free.dailyAllowance);
  });

  for (const status of ['canceled', 'expired'] as const) {
    it(`falls back to FREE when the only subscription is ${status}`, async () => {
      const prisma = createPlanPrisma();
      prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'team', status });
      const svc = new PlanService(prisma as never);
      const ent = await svc.entitlements(OWNER);
      expect(ent.tier).toBe('free');
      expect(ent.dailyAllowance).toBe(PLAN_CATALOG.free.dailyAllowance);
    });
  }

  it('resolves entitlements from a trialing subscription (an active status)', async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'team', status: 'trialing' });
    const svc = new PlanService(prisma as never);
    const ent = await svc.entitlements(OWNER);
    expect(ent.tier).toBe('team');
    expect(ent.monthlyIncludedCredits).toBe(PLAN_CATALOG.team.monthlyIncludedCredits);
  });
});

// ===========================================================================
// getPlan — active tier + elapsed scheduled downgrade (Req 19.1 / 19.3)
// ===========================================================================

describe('PlanService.getPlan — tier resolution', () => {
  it('reflects the active tier and exposes the backing subscription', async () => {
    const prisma = createPlanPrisma();
    const seeded = prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'pro', status: 'active' });
    const svc = new PlanService(prisma as never);

    const plan = await svc.getPlan(OWNER);
    expect(plan.tier).toBe('pro');
    expect(plan.definition).toBe(PLAN_CATALOG.pro);
    expect(plan.subscription?.id).toBe(seeded.id);
  });

  it('returns a synthetic FREE plan with no subscription row by default', async () => {
    const svc = new PlanService(createPlanPrisma() as never);
    const plan = await svc.getPlan(OWNER);
    expect(plan.tier).toBe('free');
    expect(plan.subscription).toBeNull();
  });

  it('keeps the current tier before a scheduled downgrade boundary, then applies it after', async () => {
    const prisma = createPlanPrisma();
    let nowMs = Date.parse('2025-01-10T00:00:00Z');
    const boundary = new Date('2025-02-01T00:00:00Z');
    prisma._seed({
      ownerRef: OWNER.ownerId,
      planTier: 'team',
      status: 'active',
      pendingPlanTier: 'pro',
      effectiveAt: boundary,
      currentPeriodEnd: boundary,
    });
    const svc = new PlanService(prisma as never, { clock: () => new Date(nowMs) });

    // Before the boundary: still TEAM, entitlements still TEAM.
    expect((await svc.getPlan(OWNER)).tier).toBe('team');
    expect((await svc.entitlements(OWNER)).dailyAllowance).toBe(PLAN_CATALOG.team.dailyAllowance);

    // After the boundary elapses: the pending PRO tier applies (no write needed).
    nowMs = Date.parse('2025-02-02T00:00:00Z');
    expect((await svc.getPlan(OWNER)).tier).toBe('pro');
    expect((await svc.entitlements(OWNER)).dailyAllowance).toBe(PLAN_CATALOG.pro.dailyAllowance);
  });
});

// ===========================================================================
// Single-active-subscription invariant (Req 19.4)
// ===========================================================================

describe('PlanService.changePlan — at most one active subscription (Req 19.4)', () => {
  it('creates exactly one row on the first upgrade away from FREE', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);

    await svc.changePlan(OWNER, 'pro');

    expect(prisma._rows.length).toBe(1);
    expect(prisma._createCalls).toBe(1);
    expect(countActive(prisma, OWNER.ownerId)).toBe(1);
  });

  it('upgrade → downgrade → upgrade keeps exactly one active row', async () => {
    const prisma = createPlanPrisma();
    let nowMs = Date.parse('2025-01-01T00:00:00Z');
    const svc = new PlanService(prisma as never, { clock: () => new Date(nowMs) });

    await svc.changePlan(OWNER, 'team'); // upgrade (creates the row)
    await svc.changePlan(OWNER, 'pro'); // downgrade (scheduled on the same row)
    await svc.changePlan(OWNER, 'enterprise'); // upgrade (mutates the same row)

    expect(prisma._rows.length).toBe(1);
    expect(prisma._createCalls).toBe(1);
    expect(countActive(prisma, OWNER.ownerId)).toBe(1);

    nowMs = Date.parse('2025-06-01T00:00:00Z');
    expect((await svc.getPlan(OWNER)).tier).toBe('enterprise');
  });

  it('createSubscription fires only once across many changes', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);

    await svc.changePlan(OWNER, 'pro');
    await svc.changePlan(OWNER, 'team');
    await svc.changePlan(OWNER, 'enterprise');
    await svc.changePlan(OWNER, 'pro');

    expect(prisma._createCalls).toBe(1);
    expect(prisma._rows.length).toBe(1);
  });

  it('changing to the current tier with nothing pending is a no-op', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);

    const created = await svc.changePlan(OWNER, 'pro');
    const again = await svc.changePlan(OWNER, 'pro');

    expect(again.id).toBe(created.id);
    expect(again.updatedAt.getTime()).toBe(created.updatedAt.getTime()); // untouched
    expect(prisma._rows.length).toBe(1);
  });

  it('changing to FREE with no subscription does not persist a row', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);

    const sub = await svc.changePlan(OWNER, 'free');

    expect(sub.planTier).toBe('free');
    expect(prisma._rows.length).toBe(0);
    expect(prisma._createCalls).toBe(0);
  });

  it('an upgrade applies immediately and clears any pending downgrade', async () => {
    const prisma = createPlanPrisma();
    let nowMs = Date.parse('2025-01-01T00:00:00Z');
    const svc = new PlanService(prisma as never, { clock: () => new Date(nowMs) });

    await svc.changePlan(OWNER, 'team');
    await svc.changePlan(OWNER, 'pro'); // schedule downgrade
    expect(prisma._rows[0].pendingPlanTier).toBe('pro');

    await svc.changePlan(OWNER, 'enterprise'); // upgrade clears the pending change
    expect(prisma._rows[0].pendingPlanTier).toBeNull();
    expect(prisma._rows[0].planTier).toBe('enterprise');
  });
});

// ===========================================================================
// Authorization (design precondition — caller must own or be tenant admin)
// ===========================================================================

describe('PlanService.changePlan — ownership authorization', () => {
  const owner: OwnershipPrincipal = { principalId: OWNER.ownerId, tenantId: OWNER.tenantId };
  const stranger: OwnershipPrincipal = { principalId: 'mallory', tenantId: 'tenant-Z' };
  const tenantAdmin: OwnershipPrincipal = {
    principalId: 'admin',
    tenantId: OWNER.tenantId,
    isTenantAdmin: true,
  };

  it('throws 403 FORBIDDEN when a non-owner caller attempts the change', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never, { authz: ownerOnlyAuthz });

    await expect(svc.changePlan(OWNER, 'pro', { caller: stranger })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    // Nothing was persisted on the denied attempt.
    expect(prisma._rows.length).toBe(0);
  });

  it('succeeds when the owner is the caller', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never, { authz: ownerOnlyAuthz });
    const sub = await svc.changePlan(OWNER, 'pro', { caller: owner });
    expect(sub.planTier).toBe('pro');
  });

  it('succeeds when a same-tenant admin is the caller', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never, { authz: ownerOnlyAuthz });
    const sub = await svc.changePlan(OWNER, 'team', { caller: tenantAdmin });
    expect(sub.planTier).toBe('team');
  });
});

// ===========================================================================
// Rate-limit windows (Req 19.1 entitlements feeding the gate's enforcement)
// ===========================================================================

describe('PlanService.permits — per-minute rate window', () => {
  it('rejects beyond the per-minute ceiling and resets in the next minute', async () => {
    let nowMs = Date.parse('2025-01-01T00:00:00Z');
    const svc = new PlanService(createPlanPrisma() as never, {
      clock: () => new Date(nowMs),
      rateCounter: new InMemoryRateCounter(),
    });
    const perMinute = PLAN_CATALOG.free.rateLimits.find((r) => r.kind === 'rag_query')!.perMinute!;

    for (let i = 0; i < perMinute; i++) {
      expect(await svc.permits(OWNER, 'rag_query')).toBe(true);
    }
    // The ceiling+1-th action in the same minute is rejected.
    expect(await svc.permits(OWNER, 'rag_query')).toBe(false);

    // Advance into the next UTC minute — the per-minute window resets.
    nowMs += 60_000;
    expect(await svc.permits(OWNER, 'rag_query')).toBe(true);
  });
});

describe('PlanService.permits — per-day rate window', () => {
  it('rejects beyond the per-day ceiling and resets on the next UTC day', async () => {
    let nowMs = Date.parse('2025-01-01T00:00:00Z');
    const svc = new PlanService(createPlanPrisma() as never, {
      clock: () => new Date(nowMs),
      rateCounter: new InMemoryRateCounter(),
    });
    const limit = PLAN_CATALOG.free.rateLimits.find((r) => r.kind === 'rag_query')!;
    const perDay = limit.perDay!;
    const perMinute = limit.perMinute!;

    // Advance one minute per action so the per-minute window never interferes,
    // isolating the per-day ceiling. (perDay must exceed perMinute for this.)
    expect(perDay).toBeGreaterThan(perMinute);
    for (let i = 0; i < perDay; i++) {
      expect(await svc.permits(OWNER, 'rag_query')).toBe(true);
      nowMs += 60_000;
    }
    // Still the same UTC day → the per-day ceiling rejects the next action.
    expect(await svc.permits(OWNER, 'rag_query')).toBe(false);

    // Advance to the next UTC day — the per-day window resets.
    nowMs = Date.parse('2025-01-02T00:00:00Z');
    expect(await svc.permits(OWNER, 'rag_query')).toBe(true);
  });
});

describe('PlanService.permits — feature lock + unmetered tier', () => {
  it('rejects a feature-locked driver on FREE and permits it after upgrading to PRO', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);
    expect(await svc.permits(OWNER, 'agent_org_run')).toBe(false);
    await svc.changePlan(OWNER, 'pro');
    expect(await svc.permits(OWNER, 'agent_org_run')).toBe(true);
  });

  it('does not rate-limit a driver with no ceiling on ENTERPRISE', async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'enterprise', status: 'active' });
    const svc = new PlanService(prisma as never);
    for (let i = 0; i < 100; i++) {
      expect(await svc.permits(OWNER, 'ai_inference')).toBe(true);
    }
  });
});

// ===========================================================================
// Model lock (Req 19.1 unlocked models feeding the gate)
// ===========================================================================

describe('PlanService.permits — model lock', () => {
  it('rejects a model that is not in the active tier unlocked set', async () => {
    const svc = new PlanService(createPlanPrisma() as never); // FREE
    // FREE unlocks only gpt-4o-mini.
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'gpt-4o-mini' })).toBe(true);
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'gpt-4o' })).toBe(false);
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'o1' })).toBe(false);
  });

  it('permits a model unlocked by a higher tier', async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'pro', status: 'active' });
    const svc = new PlanService(prisma as never);
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'claude-3-5-sonnet' })).toBe(true);
    // o1 is only unlocked at TEAM+.
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'o1' })).toBe(false);
  });

  it("'*' unlocks every model on ENTERPRISE", async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: OWNER.ownerId, planTier: 'enterprise', status: 'active' });
    const svc = new PlanService(prisma as never);
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'gpt-4o' })).toBe(true);
    expect(await svc.permits(OWNER, 'ai_inference', { modelId: 'any-future-model' })).toBe(true);
  });
});

// ===========================================================================
// Adapter factories feed the billing seams
// ===========================================================================

describe('PlanService adapter factories', () => {
  it('createPlanEntitlementPort.permits reflects the active tier locks', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);
    const port = createPlanEntitlementPort(svc);

    // FREE: ai_inference allowed, agent_org_run feature-locked.
    expect(await port.permits('alice', 'ai_inference')).toBe(true);
    expect(await port.permits('alice', 'agent_org_run')).toBe(false);

    await svc.changePlan({ ownerId: 'alice' }, 'pro');
    expect(await port.permits('alice', 'agent_org_run')).toBe(true);
  });

  it('createPlanDailyAllowanceProvider returns the active tier daily allowance', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);
    const provider = createPlanDailyAllowanceProvider(svc);

    // Default FREE.
    expect(await provider({ ownerId: 'alice' })).toBe(PLAN_CATALOG.free.dailyAllowance);

    // After upgrading to TEAM, the provider returns the TEAM allowance.
    await svc.changePlan({ ownerId: 'alice' }, 'team');
    expect(await provider({ ownerId: 'alice' })).toBe(PLAN_CATALOG.team.dailyAllowance);
  });

  it('a custom resolveOwner maps the gate string ownerRef to a PlanOwnerRef', async () => {
    const prisma = createPlanPrisma();
    prisma._seed({ ownerRef: 'org-7', ownerType: 'org', planTier: 'team', status: 'active' });
    const svc = new PlanService(prisma as never);
    const port = createPlanEntitlementPort(svc, {
      resolveOwner: (ref) => ({ ownerId: ref, ownerType: 'org', tenantId: 'tenant-A' }),
    });
    // TEAM unlocks autonomous_gmail + agent_org → agent_org_run permitted.
    expect(await port.permits('org-7', 'agent_org_run')).toBe(true);
  });
});
