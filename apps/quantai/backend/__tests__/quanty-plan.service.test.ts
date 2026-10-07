// ============================================================================
// QuantyPlanService + ToolPolicyService tests (PR-Q6)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

import {
  QuantyPlanService,
  ToolPolicyService,
  DEFAULT_TOOL_CATALOG,
  type QuantyPlanPrisma,
} from '../services/quanty-plan.service';

function mockPrisma(overrides: Partial<QuantyPlanPrisma> = {}): QuantyPlanPrisma {
  return {
    planSubscription: {
      findFirst: async () => null,
    },
    creditLedgerEntry: {
      aggregate: async () => ({ _sum: { amount: null } }),
      findMany: async () => [],
    },
    oAuthAccount: {
      findMany: async () => [],
      delete: async () => ({}),
    },
    aISession: {
      findMany: async () => [],
    },
    ...overrides,
  };
}

describe('QuantyPlanService.getPlanSummary', () => {
  it('defaults to Free plan with 0% when no subscription exists', async () => {
    const svc = new QuantyPlanService(mockPrisma());
    const s = await svc.getPlanSummary('user-1');
    expect(s.configured).toBe(true);
    expect(s.plan.name).toBe('Free plan');
    expect(s.plan.tier).toBe('free');
    expect(s.plan.percentUsed).toBe(0);
    expect(s.plan.resetsAt).not.toBeNull();
    expect(s.tokens.expiresAt).toBeNull(); // never expires
  });

  it('resolves the active subscription tier', async () => {
    const prisma = mockPrisma({
      planSubscription: {
        findFirst: async () => ({
          planTier: 'pro',
          status: 'active',
          currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
        }),
      },
    });
    const svc = new QuantyPlanService(prisma);
    const s = await svc.getPlanSummary('user-1');
    expect(s.plan.tier).toBe('pro');
    expect(s.plan.name).toBe('Pro plan');
  });

  it('computes purchased-token usage from the ledger (no fake numbers)', async () => {
    const prisma = mockPrisma({
      creditLedgerEntry: {
        aggregate: async (args: any) => {
          // first call: positive-only (granted); second: net (remaining)
          const where = args.where as { amount?: { gt: number } };
          if (where.amount?.gt !== undefined) return { _sum: { amount: 1000 } };
          return { _sum: { amount: 960 } };
        },
        findMany: async () => [],
      },
    });
    const svc = new QuantyPlanService(prisma);
    const s = await svc.getPlanSummary('user-1');
    expect(s.tokens.granted).toBe(1000);
    expect(s.tokens.remaining).toBe(960);
    expect(s.tokens.percentUsed).toBe(4);
  });

  it('returns configured:false when Prisma is absent (honest, not fake)', async () => {
    const svc = new QuantyPlanService(null);
    const s = await svc.getPlanSummary('user-1');
    expect(s.configured).toBe(false);
    expect(s.plan.percentUsed).toBe(0);
    expect(s.tokens.remaining).toBe(0);
  });
});

describe('QuantyPlanService.getWallet', () => {
  it('derives balances from ledger sums by bucket', async () => {
    const prisma = mockPrisma({
      creditLedgerEntry: {
        aggregate: async (args: any) => {
          const bucket = (args.where as { bucket: string }).bucket;
          const sums: Record<string, number> = { DAILY: 500, MONTHLY: 200, PURCHASED: 960 };
          return { _sum: { amount: sums[bucket] ?? null } };
        },
        findMany: async () => [
          {
            id: 'e1',
            entryType: 'purchase',
            bucket: 'PURCHASED',
            amount: 1000,
            reason: 'Token pack',
            createdAt: new Date('2026-10-01T00:00:00Z'),
          },
        ],
      },
    });
    const svc = new QuantyPlanService(prisma);
    const w = await svc.getWallet('user-1');
    expect(w.configured).toBe(true);
    expect(w.balance).toEqual({ daily: 500, monthly: 200, purchased: 960, total: 1660 });
    expect(w.history).toHaveLength(1);
    expect(w.history[0].id).toBe('e1');
    expect(w.history[0].createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('returns configured:false with empty history when Prisma is absent', async () => {
    const svc = new QuantyPlanService(null);
    const w = await svc.getWallet('user-1');
    expect(w.configured).toBe(false);
    expect(w.history).toEqual([]);
  });
});

describe('QuantyPlanService credentials (metadata only)', () => {
  it('lists grants WITHOUT token values and masks account labels', async () => {
    const prisma = mockPrisma({
      oAuthAccount: {
        findMany: async () => [
          {
            id: 'g1',
            provider: 'google',
            providerAccountId: 'kundan@quantmail.in',
            scope: 'gmail.read gmail.send',
            createdAt: new Date('2026-09-01T00:00:00Z'),
          },
        ],
        delete: async () => ({}),
      },
    });
    const svc = new QuantyPlanService(prisma);
    const { grants, configured } = await svc.getCredentials('user-1');
    expect(configured).toBe(true);
    expect(grants).toHaveLength(1);
    expect(grants[0].provider).toBe('google');
    expect(grants[0].scopes).toEqual(['gmail.read', 'gmail.send']);
    // masked — full email must never appear
    expect(grants[0].accountLabel).not.toContain('kundan@quantmail.in');
    expect(grants[0].accountLabel).toContain('@quantmail.in');
    // no token fields anywhere on the grant object
    expect(grants[0]).not.toHaveProperty('accessToken');
    expect(grants[0]).not.toHaveProperty('refreshToken');
  });

  it('revoke deletes only the caller-owned grant; 404 otherwise', async () => {
    const deleted: string[] = [];
    const prisma = mockPrisma({
      oAuthAccount: {
        findMany: async (args: any) =>
          (args.where as { id: string }).id === 'g1'
            ? [
                {
                  id: 'g1',
                  provider: 'google',
                  providerAccountId: 'x',
                  scope: '',
                  createdAt: new Date(),
                },
              ]
            : [],
        delete: async (args: any) => {
          deleted.push((args.where as { id: string }).id);
          return {};
        },
      },
    });
    const svc = new QuantyPlanService(prisma);
    const r = await svc.revokeCredential('user-1', 'g1');
    expect(r.revoked).toBe(true);
    expect(deleted).toEqual(['g1']);
    await expect(svc.revokeCredential('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('ToolPolicyService', () => {
  let svc: ToolPolicyService;

  beforeEach(() => {
    svc = new ToolPolicyService();
  });

  it('defaults destructive tools to ask and read-only tools to allow', () => {
    const tools = svc.listPolicies('user-1');
    expect(tools.length).toBe(DEFAULT_TOOL_CATALOG.length);
    expect(tools.find((t) => t.id === 'mail.send')?.policy).toBe('ask');
    expect(tools.find((t) => t.id === 'mail.search')?.policy).toBe('allow');
  });

  it('persists per-user policy changes', () => {
    svc.setPolicy('user-1', 'mail.send', 'allow');
    expect(svc.listPolicies('user-1').find((t) => t.id === 'mail.send')?.policy).toBe('allow');
    // other users unaffected
    expect(svc.listPolicies('user-2').find((t) => t.id === 'mail.send')?.policy).toBe('ask');
  });

  it('rejects unknown tool ids', () => {
    expect(() => svc.setPolicy('user-1', 'nope.tool', 'allow')).toThrow();
  });

  it('denies unknown tools in the executor-facing getPolicy', () => {
    expect(svc.getPolicy('user-1', 'nope.tool')).toBe('deny');
  });
});
