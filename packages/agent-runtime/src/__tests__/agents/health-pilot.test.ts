import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthPilot, HealthMetric } from '../../agents/health-pilot.js';
import type { AIEnginePort } from '../../ai-engine.interface.js';
import { TypedToolRegistry } from '../../typed-tool-registry.js';
import { SpendingLimit } from '../../spending-limit.js';
import { PermissionLevel } from '../../permissions.js';
import { AgentState } from '../../state-machine.js';
import { KillSwitch } from '../../kill-switch.js';

function createMockAIEngine(overrides?: Partial<AIEnginePort>): AIEnginePort {
  return {
    infer: vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'health.track_metric',
          args: { type: 'steps', value: 5000, unit: 'count' },
          description: 'Track',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'health', confidence: 0.9 }),
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

describe('HealthPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has OBSERVE default permission', () => {
    const pilot = new HealthPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.OBSERVE);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new HealthPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('AI tracks health metrics and detects trends', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          trends: [{ metric: 'steps', trend: 'up' }],
        }),
        usage: { tokens: 100, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'health.track_metric',
            args: { type: 'steps', value: 5000, unit: 'count' },
            description: 'Track',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new HealthPilot(createDeps({ aiEngine }));
    pilot.start();

    const metrics: HealthMetric[] = [
      { type: 'steps', value: 5000, unit: 'count', timestamp: 1000 },
      { type: 'steps', value: 7000, unit: 'count', timestamp: 2000 },
      { type: 'steps', value: 9000, unit: 'count', timestamp: 3000 },
    ];

    await pilot.run({ id: 'task-1', description: 'Track', params: { metrics, reminders: [] } });

    const result = pilot.getHealthResult();
    expect(result!.metrics).toHaveLength(3);
    expect(result!.trends).toHaveLength(1);
    expect(result!.trends[0]!.metric).toBe('steps');
    expect(result!.trends[0]!.trend).toBe('up');
    expect(inferMock).toHaveBeenCalled();
  });

  it('AI detects downward trend', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          trends: [{ metric: 'weight', trend: 'down' }],
        }),
        usage: { tokens: 100, cost: 0.002 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'health.track_metric',
            args: { type: 'weight', value: 78, unit: 'kg' },
            description: 'Track',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new HealthPilot(createDeps({ aiEngine }));
    pilot.start();

    const metrics: HealthMetric[] = [
      { type: 'weight', value: 80, unit: 'kg', timestamp: 1000 },
      { type: 'weight', value: 78, unit: 'kg', timestamp: 2000 },
    ];

    await pilot.run({ id: 'task-1', description: 'Track', params: { metrics, reminders: [] } });

    const result = pilot.getHealthResult();
    expect(result!.trends[0]!.trend).toBe('down');
  });

  it('transitions to DONE when opted in', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'health.track_metric',
          args: { type: 'steps', value: 5000, unit: 'count' },
          description: 'Track',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new HealthPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Track', params: { metrics: [], reminders: [] } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('rejects execution when opt-in is false', async () => {
    const pilot = new HealthPilot(createDeps({ optIn: false }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Track', params: { metrics: [], reminders: [] } });

    expect(pilot.stateMachine.getState()).toBe(AgentState.FAILED);
  });

  it('system prompt contains medical advice prohibition', () => {
    const deps = createDeps();
    const healthPilot = new HealthPilot(deps);
    // Use type assertion to access protected method for testing
    const prompt = (healthPilot as unknown as { getSystemPrompt(): string }).getSystemPrompt();
    expect(prompt).toContain('NEVER provide medical advice');
    expect(prompt).toContain('diagnoses');
    expect(prompt).toContain('treatment');
  });

  it('registers health-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new HealthPilot(deps);

    expect(deps.toolRegistry.hasTool('health.track_metric')).toBe(true);
    expect(deps.toolRegistry.hasTool('health.generate_digest')).toBe(true);
    expect(deps.toolRegistry.hasTool('health.trend_analysis')).toBe(true);
  });

  it('reasoning trace is populated after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'health.track_metric',
          args: { type: 'steps', value: 5000, unit: 'count' },
          description: 'Track',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new HealthPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Track', params: { metrics: [], reminders: [] } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });
});
