/**
 * F-111: per-user permission tiers in the agent gateway.
 *
 * The gateway used to hardcode tier 1 everywhere (checkPermissions default,
 * execute() context, streaming branch), so tier-3 tools were 403 for everyone
 * — including real admins — and the tier model could not express the verbatim
 * role claims the war-room freeze assumes.
 *
 * These tests assert:
 *  - roleToPermissionTier: verbatim UPPERCASE mapping, exact-match only,
 *    fail-closed to 1 for everything unrecognized.
 *  - checkPermissions: tier-3 reachable by ADMIN (tier 3), denied for
 *    everyone below; tier-2 denied for tier 1; held plans carry the tier.
 *  - execute: the caller's tier reaches the ToolExecutionContext
 *    (default stays 1 when no tier is supplied).
 *  - confirm: re-gates against the confirming caller's tier so a stale or
 *    unverifiable role fails closed; 404/403/user-mismatch still hold.
 *
 * Network is stubbed: real HTTP handlers are overridden via registerHandler.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import type { PermissionTier, ToolExecutionContext, ToolPlan } from '@quant/quant-tools';
import { roleToPermissionTier } from '../services/gateway-tier';
import { getAgentGateway } from '../services/agent-gateway.service';

// quantads.set-budget = permissionTier 3, quantads.create-campaign = 2,
// quantads.analytics = 0 (packages/quant-tools/src/tools/ads-tools.ts).
function makePlan(toolIds: string[]): ToolPlan {
  return {
    id: `test-plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: 'F-111 tier test plan',
    estimatedCost: 'low',
    requiredPermission: 1,
    steps: toolIds.map((toolId, i) => ({
      stepId: `step-${i}`,
      toolId,
      params: {},
      dependsOn: [],
      outputKey: '',
    })),
  };
}

describe('roleToPermissionTier (verbatim role claim, war-room freeze)', () => {
  it('maps ADMIN to tier 3', () => {
    expect(roleToPermissionTier('ADMIN')).toBe(3);
  });

  it('maps MODERATOR to tier 2', () => {
    expect(roleToPermissionTier('MODERATOR')).toBe(2);
  });

  it('maps the other frozen roles to tier 1', () => {
    expect(roleToPermissionTier('USER')).toBe(1);
    expect(roleToPermissionTier('CREATOR')).toBe(1);
    expect(roleToPermissionTier('ADVERTISER')).toBe(1);
  });

  it('fails closed to tier 1 for missing/unrecognized claims', () => {
    expect(roleToPermissionTier(undefined)).toBe(1);
    expect(roleToPermissionTier(null)).toBe(1);
    expect(roleToPermissionTier('')).toBe(1);
    expect(roleToPermissionTier(3)).toBe(1);
    expect(roleToPermissionTier({})).toBe(1);
    expect(roleToPermissionTier('SUPERADMIN')).toBe(1);
  });

  it('never normalizes: lowercase/look-alike roles do NOT match ADMIN', () => {
    expect(roleToPermissionTier('admin')).toBe(1);
    expect(roleToPermissionTier('Admin')).toBe(1);
    expect(roleToPermissionTier('ADMIN ')).toBe(1);
    expect(roleToPermissionTier(' ADMIN')).toBe(1);
    expect(roleToPermissionTier('moderator')).toBe(1);
  });
});

describe('AgentGateway.checkPermissions with real caller tiers', () => {
  const gateway = getAgentGateway();

  it('lets an ADMIN (tier 3) hold — not block — a tier-3 plan', () => {
    const gate = gateway.checkPermissions(makePlan(['quantads.set-budget']), 3);
    expect(gate.held).toBe(true);
    if (gate.held) {
      expect(gate.userTier).toBe(3);
      expect(gate.planId).toMatch(/^plan-/);
      expect(gate.reason).toContain('tier');
    }
  });

  it('denies a tier-3 tool for a MODERATOR (tier 2) with an honest 403', () => {
    expect(() => gateway.checkPermissions(makePlan(['quantads.set-budget']), 2)).toThrowError(
      /requires tier 3, user has tier 2/,
    );
  });

  it('denies a tier-3 tool for the old default tier 1', () => {
    expect(() => gateway.checkPermissions(makePlan(['quantads.set-budget']), 1)).toThrowError(
      /requires tier 3, user has tier 1/,
    );
  });

  it('fails closed when the tier is omitted entirely (default 1)', () => {
    try {
      gateway.checkPermissions(makePlan(['quantads.set-budget']));
      throw new Error('expected checkPermissions to throw');
    } catch (err) {
      const appErr = err as { statusCode?: number; code?: string; message: string };
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('TOOL_FORBIDDEN');
      expect(appErr.message).toContain('requires tier 3, user has tier 1');
    }
  });

  it('denies a tier-2 tool for a tier-1 caller', () => {
    expect(() => gateway.checkPermissions(makePlan(['quantads.create-campaign']), 1)).toThrowError(
      /requires tier 2, user has tier 1/,
    );
  });

  it('holds (not blocks) a tier-2 tool for a tier-2 caller', () => {
    const gate = gateway.checkPermissions(makePlan(['quantads.create-campaign']), 2);
    expect(gate.held).toBe(true);
    if (gate.held) expect(gate.userTier).toBe(2);
  });

  it('executes a tier-0 plan for a tier-1 caller without holding', () => {
    const gate = gateway.checkPermissions(makePlan(['quantads.analytics']), 1);
    expect(gate).toEqual({ held: false });
  });
});

describe('AgentGateway.execute threads the caller tier into the context', () => {
  const gateway = getAgentGateway();
  let seenContext: ToolExecutionContext | null = null;

  beforeAll(() => {
    gateway.getExecutor().registerHandler('quantads.analytics', async (_params, context) => {
      seenContext = context;
      return { ok: true };
    });
  });

  it('passes the caller tier into ToolExecutionContext.permissions', async () => {
    await gateway.execute(makePlan(['quantads.analytics']), {
      userId: 'u-admin',
      jwt: 'test-jwt',
      permissionTier: 3 as PermissionTier,
    });
    expect(seenContext?.permissions).toBe(3);
  });

  it('defaults permissions to 1 when no tier is supplied (fail closed)', async () => {
    await gateway.execute(makePlan(['quantads.analytics']), {
      userId: 'u-default',
      jwt: 'test-jwt',
    });
    expect(seenContext?.permissions).toBe(1);
  });
});

describe('AgentGateway.confirm re-gates against the confirming tier', () => {
  const gateway = getAgentGateway();
  let seenContext: ToolExecutionContext | null = null;

  beforeAll(() => {
    gateway.getExecutor().registerHandler('quantads.create-campaign', async (_params, context) => {
      seenContext = context;
      return { ok: true };
    });
  });

  function holdTier2Plan(): { planId: string; userId: string } {
    const userId = `u-mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const gate = gateway.checkPermissions(makePlan(['quantads.create-campaign']), 2);
    expect(gate.held).toBe(true);
    if (!gate.held) throw new Error('expected held plan');
    gateway.bindHeldPlan(gate.planId, userId);
    return { planId: gate.planId, userId };
  }

  it('executes after approval when the confirming tier still satisfies the plan', async () => {
    const { planId, userId } = holdTier2Plan();
    const results = await gateway.confirm(planId, {
      userId,
      jwt: 'test-jwt',
      approved: true,
      permissionTier: 2,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(seenContext?.permissions).toBe(2);
  });

  it('fails closed when the confirming tier was downgraded to 1', async () => {
    const { planId, userId } = holdTier2Plan();
    await expect(
      gateway.confirm(planId, {
        userId,
        jwt: 'test-jwt',
        approved: true,
        permissionTier: 1,
      }),
    ).rejects.toThrowError(/requires tier 2, user has tier 1/);
  });

  it('returns [] when the approval is denied', async () => {
    const { planId, userId } = holdTier2Plan();
    const results = await gateway.confirm(planId, {
      userId,
      jwt: 'test-jwt',
      approved: false,
      permissionTier: 2,
    });
    expect(results).toEqual([]);
  });

  it('still rejects a different user (403)', async () => {
    const { planId } = holdTier2Plan();
    await expect(
      gateway.confirm(planId, {
        userId: 'someone-else',
        jwt: 'test-jwt',
        approved: true,
        permissionTier: 3,
      }),
    ).rejects.toThrowError(/different user/);
  });

  it('still 404s on unknown planIds', async () => {
    await expect(
      gateway.confirm('plan-nope', {
        userId: 'u-x',
        jwt: 'test-jwt',
        approved: true,
        permissionTier: 3,
      }),
    ).rejects.toThrowError(/not found or expired/);
  });
});
