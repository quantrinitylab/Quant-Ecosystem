import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningPilot, LearningResource } from '../../agents/learning-pilot.js';
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
          toolName: 'learning.find_resources',
          args: { topic: 'python', level: 'beginner' },
          description: 'Find resources',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'educational', confidence: 0.9 }),
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

describe('LearningPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has SUGGEST default permission', () => {
    const pilot = new LearningPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.SUGGEST);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new LearningPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('recommends resources based on level using AI', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ orderedIds: ['1', '3'], reasoning: 'Start with basics' }),
        usage: { tokens: 80, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'learning.find_resources',
            args: { topic: 'python', level: 'beginner' },
            description: 'Find',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new LearningPilot(createDeps({ aiEngine }));
    pilot.start();

    const resources: LearningResource[] = [
      {
        id: '1',
        title: 'Intro to Python',
        type: 'course',
        topic: 'python',
        difficulty: 'beginner',
        estimatedHours: 10,
        completed: false,
      },
      {
        id: '2',
        title: 'Advanced Python',
        type: 'course',
        topic: 'python',
        difficulty: 'advanced',
        estimatedHours: 20,
        completed: false,
      },
      {
        id: '3',
        title: 'Intermediate Python',
        type: 'article',
        topic: 'python',
        difficulty: 'intermediate',
        estimatedHours: 5,
        completed: true,
      },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Recommend',
      params: { goal: 'Learn Python', resources, level: 'beginner' },
    });

    const result = pilot.getLearningResult();
    expect(result!.recommendations.length).toBeGreaterThan(0);
    expect(result!.recommendations[0]!.difficulty).toBe('beginner');
    expect(inferMock).toHaveBeenCalled();
  });

  it('identifies next step in learning path', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ orderedIds: ['1', '2'], reasoning: 'Follow curriculum order' }),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'learning.create_path',
            args: { goal: 'JS', level: 'intermediate' },
            description: 'Create path',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new LearningPilot(createDeps({ aiEngine }));
    pilot.start();

    const resources: LearningResource[] = [
      {
        id: '1',
        title: 'Done',
        type: 'course',
        topic: 'js',
        difficulty: 'beginner',
        estimatedHours: 5,
        completed: true,
      },
      {
        id: '2',
        title: 'Next',
        type: 'course',
        topic: 'js',
        difficulty: 'intermediate',
        estimatedHours: 10,
        completed: false,
      },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Recommend',
      params: { goal: 'Learn JS', resources, level: 'intermediate' },
    });

    const result = pilot.getLearningResult();
    expect(result!.nextStep!.title).toBe('Next');
  });

  it('calculates progress', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ orderedIds: ['1', '2'], reasoning: 'Sequential' }),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'learning.find_resources',
            args: { topic: 'ts', level: 'beginner' },
            description: 'Find',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new LearningPilot(createDeps({ aiEngine }));
    pilot.start();

    const resources: LearningResource[] = [
      {
        id: '1',
        title: 'A',
        type: 'course',
        topic: 'ts',
        difficulty: 'beginner',
        estimatedHours: 10,
        completed: true,
      },
      {
        id: '2',
        title: 'B',
        type: 'course',
        topic: 'ts',
        difficulty: 'beginner',
        estimatedHours: 10,
        completed: false,
      },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Recommend',
      params: { goal: 'TS', resources, level: 'beginner' },
    });

    const result = pilot.getLearningResult();
    expect(result!.path!.progress).toBe(50);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'learning.find_resources',
          args: { topic: 'test', level: 'beginner' },
          description: 'Find',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new LearningPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({
      id: 'task-1',
      description: 'Recommend',
      params: { goal: 'test', resources: [] },
    });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers learning-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new LearningPilot(deps);

    expect(deps.toolRegistry.hasTool('learning.find_resources')).toBe(true);
    expect(deps.toolRegistry.hasTool('learning.create_path')).toBe(true);
    expect(deps.toolRegistry.hasTool('learning.quiz')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new LearningPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });
});
