import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TravelPilot } from '../../agents/travel-pilot.js';
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
          toolName: 'travel.plan_trip',
          args: { destination: 'Paris', days: 3, budget: 2000 },
          description: 'Plan trip',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'travel', confidence: 0.9 }),
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

describe('TravelPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has ACT_HIGH default permission', () => {
    const pilot = new TravelPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_HIGH);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new TravelPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('plans a trip within budget using AI', async () => {
    const activities = [
      {
        name: 'Flight to Paris',
        date: Date.now(),
        estimatedCost: 400,
        category: 'transport',
        booked: false,
      },
      {
        name: 'Hotel',
        date: Date.now(),
        estimatedCost: 300,
        category: 'accommodation',
        booked: false,
      },
    ];
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ activities, suggestions: ['Visit the Eiffel Tower'] }),
        usage: { tokens: 150, cost: 0.003 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'travel.plan_trip',
            args: { destination: 'Paris', days: 3, budget: 5000 },
            description: 'Plan',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new TravelPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Plan trip',
      params: {
        destination: 'Paris',
        budget: 5000,
        startDate: Date.now(),
        endDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
      },
    });

    const result = pilot.getTravelResult();
    expect(result!.plan!.destination).toBe('Paris');
    expect(result!.totalEstimatedCost).toBeGreaterThan(0);
    expect(result!.withinBudget).toBe(true);
    expect(inferMock).toHaveBeenCalled();
  });

  it('detects over-budget trips', async () => {
    // AI returns activities that exceed budget; fallback to default
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: 'not valid json',
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'travel.plan_trip',
            args: { destination: 'Tokyo', days: 7, budget: 100 },
            description: 'Plan',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new TravelPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Plan trip',
      params: {
        destination: 'Tokyo',
        budget: 100,
        startDate: Date.now(),
        endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    });

    const result = pilot.getTravelResult();
    expect(result!.withinBudget).toBe(false);
    expect(result!.suggestions.some((s) => s.includes('budget'))).toBe(true);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'travel.plan_trip',
          args: { destination: 'London', days: 3, budget: 2000 },
          description: 'Plan',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new TravelPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({
      id: 'task-1',
      description: 'Plan',
      params: { destination: 'London', budget: 2000 },
    });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers travel-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new TravelPilot(deps);

    expect(deps.toolRegistry.hasTool('travel.plan_trip')).toBe(true);
    expect(deps.toolRegistry.hasTool('travel.find_flights')).toBe(true);
    expect(deps.toolRegistry.hasTool('travel.book_hotel')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new TravelPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });
});
