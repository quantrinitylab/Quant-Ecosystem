import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocialPilot, SocialPost } from '../../agents/social-pilot.js';
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
          toolName: 'social.compose_post',
          args: { platform: 'twitter', topic: 'AI' },
          description: 'Compose',
        },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'engagement', confidence: 0.9 }),
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

describe('SocialPilot', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('has SUGGEST default permission', () => {
    const pilot = new SocialPilot(createDeps());
    expect(pilot.defaultPermission).toBe(PermissionLevel.SUGGEST);
  });

  it('extends IntelligentAgent, not WorkerAgent directly', () => {
    const pilot = new SocialPilot(createDeps());
    expect(typeof pilot.getReasoningTrace).toBe('function');
    expect(typeof pilot.getCostPreview).toBe('function');
    expect(typeof pilot.redoWithFeedback).toBe('function');
  });

  it('generates AI-driven content suggestions for a topic', async () => {
    const suggestions = ['Post about AI trends', 'Thread on AI impact', 'Ask about AI tools'];
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(suggestions),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'social.compose_post',
            args: { platform: 'twitter', topic: 'AI' },
            description: 'Compose',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SocialPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({
      id: 'task-1',
      description: 'Draft',
      params: { action: 'draft', topic: 'AI trends', posts: [] },
    });

    const result = pilot.getSocialResult();
    expect(result!.suggestions).toEqual(suggestions);
    expect(inferMock).toHaveBeenCalled();
  });

  it('schedules posts with AI-optimized times', async () => {
    const inferMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify([{ id: 'p1', scheduledTime: 1700000000000 }]),
        usage: { tokens: 50, cost: 0.001 },
      })
      .mockResolvedValue({
        content: JSON.stringify([
          {
            toolName: 'social.schedule_post',
            args: { postId: 'p1', scheduledTime: 1700000000000 },
            description: 'Schedule',
          },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });

    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SocialPilot(createDeps({ aiEngine }));
    pilot.start();

    const posts: SocialPost[] = [
      { id: 'p1', platform: 'twitter', content: 'Hello world', hashtags: ['tech'] },
    ];

    await pilot.run({
      id: 'task-1',
      description: 'Schedule',
      params: { action: 'schedule', posts },
    });

    const result = pilot.getSocialResult();
    expect(result!.scheduled).toHaveLength(1);
    expect(result!.scheduled[0]!.scheduledTime).toBe(1700000000000);
  });

  it('transitions to DONE on success', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'social.compose_post',
          args: { platform: 'twitter', topic: 'test' },
          description: 'Compose',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SocialPilot(createDeps({ aiEngine }));
    pilot.start();
    await pilot.run({ id: 'task-1', description: 'Draft', params: { action: 'draft', posts: [] } });
    expect(pilot.stateMachine.getState()).toBe(AgentState.DONE);
  });

  it('registers social-specific tools in TypedToolRegistry', () => {
    const deps = createDeps();
    new SocialPilot(deps);

    expect(deps.toolRegistry.hasTool('social.compose_post')).toBe(true);
    expect(deps.toolRegistry.hasTool('social.schedule_post')).toBe(true);
    expect(deps.toolRegistry.hasTool('social.analyze_engagement')).toBe(true);
  });

  it('has agent.handoff tool available', () => {
    const deps = createDeps();
    new SocialPilot(deps);

    expect(deps.toolRegistry.hasTool('agent.handoff')).toBe(true);
  });

  it('reasoning trace is populated after execution', async () => {
    const inferMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          toolName: 'social.compose_post',
          args: { platform: 'twitter', topic: 'test' },
          description: 'Compose',
        },
      ]),
      usage: { tokens: 50, cost: 0.001 },
    });
    const aiEngine = createMockAIEngine({ infer: inferMock });
    const pilot = new SocialPilot(createDeps({ aiEngine }));
    pilot.start();

    await pilot.run({ id: 'task-1', description: 'Draft', params: { action: 'draft', posts: [] } });

    const trace = pilot.getReasoningTrace();
    expect(trace.length).toBeGreaterThan(0);
    const phases = trace.map((t) => t.phase);
    expect(phases).toContain('observe');
    expect(phases).toContain('plan');
  });
});
