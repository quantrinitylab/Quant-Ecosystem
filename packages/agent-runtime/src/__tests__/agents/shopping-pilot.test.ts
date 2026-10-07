import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingPilot, Product } from '../../agents/shopping-pilot.js';
import type { AIEnginePort } from '../../ai-engine.interface.js';
import { TypedToolRegistry } from '../../typed-tool-registry.js';
import { SpendingLimit } from '../../spending-limit.js';
import { PermissionLevel } from '../../permissions.js';
import { AgentState } from '../../state-machine.js';
import { KillSwitch } from '../../kill-switch.js';

// ============================================================================
// Mock AI Engine
// ============================================================================

function createMockAIEngine(overrides?: Partial<AIEnginePort>): AIEnginePort {
  return {
    infer: vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'shopping.search', args: { query: 'test' }, description: 'Search' },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'product', confidence: 0.9 }),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  };
}

function createDeps(opts?: {
  aiEngine?: AIEnginePort;
  toolRegistry?: TypedToolRegistry;
  spendingLimit?: SpendingLimit;
}) {
  return {
    aiEngine: opts?.aiEngine ?? createMockAIEngine(),
    toolRegistry: opts?.toolRegistry ?? new TypedToolRegistry(),
    spendingLimit:
      opts?.spendingLimit ?? new SpendingLimit({ dailyCap: 10, weeklyCap: 50, monthlyCap: 200 }),
  };
}

describe('ShoppingPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has ACT_HIGH default permission', () => {
    const pilot = new ShoppingPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_HIGH);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new ShoppingPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('finds best deal from products using AI', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ bestDealId: '2', reasoning: 'Best price to quality ratio' }),
        usage: { tokens: 80, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'shopping.search', args: { query: 'Widget' }, description: 'Search' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ShoppingPilot(createDeps({ aiEngine }));
    pilot.start();

    const products: Product[] = [
      {
        id: '1',
        name: 'Widget',
        price: 29.99,
        currency: 'USD',
        store: 'StoreA',
        rating: 4.5,
        inStock: true,
      },
      {
        id: '2',
        name: 'Widget',
        price: 19.99,
        currency: 'USD',
        store: 'StoreB',
        rating: 4.0,
        inStock: true,
      },
      {
        id: '3',
        name: 'Widget',
        price: 14.99,
        currency: 'USD',
        store: 'StoreC',
        rating: 3.5,
        inStock: false,
      },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Compare',
      params: { query: 'Widget', products },
    });

    const result = pilot.getShoppingResult();
    expect(result!.bestDeal!.price).toBe(19.99);
    expect(result!.products).toHaveLength(2); // only in-stock
    expect(inferMock).toHaveBeenCalled();
  });

  it('computes savings for each store', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ bestDealId: '2', reasoning: 'Cheapest' }),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'shopping.compare',
            args: { productIds: ['1', '2'] },
            description: 'Compare',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ShoppingPilot(createDeps({ aiEngine }));
    pilot.start();

    const products: Product[] = [
      {
        id: '1',
        name: 'Phone',
        price: 999,
        currency: 'USD',
        store: 'Apple',
        rating: 5,
        inStock: true,
      },
      {
        id: '2',
        name: 'Phone',
        price: 899,
        currency: 'USD',
        store: 'Amazon',
        rating: 4.8,
        inStock: true,
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Compare', params: { query: 'Phone', products } });

    const result = pilot.getShoppingResult();
    expect(result!.comparison).toHaveLength(2);
    const amazonDeal = result!.comparison.find((c) => c.store === 'Amazon');
    expect(amazonDeal!.savings).toBe(100);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'shopping.search', args: { query: 'test' }, description: 'Search' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new ShoppingPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({
      id: 'task-1',
      description: 'Search',
      params: { query: 'test', products: [] },
    });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers shopping-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new ShoppingPilot(deps);

    expect(deps.toolRegistry.hasTool('shopping.search')).toBe(true);
    expect(deps.toolRegistry.hasTool('shopping.compare')).toBe(true);
    expect(deps.toolRegistry.hasTool('shopping.add_to_cart')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new ShoppingPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });
});
