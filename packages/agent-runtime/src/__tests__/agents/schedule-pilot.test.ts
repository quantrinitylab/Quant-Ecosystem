import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulePilot, CalendarEvent } from '../../agents/schedule-pilot.js';
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
          toolName: 'schedule.find_slot',
          args: { duration: 30, attendees: [] },
          description: 'Find slot',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'meeting', confidence: 0.9 }),
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

describe('SchedulePilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has correct default configuration', () => {
    const pilot = new SchedulePilot(createDeps());
    expect(pilot.name).toBe('Schedule Pilot');
    expect(pilot.defaultPermission).toBe(PermissionLevel.ACT_LOW);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new SchedulePilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('adds non-conflicting events', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'schedule.find_slot',
          args: { duration: 30, attendees: [] },
          description: 'Find slot',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SchedulePilot(createDeps({ aiEngine }));
    pilot.start();

    const events: CalendarEvent[] = [
      { id: 'e1', title: 'Standup', start: 1000, end: 2000, attendees: ['alice'] },
      { id: 'e2', title: 'Lunch', start: 3000, end: 4000, attendees: ['bob'] },
    ];

    await pilot.run({ id: 'task-1', description: 'Add events', params: { action: 'add', events } });

    const result = pilot.getScheduleResult();
    expect(result!.created).toHaveLength(2);
    expect(result!.conflicts).toHaveLength(0);
  });

  it('detects conflicting events and uses AI for resolution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify({ action: 'skip', reason: 'Time overlap detected' }),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SchedulePilot(createDeps({ aiEngine }));
    pilot.start();

    const events: CalendarEvent[] = [
      { id: 'e1', title: 'Meeting A', start: 1000, end: 3000, attendees: ['alice'] },
      { id: 'e2', title: 'Meeting B', start: 2000, end: 4000, attendees: ['bob'] },
    ];

    await pilot.run({ id: 'task-1', description: 'Add events', params: { action: 'add', events } });

    const result = pilot.getScheduleResult();
    expect(result!.created).toHaveLength(1);
    expect(result!.conflicts).toHaveLength(1);
    // AI was consulted for conflict resolution
    expect(inferMock).toHaveBeenCalled();
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'schedule.find_slot',
          args: { duration: 30, attendees: [] },
          description: 'Find slot',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SchedulePilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Organize', params: { action: 'organize' } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers schedule-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new SchedulePilot(deps);

    expect(deps.toolRegistry.hasTool('schedule.find_slot')).toBe(true);
    expect(deps.toolRegistry.hasTool('schedule.book')).toBe(true);
    expect(deps.toolRegistry.hasTool('schedule.reschedule')).toBe(true);
    expect(deps.toolRegistry.hasTool('schedule.conflict_check')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new SchedulePilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });
});
