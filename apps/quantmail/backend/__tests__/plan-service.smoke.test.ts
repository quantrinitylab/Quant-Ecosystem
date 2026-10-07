// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 28.1 — PlanService entitlements / getPlan / changePlan
// (Requirements 19.1, 19.2, 19.3, 19.4)
// ============================================================================
//
// Minimal smoke coverage for the plan/entitlements/rate-limit service. The
// comprehensive unit/property tests are Task 28.2; this asserts the core wiring:
//   * entitlements default to FREE when no active subscription (Req 19.1).
//   * a rate-limit-exceeding action is not permitted (Req 19.2).
//   * a feature-locked driver is not permitted on FREE (Req 19.2).
//   * an upgrade applies immediately; a downgrade is scheduled for the boundary
//     and takes effect once it elapses (Req 19.3).
//   * at most one active/trialing subscription per owner — changePlan mutates the
//     single row rather than creating a second (Req 19.4).
//   * the adapter factories feed the UsageGate + CreditWallet seams.

import { describe, it, expect } from 'vitest';
import {
  PlanService,
  PLAN_CATALOG,
  InMemoryRateCounter,
  createPlanEntitlementPort,
  createPlanDailyAllowanceProvider,
  type PlanSubscriptionRecord,
} from '../modules/billing';

// ---------------------------------------------------------------------------
// In-memory planSubscription prisma mock (supports findFirst{status:{in}},
// create, update, orderBy createdAt desc).
// ---------------------------------------------------------------------------

function createPlanPrisma() {
  const rows: PlanSubscriptionRecord[] = [];
  let n = 0;
  const prisma = {
    _rows: rows,
    planSubscription: {
      async findFirst({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { createdAt?: 'asc' | 'desc' } } = {}) {
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
      async create({ data }: { data: Record<string, unknown> }) {
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
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = rows.find((r) => r.id === where.id);
        if (row == null) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
  };
  return prisma;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };

describe('PlanService.entitlements — defaults to FREE (Req 19.1)', () => {
  it('resolves FREE entitlements when no active subscription exists', async () => {
    const svc = new PlanService(createPlanPrisma() as never);
    const ent = await svc.entitlements(OWNER);
    expect(ent.tier).toBe('free');
    expect(ent.dailyAllowance).toBe(PLAN_CATALOG.free.dailyAllowance);
    expect(ent.monthlyIncludedCredits).toBe(0);
  });
});

describe('PlanService.permits — rate limits + feature locks (Req 19.2)', () => {
  it('rejects an action that would exceed the FREE per-minute rate limit', async () => {
    const clock = () => new Date('2025-01-01T00:00:30Z');
    const svc = new PlanService(createPlanPrisma() as never, {
      clock,
      rateCounter: new InMemoryRateCounter(),
    });
    const limit = PLAN_CATALOG.free.rateLimits.find((r) => r.kind === 'rag_query')!.perMinute!;
    for (let i = 0; i < limit; i++) {
      expect(await svc.permits(OWNER, 'rag_query')).toBe(true);
    }
    // The (limit + 1)-th action within the same minute is rejected.
    expect(await svc.permits(OWNER, 'rag_query')).toBe(false);
  });

  it('rejects a feature-locked driver on FREE and permits it on PRO', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);
    // agent_org_run requires the 'agent_org' feature, locked on FREE.
    expect(await svc.permits(OWNER, 'agent_org_run')).toBe(false);
    await svc.changePlan(OWNER, 'pro');
    expect(await svc.permits(OWNER, 'agent_org_run')).toBe(true);
  });
});

describe('PlanService.changePlan — boundaries + single-active (Req 19.3, 19.4)', () => {
  it('applies an upgrade immediately', async () => {
    const prisma = createPlanPrisma();
    const svc = new PlanService(prisma as never);
    await svc.changePlan(OWNER, 'pro');
    const plan = await svc.getPlan(OWNER);
    expect(plan.tier).toBe('pro');
    expect((prisma._rows as PlanSubscriptionRecord[]).length).toBe(1);
  });

  it('schedules a downgrade for the boundary and applies it once elapsed', async () => {
    const prisma = createPlanPrisma();
    let nowMs = Date.parse('2025-01-01T00:00:00Z');
    const svc = new PlanService(prisma as never, { clock: () => new Date(nowMs) });

    await svc.changePlan(OWNER, 'team'); // upgrade -> immediate
    expect((await svc.getPlan(OWNER)).tier).toBe('team');

    await svc.changePlan(OWNER, 'pro'); // downgrade -> scheduled
    // Still TEAM until the boundary.
    expect((await svc.getPlan(OWNER)).tier).toBe('team');

    // Advance past the current period end -> the pending PRO tier applies.
    nowMs = Date.parse('2025-03-01T00:00:00Z');
    expect((await svc.getPlan(OWNER)).tier).toBe('pro');

    // Never created a second active subscription row (Req 19.4).
    expect((prisma._rows as PlanSubscriptionRecord[]).length).toBe(1);
  });
});

describe('PlanService adapters feed the billing seams', () => {
  it('entitlement port maps permits; daily-allowance provider returns the active allowance', async () => {
    const svc = new PlanService(createPlanPrisma() as never);
    const port = createPlanEntitlementPort(svc);
    expect(await port.permits('alice', 'ai_inference')).toBe(true);
    expect(await port.permits('alice', 'agent_org_run')).toBe(false); // FREE locks agent_org

    const dailyAllowanceProvider = createPlanDailyAllowanceProvider(svc);
    expect(await dailyAllowanceProvider({ ownerId: 'alice' })).toBe(PLAN_CATALOG.free.dailyAllowance);
  });
});
