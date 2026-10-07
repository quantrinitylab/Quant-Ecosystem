import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodePilot, CodeChange } from '../../agents/code-pilot.js';
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
        { toolName: 'code.review', args: { diff: 'test' }, description: 'Review code' },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'bug', confidence: 0.9 }),
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

describe('CodePilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has correct default configuration', () => {
    const pilot = new CodePilot(createDeps());
    expect(pilot.name).toBe('Code Pilot');
    expect(pilot.defaultPermission).toBe(PermissionLevel.SUGGEST);
    expect(pilot.icon).toBe('code');
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new CodePilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('AI reviews code changes and returns issues', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          issues: [
            { file: 'src/app.ts', line: 1, severity: 'warning', message: 'Debug statement found' },
          ],
          suggestions: [],
          score: 85,
        }),
        usage: { tokens: 100, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'code.review', args: { diff: 'test' }, description: 'Review' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new CodePilot(createDeps({ aiEngine }));
    pilot.start();

    const changes: CodeChange[] = [
      {
        file: 'src/app.ts',
        additions: 5,
        deletions: 0,
        content: 'console.log("debug");\nconst x = 1;',
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Review', params: { changes } });

    const review = pilot.getLastReview();
    expect(review).not.toBeNull();
    expect(review!.issues).toHaveLength(1);
    expect(review!.issues[0]!.message).toBe('Debug statement found');
    expect(review!.score).toBe(85);
    expect(inferMock).toHaveBeenCalled();
  });

  it('AI provides suggestions for code improvements', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          issues: [],
          suggestions: [
            {
              file: 'src/big-feature.ts',
              line: 1,
              original: '',
              suggested: 'Add unit tests',
              reason: 'Large addition without test coverage',
            },
          ],
          score: 90,
        }),
        usage: { tokens: 80, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'code.review', args: { diff: 'test' }, description: 'Review' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new CodePilot(createDeps({ aiEngine }));
    pilot.start();

    const changes: CodeChange[] = [
      { file: 'src/big-feature.ts', additions: 100, deletions: 0, content: 'const x = 1;' },
    ];

    await pilot.run({ id: 'task-1', description: 'Review', params: { changes } });

    const review = pilot.getLastReview();
    expect(review!.suggestions).toHaveLength(1);
    expect(review!.suggestions[0]!.reason).toContain('test coverage');
  });

  it('returns perfect score for clean code', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ issues: [], suggestions: [], score: 100 }),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'code.review', args: { diff: 'test' }, description: 'Review' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new CodePilot(createDeps({ aiEngine }));
    pilot.start();

    const changes: CodeChange[] = [
      {
        file: 'src/clean.ts',
        additions: 10,
        deletions: 0,
        content: 'const x: number = 1;\nconst y = x + 2;',
      },
    ];

    await pilot.run({ id: 'task-1', description: 'Review', params: { changes } });

    const review = pilot.getLastReview();
    expect(review!.score).toBe(100);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'code.review', args: { diff: 'test' }, description: 'Review' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new CodePilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Review', params: { changes: [] } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers code-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new CodePilot(deps);

    expect(deps.toolRegistry.hasTool('code.review')).toBe(true);
    expect(deps.toolRegistry.hasTool('code.suggest_fix')).toBe(true);
    expect(deps.toolRegistry.hasTool('code.open_pr')).toBe(true);
    expect(deps.toolRegistry.hasTool('code.run_tests')).toBe(true);
  });

  it('reasoning trace is populated after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'code.review', args: { diff: 'test' }, description: 'Review' },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new CodePilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Review', params: { changes: [] } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });

  it('getLastReview returns null before execution', () => {
    const pilot = new CodePilot(createDeps());
    expect(pilot.getLastReview()).toBeNull();
  });
});
