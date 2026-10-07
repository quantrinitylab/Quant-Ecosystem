// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 13.1 — PricingEngine + CreditMeter/UsageGate hook
// (Requirements 18.1, 18.5)
// ============================================================================
//
// Verifies the early credit-metering choke point:
//   * PricingEngine derives the ai_inference rate from the @quant/ai cost
//     tracker (tokens -> $ -> credits) and prices per-unit drivers statically.
//   * UsageGate.checkAndReserve fails closed on insufficient balance and is
//     idempotent by actionKey; settle reconciles and is idempotent.
//   * The UsageGate-backed BudgetPort funds (or denies) an agent session.
//   * withUsageMetering routes agent inference through the gate: reserve before
//     execute, settle after, and fail closed (no inference) when out of credits.

import { describe, it, expect, vi } from 'vitest';
import { ModelRouter } from '@quant/ai';

import {
  PricingEngine,
  createModelRouterCostEstimator,
  UsageGate,
  InMemoryBalanceProvider,
  InMemoryReservationStore,
  createUsageGateBudgetPort,
  type MeteredAction,
} from '../modules/billing';
import { withUsageMetering } from '../modules/agent/services/usage-metering-loop';
import type {
  ToolExecutionLoop,
  AgentStepState,
} from '../modules/agent/services/tool-execution-loop';

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

describe('PricingEngine (Requirement 18.1) — cost driver -> credits', () => {
  const router = new ModelRouter();
  const pricing = new PricingEngine({
    aiCost: createModelRouterCostEstimator(router),
    creditsPerUsd: 1000,
  });

  it('derives ai_inference cost from the @quant/ai cost tracker rates', () => {
    // gpt-4o-mini: $0.00000015/in token, $0.0000006/out token.
    // 1000 in + 1000 out => $0.00075 => 0.75 credits => ceil => 1 credit.
    const action: MeteredAction = {
      actionKey: 'k1',
      kind: 'ai_inference',
      modelId: 'gpt-4o-mini',
      projectedTokens: { input: 1000, output: 1000 },
    };
    expect(pricing.estimateCost(action)).toBe(1);
  });

  it('charges a costlier model more credits for identical token usage', () => {
    const tokens = { input: 100000, output: 100000 };
    const mini = pricing.estimateCost({ actionKey: 'a', kind: 'ai_inference', modelId: 'gpt-4o-mini', projectedTokens: tokens });
    const sonnet = pricing.estimateCost({ actionKey: 'b', kind: 'ai_inference', modelId: 'claude-sonnet-4', projectedTokens: tokens });
    expect(sonnet).toBeGreaterThan(mini);
  });

  it('publishes an inspectable, cost-tracker-sourced ai_inference rule', () => {
    const rule = pricing.deriveAiInferenceRule('gpt-4o-mini');
    expect(rule.actionKind).toBe('ai_inference');
    expect(rule.unit).toBe('per_1k_tokens');
    expect(rule.source).toBe('quant_ai_cost_tracker');
    expect(rule.creditsPerUnit).toBeGreaterThanOrEqual(0);
  });

  it('prices per-unit drivers statically (message/query/minute)', () => {
    expect(pricing.estimateCost({ actionKey: 'm', kind: 'email_send', units: 3 })).toBe(3);
    expect(pricing.estimateCost({ actionKey: 'q', kind: 'rag_query' })).toBe(5); // default 1 unit
    expect(pricing.estimateCost({ actionKey: 'c', kind: 'ci_minute', units: 4 })).toBe(8);
  });

  it('never returns a negative or fractional credit cost', () => {
    const c = pricing.estimateCost({ actionKey: 'z', kind: 'ai_inference', projectedTokens: { input: 1, output: 0 } });
    expect(Number.isInteger(c)).toBe(true);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// UsageGate — reserve/settle, fail closed, idempotency
// ---------------------------------------------------------------------------

function makeGate(balance: number) {
  const balances = new InMemoryBalanceProvider({ initial: { 'user-1': balance } });
  const reservations = new InMemoryReservationStore();
  let n = 0;
  const gate = new UsageGate({
    balances,
    reservations,
    pricing: new PricingEngine({ creditsPerUsd: 1000 }),
    generateId: () => `res-${++n}`,
  });
  return { gate, balances, reservations };
}

describe('UsageGate.checkAndReserve (Requirement 18.5) — fail closed + idempotent', () => {
  it('rejects with OUT_OF_CREDITS when balance cannot cover the estimate (fail closed)', async () => {
    const { gate } = makeGate(0);
    await expect(
      gate.checkAndReserve('user-1', { actionKey: 'k', kind: 'rag_query' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'OUT_OF_CREDITS' });
  });

  it('records a hold when balance covers the estimate', async () => {
    const { gate } = makeGate(100);
    const res = await gate.checkAndReserve('user-1', { actionKey: 'k', kind: 'rag_query' });
    expect(res.estimatedCost).toBe(5);
    expect(res.settled).toBe(false);
    // The hold reduces the available balance.
    expect(await gate.getAvailableBalance('user-1')).toBe(95);
  });

  it('is idempotent by actionKey — replay returns the same reservation, no second hold', async () => {
    const { gate } = makeGate(100);
    const first = await gate.checkAndReserve('user-1', { actionKey: 'dup', kind: 'rag_query' });
    const second = await gate.checkAndReserve('user-1', { actionKey: 'dup', kind: 'rag_query' });
    expect(second.id).toBe(first.id);
    // Only one hold of 5 credits, not two.
    expect(await gate.getAvailableBalance('user-1')).toBe(95);
  });

  it('rejects with UPGRADE_REQUIRED when entitlements forbid the driver', async () => {
    const balances = new InMemoryBalanceProvider({ initial: { 'user-1': 100 } });
    const gate = new UsageGate({
      balances,
      entitlements: { permits: (_o, kind) => kind !== 'rag_query' },
    });
    await expect(
      gate.checkAndReserve('user-1', { actionKey: 'k', kind: 'rag_query' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'UPGRADE_REQUIRED' });
  });
});

describe('UsageGate.settle — reconcile + idempotent', () => {
  it('settles against the actual cost and debits the backing balance once', async () => {
    const { gate, balances } = makeGate(100);
    const res = await gate.checkAndReserve('user-1', { actionKey: 'k', kind: 'rag_query' }); // est 5
    const settled = await gate.settle(res, 3);
    expect(settled.settled).toBe(true);
    expect(settled.actualCost).toBe(3);
    // Balance reduced by the ACTUAL cost; the hold is released.
    expect(balances.getBalance('user-1')).toBe(97);
    expect(await gate.getAvailableBalance('user-1')).toBe(97);
  });

  it('is idempotent — settling twice does not double-charge', async () => {
    const { gate, balances } = makeGate(100);
    const res = await gate.checkAndReserve('user-1', { actionKey: 'k', kind: 'rag_query' });
    await gate.settle(res, 3);
    const again = await gate.settle(res, 3);
    expect(again.actualCost).toBe(3);
    expect(balances.getBalance('user-1')).toBe(97); // not 94
  });
});

// ---------------------------------------------------------------------------
// UsageGate-backed BudgetPort for the Agent Runtime
// ---------------------------------------------------------------------------

describe('createUsageGateBudgetPort — agent session funding', () => {
  it('funds a session when the wallet covers the cost budget', async () => {
    const { gate } = makeGate(100);
    const port = createUsageGateBudgetPort({ gate });
    expect(await port.hasAvailableBudget('user-1', { maxIterations: 5, costBudget: 50 })).toBe(true);
  });

  it('denies a session when the wallet cannot cover the cost budget (fail closed)', async () => {
    const { gate } = makeGate(40);
    const port = createUsageGateBudgetPort({ gate });
    expect(await port.hasAvailableBudget('user-1', { maxIterations: 5, costBudget: 50 })).toBe(false);
  });

  it('still rejects a non-positive budget', async () => {
    const { gate } = makeGate(1000);
    const port = createUsageGateBudgetPort({ gate });
    expect(await port.hasAvailableBudget('user-1', { maxIterations: 0, costBudget: 50 })).toBe(false);
    expect(await port.hasAvailableBudget('user-1', { maxIterations: 5, costBudget: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withUsageMetering — route agent inference through the gate
// ---------------------------------------------------------------------------

function stepState(): AgentStepState {
  return {
    sessionId: 'sess-1',
    userId: 'user-1',
    repoId: 'repo-1',
    instruction: 'fix the failing test',
    branchRef: 'agent/sess-1',
    iterationCount: 0,
    maxIterations: 10,
  };
}

describe('withUsageMetering (Requirements 18.1, 18.5) — agent inference is metered', () => {
  it('reserves before execution and settles the actual cost after', async () => {
    const { gate, balances } = makeGate(100);
    const inner: ToolExecutionLoop = {
      selectTool: () => ({ toolName: 'ai_reply', args: {} }),
      execute: vi.fn(async () => ({ ok: true, costDelta: 7 })),
    };
    const loop = withUsageMetering(inner, { gate });

    const obs = await loop.execute({ toolName: 'ai_reply', args: {} }, stepState());

    expect(inner.execute).toHaveBeenCalledTimes(1);
    expect(obs.ok).toBe(true);
    expect(obs.costDelta).toBe(7);
    // Settled actual cost (7) was debited from the wallet.
    expect(balances.getBalance('user-1')).toBe(93);
  });

  it('fails closed (does NOT run inference) when the wallet is empty', async () => {
    const { gate } = makeGate(0);
    const inner: ToolExecutionLoop = {
      selectTool: () => ({ toolName: 'ai_reply', args: {} }),
      execute: vi.fn(async () => ({ ok: true })),
    };
    const loop = withUsageMetering(inner, { gate });

    const obs = await loop.execute({ toolName: 'ai_reply', args: {} }, stepState());

    expect(inner.execute).not.toHaveBeenCalled();
    expect(obs.ok).toBe(false);
    expect(obs.done).toBe(true);
    expect(obs.error).toBe('OUT_OF_CREDITS');
  });

  it('delegates tool selection unchanged to the inner loop', async () => {
    const { gate } = makeGate(100);
    const inner: ToolExecutionLoop = {
      selectTool: vi.fn(() => ({ toolName: 'search_repo', args: { q: 'x' } })),
      execute: async () => ({ ok: true, costDelta: 1 }),
    };
    const loop = withUsageMetering(inner, { gate });
    const call = await loop.selectTool(stepState());
    expect(inner.selectTool).toHaveBeenCalledTimes(1);
    expect(call?.toolName).toBe('search_repo');
  });
});
