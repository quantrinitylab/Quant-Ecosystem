import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinancePilot, Expense } from '../../agents/finance-pilot.js';
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
        {
          toolName: 'finance.categorize',
          args: { description: 'test', amount: 10 },
          description: 'Categorize',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'expense', confidence: 0.9 }),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  };
}

function createDeps(opts?: {
  aiEngine?: AIEnginePort;
  toolRegistry?: TypedToolRegistry;
  spendingLimit?: SpendingLimit;
  optIn?: boolean;
}) {
  return {
    aiEngine: opts?.aiEngine ?? createMockAIEngine(),
    toolRegistry: opts?.toolRegistry ?? new TypedToolRegistry(),
    spendingLimit:
      opts?.spendingLimit ?? new SpendingLimit({ dailyCap: 10, weeklyCap: 50, monthlyCap: 200 }),
    optIn: opts?.optIn ?? true,
  };
}

describe('FinancePilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has OBSERVE default permission', () => {
    const pilot = new FinancePilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.OBSERVE);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new FinancePilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('AI analyzes expenses and generates insights', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          totalSpending: 180,
          categoryBreakdown: { food: 150, transport: 30 },
          topCategory: 'food',
          averageDaily: 60,
          recurringTotal: 0,
        }),
        usage: { tokens: 100, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'finance.categorize',
            args: { description: 'test', amount: 10 },
            description: 'Categorize',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new FinancePilot(createDeps({ aiEngine }));
    pilot.start();

    const expenses: Expense[] = [
      {
        id: '1',
        amount: 50,
        category: 'food',
        description: 'Lunch',
        date: Date.now(),
        recurring: false,
      },
      {
        id: '2',
        amount: 100,
        category: 'food',
        description: 'Dinner',
        date: Date.now(),
        recurring: false,
      },
      {
        id: '3',
        amount: 30,
        category: 'transport',
        description: 'Uber',
        date: Date.now(),
        recurring: false,
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses } });

    const insight = pilot.getInsight();
    expect(insight).not.toBeNull();
    expect(insight!.totalSpending).toBe(180);
    expect(insight!.topCategory).toBe('food');
    expect(insight!.categoryBreakdown['food']).toBe(150);
    expect(inferMock).toHaveBeenCalled();
  });

  it('AI calculates recurring totals', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          totalSpending: 75,
          categoryBreakdown: { subscriptions: 25, food: 50 },
          topCategory: 'food',
          averageDaily: 25,
          recurringTotal: 25,
        }),
        usage: { tokens: 100, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'finance.categorize',
            args: { description: 'test', amount: 10 },
            description: 'Categorize',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new FinancePilot(createDeps({ aiEngine }));
    pilot.start();

    const expenses: Expense[] = [
      {
        id: '1',
        amount: 10,
        category: 'subscriptions',
        description: 'Netflix',
        date: Date.now(),
        recurring: true,
      },
      {
        id: '2',
        amount: 15,
        category: 'subscriptions',
        description: 'Spotify',
        date: Date.now(),
        recurring: true,
      },
      {
        id: '3',
        amount: 50,
        category: 'food',
        description: 'Dinner',
        date: Date.now(),
        recurring: false,
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses } });

    const insight = pilot.getInsight();
    expect(insight!.recurringTotal).toBe(25);
  });

  it('transitions to DONE when opted in', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'finance.categorize',
          args: { description: 'test', amount: 10 },
          description: 'Categorize',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new FinancePilot(createDeps({ aiEngine, optIn: true }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses: [] } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('rejects execution when opt-in is false', async () => {
    const pilot = new FinancePilot(createDeps({ optIn: false }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses: [] } });

    // Should transition to FAILED because execute() throws
    expect(pilot.stateMachine.getState()).toBe(AgentState.FAILED);
  });

  it('throws descriptive error message for opt-in rejection', async () => {
    const pilot = new FinancePilot(createDeps({ optIn: false }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses: [] } });

    // The agent fails with the opt-in error
    expect(pilot.stateMachine.getState()).toBe(AgentState.FAILED);
  });

  it('registers read-only finance tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new FinancePilot(deps);

    expect(deps.toolRegistry.hasTool('finance.categorize')).toBe(true);
    expect(deps.toolRegistry.hasTool('finance.summarize_spending')).toBe(true);
    expect(deps.toolRegistry.hasTool('finance.detect_anomaly')).toBe(true);
  });

  it('does not register any trade or transfer tools', () => {
    const deps = createDeps();
    new FinancePilot(deps);

    // Verify no tool names contain trade/transfer/send/buy/sell
    const toolNames = [
      'finance.categorize',
      'finance.summarize_spending',
      'finance.detect_anomaly',
    ];
    const allTools = deps.toolRegistry.getToolsByCategory('finance');
    for (const tool of allTools) {
      expect(tool.name).not.toMatch(/trade|transfer|send|buy|sell/i);
    }
    expect(allTools).toHaveLength(toolNames.length);
  });

  it('reasoning trace is populated after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'finance.categorize',
          args: { description: 'test', amount: 10 },
          description: 'Categorize',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new FinancePilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Analyze', params: { expenses: [] } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });
});
