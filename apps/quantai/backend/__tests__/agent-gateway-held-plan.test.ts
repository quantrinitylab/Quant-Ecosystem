// ============================================================================
// QuantAI — AgentGateway held-plan ownership tests (CEO-approved claim:
// quantai-held-plan-ownership, Stage 1 Seam 1C fix)
//
// The held-plan creation path used to store an empty owner (userId '') and
// the confirm check was shaped `if (held.userId && held.userId !==
// opts.userId)`, so an empty owner bypassed ownership entirely. The fix:
// checkPermissions accepts the requesting userId and binds at creation,
// bindHeldPlan ignores an empty userId, and confirm fails closed — a
// missing/empty owner is rejected, a foreign owner is rejected, only the
// owning userId passes.
//
// Harness mirrors project-memory-ownership.test.ts: mocked
// @quant/server-core (createAppError shape), real @quant/quant-tools.
// quantads.create-campaign is tier 2, so checkPermissions at userTier 2
// holds it (confirmationRequired). confirm with approved:false proves the
// ownership verdict without executing anything.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { getAgentGateway } from '../services/agent-gateway.service';
import type { ToolPlan } from '@quant/quant-tools';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

const ALICE = 'user-alice';
const BOB = 'user-bob';

const gw = getAgentGateway();

function tier2Plan(): ToolPlan {
  return {
    id: 'plan-test',
    description: 'test plan',
    estimatedCost: 'low',
    requiredPermission: 2,
    steps: [
      {
        stepId: 's1',
        toolId: 'quantads.create-campaign',
        params: {},
        dependsOn: [],
        outputKey: 'o1',
      },
    ],
  };
}

/** Hold a plan and return its planId (asserts the gate actually held). */
function hold(userId?: string): string {
  const gate = gw.checkPermissions(tier2Plan(), 2, userId);
  expect(gate.held).toBe(true);
  if (!gate.held) throw new Error('expected a held plan');
  return gate.planId;
}

async function confirmError(planId: string, userId: string): Promise<unknown> {
  try {
    await gw.confirm(planId, { userId, jwt: 'test-jwt', approved: false });
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('AgentGateway — held-plan ownership', () => {
  it('creation binds the requesting userId', async () => {
    const planId = hold(ALICE);
    await expect(
      gw.confirm(planId, { userId: ALICE, jwt: 'test-jwt', approved: false }),
    ).resolves.toEqual([]);
  });

  it('confirm with a missing/empty owner fails closed', async () => {
    const planId = hold();
    const err = (await confirmError(planId, ALICE)) as
      | { statusCode: number; code: string; message: string }
      | undefined;
    expect(err).toBeDefined();
    expect(err?.statusCode).toBe(403);
    expect(err?.code).toBe('PLAN_USER_MISMATCH');
    expect(err?.message).toBe('Plan has no bound owner');
  });

  it('confirm with a foreign owner fails', async () => {
    const planId = hold(ALICE);
    const err = (await confirmError(planId, BOB)) as
      | { statusCode: number; code: string; message: string }
      | undefined;
    expect(err).toBeDefined();
    expect(err?.statusCode).toBe(403);
    expect(err?.code).toBe('PLAN_USER_MISMATCH');
    expect(err?.message).toBe('Plan belongs to a different user');
  });

  it('confirm with the correct owner passes', async () => {
    const planId = hold(ALICE);
    await expect(
      gw.confirm(planId, { userId: ALICE, jwt: 'test-jwt', approved: false }),
    ).resolves.toEqual([]);
  });

  it('bindHeldPlan with an empty userId never creates an owner', async () => {
    const planId = hold();
    gw.bindHeldPlan(planId, '');
    const err = (await confirmError(planId, ALICE)) as
      | { statusCode: number; code: string; message: string }
      | undefined;
    expect(err).toBeDefined();
    expect(err?.statusCode).toBe(403);
    expect(err?.code).toBe('PLAN_USER_MISMATCH');
    expect(err?.message).toBe('Plan has no bound owner');
  });

  it('post-hoc bindHeldPlan still binds (existing route flow)', async () => {
    const planId = hold();
    gw.bindHeldPlan(planId, ALICE);
    await expect(
      gw.confirm(planId, { userId: ALICE, jwt: 'test-jwt', approved: false }),
    ).resolves.toEqual([]);
  });
});
